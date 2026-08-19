import { cn } from "./cn";

export interface MetricDelta {
  /** Pre-formatted, e.g. "−1.4 vs 30-day average" — the component never infers a unit. */
  label: string;
  direction: "up" | "down" | "flat";
}

export interface MetricProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: MetricDelta;
  size?: "default" | "xl";
  className?: string;
}

const DELTA_GLYPH: Record<MetricDelta["direction"], string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

/** A tabular readout number. Numerals are always tabular-nums — never proportional figures. */
export function Metric({ label, value, unit, delta, size = "default", className }: MetricProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-label uppercase tracking-[0.1em] text-ink-muted">{label}</span>
      <span className="flex items-baseline gap-[3px]">
        <span
          className={cn(
            "font-mono tabular-nums text-ink",
            size === "xl" ? "text-metric-xl" : "text-metric",
          )}
        >
          {value}
        </span>
        {unit ? <span className="font-mono text-caption text-ink-muted whitespace-nowrap">{unit}</span> : null}
      </span>
      {delta ? (
        <span className="font-mono text-caption tabular-nums text-ink-muted">
          {DELTA_GLYPH[delta.direction]} {delta.label}
        </span>
      ) : null}
    </div>
  );
}
