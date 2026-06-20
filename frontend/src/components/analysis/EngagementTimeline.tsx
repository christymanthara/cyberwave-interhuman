"use client";

import React, { useState, useMemo } from "react";
import { RawEngagement } from "../../lib/parsers/interhumanParser";
import { Clock, Info, Activity } from "lucide-react";

interface EngagementTimelineProps {
  engagement: RawEngagement[];
  maxTime?: number;
}

const ENGAGEMENT_CONFIG: Record<
  string,
  { label: string; bg: string; border: string; text: string; hex: string }
> = {
  engaged: {
    label: "Engaged",
    bg: "bg-emerald-500/20 dark:bg-emerald-500/10 hover:bg-emerald-500/30",
    border: "border-emerald-500/30 dark:border-emerald-500/20",
    text: "text-emerald-800 dark:text-emerald-300",
    hex: "#10b981",
  },
  distracted: {
    label: "Distracted",
    bg: "bg-rose-500/20 dark:bg-rose-500/10 hover:bg-rose-500/30",
    border: "border-rose-500/30 dark:border-rose-500/20",
    text: "text-rose-800 dark:text-rose-300",
    hex: "#f43f5e",
  },
  neutral: {
    label: "Neutral",
    bg: "bg-zinc-500/20 dark:bg-zinc-500/10 hover:bg-zinc-500/30",
    border: "border-zinc-500/30 dark:border-zinc-500/20",
    text: "text-zinc-800 dark:text-zinc-300",
    hex: "#71717a",
  },
};

export function EngagementTimeline({ engagement, maxTime }: EngagementTimelineProps) {
  const [selectedBlock, setSelectedBlock] = useState<RawEngagement | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<RawEngagement | null>(null);

  // Compute maximum end time for timeline scaling
  const finalMaxTime = useMemo(() => {
    if (maxTime && maxTime > 0) return maxTime;
    if (engagement.length === 0) return 30;
    const maxEnd = Math.max(...engagement.map((e) => e.end));
    return Math.max(maxEnd, 30);
  }, [engagement, maxTime]);

  // Sort engagement segments chronologically
  const sortedEngagement = useMemo(() => {
    return [...engagement].sort((a, b) => a.start - b.start);
  }, [engagement]);

  return (
    <div className="flex flex-col gap-4">
      {/* Timeline Card */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-200 px-4 py-3 gap-2 dark:border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Engagement Timeline</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Session engagement levels and conversational focus tracking
            </p>
          </div>

          {/* Mini Legend */}
          <div className="flex items-center gap-3">
            {Object.entries(ENGAGEMENT_CONFIG).map(([state, config]) => (
              <div key={state} className="flex items-center gap-1.5 text-xs">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: config.hex }}
                />
                <span className="text-zinc-600 dark:text-zinc-400 font-medium">{config.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline Row */}
        <div className="p-4 overflow-x-auto">
          <div className="min-w-[640px] flex flex-col gap-2">
            <div className="relative h-12 w-full rounded-lg bg-zinc-50/50 border border-zinc-100 p-1 flex items-center overflow-hidden dark:bg-zinc-900/20 dark:border-zinc-800/55">
              {/* If no engagement data, render a placeholder bar */}
              {sortedEngagement.length === 0 && (
                <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400 italic">
                  No engagement state records available
                </div>
              )}

              {/* Render segments */}
              {sortedEngagement.map((block, idx) => {
                const config = ENGAGEMENT_CONFIG[block.state] || ENGAGEMENT_CONFIG.neutral;
                const leftPercent = (block.start / finalMaxTime) * 100;
                const widthPercent = ((block.end - block.start) / finalMaxTime) * 100;

                const isHovered = hoveredBlock === block;
                const isSelected = selectedBlock === block;

                return (
                  <div
                    key={idx}
                    className={`absolute h-[calc(100%-8px)] rounded-md border flex items-center justify-center cursor-pointer transition-all duration-200 select-none overflow-hidden ${
                      config.bg
                    } ${config.border} ${config.text} ${
                      isHovered || isSelected
                        ? "ring-2 ring-zinc-950 dark:ring-zinc-50 scale-[1.01] z-10 font-bold"
                        : "font-semibold"
                    }`}
                    style={{
                      left: `calc(${leftPercent}% + 4px)`,
                      width: `calc(${widthPercent}% - 8px)`,
                      minWidth: "12px",
                    }}
                    onMouseEnter={() => setHoveredBlock(block)}
                    onMouseLeave={() => setHoveredBlock(null)}
                    onClick={() => setSelectedBlock(isSelected ? null : block)}
                  >
                    {/* Render text labels only if the block is wide enough */}
                    <span className="truncate px-2 text-[10px] uppercase tracking-wider text-center">
                      {widthPercent > 6 ? config.label : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* X-Axis time indicators */}
            <div className="relative h-4 mt-1 border-t border-zinc-100 dark:border-zinc-800/40">
              {Array.from({ length: 7 }).map((_, idx) => {
                const val = (idx / 6) * finalMaxTime;
                const leftPercent = (idx / 6) * 100;
                return (
                  <span
                    key={idx}
                    className="absolute transform -translate-x-1/2 text-[9px] font-bold text-zinc-400 dark:text-zinc-500"
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

      {/* Details Box */}
      {(selectedBlock || hoveredBlock) ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 animate-in fade-in slide-in-from-bottom-1 duration-150 dark:border-zinc-800 dark:bg-zinc-900/30">
          {(() => {
            const block = selectedBlock || hoveredBlock!;
            const config = ENGAGEMENT_CONFIG[block.state] || ENGAGEMENT_CONFIG.neutral;
            return (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Engagement Segment:
                  </span>
                  <span className={`text-xs font-bold uppercase tracking-wide ${config.text}`}>
                    {config.label}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {block.start.toFixed(1)}s - {block.end.toFixed(1)}s ({ (block.end - block.start).toFixed(1) }s duration)
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 p-3 text-center justify-center text-xs text-zinc-400 dark:border-zinc-800">
          <Info className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-700" />
          Hover or click on any engagement segment block for timing details.
        </div>
      )}
    </div>
  );
}

export default EngagementTimeline;
