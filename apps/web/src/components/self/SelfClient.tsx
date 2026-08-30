"use client";

import type { SelfView } from "@collegeos/api";
import {
  EVIDENCE_KIND_LABELS,
  MIN_ACTS_TO_JUDGE,
  type DimensionStanding,
  type EvidenceKind,
} from "@collegeos/core";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Input, Modal, Panel, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { createDimensionAction, setRouteAction } from "@/app/(app)/self/selfActions";
import { setDriftStatementAction, toggleDriftAlertsAction } from "@/app/(app)/self/driftStatementActions";

/**
 * Desired Self.
 *
 * The one rule this screen exists to enforce: **a number never appears without the acts behind
 * it.** Every standing renders with its evidence expanded or one disclosure away, and there is no
 * view, sort, or summary that shows scores alone. That is the design's core integrity constraint
 * (points are evidence, not currency), and putting it in the component rather than only in the
 * schema is what makes it true of what a person actually sees.
 *
 * There is also no total anywhere, deliberately (D34). The only cross-dimension view is attention:
 * how many acts each received this week, which is information about where a life is going rather
 * than a ranking of the parts of it.
 */

/** The directive's starting structure, offered as one-tap adds -- never inserted for someone. */
const SUGGESTED = [
  { name: "Physique", definition: "The body I'm building, and what it lets me do." },
  { name: "Deen", definition: "The practice I want to be consistent in, not just sincere about." },
  { name: "Work/Craft", definition: "What I can make, and how well I can make it." },
  { name: "Focus", definition: "The ability to stay on one hard thing until it's finished." },
  { name: "Traits", definition: "Character — the sub-dimensions live under this one." },
];

const EVIDENCE_KINDS: EvidenceKind[] = [
  "session",
  "habit_log",
  "prayer",
  "quran_session",
  "workout_set",
  "body_metric",
  "lesson_review",
  "milestone",
  "experiment",
];

