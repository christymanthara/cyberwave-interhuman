from __future__ import annotations

import json
import os
from typing import Annotated, Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .sample_data import SAMPLE_ANALYSIS
from .schemas import InterhumanError
from .service import InterhumanService

app = FastAPI(title='Interhuman Local API', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

service = InterhumanService(os.getenv('INTERHUMAN_API_KEY'))


@app.get('/healthz')
async def healthz() -> dict[str, str]:
    return {'status': 'ok'}


@app.post('/v1/upload/analyze')
async def upload_analyze(
    file: Annotated[UploadFile, File(...)],
    include: Annotated[list[str] | None, Form(alias='include[]')] = None,
) -> JSONResponse:
    del include
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail='Uploaded file is empty.')

    try:
        payload = await service.upload_and_analyze(file_bytes, file.filename, file.content_type)
    except httpx.HTTPStatusError as exc:  # type: ignore[name-defined]
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
        return JSONResponse(
            status_code=502,
            content=InterhumanError(
                error_id='ih-backend-error',
                correlation_id='unknown',
                link='https://docs.interhuman.ai',
                message=str(exc),
            ).model_dump(),
        )

    return JSONResponse(content=payload)


@app.websocket('/v0/real-time/analyze')
async def realtime_analyze(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        message = await websocket.receive_text()
        control: dict[str, Any] = json.loads(message)
        session_id = control.get('session_id')
        for update in await service.stream_updates(session_id=session_id):
            await websocket.send_json(update)
    except WebSocketDisconnect:
        return
    except Exception as exc:
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
    try:
        while True:
            message = await websocket.receive_text()
            control: dict[str, Any] = json.loads(message)
            session_id = control.get('session_id')
            for update in await service.stream_updates(session_id=session_id):
                await websocket.send_json(update)
    except WebSocketDisconnect:
        return
    except Exception as exc:
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
