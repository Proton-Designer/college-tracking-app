"use client";

import { useState } from "react";
import {
  Aurora,
  Button,
  Checkbox,
  EmptyState,
  FieldError,
  Input,
  Label,
  Metric,
  Panel,
  RiskPill,
  Badge,
  SegmentedControl,
  Skeleton,
  Textarea,
  Toast,
  Toggle,
  useToast,
} from "@/components/ui";
import { color, island, aurora, type as typeScale, riskBands, type RiskBand } from "@collegeos/design";

const TYPE_SAMPLE: Record<keyof typeof typeScale, string> = {
  displayXl: "The Sunday plan carries forward",
  displayL: "Main win: both academic MITs, despite a slow start",
  displayM: "Today",
  title: "BME 301",
  bodyL: "You completed both high-priority academic tasks today.",
  body: "Upload a syllabus to build this course's semester map.",
  bodyS: "Last three study blocks started 1.4 days late.",
  label: "PANEL LABEL",
  metricXl: "1,204.5",
  metric: "72",
  caption: "6.3 h · 2 min ago",
};

const FONT_VAR: Record<string, string> = {
  "Instrument Sans": "--font-instrument-sans",
  "Geist Mono": "--font-geist-mono",
};

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-hairline py-10 first:border-t-0 first:pt-0">
      <div>
        <h2 className="font-sans text-display-m font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {note ? <p className="mt-1 text-body-s text-ink-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({
  name,
  varName,
  hex,
  on,
  ratio,
  level,
  dark,
}: {
  name: string;
  varName: string;
  hex: string;
  on?: string;
  ratio?: string;
  level?: string;
  dark?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={dark ? "h-16 rounded-md" : "h-16 rounded-md border border-hairline"}
        style={{ backgroundColor: hex }}
      />
      <div className="flex flex-col">
        <span className="font-mono text-body-s text-ink">{name}</span>
        <span className="font-mono text-caption text-ink-muted">
          {varName} · {hex}
        </span>
        {ratio ? (
          <span
            className={
              level === "FAIL"
                ? "font-mono text-caption font-medium text-risk-critical"
                : "font-mono text-caption text-ink-faint"
            }
          >
            {on} {ratio} {level}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StateRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function ToastDemoButton() {
  const { show } = useToast();
  return (
    <Button variant="secondary" onClick={() => show("Focus session logged.", "success")}>
      Trigger toast
    </Button>
  );
}

const AURORA_LABEL: Record<RiskBand, string> = {
  low: "low — mint + periwinkle, cool and wide",
  moderate: "moderate — periwinkle + lilac",
  high: "high — lilac + blush, warmer, tighter",
  critical: "critical — blush dominant, highest saturation",
};

export default function DesignPreviewPage() {
  const [scale, setScale] = useState<number | null>(7);
  const [checked, setChecked] = useState(true);
  const [toggled, setToggled] = useState(false);

  return (
    <main className="relative mx-auto flex max-w-app flex-col gap-2 px-8 py-12">
      <p className="text-label uppercase tracking-[0.1em] text-ink-faint">Design system</p>
      <h1 className="font-sans text-display-l font-semibold tracking-[-0.02em] text-ink">Aurora</h1>
      <p className="max-w-prose text-body text-ink-muted">
        Every token and primitive from docs/DESIGN_LANGUAGE_V2.md, rendered live. Not a route the
        product ships — a reference for judging whether the implementation matches the ratified
        spec, and the fastest way to catch a v2 regression across all 23 primitives at once.
      </p>

      <Section title="The Aurora" note="§6 — an instrument reading, not decoration. Derived from a real computed RiskBand; a null band is flat ground, no atmosphere at all. These five boxes are canonical enum values shown deliberately in a component gallery, never live/fabricated data.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {riskBands.map((band) => (
            <div key={band} className="relative h-40 overflow-hidden rounded-lg border border-hairline">
              <Aurora band={band} variant="contained" />
              <div className="relative z-10 flex h-full flex-col justify-end p-4">
                <span className="font-mono text-caption uppercase tracking-[0.08em] text-ink-muted">
                  {AURORA_LABEL[band]}
                </span>
              </div>
            </div>
          ))}
          <div className="relative h-40 overflow-hidden rounded-lg border border-hairline">
            <div className="relative z-10 flex h-full flex-col justify-end p-4">
              <span className="font-mono text-caption uppercase tracking-[0.08em] text-ink-muted">
                null — no history, no atmosphere, flat ground
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Glass" note="§2 — three tiers, and only three. Every surface carries two edges (inner top highlight + outer hairline) and degrades to an opaque fallback under @supports / prefers-reduced-transparency.">
        <div className="relative overflow-hidden rounded-lg p-8">
          <Aurora band="high" variant="contained" />
          <div className="relative z-10 grid gap-4 sm:grid-cols-3">
            <div className="glass rounded-lg p-5">
              <p className="text-body-s text-ink">
                <span className="font-mono text-label uppercase tracking-[0.08em] text-ink-muted">glass</span>
                <br />
                cards, panels, list containers — 24px blur, 62% fill.
              </p>
            </div>
            <div className="glass-raised rounded-xl p-5">
              <p className="text-body-s text-ink">
                <span className="font-mono text-label uppercase tracking-[0.08em] text-ink-muted">glass-raised</span>
                <br />
                modals, sheets, popovers — 32px blur, 78% fill.
              </p>
            </div>
            <div className="glass-sunken rounded-lg p-5">
              <p className="text-body-s text-ink">
                <span className="font-mono text-label uppercase tracking-[0.08em] text-ink-muted">glass-sunken</span>
                <br />
                wells, inset rows, empty states — 16px blur, 38% fill.
              </p>
            </div>
          </div>
        </div>
        <p className="text-body-s text-ink-muted">
          Same three tiers with no aurora behind them — this is what most screens look like most
          of the time (a null-band day, flat ground):
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="glass rounded-lg p-5 text-body-s text-ink">glass</div>
          <div className="glass-raised rounded-xl p-5 text-body-s text-ink">glass-raised</div>
          <div className="glass-sunken rounded-lg p-5 text-body-s text-ink">glass-sunken</div>
        </div>
      </Section>

      <Section title="The Island" note="§5 — the primary nav on both platforms. Shown here as a static swatch; the real floating dock lands with the shell (work item 3).">
        <div className="island-surface inline-flex items-center gap-1 rounded-pill p-1.5">
          <span
            className="rounded-pill px-4 py-2 font-sans text-body-s font-medium text-white"
            style={{ backgroundColor: color.accent }}
          >
            Today
          </span>
          <span className="px-3 py-2 font-sans text-body-s" style={{ color: island.inkDim }}>
            Courses
          </span>
          <span className="px-3 py-2 font-sans text-body-s" style={{ color: island.inkDim }}>
            Review
          </span>
          <span className="px-3 py-2 font-sans text-body-s" style={{ color: island.inkDim }}>
            Insights
          </span>
        </div>
      </Section>

      <Section
        title="Color"
        note="Foundation + risk scale. Ratios below are computed (WCAG relative luminance), not estimated — two fail and are called out rather than hidden."
      >
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Swatch name="ground" varName="--color-ground" hex={color.ground} />
          <Swatch name="surface" varName="--color-surface" hex={color.surface} />
          <Swatch name="surface-sunken" varName="--color-surface-sunken" hex={color.surfaceSunken} />
          <Swatch name="ink" varName="--color-ink" hex={color.ink} on="on ground" ratio="17.25" level="AAA" />
          <Swatch name="ink-muted" varName="--color-ink-muted" hex={color.inkMuted} on="on ground" ratio="5.69" level="AA" />
          <Swatch name="ink-faint" varName="--color-ink-faint" hex={color.inkFaint} on="on ground" ratio="2.77" level="FAIL (decorative/precision use only, never body text)" />
          <Swatch name="hairline" varName="--color-hairline" hex={color.hairline} />
          <Swatch name="border" varName="--color-border" hex={color.border} on="on ground" ratio="1.54" level="FAIL as a visible divider on bare ground — fine as a border inside a white/glass surface" />
          <Swatch name="accent" varName="--color-accent" hex={color.accent} on="on ground" ratio="5.15" level="AA" />
          <Swatch name="accent-hover" varName="--color-accent-hover" hex={color.accentHover} />
          <Swatch name="accent-wash" varName="--color-accent-wash" hex={color.accentWash} />
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Swatch name="risk-low" varName="--color-risk-low" hex={color.riskLow} on="on white" ratio="5.25" level="AA" />
          <Swatch name="risk-moderate" varName="--color-risk-moderate" hex={color.riskModerate} on="on white" ratio="3.73" level="FAIL" />
          <Swatch name="risk-high" varName="--color-risk-high" hex={color.riskHigh} on="on white" ratio="3.87" level="FAIL" />
          <Swatch name="risk-critical" varName="--color-risk-critical" hex={color.riskCritical} on="on white" ratio="5.63" level="AA" />
        </div>
        <p className="max-w-prose text-body-s text-risk-critical">
          Flagging, not fixing silently: risk-moderate and risk-high both fall under 4.5:1 on white
          at normal text sizes (3.73 and 3.87). They clear the 3:1 large-text/non-text threshold, so
          RiskPill/Badge — which render at 11px uppercase — are the exact case this doesn&apos;t
          cover. Reporting to the Lead rather than hand-darkening a ratified hex.
        </p>
        <p className="text-body-s text-ink-muted">Aurora stops (atmosphere only — never a component fill):</p>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Swatch name="aurora-periwinkle" varName="--color-aurora-periwinkle" hex={aurora.periwinkle} />
          <Swatch name="aurora-lilac" varName="--color-aurora-lilac" hex={aurora.lilac} />
          <Swatch name="aurora-mint" varName="--color-aurora-mint" hex={aurora.mint} />
          <Swatch name="aurora-blush" varName="--color-aurora-blush" hex={aurora.blush} />
        </div>
        <p className="text-body-s text-ink-muted">The island (near-black glass dock):</p>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Swatch name="island" varName="--color-island" hex={island.fill} dark on="ink white on island" ratio="19.32" level="AAA" />
        </div>
      </Section>

      <Section title="Typography" note="Instrument Sans (display + UI) and Geist Mono (data + eyebrows). Tabular numerals everywhere, without exception.">
        <div className="flex flex-col gap-5">
          {(Object.keys(typeScale) as Array<keyof typeof typeScale>).map((step) => {
            const t = typeScale[step];
            return (
              <div key={step} className="flex flex-col gap-1 border-b border-hairline pb-4">
                <span
                  style={{
                    fontFamily: `var(${FONT_VAR[t.fontFamily] ?? "--font-instrument-sans"})`,
                    fontSize: t.fontSize,
                    lineHeight: `${t.lineHeight}px`,
                    fontWeight: t.fontWeight,
                    letterSpacing: `${t.tracking}em`,
                    textTransform: t.uppercase ? "uppercase" : "none",
                  }}
                  className="tabular-nums text-ink"
                >
                  {TYPE_SAMPLE[step]}
                </span>
                <span className="font-mono text-caption text-ink-faint">
                  {step} · {t.fontSize}/{t.lineHeight} · {t.fontFamily} {t.fontWeight} · {t.tracking}em
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Button" note="primary / secondary / ghost / destructive — one primary per view.">
        <StateRow label="default">
          <Button variant="primary">Start focus</Button>
          <Button variant="secondary">Move block</Button>
          <Button variant="ghost">Dismiss</Button>
          <Button variant="destructive">Delete course</Button>
        </StateRow>
        <StateRow label="disabled">
          <Button variant="primary" disabled>Start focus</Button>
          <Button variant="secondary" disabled>Move block</Button>
          <Button variant="ghost" disabled>Dismiss</Button>
          <Button variant="destructive" disabled>Delete course</Button>
        </StateRow>
        <StateRow label="loading">
          <Button variant="primary" loading>Saving</Button>
        </StateRow>
        <StateRow label="hover / focus-visible / active (live — tab or hover to see)">
          <Button data-testid="hover-demo-button" variant="primary">Start focus</Button>
        </StateRow>
      </Section>

      <Section title="Input & Textarea" note="The well tier (glass-sunken) — a translucent inset, not a flat surface-sunken fill.">
        <div className="grid max-w-md gap-4">
          <Input label="Course name" placeholder="BIOL 23000" defaultValue="" />
          <Input label="Target grade" defaultValue="A" required />
          <Input label="Office hours" defaultValue="bad value" error="Use the format: Day HH:MM–HH:MM." />
          <Input label="Locked" defaultValue="Cannot edit" disabled />
          <Textarea label="What went wrong?" placeholder="One or two sentences." />
        </div>
      </Section>

      <Section title="Label & FieldError" note="Used standalone (Input/Textarea compose them internally).">
        <div className="flex flex-col items-start gap-4">
          <Label required>Target grade</Label>
          <FieldError>Grade boundaries must be between 0 and 100.</FieldError>
        </div>
      </Section>

      <Section title="Panel" note="§4 — v1's 'no shadow, ever' rule is reversed. shadowGlass is what makes a panel float.">
        <div className="grid max-w-md gap-4">
          <Panel title="BME 301">
            <p className="text-body text-ink-muted">Panel body content sits here, floating on glass.</p>
          </Panel>
          <Panel title="Nested well" tone="sunken">
            <p className="text-body text-ink-muted">A sunken tone, for a readout nested a level deeper.</p>
          </Panel>
        </div>
      </Section>

      <Section title="RiskPill & Badge">
        <StateRow label="risk bands">
          <RiskPill band="low" label="LOW" />
          <RiskPill band="moderate" label="MODERATE" />
          <RiskPill band="high" label="HIGH ATTENTION" />
          <RiskPill band="critical" label="CRITICAL" />
        </StateRow>
        <StateRow label="badge">
          <Badge tone="neutral">3 new</Badge>
          <Badge tone="accent">Selected</Badge>
        </StateRow>
      </Section>

      <Section title="Metric">
        <div className="flex flex-wrap gap-8">
          <Metric label="deep work" value="138" unit="min" size="xl" />
          <Metric
            label="sleep"
            value="6.3"
            unit="h"
            delta={{ direction: "down", label: "1.4 vs 30-day average" }}
          />
          <Metric label="mit completion" value="2 / 3" />
        </div>
      </Section>

      <Section title="SegmentedControl" note="10 discrete cells — used for the 1–10 energy/mood scales. Never a slider.">
        <div className="max-w-md">
          <SegmentedControl label="Energy" value={scale} onChange={setScale} />
        </div>
        <div className="max-w-md">
          <SegmentedControl label="Disabled" value={4} onChange={() => {}} disabled />
        </div>
      </Section>

      <Section title="Checkbox & Toggle">
        <StateRow label="checkbox — unchecked / checked (live)">
          <Checkbox label="No Instagram before 6 PM" checked={checked} onChange={setChecked} />
        </StateRow>
        <StateRow label="checkbox — disabled (checked)">
          <Checkbox label="Disabled" checked={true} onChange={() => {}} disabled />
        </StateRow>
        <div className="flex flex-col gap-2">
          <StateRow label="checkbox — error">
            <Checkbox label="Confirm this commitment" checked={false} onChange={() => {}} error="Confirm this commitment." />
          </StateRow>
        </div>
        <StateRow label="toggle — off (live)">
          <div className="w-56">
            <Toggle label="Weekly digest" checked={toggled} onChange={setToggled} />
          </div>
        </StateRow>
        <StateRow label="toggle — on">
          <div className="w-56">
            <Toggle label="Weekly digest" checked={true} onChange={() => {}} />
          </div>
        </StateRow>
        <StateRow label="toggle — disabled off / on">
          <div className="w-56">
            <Toggle label="Disabled" checked={false} onChange={() => {}} disabled />
          </div>
          <div className="w-56">
            <Toggle label="Disabled" checked={true} onChange={() => {}} disabled />
          </div>
        </StateRow>
      </Section>

      <Section title="Skeleton" note="Mirrors the real layout's geometry.">
        <div className="flex max-w-md flex-col gap-2">
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} />
          <Skeleton height={14} width="80%" />
        </div>
      </Section>

      <Section title="EmptyState" note="A well (glass-sunken) with a dashed hint border. Still explains why it's empty.">
        <div className="max-w-md">
          <EmptyState
            title="No courses yet"
            description="Upload a syllabus to build this course's semester map."
            actionLabel="Upload syllabus"
            onAction={() => {}}
          />
        </div>
      </Section>

      <Section title="Toast" note="glass-raised — the popover tier.">
        <div className="flex flex-col items-start gap-4">
          <div className="max-w-sm">
            <Toast variant="success" message="Focus session logged." onDismiss={() => {}} />
          </div>
          <div className="max-w-sm">
            <Toast variant="error" message="Couldn't save — check your connection." onDismiss={() => {}} />
          </div>
          <ToastDemoButton />
        </div>
      </Section>
    </main>
  );
}
