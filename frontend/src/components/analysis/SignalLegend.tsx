import React from "react";

export const SIGNAL_CONFIG = {
  agreement: { label: "Agreement", color: "bg-emerald-500 border-emerald-600 text-emerald-950", hex: "#10b981" },
  confidence: { label: "Confidence", color: "bg-blue-500 border-blue-600 text-blue-950", hex: "#3b82f6" },
  engagement: { label: "Engagement", color: "bg-indigo-500 border-indigo-600 text-indigo-950", hex: "#6366f1" },
  interest: { label: "Interest", color: "bg-violet-500 border-violet-600 text-violet-950", hex: "#8b5cf6" },
  skepticism: { label: "Skepticism", color: "bg-amber-500 border-amber-600 text-amber-950", hex: "#f59e0b" },
  frustration: { label: "Frustration", color: "bg-rose-500 border-rose-600 text-rose-950", hex: "#f43f5e" },
  dominance: { label: "Dominance", color: "bg-purple-500 border-purple-600 text-purple-950", hex: "#a855f7" },
  submission: { label: "Submission", color: "bg-cyan-500 border-cyan-600 text-cyan-950", hex: "#06b6d4" },
  tension: { label: "Tension", color: "bg-orange-500 border-orange-600 text-orange-950", hex: "#f97316" },
  rapport: { label: "Rapport", color: "bg-teal-500 border-teal-600 text-teal-950", hex: "#14b8a6" },
};

export type SignalType = keyof typeof SIGNAL_CONFIG;

export function SignalLegend() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Social Signals Legend</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.entries(SIGNAL_CONFIG).map(([key, config]) => (
          <div key={key} className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full border ${config.color}`}
              style={{ backgroundColor: config.hex }}
            />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 capitalize">
              {config.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
export default SignalLegend;
