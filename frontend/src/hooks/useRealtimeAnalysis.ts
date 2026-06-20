import { useState, useRef, useCallback } from "react";
import { parseInterhumanResponse, InterhumanResponse } from "../lib/parsers/interhumanParser";
import { appLogger } from "../lib/logger";

type RealtimeUpdate = {
  type?: string;
  data?: any;
  analysis?: any;
  error_id?: string;
  message?: string;
};

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
    appLogger.info("realtime", "Opening websocket", {
      endpoint: "ws://localhost:8000/v0/real-time/analyze",
      sessionId,
    });

    const ws = new WebSocket("ws://localhost:8000/v0/real-time/analyze");
    socketRef.current = ws;

    ws.onopen = () => {
      // Send the initial session configuration
      const resolvedSessionId = sessionId || `session_${Date.now()}`;
      ws.send(JSON.stringify({ session_id: resolvedSessionId }));
      appLogger.info("realtime", "Websocket connected", { sessionId: resolvedSessionId });
    };

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as RealtimeUpdate;
        appLogger.debug("realtime", "Received websocket message", { type: update.type || "legacy" });

        if (update.error_id) {
          setError(update.message || "Real-time analysis error");
          appLogger.warn("realtime", "Realtime returned error payload", update);
          setActive(false);
          return;
        }

        if (update.type === "error") {
          const msg = update.data?.message || "Real-time analysis error";
          setError(msg);
          appLogger.warn("realtime", "Realtime error envelope received", update);
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
        appLogger.error("realtime", "Failed to parse realtime update", {
          error: String(err),
          raw: event.data,
        });
      }
    };

    ws.onerror = (evt) => {
      setError("WebSocket connection error");
      appLogger.error("realtime", "Websocket transport error", evt);
      setActive(false);
    };

    ws.onclose = () => {
      appLogger.info("realtime", "Websocket closed");
      setActive(false);
    };
  }, []);

  const stopAnalysis = useCallback(() => {
    appLogger.info("realtime", "Stopping realtime analysis session");
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
