from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SessionStore:
    def __init__(self, file_path: Path | None = None) -> None:
        # Store at repository root so it is easy to inspect alongside runtime logs.
        self.file_path = file_path or (Path(__file__).resolve().parents[2] / 'session.json')
        self._lock = threading.Lock()
        self._ensure_file()

    def _ensure_file(self) -> None:
        if self.file_path.exists():
            return
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        initial = {
            'updated_at': _utc_now(),
            'sessions': {},
        }
        self.file_path.write_text(json.dumps(initial, indent=2), encoding='utf-8')

    def _read(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.file_path.read_text(encoding='utf-8'))
            if isinstance(payload, dict):
                payload.setdefault('sessions', {})
                return payload
        except Exception:
            pass
        return {'updated_at': _utc_now(), 'sessions': {}}

    def _write(self, payload: dict[str, Any]) -> None:
        payload['updated_at'] = _utc_now()
        self.file_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')

    def ensure_session(self, session_id: str) -> dict[str, Any]:
        with self._lock:
            payload = self._read()
            sessions = payload.setdefault('sessions', {})
            if session_id not in sessions:
                now = _utc_now()
                sessions[session_id] = {
                    'thread_id': str(uuid4()),
                    'created_at': now,
                    'updated_at': now,
                    'last_run_at': now,
                    'responses': [],
                }
            else:
                sessions[session_id]['last_run_at'] = _utc_now()
                sessions[session_id]['updated_at'] = _utc_now()
            self._write(payload)
            return sessions[session_id]

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        with self._lock:
            payload = self._read()
            return payload.get('sessions', {}).get(session_id)

    def append_response(self, session_id: str, source: str, response: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            payload = self._read()
            sessions = payload.setdefault('sessions', {})
            session = sessions.get(session_id)
            if session is None:
                now = _utc_now()
                session = {
                    'thread_id': str(uuid4()),
                    'created_at': now,
                    'updated_at': now,
                    'last_run_at': now,
                    'responses': [],
                }
                sessions[session_id] = session

            responses: list[dict[str, Any]] = session.setdefault('responses', [])
            responses.append(
                {
                    'timestamp': _utc_now(),
                    'source': source,
                    'payload': response,
                }
            )

            # Bound session size to keep prompt payload under control.
            if len(responses) > 100:
                session['responses'] = responses[-100:]

            session['updated_at'] = _utc_now()
            session['last_run_at'] = _utc_now()
            self._write(payload)
            return session

    def build_context(self, session_id: str, max_items: int = 10) -> str | None:
        session = self.get_session(session_id)
        if not session:
            return None

        responses = session.get('responses', [])
        if not responses:
            return (
                f"Session {session_id} is valid (thread_id={session.get('thread_id')}) "
                'but no Interhuman responses are recorded yet.'
            )

        trimmed = responses[-max_items:]
        compact = [
            {
                'timestamp': item.get('timestamp'),
                'source': item.get('source'),
                'type': (item.get('payload') or {}).get('type'),
                'payload': item.get('payload'),
            }
            for item in trimmed
        ]
        return (
            f"Session context for session_id={session_id}, thread_id={session.get('thread_id')}\n"
            f"Recent Interhuman responses (latest {len(compact)}):\n"
            f"{json.dumps(compact, ensure_ascii=True)}"
        )