export function SelfClient({ view }: { view: SelfView }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [definition, setDefinition] = useState("");

  function create(dimensionName: string, dimensionDefinition: string) {
    startTransition(async () => {
      const result = await createDimensionAction({
        name: dimensionName,
        ...(dimensionDefinition.trim().length > 0 ? { definition: dimensionDefinition.trim() } : {}),
      });
      if (!result.ok) {
        toast.show(result.error);
        return;
      }
      setCreating(false);
      setName("");
      setDefinition("");
      router.refresh();
    });
  }

  if (view.dimensions.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Panel>
          <EmptyState
            title="Nothing aimed at yet"
            description="A dimension is a part of yourself you're deliberately training — with your own written definition of the version you're aiming at, and the acts that count toward it. Nothing here is scored until there are acts behind it, and there is never a total: these stand side by side rather than adding up."
          />
        </Panel>

        <Panel>
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Start from these, or write your own</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTED.map((suggestion) => (
              <button
                key={suggestion.name}
                type="button"
                disabled={isPending}
                onClick={() => create(suggestion.name, suggestion.definition)}
                className="flex h-10 items-center rounded-md border border-border px-4 font-sans text-body text-ink outline-none transition-colors duration-150 hover:bg-surface-sunken focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
              >
                + {suggestion.name}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setCreating(true)}>
              Write your own
            </Button>
          </div>
        </Panel>

        <CreateModal
          open={creating}
          name={name}
          definition={definition}
          pending={isPending}
          onName={setName}
          onDefinition={setDefinition}
          onClose={() => setCreating(false)}
          onSubmit={() => create(name, definition)}
        />
      </div>
    );
  }

  const parents = view.standings.filter((s) => s.parentId === null);

  return (
    <div className="flex flex-col gap-6">
      {view.unroutedActs > 0 ? (
        <Panel>
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Routing</p>
          <p className="mt-2 text-body text-ink">
            {view.unroutedActs} {view.unroutedActs === 1 ? "act isn't" : "acts aren't"} feeding any dimension yet.
          </p>
          <p className="mt-1 text-body-s text-ink-muted">
            Nothing is counted where you haven&apos;t said it should be. Add a rule below and it starts
            counting from the same history — no act is lost by being unrouted, only unclaimed.
          </p>
        </Panel>
      ) : null}

      <div className="flex flex-col gap-3">
        {parents.map((standing) => (
          <DimensionPanel
            key={standing.dimensionId}
            standing={standing}
            subDimensions={view.standings.filter((s) => s.parentId === standing.dimensionId)}
            driftStatement={
              view.dimensions.find((d) => d.id === standing.dimensionId)?.drift_statement ?? null
            }
            alertsEnabled={
              view.dimensions.find((d) => d.id === standing.dimensionId)?.drift_alerts_enabled ?? true
            }
          />
        ))}
      </div>

      <Panel>
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Attention this week</p>
        {/* Act counts, never scores. Ranking dimensions by standing would be the grand total D34
            refuses, wearing a list's clothing. */}
        <div className="mt-4 flex flex-col gap-2">
          {view.attention.map((row) => (
            <div key={row.dimensionId} className="flex items-baseline justify-between gap-4">
              <span className="text-body text-ink">{row.name}</span>
              <span className="font-mono text-body-s tabular-nums text-ink-muted">
                {row.acts} {row.acts === 1 ? "act" : "acts"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-body-s text-ink-muted">
          Where your attention went — not a ranking. These aren&apos;t comparable to each other, and
          nothing here adds up to a score.
        </p>
      </Panel>

      <RoutingPanel view={view} />

      <div>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          Add a dimension
        </Button>
      </div>

      <CreateModal
        open={creating}
        name={name}
        definition={definition}
        pending={isPending}
        onName={setName}
        onDefinition={setDefinition}
        onClose={() => setCreating(false)}
        onSubmit={() => create(name, definition)}
      />
    </div>
  );
}

/**
 * The drift statement (D50): who you become if this dimension keeps being neglected.
 *
 * Offered, never required — and the offer is deliberately quiet. A dimension is complete without
 * one, and nothing fires for a dimension that has none, so the empty state here is an invitation
 * rather than a gap. The placeholder is the only guidance given; the app supplies no example
 * sentence, because a suggested phrasing would start shaping words that are supposed to be
 * entirely the user's.
 */
function DriftStatementEditor({
  dimensionId,
  statement,
  alertsEnabled,
}: {
  dimensionId: number;
  statement: string | null;
  alertsEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(statement ?? "");

  function save() {
    startTransition(async () => {
      const result = await setDriftStatementAction(dimensionId, draft);
      if (!result.ok) {
        toast.show(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function toggleAlerts() {
    startTransition(async () => {
      const result = await toggleDriftAlertsAction(dimensionId, !alertsEnabled);
      if (!result.ok) {
        toast.show(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-mono text-caption text-ink-faint underline underline-offset-2 outline-none hover:text-ink-muted focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
        >
          {statement ? "Edit what you're running from" : "Write what you're running from"}
        </button>
        {statement ? (
          <button
            type="button"
            onClick={toggleAlerts}
            disabled={isPending}
            className="font-mono text-caption text-ink-faint underline underline-offset-2 outline-none hover:text-ink-muted focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
          >
            {/* One tap, no confirmation dialog. A mechanic this sharp that cannot be declined
                is not a tool. */}
            {alertsEnabled ? "Turn these off for this one" : "Turn these back on"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-hairline pt-4">
      <Textarea
        label="If this keeps being neglected, in ten years…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={4}
        placeholder="First person, present tense, your own words. Ihsan will never rewrite this, summarise it, or add anything to it — it only chooses when to show it back to you, rarely."
      />
      <div className="flex gap-3">
        <Button onClick={save} loading={isPending}>
          Save
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function DimensionPanel({
  standing,
  subDimensions,
  driftStatement,
  alertsEnabled,
}: {
  standing: DimensionStanding;
  driftStatement: string | null;
  alertsEnabled: boolean;
  /** Traits' sub-dimensions, when this is Traits. Named explicitly rather than `children`, which
   *  would collide with React's own slot and read as markup rather than as data. */
  subDimensions: DimensionStanding[];
}) {
  const tooEarly = standing.standing === null;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-sans text-title font-semibold text-ink">{standing.name}</p>
          {standing.overshoot === "over" ? (
            // D35's voice: a refusal that explains itself, and reads as "stop" rather than as
            // failure. Only fires against a ceiling the user set.
            <p className="text-body-s text-risk-moderate">
              {standing.actsThisWeek} this week, against your own ceiling. The mean cuts both ways —
              this week, less is the virtue.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end">
          {tooEarly ? (
            <>
              <p className="font-mono text-metric text-ink-faint">—</p>
              <p className="text-body-s text-ink-muted">
                {standing.observedActs} of {MIN_ACTS_TO_JUDGE} acts — too early to say
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-metric tabular-nums text-ink">{standing.standing}</p>
              <p className="font-mono text-caption text-ink-faint">
                {standing.observedActs} acts · {standing.actsThisWeek} this week
              </p>
            </>
          )}
        </div>
      </div>

      {/* The acts, never separable from the number. Open by default when there are few enough to
          read at a glance, because the point is that they are what the score IS. */}
      {standing.evidence.length > 0 ? (
        <details className="mt-4" open={standing.evidence.length <= 6}>
          <summary className="cursor-pointer font-mono text-caption text-ink-faint hover:text-ink-muted">
            What&apos;s behind this
          </summary>
          <ul className="mt-3 flex flex-col gap-1.5">
            {standing.evidence.slice(0, 30).map((act, i) => (
              <li key={`${act.date}-${i}`} className="flex items-baseline justify-between gap-4">
                <span className="text-body-s text-ink">{act.label}</span>
                <span className="font-mono text-caption tabular-nums text-ink-faint">
                  {EVIDENCE_KIND_LABELS[act.kind]} · {act.date}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="mt-4 text-body-s text-ink-muted">
          No acts route here yet. Add a rule below and this starts counting.
        </p>
      )}

      <DriftStatementEditor
        dimensionId={standing.dimensionId}
        statement={driftStatement}
        alertsEnabled={alertsEnabled}
      />

      {subDimensions.length > 0 ? (
        <div className="mt-5 flex flex-col gap-2 border-t border-hairline pt-4">
          {subDimensions.map((child) => (
            <div key={child.dimensionId} className="flex items-baseline justify-between gap-4">
              <span className="text-body text-ink-muted">{child.name}</span>
              <span className="font-mono text-body-s tabular-nums text-ink-faint">
                {child.standing === null ? "—" : child.standing}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function RoutingPanel({ view }: { view: SelfView }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [dimensionId, setDimensionId] = useState<string>("");
  const [kind, setKind] = useState<EvidenceKind>("session");
  const [matchValue, setMatchValue] = useState("");

  function add() {
    if (dimensionId === "") return;
    startTransition(async () => {
      const result = await setRouteAction({
        dimensionId: Number(dimensionId),
        kind,
        matchValue: matchValue.trim().length > 0 ? matchValue.trim() : null,
      });
      if (!result.ok) {
        toast.show(result.error);
        return;
      }
      setMatchValue("");
      router.refresh();
    });
  }

  return (
    <Panel>
      <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Routing</p>
      <p className="mt-2 text-body-s text-ink-muted">
        Which acts feed which dimension. Leave the narrow-to field empty to count every act of that
        kind; fill it to narrow — a life domain for sessions, a source for reviews, a habit for votes.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Select
          label="Dimension"
          value={dimensionId === "" ? null : dimensionId}
          placeholder="Choose…"
          onValueChange={setDimensionId}
          options={view.dimensions.map((d) => ({ value: String(d.id), label: d.name }))}
        />
        <Select
          label="Acts of kind"
          value={kind}
          onValueChange={(value) => setKind(value as EvidenceKind)}
          options={EVIDENCE_KINDS.map((k) => ({ value: k, label: EVIDENCE_KIND_LABELS[k] }))}
        />
        <Input
          label="Narrowed to"
          value={matchValue}
          onChange={(event) => setMatchValue(event.target.value)}
          placeholder="business"
        />
        <Button onClick={add} loading={isPending} disabled={dimensionId === ""}>
          Add rule
        </Button>
      </div>
    </Panel>
  );
}

function CreateModal({
  open,
  name,
  definition,
  pending,
  onName,
  onDefinition,
  onClose,
  onSubmit,
}: {
  open: boolean;
  name: string;
  definition: string;
  pending: boolean;
  onName: (value: string) => void;
  onDefinition: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Add a dimension">
      <div className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={(event) => onName(event.target.value)} required />
        <Textarea
          label="The version you're aiming at"
          value={definition}
          onChange={(event) => onDefinition(event.target.value)}
          rows={3}
          placeholder="In your own words. This is the part the score is measured against, and nobody else can write it for you."
        />
        <div className="flex gap-3">
          <Button onClick={onSubmit} loading={pending} disabled={name.trim().length === 0}>
            Add
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
