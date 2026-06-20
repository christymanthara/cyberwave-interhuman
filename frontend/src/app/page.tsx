"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useUploadAnalysis } from "../hooks/useUploadAnalysis";
import { useRealtimeAnalysis } from "../hooks/useRealtimeAnalysis";
import { useStreamingAnalysis } from "../hooks/useStreamingAnalysis";
import { ModeSelector, AnalysisMode } from "../components/analysis/ModeSelector";
import { LiveVideoPreview } from "../components/analysis/LiveVideoPreview";
import { SignalTimeline } from "../components/analysis/SignalTimeline";
import { SignalLegend } from "../components/analysis/SignalLegend";
import { EngagementTimeline } from "../components/analysis/EngagementTimeline";
import { QualityMetrics } from "../components/analysis/QualityMetrics";
import { AgentChat } from "../components/analysis/AgentChat";
import { ConversationQuality, QualityTimelinePoint } from "../lib/parsers/interhumanParser";
import {
  Activity, Play, Square, Upload, AlertCircle, Loader2, Sparkles, HelpCircle, FileText, Bot, Compass, CheckCircle
} from "lucide-react";

export default function Home() {
  const [activeMode, setActiveMode] = useState<AnalysisMode>("upload");
  const [sessionId, setSessionId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [qualityHistory, setQualityHistory] = useState<QualityTimelinePoint[]>([]);

  // Generate unique session IDs when toggling modes
  useEffect(() => {
    const timeSuffix = Date.now().toString().slice(-6);
    setSessionId(`session_${activeMode}_${timeSuffix}`);
    // Clear selected file and quality history on mode toggle
    setSelectedFile(null);
    setQualityHistory([]);
  }, [activeMode]);

  // Hook integrations
  const {
    analyzeFile,
    loading: uploadLoading,
    error: uploadError,
    data: uploadData,
    clearData: clearUpload,
  } = useUploadAnalysis();

  const {
    data: realtimeData,
    active: realtimeActive,
    error: realtimeError,
    startAnalysis: startRealtime,
    stopAnalysis: stopRealtime,
  } = useRealtimeAnalysis();

  const {
    data: streamingData,
    active: streamingActive,
    error: streamingError,
    startAnalysis: startStreaming,
    stopAnalysis: stopStreaming,
  } = useStreamingAnalysis();

  // Unified Mode Stopping & Switching
  const handleModeChange = (mode: AnalysisMode) => {
    stopRealtime();
    stopStreaming();
    clearUpload();
    setActiveMode(mode);
  };

  // Determine active dataset and loading states based on current selection
  const activeData = useMemo(() => {
    if (activeMode === "upload") return uploadData;
    if (activeMode === "realtime") return realtimeData;
    return streamingData;
  }, [activeMode, uploadData, realtimeData, streamingData]);

  const activeError = useMemo(() => {
    if (activeMode === "upload") return uploadError;
    if (activeMode === "realtime") return realtimeError;
    return streamingError;
  }, [activeMode, uploadError, realtimeError, streamingError]);

  const isRunning = useMemo(() => {
    if (activeMode === "upload") return uploadLoading;
    if (activeMode === "realtime") return realtimeActive;
    return streamingActive;
  }, [activeMode, uploadLoading, realtimeActive, streamingActive]);

  // Accumulate single quality update objects into a historical timeline
  useEffect(() => {
    if (!activeData) {
      setQualityHistory([]);
      return;
    }

    // Case 1: Upload response contains pre-allocated timeline points
    if (Array.isArray(activeData.conversation_quality)) {
      setQualityHistory(activeData.conversation_quality);
      return;
    }

    // Case 2: Live websocket emits single quality update point. Accumulate it.
    if (activeData.conversation_quality && typeof activeData.conversation_quality === "object") {
      const currentQuality = activeData.conversation_quality as ConversationQuality;
      if (Object.keys(currentQuality).length === 0) return;

      // Extract current second from signals, or estimate based on history length
      let currentSecond = 0;
      if (activeData.signals && activeData.signals.length > 0) {
        currentSecond = Math.max(...activeData.signals.map((s) => s.end));
      } else {
        currentSecond = (qualityHistory.length + 1) * 3;
      }

      const alreadyLogged = qualityHistory.some(
        (point) => Math.abs(point.end - currentSecond) < 0.5
      );

      if (!alreadyLogged) {
        setQualityHistory((prev) => [
          ...prev,
          {
            start: Math.max(0, currentSecond - 3),
            end: currentSecond,
            values: currentQuality,
          },
        ]);
      }
    }
  }, [activeData]);

  // Compute maximum session time
  const maxTime = useMemo(() => {
    let t = 30;
    if (!activeData) return t;

    if (activeData.signals && activeData.signals.length > 0) {
      const maxSig = Math.max(...activeData.signals.map((s) => s.end));
      t = Math.max(t, maxSig);
    }
    if (activeData.engagement_state && activeData.engagement_state.length > 0) {
      const maxEng = Math.max(...activeData.engagement_state.map((e) => e.end));
      t = Math.max(t, maxEng);
    }
    if (qualityHistory.length > 0) {
      const maxQual = Math.max(...qualityHistory.map((q) => q.end));
      t = Math.max(t, maxQual);
    }
    return t;
  }, [activeData, qualityHistory]);

  // Compute stats for overview
  const totalSignals = activeData?.signals?.length || 0;

  const topSignals = useMemo(() => {
    if (!activeData?.signals || activeData.signals.length === 0) return [];
    const counts: Record<string, number> = {};
    activeData.signals.forEach((sig) => {
      counts[sig.type] = (counts[sig.type] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [activeData]);

  const overallQualityScore = useMemo(() => {
    if (qualityHistory.length === 0) return 0;
    const last = qualityHistory[qualityHistory.length - 1];
    const val = last.values.quality_index || 0;
    return val <= 1 ? Math.round(val * 100) : Math.round(val);
  }, [qualityHistory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = () => {
    if (selectedFile) {
      analyzeFile(selectedFile);
    }
  };

  const handleStartAnalysis = () => {
    if (activeMode === "realtime") {
      startRealtime(sessionId);
    } else if (activeMode === "streaming") {
      startStreaming(sessionId, selectedCameraId || undefined);
    }
  };

  const handleStopAnalysis = () => {
    if (activeMode === "realtime") {
      stopRealtime();
    } else if (activeMode === "streaming") {
      stopStreaming();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 text-zinc-900 font-sans pb-16 dark:bg-zinc-950 dark:text-zinc-50">
      {/* Sticky Premium Header */}
      <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 shadow-md">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight sm:text-base bg-gradient-to-r from-zinc-900 to-zinc-650 bg-clip-text text-transparent dark:from-zinc-50 dark:to-zinc-300">
                InterHuman AI
              </h1>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider dark:text-zinc-500">
                Conversation Chemistry Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                isRunning ? "bg-emerald-400" : "bg-zinc-400"
              }`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${
                isRunning ? "bg-emerald-500" : "bg-zinc-400"
              }`} />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {isRunning ? "Active Session Running" : "System Standby"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid Content Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* LEFT SIDEBAR: Ingestion & Control (Columns 1-4) */}
          <div className="flex flex-col gap-6 lg:col-span-4">
            {/* Mode Switcher */}
            <ModeSelector activeMode={activeMode} onModeChange={handleModeChange} disabled={isRunning} />

            {/* Mode Controls Panel */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                {activeMode === "upload" && "Ingest Media File"}
                {activeMode === "realtime" && "Websocket Live Session"}
                {activeMode === "streaming" && "Continuous Video Stream"}
              </h3>

              {/* Upload Form */}
              {activeMode === "upload" && (
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 rounded-xl p-6 cursor-pointer hover:bg-zinc-50/50 transition duration-200 dark:border-zinc-800 dark:hover:bg-zinc-900/10">
                    <Upload className="h-8 w-8 text-zinc-400 mb-2" />
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      {selectedFile ? selectedFile.name : "Select Audio/Video file"}
                    </span>
                    <span className="text-[10px] text-zinc-400 mt-1">MP3, WAV, MP4 or WebM up to 50MB</span>
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={isRunning}
                    />
                  </label>

                  <button
                    onClick={handleUploadSubmit}
                    disabled={!selectedFile || isRunning}
                    className="w-full rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-250 flex items-center justify-center gap-2"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing Audio...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        Analyze File
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Realtime & Streaming Controls */}
              {activeMode !== "upload" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                      Session Identifier
                    </label>
                    <input
                      type="text"
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                      placeholder="session_id_hash"
                      disabled={isRunning}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-xs outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-50"
                    />
                  </div>

                  {!isRunning ? (
                    <button
                      onClick={handleStartAnalysis}
                      className="w-full rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 flex items-center justify-center gap-2"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      Start Feed Analysis
                    </button>
                  ) : (
                    <button
                      onClick={handleStopAnalysis}
                      className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-rose-500 flex items-center justify-center gap-2 animate-pulse"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      Stop Feed Connection
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Camera feed preview for realtime / streaming mode */}
            {activeMode !== "upload" && (
              <LiveVideoPreview
                isActive={isRunning}
                selectedCameraId={selectedCameraId}
                onCameraSelect={setSelectedCameraId}
              />
            )}

            {/* AI Agent Chat Copilot Sidepanel */}
            <AgentChat sessionId={sessionId} />
          </div>

          {/* RIGHT PANEL: Interactive Dashboard Visualizations (Columns 5-12) */}
          <div className="flex flex-col gap-6 lg:col-span-8">
            {/* If no data has been parsed and we are not loading, show empty welcome state */}
            {!activeData && !isRunning ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950 h-full min-h-[500px]">
                <div className="rounded-2xl bg-indigo-50 p-4 dark:bg-indigo-950/30">
                  <Compass className="h-10 w-10 text-indigo-500 dark:text-indigo-400" />
                </div>
                <h2 className="mt-6 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Welcome to InterHuman AI Dashboard
                </h2>
                <p className="mt-2 max-w-sm text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Start an ingestion session on the left panel to begin detecting social signals, conversational alignment, and visual speech metrics.
                </p>

                <div className="mt-8 grid grid-cols-1 gap-4 text-left sm:grid-cols-3 max-w-xl">
                  <div className="rounded-xl border border-zinc-150 p-4 dark:border-zinc-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white dark:bg-zinc-50 dark:text-zinc-950">
                      1
                    </span>
                    <h4 className="mt-3 text-xs font-bold text-zinc-900 dark:text-zinc-50">Ingestion Ingestion</h4>
                    <p className="mt-1 text-[10px] text-zinc-400 leading-normal">
                      Upload audio files or start high-performance live WebSocket streams.
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-150 p-4 dark:border-zinc-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white dark:bg-zinc-50 dark:text-zinc-950">
                      2
                    </span>
                    <h4 className="mt-3 text-xs font-bold text-zinc-900 dark:text-zinc-50">Chemistry Visualizers</h4>
                    <p className="mt-1 text-[10px] text-zinc-400 leading-normal">
                      Inspect 10 overlapping social signals, continuous engagement levels, and SVG trend plots.
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-150 p-4 dark:border-zinc-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white dark:bg-zinc-50 dark:text-zinc-950">
                      3
                    </span>
                    <h4 className="mt-3 text-xs font-bold text-zinc-900 dark:text-zinc-50">Agent Co-Pilot</h4>
                    <p className="mt-1 text-[10px] text-zinc-400 leading-normal">
                      Engage with the conversational AI agent about summaries and recommendations.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6 animate-in fade-in duration-300">
                {/* Active Session Status & Overview Header */}
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white dark:bg-zinc-50 dark:text-zinc-950">
                          Session Overview
                        </span>
                        <span className="text-[11px] font-semibold text-zinc-400">
                          ID: {sessionId.slice(0, 18)}...
                        </span>
                      </div>
                      <h2 className="text-base font-bold text-zinc-900 mt-1 dark:text-zinc-50">
                        {activeMode === "upload" ? "Media Analysis Report" : "Live Streaming Dashboard"}
                      </h2>
                    </div>

                    {/* Meta quick score summary */}
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">
                          Quality Index
                        </p>
                        <p className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                          {overallQualityScore}%
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">
                          Total Signals
                        </p>
                        <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                          {totalSignals}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">
                          Duration
                        </p>
                        <p className="text-lg font-extrabold text-zinc-800 dark:text-zinc-200">
                          {maxTime.toFixed(0)}s
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Top detected social signals row */}
                  {topSignals.length > 0 && (
                    <div className="mt-4 border-t border-zinc-100 pt-3 flex flex-wrap items-center gap-2 text-xs dark:border-zinc-850">
                      <span className="font-bold text-zinc-400 uppercase tracking-wide text-[9px]">
                        Dominant Signals Detected:
                      </span>
                      {topSignals.map(([type, count]) => (
                        <span
                          key={type}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 capitalize dark:bg-zinc-900 dark:text-zinc-300 border border-zinc-200/40 dark:border-zinc-850"
                        >
                          {type} ({count})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* API Error alerts */}
                {activeError && (
                  <div className="rounded-xl border border-rose-250 bg-rose-50/50 p-4 dark:border-rose-950 dark:bg-rose-950/20">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-rose-900 dark:text-rose-400">Analysis Error</h4>
                        <p className="text-xs text-rose-700 mt-0.5 leading-relaxed dark:text-rose-500">
                          {activeError}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading indicator when waiting for live WebSocket/Upload to respond */}
                {isRunning && !activeData && (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950 min-h-[300px]">
                    <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mb-3" />
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      Processing Conversation Analytics...
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-normal">
                      Connecting feed signals, syncing overlays, and establishing secure websocket session handlers. Please hold.
                    </p>
                  </div>
                )}

                {/* Ingestion dashboards: Quality, Social Signals, and Engagement tracks */}
                {(activeData || qualityHistory.length > 0) && (
                  <div className="flex flex-col gap-6">
                    {/* SVG Metrics & KPI card deck */}
                    <QualityMetrics
                      quality={activeData?.conversation_quality as ConversationQuality}
                      history={qualityHistory}
                      maxTime={maxTime}
                    />

                    {/* Social Signals Legend & Gantt Timeline */}
                    <div className="flex flex-col gap-4">
                      <SignalTimeline signals={activeData?.signals || []} />
                      <SignalLegend />
                    </div>

                    {/* Continuous Engagement Timeline */}
                    <EngagementTimeline
                      engagement={activeData?.engagement_state || []}
                      maxTime={maxTime}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
