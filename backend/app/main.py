from __future__ import annotations

import logging
import json
import os
from typing import Annotated, Any

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from .schemas import InterhumanError
from .service import InterhumanService
from .session_store import SessionStore

# Agent helpers (agent.py is kept untouched as a standalone script)
from backend.agent.agent import chat as agent_chat, stream_chat as agent_stream_chat

app = FastAPI(title='Interhuman Local API', version='0.1.0')

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO').upper(),
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

service = InterhumanService(os.getenv('INTERHUMAN_API_KEY'))
session_store = SessionStore()


# ---------------------------------------------------------------------------
# Chat request/response schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    history: list[ChatMessage] | None = None  # optional prior turns


class ChatResponse(BaseModel):
    reply: str


# ---------------------------------------------------------------------------
# Healthcheck
# ---------------------------------------------------------------------------

@app.get('/healthz')
async def healthz() -> dict[str, str]:
    return {'status': 'ok'}


# ---------------------------------------------------------------------------
# Agent chat endpoints
# ---------------------------------------------------------------------------

@app.post('/v1/chat', response_model=ChatResponse, tags=['chat'])
async def chat_endpoint(body: ChatRequest) -> ChatResponse:
    """
    Send a message to the AI agent and receive a full reply.

    - **message**: The user's text input.
    - **history**: Optional list of prior {role, content} turns for multi-turn context.
    """
    history = [
        {"role": m.role, "content": m.content}
        for m in (body.history or [])
    ]
    logger.info(
        'POST /v1/chat message_length=%s history_size=%s session_id=%s',
        len(body.message or ''),
        len(history),
        body.session_id,
    )

    if not body.session_id:
        raise HTTPException(status_code=400, detail='session_id is required for chat context.')

    existing = session_store.get_session(body.session_id)
    if existing is None:
        raise HTTPException(status_code=404, detail='Invalid session_id. Run an analysis session first.')

    context = session_store.build_context(body.session_id)
    if context:
        history = [
            {
                'role': 'system',
                'content': (
                    'Use this Interhuman session context to answer the user. '
                    'Prefer citing recent detected signals, engagement, and quality updates.\n\n'
                    + context
                ),
            }
        ] + history

    try:
        reply = await agent_chat(body.message, history or None)
    except Exception as exc:
        logger.exception('Chat agent error')
        raise HTTPException(status_code=502, detail=f"Agent error: {exc}") from exc
    return ChatResponse(reply=reply)


@app.post('/v1/chat/stream', tags=['chat'])
async def chat_stream_endpoint(body: ChatRequest) -> StreamingResponse:
    """
    Stream the agent's reply token-by-token as **Server-Sent Events**.

    Each event looks like:  `data: <text chunk>\\n\\n`
    The stream ends with:   `data: [DONE]\\n\\n`

    Connect from the frontend with the `EventSource` API or `fetch` + ReadableStream.
    """
    history = [
        {"role": m.role, "content": m.content}
        for m in (body.history or [])
    ]
    logger.info(
        'POST /v1/chat/stream message_length=%s history_size=%s session_id=%s',
        len(body.message or ''),
        len(history),
        body.session_id,
    )

    if not body.session_id:
        raise HTTPException(status_code=400, detail='session_id is required for chat context.')

    existing = session_store.get_session(body.session_id)
    if existing is None:
        raise HTTPException(status_code=404, detail='Invalid session_id. Run an analysis session first.')

    context = session_store.build_context(body.session_id)
    if context:
        history = [
            {
                'role': 'system',
                'content': (
                    'Use this Interhuman session context to answer the user. '
                    'Prefer citing recent detected signals, engagement, and quality updates.\n\n'
                    + context
                ),
            }
        ] + history

    async def event_generator():
        try:
            async for chunk in agent_stream_chat(body.message, history or None):
                # SSE format: each line must start with "data: "
                yield f"data: {chunk}\n\n"
        except Exception as exc:
            yield f"data: [ERROR] {exc}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering
        },
    )


