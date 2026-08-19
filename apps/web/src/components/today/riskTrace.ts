import type { TraceEntry } from "@collegeos/core";

/**
 * Formats one already-computed TraceEntry into a human sentence. This labels and rounds
 * values the engine already produced — it does not derive anything new. See
 * packages/core/src/risk/assignmentRisk.ts for the source of each key/rawInput shape.
 */
export function formatTraceEntry(entry: TraceEntry): string {
  switch (entry.key) {
    case "proximity": {
      const { dueDate } = entry.rawInput as { today: string; dueDate: string };
      return `Due ${dueDate}`;
    }
    case "weight": {
      const weightPct = entry.rawInput as number;
      return `Worth ${weightPct}% of the grade`;
    }
    case "difficulty": {
      const rating = entry.rawInput as number | null;
      return rating != null ? `Rated ${rating}/5 difficulty` : "Difficulty not rated";
    }
    case "knowledgeGap": {
      const rating = entry.rawInput as number | null;
      return rating != null ? `Self-rated understanding ${rating}/5` : "Understanding not rated";
    }
    case "unfinished": {
      const { completedUnits, plannedUnits } = entry.rawInput as {
        completedUnits: number;
        plannedUnits: number;
      };
      return plannedUnits === 0
        ? "No study sessions planned yet"
        : `${completedUnits} of ${plannedUnits} planned sessions completed`;
    }
    case "congestion": {
      return "Schedule is congested before this is due";
    }
    case "procrastination": {
      const days = entry.rawInput as number;
      return `Typically starts ${days.toFixed(1)} days late`;
    }
    case "gradeHeadroom": {
      return "Current grade is below target";
    }
    default:
      return entry.key;
  }
}

/** The single highest-contribution factor — what SCREEN_SPEC §1 calls "the top trace reason". */
export function topTraceReason(trace: TraceEntry[]): string | null {
  if (trace.length === 0) return null;
  const top = [...trace].sort((a, b) => b.contribution - a.contribution)[0];
  return top ? formatTraceEntry(top) : null;
}
