import { useState, useRef, useCallback } from "react";
import { parseInterhumanResponse, InterhumanResponse } from "../lib/parsers/interhumanParser";

export function useStreamingAnalysis() {
  const [data, setData] = useState<InterhumanResponse | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<any>(null);

  const stopAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
    }
    setActive(false);
  }, []);

  const startAnalysis = useCallback((sessionId?: string) => {
    stopAnalysis();

    setActive(true);
    setError(null);
    setData(null);

    const ws = new WebSocket("ws://localhost:8000/v1/stream/analyze");
    socketRef.current = ws;
    const activeSessionId = sessionId || `session_stream_${Date.now()}`;

    ws.onopen = () => {
      // Simulate continuous audio/video chunk submissions by sending a control packet every 3 seconds
      ws.send(JSON.stringify({ session_id: activeSessionId }));

      intervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ session_id: activeSessionId }));
        }
      }, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (update.error_id) {
          setError(update.message || "Streaming analysis error");
          stopAnalysis();
          return;
        }

        const analysisData = update.analysis;
        if (analysisData) {
          const parsed = parseInterhumanResponse(analysisData);
          setData(parsed);
        }
      } catch (err) {
        console.error("Failed to parse streaming update:", err);
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
      stopAnalysis();
    };

    ws.onclose = () => {
      setActive(false);
    };
  }, [stopAnalysis]);

  return {
    data,
    active,
    error,
    startAnalysis,
    stopAnalysis,
  };
}
