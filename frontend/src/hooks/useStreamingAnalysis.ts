import { useState, useRef, useCallback } from "react";
import { parseInterhumanResponse, InterhumanResponse } from "../lib/parsers/interhumanParser";
import { appLogger } from "../lib/logger";

type StreamUpdate = {
  type?: string;
  data?: any;
  analysis?: any;
  error_id?: string;
  message?: string;
};

type ActiveSignal = {
  type: string;
  start: number;
  probability: "low" | "medium" | "high";
  rationale?: string;
};

export function useStreamingAnalysis() {
  const [data, setData] = useState<InterhumanResponse | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<any>(null);
  const closedSignalsRef = useRef<NonNullable<InterhumanResponse["signals"]>>([]);
  const activeSignalsRef = useRef<Record<string, ActiveSignal>>({});
  const engagementRef = useRef<NonNullable<InterhumanResponse["engagement_state"]>>([]);
  const currentEngagementRef = useRef<{ start: number; state: string } | null>(null);
  const conversationQualityRef = useRef<InterhumanResponse["conversation_quality"]>({});

  const clearLocalState = () => {
    closedSignalsRef.current = [];
    activeSignalsRef.current = {};
    engagementRef.current = [];
    currentEngagementRef.current = null;
    conversationQualityRef.current = {};
  };

  const buildSnapshot = (cursorTime?: number): InterhumanResponse => {
    const signals = [...closedSignalsRef.current];

    Object.values(activeSignalsRef.current).forEach((sig) => {
      const resolvedEnd = Math.max(sig.start + 3, cursorTime ?? sig.start + 3);
      signals.push({
        type: sig.type,
        start: sig.start,
        end: resolvedEnd,
        probability: sig.probability,
        rationale: sig.rationale,
      });
    });

    const engagement_state = [...engagementRef.current];
    if (currentEngagementRef.current) {
      const open = currentEngagementRef.current;
      engagement_state.push({
        start: open.start,
        end: Math.max(open.start + 3, cursorTime ?? open.start + 3),
        state: open.state,
      });
    }

    return {
      signals,
      engagement_state,
      conversation_quality: conversationQualityRef.current,
    };
  };

  const applyStreamEnvelope = (update: StreamUpdate): InterhumanResponse | null => {
    if (update.analysis) {
      return parseInterhumanResponse(update.analysis);
    }

    if (!update.type) {
      return null;
    }

    const envelopeType = update.type;
    const payload = update.data || {};

    if (envelopeType === "conversation_quality.updated") {
      if (payload.overall && typeof payload.overall === "object") {
        conversationQualityRef.current = payload.overall;
      } else if (Array.isArray(payload.timeline) && payload.timeline.length > 0) {
        conversationQualityRef.current = payload.timeline;
      }
      return buildSnapshot();
    }

    if (envelopeType === "engagement.updated") {
      const start = typeof payload.start === "number" ? payload.start : undefined;
      const state = typeof payload.state === "string" ? payload.state : "neutral";
      if (start !== undefined) {
        if (currentEngagementRef.current) {
          const prev = currentEngagementRef.current;
          engagementRef.current.push({ start: prev.start, end: start, state: prev.state });
        }
        currentEngagementRef.current = { start, state };
        return buildSnapshot(start);
      }
      return buildSnapshot();
    }

    if (envelopeType === "signal.detected" || envelopeType === "signal.updated") {
      const signalType = typeof payload.signal_type === "string" ? payload.signal_type.toLowerCase() : undefined;
      const start = typeof payload.start === "number" ? payload.start : undefined;
      if (signalType && start !== undefined) {
        const prior = activeSignalsRef.current[signalType];
        if (prior) {
          closedSignalsRef.current.push({
            type: prior.type,
            start: prior.start,
            end: start,
            probability: prior.probability,
            rationale: prior.rationale,
          });
        }
        const probability = payload.probability || prior?.probability || "medium";
        activeSignalsRef.current[signalType] = {
          type: signalType,
          start,
          probability,
          rationale: payload.rationale || prior?.rationale,
        };
        return buildSnapshot(start);
      }
      return buildSnapshot();
    }

    if (envelopeType === "signal.ended") {
      const signalType = typeof payload.signal_type === "string" ? payload.signal_type.toLowerCase() : undefined;
      const end = typeof payload.end === "number" ? payload.end : undefined;
      if (signalType && end !== undefined) {
        const prior = activeSignalsRef.current[signalType];
        if (prior) {
          closedSignalsRef.current.push({
            type: prior.type,
            start: prior.start,
            end,
            probability: prior.probability,
            rationale: prior.rationale,
          });
          delete activeSignalsRef.current[signalType];
        }
        return buildSnapshot(end);
      }
      return buildSnapshot();
    }

    // session.ready/session.updated and unknown envelopes keep current state intact
    return buildSnapshot();
  };

  const stopAnalysis = useCallback(() => {
    appLogger.info("streaming", "Stopping stream analysis session");
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
    }
    clearLocalState();
    setActive(false);
  }, []);

  const startAnalysis = useCallback((sessionId?: string) => {
    stopAnalysis();

    setActive(true);
    setError(null);
    setData(null);
    clearLocalState();
    appLogger.info("streaming", "Opening websocket", {
      endpoint: "ws://localhost:8000/v1/stream/analyze",
      sessionId,
    });

    const ws = new WebSocket("ws://localhost:8000/v1/stream/analyze");
    socketRef.current = ws;
    const activeSessionId = sessionId || `session_stream_${Date.now()}`;

    ws.onopen = () => {
      // Simulate continuous audio/video chunk submissions by sending a control packet every 3 seconds
      ws.send(JSON.stringify({ session_id: activeSessionId }));
      appLogger.info("streaming", "Websocket connected", { sessionId: activeSessionId });

      intervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ session_id: activeSessionId }));
          appLogger.debug("streaming", "Sent keepalive control packet", { sessionId: activeSessionId });
        }
      }, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as StreamUpdate;
        appLogger.debug("streaming", "Received websocket message", { type: update.type || "legacy" });

        if (update.error_id) {
          setError(update.message || "Streaming analysis error");
          appLogger.error("streaming", "Stream returned error payload", update);
          stopAnalysis();
          return;
        }

        if (update.type === "error") {
          const msg = update.data?.message || "Streaming analysis error";
          setError(msg);
          appLogger.error("streaming", "Interhuman error envelope received", update);
          stopAnalysis();
          return;
        }

        const snapshot = applyStreamEnvelope(update);
        if (snapshot) {
          const parsed = parseInterhumanResponse(snapshot);
          setData(parsed);
        }
      } catch (err) {
        appLogger.error("streaming", "Failed to parse websocket payload", {
          error: String(err),
          raw: event.data,
        });
      }
    };

    ws.onerror = (evt) => {
      setError("WebSocket connection error");
      appLogger.error("streaming", "Websocket transport error", evt);
      stopAnalysis();
    };

    ws.onclose = () => {
      appLogger.info("streaming", "Websocket closed");
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
