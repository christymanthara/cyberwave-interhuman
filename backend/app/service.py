from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import shutil
import subprocess
import tempfile
from typing import Any
from uuid import uuid4

import httpx
from fastapi import WebSocket
from websockets.asyncio.client import connect as ws_connect

from .sample_data import SAMPLE_ANALYSIS

API_BASE = 'https://api.interhuman.ai'
UPLOAD_ENDPOINT = '/v1/upload/analyze'
REALTIME_ENDPOINT = '/v0/real-time/analyze'
STREAM_ENDPOINT = '/v1/stream/analyze'

logger = logging.getLogger(__name__)


class InterhumanService:
    def __init__(self, api_key: str | None) -> None:
        self.api_key = api_key or ''
        self.stream_ws_url = API_BASE.replace('https://', 'wss://') + STREAM_ENDPOINT
        mode = 'live-proxy' if self.api_key else 'mock-fallback'
        logger.info('InterhumanService initialized mode=%s', mode)

    async def upload_and_analyze(self, file_bytes: bytes, filename: str | None, content_type: str | None) -> dict[str, Any]:
        if not self.api_key:
            logger.warning('No INTERHUMAN_API_KEY configured; returning SAMPLE_ANALYSIS for upload')
            return SAMPLE_ANALYSIS.model_dump()

        guessed_type = content_type or mimetypes.guess_type(filename or '')[0] or 'application/octet-stream'
        files = {
            'file': (filename or 'upload.bin', file_bytes, guessed_type),
        }
        data = [
            ('include[]', 'conversation_quality_overall'),
            ('include[]', 'conversation_quality_timeline'),
        ]

        async with httpx.AsyncClient(timeout=120.0) as client:
            logger.info('Calling Interhuman upload endpoint filename=%s size_bytes=%s', filename, len(file_bytes))
            response = await client.post(
                API_BASE + UPLOAD_ENDPOINT,
                headers={'Authorization': f'Bearer {self.api_key}'},
                files=files,
                data=data,
            )

        response.raise_for_status()
        logger.info('Interhuman upload succeeded status=%s', response.status_code)
        return response.json()

    async def stream_updates(self, session_id: str | None = None) -> list[dict[str, Any]]:
        if self.api_key:
            logger.warning(
                'INTERHUMAN_API_KEY is set but local stream adapter is still mock-driven; configure upstream WS relay for live frames.'
            )
        else:
            logger.warning('Streaming in mock mode because INTERHUMAN_API_KEY is not set')

        seed = SAMPLE_ANALYSIS.model_dump()
        updates: list[dict[str, Any]] = []
        for index in range(len(seed['signals'])):
            updates.append(
                {
                    'type': 'partial',
                    'session_id': session_id or str(uuid4()),
                    'chunk_index': index,
                    'analysis': {
                        **seed,
                        'signals': seed['signals'][: index + 1],
                    },
                }
            )
        updates.append({'type': 'final', 'session_id': session_id or str(uuid4()), 'analysis': seed})
        logger.debug('Generated mock stream updates session_id=%s update_count=%s', session_id, len(updates))
        return updates

    async def relay_stream_session(self, client_socket: WebSocket) -> None:
        if not self.api_key:
            raise RuntimeError('INTERHUMAN_API_KEY is not configured; cannot start upstream stream relay.')

        headers = {
            'Authorization': f'Bearer {self.api_key}',
        }

        logger.info('Opening upstream stream relay url=%s', self.stream_ws_url)
        async with ws_connect(
            self.stream_ws_url,
            additional_headers=headers,
            max_size=None,
        ) as upstream:
            logger.info('Upstream stream relay connected')
            session_config_sent = False

            async def client_to_upstream() -> None:
                nonlocal session_config_sent
                while True:
                    message = await client_socket.receive()
                    msg_type = message.get('type')

                    if msg_type == 'websocket.disconnect':
                        logger.info('Client disconnected from local stream relay')
                        break

                    text_payload = message.get('text')
                    bytes_payload = message.get('bytes')

                    if text_payload is not None:
                        try:
                            control = json.loads(text_payload)
                        except json.JSONDecodeError:
                            control = None

                        # Frontend compatibility shim: translate local keepalive control into a valid session config once.
                        if isinstance(control, dict):
                            include = control.get('include')
                            if isinstance(include, list):
                                outbound = json.dumps({'include': include})
                                await upstream.send(outbound)
                                session_config_sent = True
                                logger.debug('Forwarded explicit stream session config include=%s', include)
                                continue

                            if 'session_id' in control and not session_config_sent:
                                default_config = {
                                    'include': [
                                        'conversation_quality_overall',
                                        'conversation_quality_timeline',
                                    ]
                                }
                                await upstream.send(json.dumps(default_config))
                                session_config_sent = True
                                logger.debug('Translated session_id control into default session config')
                                continue

                            if 'session_id' in control and session_config_sent:
                                logger.debug('Ignoring local keepalive session_id control after initial config')
                                continue

                        await upstream.send(text_payload)
                        logger.debug('Forwarded text frame from client to upstream')
                        continue

                    if bytes_payload is not None:
                        prepared_segment = await self._prepare_video_segment(bytes_payload)
                        if prepared_segment is None:
                            logger.warning('Dropping malformed stream segment before upstream relay size_bytes=%s', len(bytes_payload))
                            continue

                        await upstream.send(prepared_segment)
                        logger.debug('Forwarded binary frame size_bytes=%s', len(prepared_segment))

            async def upstream_to_client() -> None:
                while True:
                    frame = await upstream.recv()
                    if isinstance(frame, bytes):
                        await client_socket.send_bytes(frame)
                        logger.debug('Relayed binary frame from upstream size_bytes=%s', len(frame))
                    else:
                        await client_socket.send_text(frame)
                        try:
                            envelope = json.loads(frame)
                            logger.debug('Relayed upstream envelope type=%s', envelope.get('type'))
                        except json.JSONDecodeError:
                            logger.debug('Relayed upstream text frame (non-json)')

            sender_task = asyncio.create_task(client_to_upstream())
            receiver_task = asyncio.create_task(upstream_to_client())

            done, pending = await asyncio.wait(
                {sender_task, receiver_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            for task in done:
                exc = task.exception()
                if exc:
                    raise exc

        logger.info('Upstream stream relay closed')

    async def relay_realtime_session(self, client_socket: WebSocket) -> None:
        if not self.api_key:
            raise RuntimeError('INTERHUMAN_API_KEY is not configured; cannot start upstream realtime relay.')

        realtime_ws_url = API_BASE.replace('https://', 'wss://') + REALTIME_ENDPOINT
        headers = {
            'Authorization': f'Bearer {self.api_key}',
        }

        logger.info('Opening upstream realtime relay url=%s', realtime_ws_url)
        async with ws_connect(
            realtime_ws_url,
            additional_headers=headers,
            max_size=None,
        ) as upstream:
            logger.info('Upstream realtime relay connected')

            async def client_to_upstream() -> None:
                while True:
                    message = await client_socket.receive()
                    msg_type = message.get('type')

                    if msg_type == 'websocket.disconnect':
                        logger.info('Client disconnected from local realtime relay')
                        break

                    text_payload = message.get('text')
                    bytes_payload = message.get('bytes')

                    if text_payload is not None:
                        try:
                            control = json.loads(text_payload)
                        except json.JSONDecodeError:
                            control = None

                        # Compatibility shim: ignore the local session-id packet, but forward valid realtime config/transcript frames.
                        if isinstance(control, dict):
                            if 'session_id' in control and len(control) == 1:
                                logger.debug('Ignoring local realtime session_id control packet')
                                continue

                            if control.get('type') in {'transcript.updated', 'realtime_session_config_v1', 'session.updated'}:
                                await upstream.send(text_payload)
                                logger.debug('Forwarded realtime config/transcript frame type=%s', control.get('type'))
                                continue

                            if 'synthesis_frequency' in control or 'synthesis_prompt' in control:
                                await upstream.send(text_payload)
                                logger.debug('Forwarded realtime session config keys=%s', list(control.keys()))
                                continue

                        await upstream.send(text_payload)
                        logger.debug('Forwarded realtime text frame from client to upstream')
                        continue

                    if bytes_payload is not None:
                        prepared_segment = await self._prepare_video_segment(bytes_payload)
                        if prepared_segment is None:
                            logger.warning('Dropping malformed realtime segment before upstream relay size_bytes=%s', len(bytes_payload))
                            continue

                        await upstream.send(prepared_segment)
                        logger.debug('Forwarded realtime binary frame size_bytes=%s', len(prepared_segment))

            async def upstream_to_client() -> None:
                while True:
                    frame = await upstream.recv()
                    if isinstance(frame, bytes):
                        await client_socket.send_bytes(frame)
                        logger.debug('Relayed realtime binary frame from upstream size_bytes=%s', len(frame))
                    else:
                        await client_socket.send_text(frame)
                        try:
                            envelope = json.loads(frame)
                            logger.debug('Relayed realtime upstream envelope type=%s', envelope.get('type'))
                        except json.JSONDecodeError:
                            logger.debug('Relayed realtime upstream text frame (non-json)')

            sender_task = asyncio.create_task(client_to_upstream())
            receiver_task = asyncio.create_task(upstream_to_client())

            done, pending = await asyncio.wait(
                {sender_task, receiver_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            for task in done:
                exc = task.exception()
                if exc:
                    raise exc

        logger.info('Upstream realtime relay closed')

    async def _prepare_video_segment(self, payload: bytes) -> bytes | None:
        if len(payload) == 0:
            return None

        looks_like_mp4 = len(payload) >= 8 and payload[4:8] == b'ftyp'
        if not looks_like_mp4:
            logger.debug('Stream segment is not mp4-like; forwarding without faststart validation')
            return payload

        ffmpeg_path = shutil.which('ffmpeg')
        if not ffmpeg_path:
            logger.warning('ffmpeg is not installed on PATH; sending segment without re-encode/faststart verification')
            return payload

        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = f'{temp_dir}/input.bin'
            output_path = f'{temp_dir}/output.mp4'

            with open(input_path, 'wb') as input_file:
                input_file.write(payload)

            command = [
                ffmpeg_path,
                '-hide_banner',
                '-loglevel', 'error',
                '-y',
                '-i',
                input_path,
                '-map',
                '0',
                '-c',
                'copy',
                '-movflags',
                '+faststart',
                output_path,
            ]

            try:
                result = subprocess.run(command, capture_output=True, check=False, text=True)
            except OSError as exc:
                logger.warning('ffmpeg execution failed, forwarding original segment instead: %s', exc)
                return payload

            if result.returncode != 0:
                stderr = (result.stderr or '').strip()
                logger.warning('ffmpeg rejected stream segment as malformed/truncated: %s', stderr)
                return None

            try:
                with open(output_path, 'rb') as output_file:
                    encoded = output_file.read()
            except OSError as exc:
                logger.warning('Unable to read ffmpeg output, forwarding original segment instead: %s', exc)
                return payload

            if len(encoded) == 0:
                logger.warning('ffmpeg produced empty output for a stream segment')
                return None

            logger.debug('Validated and faststarted stream segment input_bytes=%s output_bytes=%s', len(payload), len(encoded))
            return encoded
