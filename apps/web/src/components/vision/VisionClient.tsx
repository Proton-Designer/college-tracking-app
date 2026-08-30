"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  VISION_MANDATES,
  VISION_MANDATE_LABELS,
  type ChainGoal,
  type VisionChainView,
  type VisionMandate,
} from "@collegeos/api";
import { CHAIN_LAYER_LABELS, type ChainLayer } from "@collegeos/core";
import { Badge, Button, DatePicker, EmptyState, Input, Panel, Textarea } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import {
  saveBeachheadAction,
  saveMissionAction,
  saveMomAction,
  saveVisionAction,
  setGoalAnchorAction,
  setTaskAnchorAction,
} from "@/app/(app)/vision/visionActions";

/**
 * The vision chain, web (D48). One unbroken line, top down, each layer editable in place.
 *
 * **The spine is drawn from `firstMissing`, not from guesswork.** `loadVisionChain` resolves the
 * active rows through `packages/core`, and the connector between two layers is solid only where
 * that resolution says the link is real. A dashed connector is not a warning: it is the honest
 * drawing of a line the user has not joined up yet, and the label beside it says exactly that.
 *
 * **Nothing is seeded and no number is invented (D40).** A layer with no row shows what the layer
 * is *for* and one way to write it. A M.O.M. with no end date shows no countdown at all rather
 * than a zero — there is no deadline to count to, and inventing one would be inventing a promise.
 *
 * **Drift is stated, then given a door.** The count comes from core and is shown with the items
 * behind it; each one carries a single control to attach it, and leaving it alone is equally
 * available. No colour, no badge, no verdict: sometimes the honest reading is that the chain is
 * wrong rather than the night.
 */

export interface VisionClientProps {
  view: VisionChainView;
}

/** The layers, top down — the order the chain is read in. */
const LAYERS: ChainLayer[] = ["vision", "beachhead", "mission", "mom"];

function LayerFrame({
  layer,
  connected,
  showConnector,
  children,
}: {
  layer: ChainLayer;
  /** Whether the link UP from this layer resolved. Drawn, never scored. */
  connected: boolean;
  showConnector: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {showConnector ? (
        <div className="flex items-center gap-3 pl-5">
          <span
            aria-hidden
            className={cn(
              "ml-px h-8 w-0 border-l",
              connected ? "border-solid border-accent/50" : "border-dashed border-border",
            )}
          />
          {!connected ? (
            <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
              Not linked yet
            </span>
          ) : null}
        </div>
      ) : null}
      <Panel className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {CHAIN_LAYER_LABELS[layer]}
        </h2>
        {children}
      </Panel>
    </div>
  );
}

function Meta({ target, startsOn, endsOn }: { target: string | null; startsOn: string | null; endsOn: string | null }) {
  const window =
    startsOn == null && endsOn == null
      ? null
      : `${startsOn ?? "no start date"} → ${endsOn ?? "no end date"}`;
  if (target == null && window == null) return null;
  return (
    <p className="font-mono text-label tabular-nums text-ink-muted">
      {[target, window].filter(Boolean).join(" · ")}
    </p>
  );
}