@app.post('/v1/upload/analyze')
async def upload_analyze(
    file: Annotated[UploadFile, File(...)],
    include: Annotated[list[str] | None, Form(alias='include[]')] = None,
    session_id: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    del include
    resolved_session_id = session_id or f'upload_{os.urandom(4).hex()}'
    session_store.ensure_session(resolved_session_id)
    file_bytes = await file.read()
    logger.info(
        'POST /v1/upload/analyze filename=%s size_bytes=%s content_type=%s session_id=%s',
        file.filename,
        len(file_bytes),
        file.content_type,
        resolved_session_id,
    )
    if not file_bytes:
        raise HTTPException(status_code=400, detail='Uploaded file is empty.')

    try:
        payload = await service.upload_and_analyze(file_bytes, file.filename, file.content_type)
    except httpx.HTTPStatusError as exc:  # type: ignore[name-defined]
        logger.warning('Upload analyze upstream HTTP error status=%s', exc.response.status_code)
        response = exc.response
        try:
            error_payload = response.json()
        except Exception:
            error_payload = {
                'error_id': 'ih-upstream-error',
                'correlation_id': 'unknown',
                'link': 'https://docs.interhuman.ai',
                'message': response.text,
            }
        return JSONResponse(status_code=response.status_code, content=error_payload)
    except Exception as exc:  # pragma: no cover - defensive adapter
        logger.exception('Upload analyze backend adapter error')
        return JSONResponse(
            status_code=502,
            content=InterhumanError(
                error_id='ih-backend-error',
                correlation_id='unknown',
                link='https://docs.interhuman.ai',
                message=str(exc),
            ).model_dump(),
        )

    session_store.append_response(resolved_session_id, 'upload', payload)
    payload['_session'] = {
        'session_id': resolved_session_id,
        'thread_id': session_store.get_session(resolved_session_id).get('thread_id'),
    }
    return JSONResponse(content=payload)


@app.websocket('/v0/real-time/analyze')
async def realtime_analyze(websocket: WebSocket) -> None:
    await websocket.accept()
    logger.info('WS /v0/real-time/analyze connected client=%s', websocket.client)
    try:
        if service.api_key:
            logger.info('WS /v0/real-time/analyze running in live relay mode')
            await service.relay_realtime_session(
                websocket,
                lambda sid, envelope: session_store.append_response(
                    sid,
                    'realtime',
                    envelope,
                ) if sid else None,
                lambda sid: session_store.ensure_session(sid),
            )
            return

        logger.warning('WS /v0/real-time/analyze running in mock mode (no INTERHUMAN_API_KEY)')
        session_id: str | None = None
        while True:
            message = await websocket.receive()
            msg_type = message.get('type')
            if msg_type == 'websocket.disconnect':
                logger.info('WS /v0/real-time/analyze mock client disconnected client=%s', websocket.client)
                return

            text_payload = message.get('text')
            bytes_payload = message.get('bytes')

            if text_payload is not None:
                control: dict[str, Any] = json.loads(text_payload)
                session_id = control.get('session_id', session_id)
                if session_id:
                    session_store.ensure_session(session_id)
                logger.debug('WS /v0/real-time/analyze mock control_message session_id=%s', session_id)
            elif bytes_payload is not None:
                logger.debug('WS /v0/real-time/analyze mock received binary chunk size_bytes=%s', len(bytes_payload))

            for update in await service.stream_updates(session_id=session_id):
                if session_id:
                    session_store.append_response(session_id, 'realtime-mock', update)
                await websocket.send_json(update)
    except WebSocketDisconnect:
        logger.info('WS /v0/real-time/analyze disconnected client=%s', websocket.client)
        return
    except Exception as exc:
        logger.exception('Realtime websocket error')
        await websocket.send_json(
            InterhumanError(
                error_id='ih-realtime-error',
                correlation_id='unknown',
                link='https://docs.interhuman.ai',
                message=str(exc),
            ).model_dump()
        )
    finally:
        await websocket.close()


@app.websocket('/v1/stream/analyze')
async def stream_analyze(websocket: WebSocket) -> None:
    await websocket.accept()
    logger.info('WS /v1/stream/analyze connected client=%s', websocket.client)
    try:
        if service.api_key:
            logger.info('WS /v1/stream/analyze running in live relay mode')
            await service.relay_stream_session(
                websocket,
                lambda sid, envelope: session_store.append_response(
                    sid,
                    'stream',
                    envelope,
                ) if sid else None,
                lambda sid: session_store.ensure_session(sid),
            )
            return

        logger.warning('WS /v1/stream/analyze running in mock mode (no INTERHUMAN_API_KEY)')
        session_id: str | None = None
        while True:
            message = await websocket.receive()
            msg_type = message.get('type')
            if msg_type == 'websocket.disconnect':
                logger.info('WS /v1/stream/analyze mock client disconnected client=%s', websocket.client)
                return

            text_payload = message.get('text')
            bytes_payload = message.get('bytes')

            if text_payload is not None:
                control: dict[str, Any] = json.loads(text_payload)
                session_id = control.get('session_id', session_id)
                if session_id:
                    session_store.ensure_session(session_id)
                logger.debug('WS /v1/stream/analyze mock control_message session_id=%s', session_id)
            elif bytes_payload is not None:
                logger.debug('WS /v1/stream/analyze mock received binary chunk size_bytes=%s', len(bytes_payload))

            for update in await service.stream_updates(session_id=session_id):
                if session_id:
                    session_store.append_response(session_id, 'stream-mock', update)
                await websocket.send_json(update)
    except WebSocketDisconnect:
        logger.info('WS /v1/stream/analyze disconnected client=%s', websocket.client)
        return
    except Exception as exc:
        logger.exception('Stream websocket error')
        await websocket.send_json(
            InterhumanError(
                error_id='ih-stream-error',
                correlation_id='unknown',
                link='https://docs.interhuman.ai',
                message=str(exc),
            ).model_dump()
        )
    finally:
        await websocket.close()
