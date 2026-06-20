"use client";

import React, { useState, useMemo } from "react";
import { ConversationQuality, QualityTimelinePoint } from "../../lib/parsers/interhumanParser";
import { Award, Volume2, Shield, Zap, Heart, Brain, TrendingUp, Info } from "lucide-react";

interface QualityMetricsProps {
  quality: ConversationQuality | null | undefined;
  history?: QualityTimelinePoint[];
  maxTime?: number;
}

interface MetricConfig {
  key: keyof ConversationQuality;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
  gradient: string;
  bgLight: string;
  borderClass: string;
}

const METRIC_CONFIGS: MetricConfig[] = [
  {
    key: "quality_index",
    label: "Quality Index",
    description: "Overall conversation flow rating",
    icon: Award,
    color: "text-indigo-600 dark:text-indigo-400",
    gradient: "from-indigo-500 to-violet-600",
    bgLight: "bg-indigo-50/50 dark:bg-indigo-950/20",
    borderClass: "border-indigo-100 dark:border-indigo-950",
  },
  {
    key: "clarity",
    label: "Speech Clarity",
    description: "Diction and articulation level",
    icon: Volume2,
    color: "text-emerald-600 dark:text-emerald-400",
    gradient: "from-emerald-500 to-teal-600",
    bgLight: "bg-emerald-50/50 dark:bg-emerald-950/20",
    borderClass: "border-emerald-100 dark:border-emerald-950",
  },
  {
    key: "energy",
    label: "Vocal Energy",
    description: "Pitch variation and dynamics",
    icon: Zap,
    color: "text-amber-600 dark:text-amber-400",
    gradient: "from-amber-500 to-orange-600",
    bgLight: "bg-amber-50/50 dark:bg-amber-950/20",
    borderClass: "border-amber-100 dark:border-amber-950",
  },
  {
    key: "rapport",
    label: "Rapport & Empathy",
    description: "Mutual understanding & alignment",
    icon: Heart,
    color: "text-rose-600 dark:text-rose-400",
    gradient: "from-rose-500 to-pink-600",
    bgLight: "bg-rose-50/50 dark:bg-rose-950/20",
    borderClass: "border-rose-100 dark:border-rose-950",
  },
  {
    key: "authority",
    label: "Leadership/Authority",
    description: "Control, pace and dominance",
    icon: Shield,
    color: "text-blue-600 dark:text-blue-400",
    gradient: "from-blue-500 to-cyan-600",
    bgLight: "bg-blue-50/50 dark:bg-blue-950/20",
    borderClass: "border-blue-100 dark:border-blue-950",
  },
  {
    key: "learning",
    label: "Active Learning",
    description: "Information transfer efficiency",
    icon: Brain,
    color: "text-purple-600 dark:text-purple-400",
    gradient: "from-purple-500 to-fuchsia-600",
    bgLight: "bg-purple-50/50 dark:bg-purple-950/20",
    borderClass: "border-purple-100 dark:border-purple-950",
  },
];