export function VisionClient({ view }: VisionClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<ChainLayer | null>(null);
  const [isPending, startTransition] = useTransition();

  // The chain resolves bottom-up, so a layer's link is "real" exactly when the resolver reached
  // the layer above it before it stopped. `firstMissing` names where it stopped.
  const brokeAt = view.firstMissing;
  const UPWARD: ChainLayer[] = ["mom", "mission", "beachhead", "vision"];
  function linkedUpFrom(layer: ChainLayer): boolean {
    if (brokeAt == null) return true;
    // The link out of `layer` is real exactly when the layer above it was reached before the
    // resolver stopped.
    return UPWARD.indexOf(layer) + 1 < UPWARD.indexOf(brokeAt);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, fallback: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? fallback);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      {view.reviewDue ? (
        <Panel className="flex flex-col items-start gap-2">
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">The 90 days are up</p>
          <p className="text-body text-ink-muted">
            Score this M.O.M. on its own terms, write what happened, and set the next one when you are
            ready to.
          </p>
          <Link href="/vision/review" className="font-mono text-body-s text-accent underline underline-offset-2">
            Open the 90-day review →
          </Link>
        </Panel>
      ) : null}

      {LAYERS.map((layer, index) => (
        <LayerFrame
          key={layer}
          layer={layer}
          connected={layer === "vision" ? true : linkedUpFrom(layer)}
          showConnector={index > 0}
        >
          {layer === "vision" ? (
            <VisionLayer
              view={view}
              editing={editing === "vision"}
              pending={isPending}
              onEdit={() => setEditing("vision")}
              onCancel={() => setEditing(null)}
              onSave={(input) => run(() => saveVisionAction(input), "Couldn't save the vision.")}
            />
          ) : null}

          {layer === "beachhead" ? (
            <ChainNodeLayer
              title={view.beachhead?.title ?? null}
              target={view.beachhead?.target ?? null}
              startsOn={view.beachhead?.starts_on ?? null}
              endsOn={view.beachhead?.ends_on ?? null}
              linkedParentId={view.beachhead?.vision_id ?? null}
              parentLabel={CHAIN_LAYER_LABELS.vision}
              parentId={view.vision?.id ?? null}
              emptyTitle="No three-year beachhead yet"
              emptyDescription="A beachhead is the position you have to be holding in three years for the ten-year vision to still be reachable. One at a time — it is a foothold, not a list."
              writeLabel="Write the beachhead"
              editing={editing === "beachhead"}
              pending={isPending}
              onEdit={() => setEditing("beachhead")}
              onCancel={() => setEditing(null)}
              onSave={(input) =>
                run(
                  () =>
                    saveBeachheadAction(
                      view.beachhead == null ? input : { ...input, id: view.beachhead.id },
                    ),
                  "Couldn't save the beachhead.",
                )
              }
            />
          ) : null}

          {layer === "mission" ? (
            <ChainNodeLayer
              title={view.mission?.title ?? null}
              target={view.mission?.target ?? null}
              startsOn={view.mission?.starts_on ?? null}
              endsOn={view.mission?.ends_on ?? null}
              linkedParentId={view.mission?.beachhead_id ?? null}
              parentLabel={CHAIN_LAYER_LABELS.beachhead}
              parentId={view.beachhead?.id ?? null}
              emptyTitle="No one-year mission yet"
              emptyDescription="The mission is what this year has to produce for the beachhead to be taken. One year, one mission."
              writeLabel="Write the mission"
              editing={editing === "mission"}
              pending={isPending}
              onEdit={() => setEditing("mission")}
              onCancel={() => setEditing(null)}
              onSave={(input) =>
                run(
                  () =>
                    saveMissionAction(view.mission == null ? input : { ...input, id: view.mission.id }),
                  "Couldn't save the mission.",
                )
              }
            />
          ) : null}

          {layer === "mom" ? (
            <>
              <ChainNodeLayer
                title={view.mom?.title ?? null}
                target={view.mom?.target ?? null}
                startsOn={view.mom?.starts_on ?? null}
                endsOn={view.mom?.ends_on ?? null}
                linkedParentId={view.mom?.mission_id ?? null}
                parentLabel={CHAIN_LAYER_LABELS.mission}
                parentId={view.mission?.id ?? null}
                emptyTitle="No 90-day M.O.M. yet"
                emptyDescription="The M.O.M. is the one measurable outcome the next ninety days are for. Give it an end date and this screen counts down to it; leave the date off and there is simply no countdown."
                writeLabel="Set the M.O.M."
                editing={editing === "mom"}
                pending={isPending}
                onEdit={() => setEditing("mom")}
                onCancel={() => setEditing(null)}
                onSave={(input) =>
                  run(
                    () => saveMomAction(view.mom == null ? input : { ...input, id: view.mom.id }),
                    "Couldn't save the M.O.M.",
                  )
                }
              />
              {view.mom != null ? <Countdown view={view} /> : null}
            </>
          ) : null}
        </LayerFrame>
      ))}

      <GoalsUnder
        goals={view.goals}
        momId={view.mom?.id ?? null}
        momTitle={view.mom?.title ?? null}
        pending={isPending}
        onSet={(goalId, momId) =>
          run(() => setGoalAnchorAction(goalId, momId), "Couldn't change what that goal answers to.")
        }
      />

      <DriftPanel
        view={view}
        pending={isPending}
        onAttach={(taskId, momId) =>
          run(() => setTaskAnchorAction(taskId, momId), "Couldn't attach that MIT.")
        }
      />

      <History view={view} />
    </div>
  );
}

/** The countdown, or the honest absence of one. */
function Countdown({ view }: { view: VisionChainView }) {
  const countdown = view.countdown;
  if (countdown == null) return null;

  if (countdown.daysRemaining == null) {
    return (
      <p className="text-body-s text-ink-muted">
        No end date set, so there is no countdown. Add one and this line starts counting.
      </p>
    );
  }

  const days = countdown.daysRemaining;
  const headline =
    days > 0
      ? `${days} ${days === 1 ? "day" : "days"} left`
      : days === 0
        ? "Last day"
        : `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} past the end date`;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="font-mono text-metric tabular-nums text-ink">{headline}</span>
      {countdown.elapsedDays != null && countdown.totalDays != null ? (
        <span className="font-mono text-label tabular-nums text-ink-muted">
          day {countdown.elapsedDays} of {countdown.totalDays}
        </span>
      ) : null}
    </div>
  );
}

