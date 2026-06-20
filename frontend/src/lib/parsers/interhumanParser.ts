export interface RawSignal {
  type: string;
  start: number;
  end: number;
  probability: "low" | "medium" | "high";
  rationale?: string;
}

export interface ParsedSignal extends RawSignal {
  lane: number;
}

export interface RawEngagement {
  start: number;
  end: number;
  state: string;
}

export interface ConversationQuality {
  quality_index?: number;
  clarity?: number;
  authority?: number;
  energy?: number;
  rapport?: number;
  learning?: number;
}

export interface QualityTimelinePoint {
  start: number;
  end: number;
  values: ConversationQuality;
}

export interface InterhumanResponse {
  signals?: RawSignal[];
  engagement_state?: RawEngagement[];
  conversation_quality?: ConversationQuality | QualityTimelinePoint[];
}

/**
 * Lane allocation algorithm for visualising overlapping intervals.
 * Each signal is assigned a lane index (0, 1, 2, ...) so overlapping signals
 * are placed in separate tracks to prevent overlap collisions.
 */
export function allocateLanes(signals: RawSignal[]): ParsedSignal[] {
  // Sort primarily by start time, and secondarily by duration (longest first)
  const sorted = [...signals].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const parsedSignals: ParsedSignal[] = [];
  const laneEndTimes: number[] = []; // tracks the end time of the last signal in each lane

  for (const signal of sorted) {
    let assignedLane = -1;

    // Find the first lane that is free before this signal's start time
    for (let i = 0; i < laneEndTimes.length; i++) {
      if (laneEndTimes[i] <= signal.start) {
        assignedLane = i;
        laneEndTimes[i] = signal.end;
        break;
      }
    }

    // If no existing lane is free, allocate a new lane
    if (assignedLane === -1) {
      assignedLane = laneEndTimes.length;
      laneEndTimes.push(signal.end);
    }

    parsedSignals.push({
      ...signal,
      lane: assignedLane,
    });
  }

  return parsedSignals;
}

/**
 * Normalise incoming API response to ensure all fields are present and correctly typed.
 */
export function parseInterhumanResponse(data: any): InterhumanResponse {
  const signals: RawSignal[] = [];
  const engagement_state: RawEngagement[] = [];
  let conversation_quality: ConversationQuality | QualityTimelinePoint[] = {};

  if (data && typeof data === "object") {
    // Parse signals safely
    if (Array.isArray(data.signals)) {
      data.signals.forEach((s: any) => {
        if (s && typeof s === "object" && s.type && typeof s.start === "number" && typeof s.end === "number") {
          signals.push({
            type: s.type.toLowerCase(),
            start: s.start,
            end: s.end,
            probability: (s.probability || "medium").toLowerCase() as "low" | "medium" | "high",
            rationale: s.rationale || "",
          });
        }
      });
    }

    // Parse engagement state safely
    if (Array.isArray(data.engagement_state)) {
      data.engagement_state.forEach((e: any) => {
        if (e && typeof e === "object" && typeof e.start === "number" && typeof e.end === "number" && e.state) {
          engagement_state.push({
            start: e.start,
            end: e.end,
            state: e.state.toLowerCase(),
          });
        }
      });
    }

    // Parse conversation quality safely
    if (data.conversation_quality) {
      if (Array.isArray(data.conversation_quality)) {
        const qualityTimeline: QualityTimelinePoint[] = [];
        data.conversation_quality.forEach((q: any) => {
          if (q && typeof q === "object" && typeof q.start === "number" && typeof q.end === "number") {
            qualityTimeline.push({
              start: q.start,
              end: q.end,
              values: {
                quality_index: typeof q.quality_index === "number" ? q.quality_index : q.values?.quality_index,
                clarity: typeof q.clarity === "number" ? q.clarity : q.values?.clarity,
                authority: typeof q.authority === "number" ? q.authority : q.values?.authority,
                energy: typeof q.energy === "number" ? q.energy : q.values?.energy,
                rapport: typeof q.rapport === "number" ? q.rapport : q.values?.rapport,
                learning: typeof q.learning === "number" ? q.learning : q.values?.learning,
              },
            });
          }
        });
        conversation_quality = qualityTimeline;
      } else if (typeof data.conversation_quality === "object") {
        conversation_quality = {
          quality_index: data.conversation_quality.quality_index,
          clarity: data.conversation_quality.clarity,
          authority: data.conversation_quality.authority,
          energy: data.conversation_quality.energy,
          rapport: data.conversation_quality.rapport,
          learning: data.conversation_quality.learning,
        };
      }
    }
  }

  return {
    signals,
    engagement_state,
    conversation_quality,
  };
}
