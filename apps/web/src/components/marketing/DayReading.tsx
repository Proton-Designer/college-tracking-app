// A static "instrument reading" of one real day — the hero's signature visual. This shares the
// planned-ghost / actual-solid motif with the future Day Trace (§6.1), but is a deliberately
// simpler, non-live illustration for marketing use. The real Day Trace (with a live cursor, real
// data binding) is built once, when Today ships.

const DAY_START_MIN = 8 * 60; // 8:00
const DAY_END_MIN = 21 * 60; // 21:00
const RANGE = DAY_END_MIN - DAY_START_MIN;

// Small horizontal insets so a centered tick label at the very start/end of the axis never
// clips against the plot's edge.
const INSET = 3;

function pct(hh: number, mm: number): number {
  const raw = ((hh * 60 + mm - DAY_START_MIN) / RANGE) * 100;
  return INSET + (raw / 100) * (100 - INSET * 2);
}

const HOUR_TICKS = [8, 10, 12, 14, 16, 18, 20];

interface Block {
  label: string;
  start: [number, number];
  end: [number, number];
}

const PLANNED: Block[] = [
  { label: "BIOL 23000", start: [9, 30], end: [10, 45] },
  { label: "PHYS 241 lab", start: [13, 0], end: [14, 50] },
  { label: "BME 301 study", start: [16, 30], end: [18, 0] },
];

const ACTUAL: Block[] = [
  { label: "BIOL 23000", start: [9, 30], end: [10, 45] },
  { label: "PHYS 241 lab", start: [13, 0], end: [14, 50] },
  { label: "BME 301 study", start: [17, 7], end: [18, 40] },
];

/** The commitment that never happened — the chart's most important mark. */
const MISSED: Block = { label: "Gym — didn't happen", start: [18, 30], end: [19, 30] };

const ROW_H = 22;
const PLANNED_Y = 34;
const ACTUAL_Y = PLANNED_Y + ROW_H + 4;

export function DayReading() {
  return (
    <div
      className="w-full"
      role="img"
      aria-label="A chart comparing one Tuesday's planned schedule against what actually happened: class and lab matched the plan, but the evening study block started 37 minutes late and finished 40 minutes later than planned, and the planned gym session never happened."
    >
      <div className="mb-2 flex items-center justify-between font-mono text-caption uppercase tracking-[0.08em] text-ink-faint">
        <span>Tuesday · planned vs. actual</span>
        <span>8 AM – 9 PM</span>
      </div>

      <svg viewBox="0 0 1000 150" className="w-full" aria-hidden>
        {HOUR_TICKS.map((h) => (
          <line
            key={h}
            x1={pct(h, 0) * 10}
            x2={pct(h, 0) * 10}
            y1={PLANNED_Y - 6}
            y2={ACTUAL_Y + ROW_H + 6}
            stroke="var(--color-hairline)"
            strokeWidth={1}
          />
        ))}

        <text x={0} y={PLANNED_Y + 15} className="fill-ink-faint font-mono text-[11px] uppercase tracking-[0.08em]">
          Planned
        </text>
        {PLANNED.map((b) => (
          <rect
            key={`p-${b.label}`}
            x={pct(...b.start) * 10}
            y={PLANNED_Y}
            width={(pct(...b.end) - pct(...b.start)) * 10}
            height={ROW_H}
            rx={3}
            fill="none"
            stroke="var(--color-ink-faint)"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
        ))}
        {/* The missed commitment: drawn in the planned row, struck through, so the eye lands on
            the one block with no solid counterpart below it. */}
        <rect
          x={pct(...MISSED.start) * 10}
          y={PLANNED_Y}
          width={(pct(...MISSED.end) - pct(...MISSED.start)) * 10}
          height={ROW_H}
          rx={3}
          fill="none"
          stroke="var(--color-risk-high)"
          strokeDasharray="4 3"
          strokeWidth={1.5}
        />
        <line
          x1={pct(...MISSED.start) * 10}
          x2={pct(...MISSED.end) * 10}
          y1={PLANNED_Y + ROW_H / 2}
          y2={PLANNED_Y + ROW_H / 2}
          stroke="var(--color-risk-high)"
          strokeWidth={1.5}
        />

        <text x={0} y={ACTUAL_Y + 15} className="fill-ink font-mono text-[11px] uppercase tracking-[0.08em]">
          Actual
        </text>
        {ACTUAL.map((b) => (
          <rect
            key={`a-${b.label}`}
            x={pct(...b.start) * 10}
            y={ACTUAL_Y}
            width={(pct(...b.end) - pct(...b.start)) * 10}
            height={ROW_H}
            rx={3}
            fill="var(--color-accent)"
          />
        ))}

        {HOUR_TICKS.map((h, i) => (
          <text
            key={`t-${h}`}
            x={pct(h, 0) * 10}
            y={ACTUAL_Y + ROW_H + 22}
            textAnchor={i === 0 ? "start" : i === HOUR_TICKS.length - 1 ? "end" : "middle"}
            className="fill-ink-faint font-mono text-[11px]"
          >
            {h > 12 ? h - 12 : h}
            {h >= 12 ? " PM" : " AM"}
          </text>
        ))}
      </svg>

      <p className="mt-1 font-mono text-caption text-risk-high">Gym — didn&apos;t happen</p>

      <div className="mt-4 grid grid-cols-3 gap-6 border-t border-hairline pt-4">
        <div>
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Study block started</p>
          <p className="font-mono text-metric tabular-nums text-ink">
            +37<span className="ml-1 text-caption text-ink-muted">min late</span>
          </p>
        </div>
        <div>
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Finished</p>
          <p className="font-mono text-metric tabular-nums text-ink">
            +40<span className="ml-1 text-caption text-ink-muted">min later than planned</span>
          </p>
        </div>
        <div>
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">MIT completion</p>
          <p className="font-mono text-metric tabular-nums text-ink">2 / 3</p>
        </div>
      </div>
    </div>
  );
}