function VisionLayer({
  view,
  editing,
  pending,
  onEdit,
  onCancel,
  onSave,
}: {
  view: VisionChainView;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (input: { body: string; mandates: Partial<Record<VisionMandate, string | null>> }) => void;
}) {
  const vision = view.vision;
  const [body, setBody] = useState(vision?.body ?? "");
  const [mandates, setMandates] = useState<Record<VisionMandate, string>>(() => ({
    financial: vision?.mandate_financial ?? "",
    professional: vision?.mandate_professional ?? "",
    physical: vision?.mandate_physical ?? "",
    relational: vision?.mandate_relational ?? "",
    family: vision?.mandate_family ?? "",
    environmental: vision?.mandate_environmental ?? "",
  }));
  const [showMandates, setShowMandates] = useState(false);

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <Textarea
          label="Ten years from now, in your own words"
          value={body}
          rows={6}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Present tense. Write it as though you are already living in it."
        />
        <div>
          <Button variant="ghost" onClick={() => setShowMandates((s) => !s)}>
            {showMandates ? "Hide the six mandates" : "Break it down by mandate (optional)"}
          </Button>
        </div>
        {showMandates ? (
          <div className="flex flex-col gap-3">
            <p className="text-body-s text-ink-muted">
              Six sections of the same statement, not six goals. Every one of them is optional.
            </p>
            {VISION_MANDATES.map((mandate) => (
              <Textarea
                key={mandate}
                label={VISION_MANDATE_LABELS[mandate]}
                rows={2}
                value={mandates[mandate]}
                onChange={(e) => setMandates((prev) => ({ ...prev, [mandate]: e.target.value }))}
              />
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button
            loading={pending}
            onClick={() =>
              onSave({
                body,
                mandates: Object.fromEntries(
                  VISION_MANDATES.map((m) => [m, mandates[m].trim() === "" ? null : mandates[m]]),
                ) as Partial<Record<VisionMandate, string | null>>,
              })
            }
          >
            Save
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (vision == null) {
    return (
      <EmptyState
        title="No ten-year vision yet"
        description="This is the top of the chain: one written statement, present tense, in your own words — the life you are aiming at in ten years. Nothing below it is required to have one, and nothing here is filled in for you."
        actionLabel="Write it"
        onAction={onEdit}
      />
    );
  }

  const written = VISION_MANDATES.filter((m) => {
    const key = `mandate_${m}` as keyof typeof vision;
    return vision[key] != null;
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="whitespace-pre-wrap text-body text-ink">{vision.body}</p>
      {written.length > 0 ? (
        <dl className="flex flex-col gap-2 border-t border-hairline pt-3">
          {written.map((mandate) => (
            <div key={mandate} className="flex flex-col gap-0.5">
              <dt className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
                {VISION_MANDATE_LABELS[mandate]}
              </dt>
              <dd className="whitespace-pre-wrap text-body-s text-ink">
                {vision[`mandate_${mandate}` as keyof typeof vision] as string}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div>
        <Button variant="ghost" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </div>
  );
}

interface ChainNodeDraft {
  title: string;
  target: string | null;
  startsOn: string | null;
  endsOn: string | null;
  parentId: number | null;
}

function ChainNodeLayer(props: {
  title: string | null;
  target: string | null;
  startsOn: string | null;
  endsOn: string | null;
  linkedParentId: number | null;
  parentLabel: string;
  parentId: number | null;
  emptyTitle: string;
  emptyDescription: string;
  writeLabel: string;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (input: ChainNodeDraft) => void;
}) {
  const [title, setTitle] = useState(props.title ?? "");
  const [target, setTarget] = useState(props.target ?? "");
  const [startsOn, setStartsOn] = useState<string | null>(props.startsOn);
  const [endsOn, setEndsOn] = useState<string | null>(props.endsOn);
  const [linked, setLinked] = useState(props.linkedParentId != null);

  if (props.editing) {
    return (
      <div className="flex flex-col gap-4">
        <Input label="What it is" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="Measurable target (optional)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Left blank, this layer is judged on its words alone."
        />
        <div className="flex flex-wrap gap-4">
          <DatePicker label="Starts" value={startsOn} onValueChange={setStartsOn} />
          <DatePicker label="Ends" value={endsOn} onValueChange={setEndsOn} />
        </div>

        {props.parentId != null ? (
          <label className="flex items-center gap-2 text-body-s text-ink-muted">
            <input
              type="checkbox"
              checked={linked}
              onChange={(e) => setLinked(e.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            Steps down from the {props.parentLabel.toLowerCase()}
          </label>
        ) : (
          <p className="text-body-s text-ink-muted">
            Nothing is written above this yet, so there is nothing to link it to. That is allowed —
            the layer above can be written later and linked then.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            loading={props.pending}
            onClick={() =>
              props.onSave({
                title,
                target: target.trim() === "" ? null : target,
                startsOn,
                endsOn,
                parentId: props.parentId != null && linked ? props.parentId : null,
              })
            }
          >
            Save
          </Button>
          <Button variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (props.title == null) {
    return (
      <EmptyState
        title={props.emptyTitle}
        description={props.emptyDescription}
        actionLabel={props.writeLabel}
        onAction={props.onEdit}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-l text-ink">{props.title}</p>
      <Meta target={props.target} startsOn={props.startsOn} endsOn={props.endsOn} />
      <div>
        <Button variant="ghost" onClick={props.onEdit}>
          Edit
        </Button>
      </div>
    </div>
  );
}

function GoalsUnder({
  goals,
  momId,
  momTitle,
  pending,
  onSet,
}: {
  goals: ChainGoal[];
  momId: number | null;
  momTitle: string | null;
  pending: boolean;
  onSet: (goalId: number, momId: number | null) => void;
}) {
  return (
    <Panel title="The War Map, under the M.O.M." className="flex flex-col gap-3">
      {goals.length === 0 ? (
        <p className="text-body-s text-ink-muted">
          No active goals yet.{" "}
          <Link href="/goals" className="text-accent underline underline-offset-2">
            The War Map
          </Link>{" "}
          is where they are written.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {goals.map(({ goal, anchored }) => (
            <li key={goal.id} className="flex flex-wrap items-center gap-3 border-b border-hairline pb-2 last:border-b-0">
              <span className="min-w-[12rem] flex-1 text-body text-ink">{goal.title}</span>
              {anchored ? (
                <Badge tone="accent">Serves the M.O.M.</Badge>
              ) : (
                <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
                  Not linked
                </span>
              )}
              {momId != null ? (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => onSet(goal.id, anchored ? null : momId)}
                >
                  {anchored ? "Unlink" : "Link"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {momId == null && goals.length > 0 ? (
        <p className="text-body-s text-ink-muted">
          Set a M.O.M. above and these can be linked to it. Until then they stand on their own,
          which is a legitimate way for a goal to exist.
        </p>
      ) : null}
      {momTitle != null ? (
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">
          Linking means: this goal serves “{momTitle}”.
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * The drift readout. A count, its items, and a door beside each one.
 *
 * The sentence comes from core's `driftLine` so mobile says it identically, and there is no tone
 * on it anywhere: no colour, no icon, no badge. The window's own emptiness is stated as emptiness
 * rather than as zero drift.
 */
function DriftPanel({
  view,
  pending,
  onAttach,
}: {
  view: VisionChainView;
  pending: boolean;
  onAttach: (taskId: number, momId: number | null) => void;
}) {
  const momId = view.mom?.id ?? null;

  return (
    <Panel title="What the nights connected to" className="flex flex-col gap-3">
      {view.driftLine == null ? (
        <p className="text-body-s text-ink-muted">
          No MITs were planned in this window, so there is nothing to trace yet.
        </p>
      ) : (
        <p className="text-body text-ink">{view.driftLine}</p>
      )}

      {view.drift.items.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2">
            {view.drift.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 border-b border-hairline pb-2 last:border-b-0"
              >
                <span className="min-w-[12rem] flex-1 text-body text-ink">{item.title}</span>
                <span className="font-mono text-label tabular-nums text-ink-muted">{item.date}</span>
                {momId != null ? (
                  <Button variant="ghost" disabled={pending} onClick={() => onAttach(item.id, momId)}>
                    Attach to the M.O.M.
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-body-s text-ink-muted">
            Leaving these as they are is a complete answer. Sometimes the night was right and the
            chain above it is what needs rewriting.
          </p>
        </>
      ) : null}
    </Panel>
  );
}

const OUTCOME_WORDS: Record<string, string> = {
  hit: "Hit",
  partial: "Partial",
  missed: "Missed",
  changed: "Changed",
};

function History({ view }: { view: VisionChainView }) {
  if (view.history.length === 0) {
    return (
      <Panel title="Closed M.O.M.s" className="flex flex-col gap-2">
        <p className="text-body-s text-ink-muted">
          None yet. The first one lands here the day you close it.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Closed M.O.M.s" className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {view.history.map(({ mom, review }) => (
          <li key={mom.id} className="flex flex-col gap-1 border-b border-hairline pb-3 last:border-b-0">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="flex-1 text-body text-ink">{mom.title}</span>
              <Badge>{review == null ? "Not reviewed" : OUTCOME_WORDS[review.outcome]}</Badge>
              {mom.ends_on != null ? (
                <span className="font-mono text-label tabular-nums text-ink-muted">{mom.ends_on}</span>
              ) : null}
            </div>
            {review?.what_happened ? (
              <p className="whitespace-pre-wrap text-body-s text-ink-muted">{review.what_happened}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
