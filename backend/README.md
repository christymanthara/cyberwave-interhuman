# FastAPI backend

Local backend that proxies Interhuman upload analysis and exposes websocket endpoints for realtime and streaming analysis.

## Run

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Set `INTERHUMAN_API_KEY` in your environment for live proxying. If the key is absent, the backend returns deterministic sample analysis data so the frontend can still be developed locally.

## Streaming relay behavior

- `WS /v1/stream/analyze`:
	- With `INTERHUMAN_API_KEY` set, this endpoint relays frames to Interhuman upstream `wss://api.interhuman.ai/v1/stream/analyze`.
	- Without `INTERHUMAN_API_KEY`, it falls back to deterministic mock updates.
- `WS /v0/real-time/analyze` currently returns an explicit `ih-realtime-not-implemented` error payload.

For best live-stream results, clients should send binary video chunks (>= 3s) to `/v1/stream/analyze`. The frontend control-only keepalive packets are translated to a one-time session config for compatibility, but no analysis can be produced without media frames.
