import { useState, useRef, useCallback } from "react";
import { parseInterhumanResponse, InterhumanResponse } from "../lib/parsers/interhumanParser";

export function useRealtimeAnalysis() {
  const [data, setData] = useState<InterhumanResponse | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const startAnalysis = useCallback((sessionId?: string) => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    setActive(true);
    setError(null);
    setData(null);

    const ws = new WebSocket("ws://localhost:8000/v0/real-time/analyze");
    socketRef.current = ws;

    ws.onopen = () => {
      // Send the initial session configuration
      ws.send(JSON.stringify({ session_id: sessionId || `session_${Date.now()}` }));
    };

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (update.error_id) {
          setError(update.message || "Real-time analysis error");
          setActive(false);
          return;
        }

        const analysisData = update.analysis;
        if (analysisData) {
          const parsed = parseInterhumanResponse(analysisData);
          setData(parsed);
        }

        if (update.type === "final") {
          setActive(false);
        }
      } catch (err) {
        console.error("Failed to parse real-time update:", err);
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
      setActive(false);
    };

    ws.onclose = () => {
      setActive(false);
    };
  }, []);

  const stopAnalysis = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    setActive(false);
  }, []);

  return {
    data,
    active,
    error,
    startAnalysis,
    stopAnalysis,
  };
}
