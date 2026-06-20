import React from "react";
import { Button } from "../ui/button";
import { UploadCloud, Radio, RefreshCw } from "lucide-react";

export type AnalysisMode = "upload" | "realtime" | "streaming";

interface ModeSelectorProps {
  activeMode: AnalysisMode;
  onModeChange: (mode: AnalysisMode) => void;
  disabled?: boolean;
}

export function ModeSelector({ activeMode, onModeChange, disabled }: ModeSelectorProps) {
  const modes = [
    {
      id: "upload" as const,
      label: "Upload Analysis",
      icon: UploadCloud,
      description: "Analyze pre-recorded audio/video files",
    },
    {
      id: "realtime" as const,
      label: "Real-Time Analysis",
      icon: Radio,
      description: "One-shot streaming from live feeds",
    },
    {
      id: "streaming" as const,
      label: "Streaming Analysis",
      icon: RefreshCw,
      description: "Persistent stream with continuous updates",
    },
  ];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Select Analysis Mode</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Choose how you want to ingest and visualize the conversation</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.id;
          return (
            <button
              key={mode.id}
              disabled={disabled}
              onClick={() => onModeChange(mode.id)}
              className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all duration-200 ${
                isActive
                  ? "border-zinc-900 bg-zinc-900/5 dark:border-zinc-50 dark:bg-zinc-50/5"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`rounded-md p-1.5 ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                  {mode.label}
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{mode.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export default ModeSelector;
