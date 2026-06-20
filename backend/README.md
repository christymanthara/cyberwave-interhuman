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
