import { cn } from "./cn";

export type RiskBand = "low" | "moderate" | "high" | "critical";

export interface RiskPillProps {
  band: RiskBand;
  /** Always required — color is never the only carrier of the band. */
  label: string;
  className?: string;
}

const BAND_CLASSES: Record<RiskBand, string> = {
  low: "bg-risk-low-wash text-risk-low",
  moderate: "bg-risk-moderate-wash text-risk-moderate",
  high: "bg-risk-high-wash text-risk-high",
  critical: "bg-risk-critical-wash text-risk-critical",
};

export function RiskPill({ band, label, className }: RiskPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-3 py-1",
        "font-mono text-label uppercase tracking-[0.1em]",
        BAND_CLASSES[band],
        className,
      )}
    >
      {label}
    </span>
  );
}
