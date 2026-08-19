import { cn } from "./cn";

export interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: "sm" | "md" | "lg" | "pill";
  className?: string;
}

const RADIUS_CLASSES = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  pill: "rounded-pill",
} as const;

/** Mirrors the real layout's geometry — never a generic shimmer box unrelated to what's loading. */
export function Skeleton({ width = "100%", height = 16, radius = "sm", className }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse bg-surface-sunken", RADIUS_CLASSES[radius], className)}
      style={{ width, height }}
    />
  );
}
