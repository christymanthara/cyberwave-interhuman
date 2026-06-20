"use client";

import React, { useState, useMemo } from "react";
import { RawSignal, allocateLanes, ParsedSignal } from "../../lib/parsers/interhumanParser";
import { SIGNAL_CONFIG } from "./SignalLegend";
import { Info, Clock, AlertTriangle } from "lucide-react";

interface SignalTimelineProps {
  signals: RawSignal[];
}

export function SignalTimeline({ signals }: SignalTimelineProps) {
  const [selectedSignal, setSelectedSignal] = useState<ParsedSignal | null>(null);
  const [hoveredSignal, setHoveredSignal] = useState<ParsedSignal | null>(null);

  // Compute maximum end time for timeline scaling (minimum 30 seconds)
  const maxTime = useMemo(() => {
    if (signals.length === 0) return 30;
    const maxEnd = Math.max(...signals.map((s) => s.end));
    return Math.max(maxEnd, 30);
  }, [signals]);

  // Group signals by probability and calculate lanes for each group
  const groupedData = useMemo(() => {
    const high = signals.filter((s) => s.probability === "high");
    const medium = signals.filter((s) => s.probability === "medium");
    const low = signals.filter((s) => s.probability === "low");

    const highLanes = allocateLanes(high);
    const mediumLanes = allocateLanes(medium);
    const lowLanes = allocateLanes(low);

    const maxHighLane = highLanes.reduce((max, s) => Math.max(max, s.lane), -1);
    const maxMediumLane = mediumLanes.reduce((max, s) => Math.max(max, s.lane), -1);
    const maxLowLane = lowLanes.reduce((max, s) => Math.max(max, s.lane), -1);

    return {
      high: { signals: highLanes, maxLane: maxHighLane },
      medium: { signals: mediumLanes, maxLane: maxMediumLane },
      low: { signals: lowLanes, maxLane: maxLowLane },
    };
  }, [signals]);

  // Renders the horizontal tracks and signal blocks for a given probability level
  const renderProbabilityRow = (
    label: string,
    data: { signals: ParsedSignal[]; maxLane: number },
    bgClass: string
  ) => {
    const totalLanes = Math.max(data.maxLane + 1, 1);
    const rowHeight = totalLanes * 36 + 12; // Dynamic height based on lanes

    return (
      <div className={`relative flex border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${bgClass}`} style={{ minHeight: `${rowHeight}px` }}>
        {/* Row Label (Y-Axis Probability Bands) */}
        <div className="flex w-24 shrink-0 items-center justify-center border-r border-zinc-200 bg-zinc-50/50 p-2 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {label}
          </span>
        </div>

        {/* Timeline Track Area */}
        <div className="relative flex-1 p-2">
          {/* Lane Rows Background grid helper lines */}
          {Array.from({ length: totalLanes }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-b border-dashed border-zinc-100 dark:border-zinc-800/40"
              style={{
                top: `${i * 36 + 6}px`,
                height: "36px",
              }}
            />
          ))}

          {/* Render Signal Blocks */}
          {data.signals.map((sig, idx) => {
            const config = SIGNAL_CONFIG[sig.type as keyof typeof SIGNAL_CONFIG] || {
              label: sig.type,
              color: "bg-zinc-400 border-zinc-500 text-zinc-950",
              hex: "#a1a1aa",
            };

            const leftPercent = (sig.start / maxTime) * 100;
            const widthPercent = ((sig.end - sig.start) / maxTime) * 100;

            const isHovered = hoveredSignal === sig;
            const isSelected = selectedSignal === sig;

            return (
              <div
                key={idx}
                className={`absolute cursor-pointer rounded-md border py-1.5 px-2 transition-all duration-200 shadow-sm ${config.color} ${
                  isHovered || isSelected
                    ? "ring-2 ring-zinc-950 dark:ring-zinc-50 scale-[1.02] z-20"
                    : "opacity-90 hover:opacity-100"
                }`}
                style={{
                  left: `${leftPercent}%`,
                  width: `calc(${widthPercent}% - 4px)`,
                  top: `${sig.lane * 36 + 8}px`,
                  height: "28px",
                }}
                onMouseEnter={() => setHoveredSignal(sig)}
                onMouseLeave={() => setHoveredSignal(null)}
                onClick={() => setSelectedSignal(isSelected ? null : sig)}
              >
                <div className="flex items-center justify-between overflow-hidden h-full">
                  <span className="truncate text-[10px] font-bold uppercase tracking-wider">
                    {config.label}
                  </span>
                  <span className="text-[9px] opacity-75 font-semibold shrink-0 ml-1">
                    {sig.start.toFixed(0)}s-{sig.end.toFixed(0)}s
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Custom Timeline Container */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Social Signals Timeline</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Interactive Gantt display categorised by probability levels
            </p>
          </div>
        </div>

        {/* Timeline Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[640px] flex flex-col">
            {/* Probability Rows */}
            {renderProbabilityRow("High", groupedData.high, "bg-white dark:bg-zinc-950")}
            {renderProbabilityRow("Medium", groupedData.medium, "bg-zinc-50/20 dark:bg-zinc-900/10")}
            {renderProbabilityRow("Low", groupedData.low, "bg-white dark:bg-zinc-950")}

            {/* X-Axis Grid Labels (Time progression) */}
            <div className="flex border-t border-zinc-200 bg-zinc-50 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="w-24 shrink-0 text-center text-[10px] font-bold text-zinc-400 uppercase">
                Time
              </div>
              <div className="relative flex-1 h-4">
                {Array.from({ length: 7 }).map((_, idx) => {
                  const val = (idx / 6) * maxTime;
                  const leftPercent = (idx / 6) * 100;
                  return (
                    <span
                      key={idx}
                      className="absolute transform -translate-x-1/2 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400"
                      style={{ left: `${leftPercent}%` }}
                    >
                      {val.toFixed(0)}s
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Signal Details View */}
      {(selectedSignal || hoveredSignal) ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 dark:border-zinc-800 dark:bg-zinc-900/50">
          {(() => {
            const sig = selectedSignal || hoveredSignal!;
            const config = SIGNAL_CONFIG[sig.type as keyof typeof SIGNAL_CONFIG] || {
              label: sig.type,
              color: "bg-zinc-400 border-zinc-500 text-zinc-950",
              hex: "#a1a1aa",
            };
            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: config.hex }}
                    />
                    <h4 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                      {config.label} Signal
                    </h4>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <Clock className="h-3 w-3" />
                      {sig.start.toFixed(1)}s - {sig.end.toFixed(1)}s ({sig.end - sig.start}s duration)
                    </span>
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {sig.probability} Probability
                    </span>
                  </div>
                </div>
                {sig.rationale && (
                  <div className="mt-1.5 flex gap-2 rounded-lg bg-white p-3 border border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800">
                    <Info className="h-4 w-4 shrink-0 text-zinc-400 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Rationale</p>
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5 leading-relaxed">{sig.rationale}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 p-4 text-center justify-center text-xs text-zinc-400 dark:border-zinc-800">
          <Info className="h-4 w-4 text-zinc-300 dark:text-zinc-700" />
          Click or hover on any timeline block to inspect detailed rationales and metrics.
        </div>
      )}
    </div>
  );
}
export default SignalTimeline;