export function QualityMetrics({ quality, history = [], maxTime = 30 }: QualityMetricsProps) {
  const [selectedMetric, setSelectedMetric] = useState<keyof ConversationQuality>("quality_index");
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; time: number; value: number } | null>(null);

  // Normalize metric values from 0-1 or 0-100 to 0-100 range
  const getNormalizedValue = (val: number | undefined): number => {
    if (val === undefined) return 0;
    if (val <= 1 && val >= 0) return Math.round(val * 100);
    return Math.round(val);
  };

  // Get current active values
  const currentMetrics = useMemo(() => {
    const defaultVals: Required<ConversationQuality> = {
      quality_index: 0,
      clarity: 0,
      energy: 0,
      rapport: 0,
      authority: 0,
      learning: 0,
    };

    if (!quality) return defaultVals;

    return {
      quality_index: getNormalizedValue(quality.quality_index),
      clarity: getNormalizedValue(quality.clarity),
      energy: getNormalizedValue(quality.energy),
      rapport: getNormalizedValue(quality.rapport),
      authority: getNormalizedValue(quality.authority),
      learning: getNormalizedValue(quality.learning),
    };
  }, [quality]);

  // Max session duration for timeline scaling
  const finalMaxTime = useMemo(() => {
    if (maxTime && maxTime > 0) return maxTime;
    if (history.length === 0) return 30;
    const maxEnd = Math.max(...history.map((p) => p.end));
    return Math.max(maxEnd, 30);
  }, [history, maxTime]);

  // Selected config for rendering
  const activeConfig = useMemo(() => {
    return METRIC_CONFIGS.find((m) => m.key === selectedMetric)!;
  }, [selectedMetric]);

  // Compute SVG chart coordinates
  const chartPathData = useMemo(() => {
    if (history.length === 0) return { line: "", area: "", points: [] };

    const width = 600;
    const height = 150;
    const padding = 15;

    // Filter points and sort chronologically
    const sortedPoints = [...history]
      .filter((p) => p.values[selectedMetric] !== undefined)
      .sort((a, b) => a.start - b.start);

    if (sortedPoints.length === 0) return { line: "", area: "", points: [] };

    const coords = sortedPoints.map((point) => {
      const rawVal = point.values[selectedMetric];
      const val = getNormalizedValue(rawVal);
      const time = (point.start + point.end) / 2;

      // Map time (0 to finalMaxTime) to X (padding to width - padding)
      const x = padding + (time / finalMaxTime) * (width - 2 * padding);
      // Map value (0 to 100) to Y (height - padding to padding)
      const y = height - padding - (val / 100) * (height - 2 * padding);

      return { x, y, time, value: val };
    });

    // Generate SVG path strings
    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      // Smooth bezier curves
      const prev = coords[i - 1];
      const curr = coords[i];
      const cpX1 = prev.x + (curr.x - prev.x) / 2;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (curr.x - prev.x) / 2;
      const cpY2 = curr.y;
      linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
    }

    const areaPath =
      `${linePath} L ${coords[coords.length - 1].x} ${height - padding} L ${coords[0].x} ${height - padding} Z`;

    return { line: linePath, area: areaPath, points: coords };
  }, [history, selectedMetric, finalMaxTime]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (chartPathData.points.length === 0) return;
    const svgRect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - svgRect.left;
    
    // Scale user coordinate back to SVG coordinate space
    const svgWidth = 600;
    const scaledX = (clientX / svgRect.width) * svgWidth;

    // Find the closest point in horizontal distance
    let closest = chartPathData.points[0];
    let minDist = Math.abs(chartPathData.points[0].x - scaledX);

    for (let i = 1; i < chartPathData.points.length; i++) {
      const dist = Math.abs(chartPathData.points[i].x - scaledX);
      if (dist < minDist) {
        minDist = dist;
        closest = chartPathData.points[i];
      }
    }

    // Map coordinates back to screen client for showing correct tooltip placement
    const xRatio = svgRect.width / svgWidth;
    const yRatio = svgRect.height / 150;

    setHoveredPoint({
      x: closest.x * xRatio,
      y: closest.y * yRatio,
      time: closest.time,
      value: closest.value,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 6 Grid Metric Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {METRIC_CONFIGS.map((config) => {
          const Icon = config.icon;
          const value = currentMetrics[config.key];
          const isSelected = selectedMetric === config.key;

          return (
            <div
              key={config.key}
              onClick={() => setSelectedMetric(config.key)}
              className={`group relative cursor-pointer rounded-xl border p-4 transition-all duration-200 shadow-sm ${
                isSelected
                  ? "border-zinc-900 bg-white ring-1 ring-zinc-950 dark:border-zinc-50 dark:bg-zinc-950 dark:ring-zinc-100"
                  : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider dark:text-zinc-400">
                  {config.label}
                </span>
                <div className={`rounded-lg p-1.5 transition-colors ${config.bgLight}`}>
                  <Icon className={`h-4.5 w-4.5 ${config.color}`} />
                </div>
              </div>

              {/* Value and Progression bar */}
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {value}%
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">score</span>
              </div>

              <div className="mt-3 h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${config.gradient} transition-all duration-500`}
                  style={{ width: `${value}%` }}
                />
              </div>

              <p className="mt-2 text-[10px] text-zinc-400 leading-normal dark:text-zinc-500">
                {config.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* SVG Trend Line Area Chart */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className={`h-4.5 w-4.5 ${activeConfig.color}`} />
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {activeConfig.label} Trend
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Timeline visualization tracking dynamic conversation changes
              </p>
            </div>
          </div>
        </div>

        {/* SVG Drawing Frame */}
        <div className="relative">
          {history.length > 0 && chartPathData.points.length > 0 ? (
            <div className="relative w-full h-[150px]">
              <svg
                viewBox="0 0 600 150"
                className="w-full h-full overflow-visible select-none cursor-crosshair"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                <defs>
                  {/* Color Gradient definitions */}
                  <linearGradient id={`grad-${selectedMetric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeConfig.key === "quality_index" ? "#6366f1" : activeConfig.key === "clarity" ? "#10b981" : activeConfig.key === "energy" ? "#f59e0b" : activeConfig.key === "rapport" ? "#f43f5e" : activeConfig.key === "authority" ? "#3b82f6" : "#a855f7"} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={activeConfig.key === "quality_index" ? "#6366f1" : activeConfig.key === "clarity" ? "#10b981" : activeConfig.key === "energy" ? "#f59e0b" : activeConfig.key === "rapport" ? "#f43f5e" : activeConfig.key === "authority" ? "#3b82f6" : "#a855f7"} stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid lines */}
                {[0, 25, 50, 75, 100].map((level) => {
                  const y = 150 - 15 - (level / 100) * 120;
                  return (
                    <g key={level}>
                      <line
                        x1="15"
                        y1={y}
                        x2="585"
                        y2={y}
                        className="stroke-zinc-100 dark:stroke-zinc-800/60"
                        strokeDasharray="4 4"
                      />
                      <text
                        x="5"
                        y={y + 3}
                        className="fill-zinc-400 text-[8px] font-bold dark:fill-zinc-600"
                      >
                        {level}%
                      </text>
                    </g>
                  );
                })}

                {/* Area under the line */}
                <path
                  d={chartPathData.area}
                  fill={`url(#grad-${selectedMetric})`}
                />

                {/* Main line */}
                <path
                  d={chartPathData.line}
                  fill="none"
                  stroke={activeConfig.key === "quality_index" ? "#6366f1" : activeConfig.key === "clarity" ? "#10b981" : activeConfig.key === "energy" ? "#f59e0b" : activeConfig.key === "rapport" ? "#f43f5e" : activeConfig.key === "authority" ? "#3b82f6" : "#a855f7"}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Interactive tracker vertical cursor line */}
                {hoveredPoint && (
                  <line
                    x1={hoveredPoint.time / finalMaxTime * 570 + 15}
                    y1="15"
                    x2={hoveredPoint.time / finalMaxTime * 570 + 15}
                    y2="135"
                    className="stroke-zinc-400 dark:stroke-zinc-700"
                    strokeDasharray="2 2"
                  />
                )}
              </svg>

              {/* Tooltip Overlay inside SVG frame */}
              {hoveredPoint && (
                <div
                  className="absolute pointer-events-none z-30 rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1.5 shadow-md backdrop-blur-sm transition-all duration-75 dark:border-zinc-800 dark:bg-zinc-950/95"
                  style={{
                    left: `${hoveredPoint.x + 8}px`,
                    top: `${hoveredPoint.y - 45}px`,
                  }}
                >
                  <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                    Time: {hoveredPoint.time.toFixed(1)}s
                  </p>
                  <p className={`text-xs font-extrabold ${activeConfig.color}`}>
                    {hoveredPoint.value}% Score
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center border border-dashed border-zinc-200 rounded-lg h-[150px] dark:border-zinc-800">
              <Info className="h-6 w-6 text-zinc-300 mb-2 dark:text-zinc-700" />
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                No history data points logged for {activeConfig.label} yet.
              </p>
              <p className="text-[10px] text-zinc-400/80 mt-0.5 dark:text-zinc-500/80">
                Data points will plot automatically as conversational updates are streamed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QualityMetrics;
