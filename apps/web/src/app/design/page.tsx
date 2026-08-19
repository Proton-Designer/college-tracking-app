"use client";

import { useState } from "react";
import {
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
import { color, type as typeScale } from "@collegeos/design";

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

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-hairline py-10 first:border-t-0 first:pt-0">
      <div>
        <h2 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">{title}</h2>
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
}: {
  name: string;
  varName: string;
  hex: string;
  on?: string;
  ratio?: string;
  level?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-16 rounded-md border border-hairline"
        style={{ backgroundColor: hex }}
      />
      <div className="flex flex-col">
        <span className="font-mono text-body-s text-ink">{name}</span>
        <span className="font-mono text-caption text-ink-muted">{varName} · {hex}</span>
        {ratio ? (
          <span className="font-mono text-caption text-ink-faint">
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

export default function DesignPreviewPage() {
  const [scale, setScale] = useState<number | null>(7);
  const [checked, setChecked] = useState(true);
  const [toggled, setToggled] = useState(false);

  return (
    <main className="mx-auto flex max-w-app flex-col gap-2 px-8 py-12">
      <p className="text-label uppercase tracking-[0.1em] text-ink-faint">Design system</p>
      <h1 className="font-serif text-display-l font-semibold tracking-[-0.02em] text-ink">
        Instrument
      </h1>
      <p className="max-w-prose text-body text-ink-muted">
        Every token and primitive from docs/DESIGN_SYSTEM.md, rendered live. Not a route the
        product ships — a reference for judging whether the implementation matches the ratified
        spec.
      </p>

      <Section title="Color" note="Foundation + risk scale. Contrast ratios are computed, not estimated.">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Swatch name="ground" varName="--color-ground" hex={color.ground} on="ink" ratio="16.99" level="AAA" />
          <Swatch name="surface" varName="--color-surface" hex={color.surface} />
          <Swatch name="surface-sunken" varName="--color-surface-sunken" hex={color.surfaceSunken} />
          <Swatch name="ink" varName="--color-ink" hex={color.ink} />
          <Swatch name="ink-muted" varName="--color-ink-muted" hex={color.inkMuted} on="on ground" ratio="5.85" level="AA" />
          <Swatch name="ink-faint" varName="--color-ink-faint" hex={color.inkFaint} />
          <Swatch name="hairline" varName="--color-hairline" hex={color.hairline} />
          <Swatch name="border" varName="--color-border" hex={color.border} on="on ground" ratio="3.80" level="AA (non-text)" />
          <Swatch name="accent" varName="--color-accent" hex={color.accent} on="on ground" ratio="7.25" level="AAA" />
          <Swatch name="accent-hover" varName="--color-accent-hover" hex={color.accentHover} />
          <Swatch name="accent-wash" varName="--color-accent-wash" hex={color.accentWash} />
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Swatch name="risk-low" varName="--color-risk-low" hex={color.riskLow} on="on white" ratio="4.88" level="AA" />
          <Swatch name="risk-moderate" varName="--color-risk-moderate" hex={color.riskModerate} on="on white" ratio="5.31" level="AA" />
          <Swatch name="risk-high" varName="--color-risk-high" hex={color.riskHigh} on="on white" ratio="5.12" level="AA" />
          <Swatch name="risk-critical" varName="--color-risk-critical" hex={color.riskCritical} on="on white" ratio="7.18" level="AAA" />
        </div>
      </Section>

      <Section title="Typography" note="IBM Plex Serif / Sans / Mono. Tabular numerals everywhere, without exception.">
        <div className="flex flex-col gap-5">
          {(Object.keys(typeScale) as Array<keyof typeof typeScale>).map((step) => {
            const t = typeScale[step];
            return (
              <div key={step} className="flex flex-col gap-1 border-b border-hairline pb-4">
                <span
                  style={{
                    fontFamily: `var(--font-${t.fontFamily === "IBM Plex Serif" ? "serif" : t.fontFamily === "IBM Plex Sans" ? "sans" : "mono"})`,
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

      <Section title="Input & Textarea">
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

      <Section title="Panel">
        <div className="grid max-w-md gap-4">
          <Panel title="BME 301">
            <p className="text-body text-ink-muted">Panel body content sits here, no shadow, ever.</p>
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

      <Section title="EmptyState">
        <div className="max-w-md">
          <EmptyState
            title="No courses yet"
            description="Upload a syllabus to build this course's semester map."
            actionLabel="Upload syllabus"
            onAction={() => {}}
          />
        </div>
      </Section>

      <Section title="Toast">
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
