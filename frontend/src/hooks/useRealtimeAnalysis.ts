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

type ActiveSignal = {
  type: string;
  start: number;
  probability: "low" | "medium" | "high";
  rationale?: string;
};

export function useRealtimeAnalysis() {
  const [data, setData] = useState<InterhumanResponse | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const closedSignalsRef = useRef<NonNullable<InterhumanResponse["signals"]>>([]);
  const activeSignalsRef = useRef<Record<string, ActiveSignal>>({});
  const conversationQualityRef = useRef<InterhumanResponse["conversation_quality"]>({});

  const clearLocalState = () => {
    closedSignalsRef.current = [];
    activeSignalsRef.current = {};
    conversationQualityRef.current = {};
  };

  const stopMediaCapture = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      mediaRecorderRef.current = null;
    }

    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
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

    return {
      signals,
      engagement_state: [],
      conversation_quality: conversationQualityRef.current,
    };
  };

  const applyRealtimeEnvelope = (update: RealtimeUpdate): InterhumanResponse | null => {
    if (update.analysis) {
      return parseInterhumanResponse(update.analysis);
    }

    if (!update.type) {
      return null;
    }

    const envelopeType = update.type;
    const payload = update.data || {};

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

    if (envelopeType === "conversation_quality.updated") {
      if (payload.overall && typeof payload.overall === "object") {
        conversationQualityRef.current = payload.overall;
      } else if (Array.isArray(payload.timeline) && payload.timeline.length > 0) {
        conversationQualityRef.current = payload.timeline;
      }
      return buildSnapshot();
    }

    return buildSnapshot();
  };

  const stopAnalysis = useCallback(() => {
    appLogger.info("realtime", "Stopping realtime analysis session");
    stopMediaCapture();
    if (socketRef.current) {
      socketRef.current.close();
    }
    clearLocalState();
    setActive(false);
  }, []);

  const startMediaCapture = useCallback(async (ws: WebSocket, selectedCameraId?: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: selectedCameraId
        ? { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });

    mediaStreamRef.current = stream;

    const mimeCandidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];

    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
    mediaRecorderRef.current = recorder;

    recorder.onstart = () => {
      appLogger.info("realtime", "MediaRecorder started", { mimeType });
    };

    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return;
      if (ws.readyState !== WebSocket.OPEN) {
        appLogger.warn("realtime", "Dropping chunk because websocket is not open", { sizeBytes: event.data.size });
        return;
      }

      const payload = await event.data.arrayBuffer();
      ws.send(payload);
      appLogger.debug("realtime", "Sent binary stream chunk", { sizeBytes: payload.byteLength });
    };

    recorder.onerror = (event) => {
      appLogger.error("realtime", "MediaRecorder error", event);
      setError("Media capture error during realtime analysis");
      stopAnalysis();
    };

    recorder.onstop = () => {
      appLogger.info("realtime", "MediaRecorder stopped");
    };

    recorder.start(3100);
  }, [stopAnalysis]);

  const startAnalysis = useCallback((sessionId?: string, selectedCameraId?: string) => {
    stopAnalysis();

    setActive(true);
    setError(null);
    setData(null);
    clearLocalState();
    appLogger.info("realtime", "Opening websocket", {
      endpoint: "ws://localhost:8000/v0/real-time/analyze",
      sessionId,
      selectedCameraId,
    });

    const ws = new WebSocket("ws://localhost:8000/v0/real-time/analyze");
    socketRef.current = ws;
    const resolvedSessionId = sessionId || `session_${Date.now()}`;

    ws.onopen = () => {
      ws.send(JSON.stringify({ session_id: resolvedSessionId }));
      appLogger.info("realtime", "Websocket connected", { sessionId: resolvedSessionId });

      startMediaCapture(ws, selectedCameraId).catch((captureError) => {
        appLogger.error("realtime", "Unable to start media capture", captureError);
        setError("Unable to access camera for realtime analysis. Check browser camera permissions.");
        stopAnalysis();
      });
    };

    ws.onmessage = (event) => {
      try {
        if (typeof event.data !== "string") {
          appLogger.debug("realtime", "Ignoring non-text websocket message", {
            dataType: typeof event.data,
          });
          return;
        }

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

        const snapshot = applyRealtimeEnvelope(update);
        if (snapshot) {
          const parsed = parseInterhumanResponse(snapshot);
          setData(parsed);
        }

        if (update.type === "synthesis.generated") {
          appLogger.info("realtime", "Synthesis generated", update.data);
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
      stopAnalysis();
    };

    ws.onclose = () => {
      stopMediaCapture();
      appLogger.info("realtime", "Websocket closed");
      setActive(false);
    };
  }, [startMediaCapture, stopAnalysis]);

  return {
    data,
    active,
    error,
    startAnalysis,
    stopAnalysis,
  };
}
