from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

from .sample_data import SAMPLE_ANALYSIS

API_BASE = 'https://api.interhuman.ai'
UPLOAD_ENDPOINT = '/v1/upload/analyze'
REALTIME_ENDPOINT = '/v0/real-time/analyze'
STREAM_ENDPOINT = '/v1/stream/analyze'


class InterhumanService:
    def __init__(self, api_key: str | None) -> None:
        self.api_key = api_key or ''

    async def upload_and_analyze(self, file_bytes: bytes, filename: str | None, content_type: str | None) -> dict[str, Any]:
        if not self.api_key:
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
            response = await client.post(
                API_BASE + UPLOAD_ENDPOINT,
                headers={'Authorization': f'Bearer {self.api_key}'},
                files=files,
                data=data,
            )

        response.raise_for_status()
        return response.json()

    async def stream_updates(self, session_id: str | None = None) -> list[dict[str, Any]]:
        seed = SAMPLE_ANALYSIS.model_dump()
        updates: list[dict[str, Any]] = []
        for index, signal in enumerate(seed['signals']):
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
        return updates
