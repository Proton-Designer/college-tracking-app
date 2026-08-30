"use client";

import type { FitnessOverview, MuscleGroupValue, TodayWorkout } from "@collegeos/api";
import {
  CYCLE_LENGTH_DAYS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type LocalDate,
  type MuscleGroup,
} from "@collegeos/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  activatePlanAction,
  addExerciseAction,
  addPlanExerciseAction,
  addPlanSessionAction,
  createPlanAction,
  deleteSetAction,
  logBodyMetricsAction,
  logSetAction,
  setCycleAnchorAction,
  setExerciseActiveAction,
  setWorkoutConfirmedAction,
} from "@/app/(app)/fitness/fitnessActions";
import { Button, DatePicker, EmptyState, Input, Metric, Panel, Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { formatShortDate } from "@/lib/dates";

/**
 * Fitness's interaction layer. Mirrored section for section and word for word by
 * apps/mobile/src/app/fitness.tsx; both render `loadFitnessOverview`, which calls
 * `packages/core`'s fitness engine, so neither platform decides anything about a cycle, a
 * week's sets or a muscle's volume on its own (Law 2).
 *
 * **Nothing here is seeded, and that is the point (D40).** LifeOS ships three starter plans
 * with one person's rep targets in them; migration 52 deliberately does not port them, because
 * three people use Ihsan and none of them should open Fitness to find someone else's programme
 * presented as their own. So every panel below has a real first-run state, and each one is
 * written as an invitation rather than a report of failure:
 *
 * - No cycle anchor -> no cycle header at all, and a prompt to pick the date a block began.
 *   Never "Cycle 1, day 1" computed from an invented anchor.
 * - No plan -> "Nothing is planned yet", with the create form right there.
 * - No exercises -> the library explains what a movement's muscles are for before asking.
 * - A future day in the week strip -> BLANK. Never `0`: a zero on Thursday when it is Tuesday
 *   is a claim that Thursday was a rest day, which measures something that has not happened.
 * - A missing measurement -> an em-dash.
 * - A cycle with one measurement -> "one reading, nothing to compare yet". Never a 0.0 delta.
 */

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
/** ISO weekdays, 1 = Monday .. 7 = Sunday — the schema's single weekday convention. */
const ISO_WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** A number the user typed that is not a number at all. Distinguished from "left blank" so a
 *  typo is reported rather than silently written as null. */
function isBadNumber(raw: string): boolean {
  return raw.trim() !== "" && !Number.isFinite(Number(raw));
}

function Chip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-pill border px-3 py-1 font-sans text-body-s",
        "outline-none transition-colors duration-90",
        "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
        selected
          ? "border-domain-fitness bg-domain-fitness/20 text-ink"
          : "border-border bg-surface text-ink-muted hover:bg-surface-sunken hover:text-ink",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {label}
    </button>
  );
}

export function FitnessClient({ overview }: { overview: FitnessOverview }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, fallback: string, onDone?: () => void) {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? fallback);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <CyclePanel overview={overview} disabled={isPending} run={run} />
      <WeekStrip overview={overview} />
      <TodayPanel overview={overview} disabled={isPending} run={run} />
      <VolumePanel overview={overview} />
      <BodyPanel overview={overview} disabled={isPending} run={run} />
      <PlanPanel overview={overview} disabled={isPending} run={run} />
      <ExerciseLibrary overview={overview} disabled={isPending} run={run} />
    </div>
  );
}

type Run = (action: () => Promise<{ ok: boolean; error?: string }>, fallback: string, onDone?: () => void) => void;

/** `cycleForDate` with days left. Absent an anchor there is no cycle — the header is replaced
 *  by the prompt that creates one, never by a cycle counted from a date nobody chose. */
function CyclePanel({ overview, disabled, run }: { overview: FitnessOverview; disabled: boolean; run: Run }) {
  const [anchor, setAnchor] = useState<string | null>(overview.today);

  if (overview.cycle == null) {
    return (
      <EmptyState
        title="No cycle started"
        description={`Ihsan counts training in ${CYCLE_LENGTH_DAYS}-day cycles from one date you pick — the day your current block actually began, which does not have to be today. Until you pick it there is no cycle, and nothing here pretends there is one.`}
        action={
          <div className="flex flex-wrap items-end gap-3">
            <DatePicker label="Cycle started on" value={anchor} onValueChange={setAnchor} maxDate={overview.today} />
            <Button
              variant="secondary"
              loading={disabled}
              onClick={() => {
                if (anchor == null) {
                  return;
                }
                run(() => setCycleAnchorAction(anchor as LocalDate), "Could not set the cycle start.");
              }}
            >
              Start the cycle
            </Button>
          </div>
        }
      />
    );
  }

  const { cycle } = overview;
  return (
    <Panel title="Cycle" className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-8">
        <Metric label="Cycle" value={cycle.cycleNumber} />
        <Metric label="Day" value={cycle.dayOfCycle} unit={`of ${CYCLE_LENGTH_DAYS}`} />
        <Metric label="Days left" value={cycle.daysLeft} />
      </div>
      <p className="text-body-s text-ink-muted">
        {formatShortDate(cycle.startDate)} – {formatShortDate(cycle.endDate)}. The last day of a cycle is where a
        benchmark belongs.
      </p>
    </Panel>
  );
}

/** The Sun–Sat strip, straight from `weekStrip`. A future day carries `null` and renders as an
 *  empty cell — never `0`, which would claim a rest day that has not happened yet. */
function WeekStrip({ overview }: { overview: FitnessOverview }) {
  return (
    <Panel title="This week" className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-2">
        {overview.week.map((day, index) => {
          const isToday = day.date === overview.today;
          const future = day.confirmedSets === null;
          return (
            <div
              key={day.date}
              className={cn(
                "glass-sunken flex flex-col items-center gap-1 rounded-md border px-1 py-3",
                isToday ? "border-domain-fitness" : "border-hairline",
              )}
            >
              <span className="font-mono text-caption uppercase tracking-[0.1em] text-ink-faint">
                {WEEKDAY_INITIALS[index]}
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums text-body-l",
                  future ? "text-ink-faint" : day.confirmedSets === 0 ? "text-ink-muted" : "text-domain-fitness",
                )}
                aria-label={
                  future
                    ? `${formatShortDate(day.date)}: still to come`
                    : `${formatShortDate(day.date)}: ${day.confirmedSets} confirmed sets`
                }
              >
                {/* Blank, not a dash and not a zero. There is no number here yet. */}
                {future ? "" : day.confirmedSets}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-caption text-ink-faint">
        Confirmed sets. Days still to come are blank rather than zero — a zero would be a claim about a day that has
        not happened.
      </p>
    </Panel>
  );
}

function TodayPanel({ overview, disabled, run }: { overview: FitnessOverview; disabled: boolean; run: Run }) {
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [reps, setReps] = useState("");
  const [load, setLoad] = useState("");
  const [planSessionId, setPlanSessionId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const open = overview.todayWorkouts.find((w) => w.session.confirmed_at == null) ?? null;

  if (overview.activeExercises.length === 0) {
    return (
      <Panel title="Today" className="flex flex-col gap-3">
        <p className="text-body-s text-ink-muted">
          Sets are logged against a movement, so the library below comes first. Add one exercise and this becomes a
          three-field form.
        </p>
      </Panel>
    );
  }

  function submit() {
    if (exerciseId == null) {
      setFormError("Pick which movement this set was.");
      return;
    }
    if (isBadNumber(reps) || isBadNumber(load)) {
      setFormError("Reps and load have to be numbers, or left blank.");
      return;
    }
    setFormError(undefined);
    run(
      () =>
        logSetAction({
          exerciseId: Number(exerciseId),
          reps: parseOptionalNumber(reps),
          load: parseOptionalNumber(load),
          planSessionId: planSessionId == null ? null : Number(planSessionId),
        }),
      "Could not log that set.",
      () => {
        setReps("");
        setLoad("");
      },
    );
  }

  return (
    <Panel title="Today" className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Select
          label="Movement"
          value={exerciseId}
          onValueChange={setExerciseId}
          placeholder="Pick one"
          options={overview.activeExercises.map((e) => ({ value: String(e.id), label: e.name }))}
        />
        <Input label="Reps" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="8" inputMode="numeric" />
        <Input label="Load (lb)" value={load} onChange={(e) => setLoad(e.target.value)} placeholder="135" inputMode="decimal" />
        {overview.planSessions.length > 0 ? (
          <Select
            label="Under session"
            value={planSessionId}
            onValueChange={setPlanSessionId}
            placeholder="Unplanned"
            options={overview.planSessions.map((p) => ({ value: String(p.session.id), label: p.session.name }))}
          />
        ) : null}
      </div>
      <p className="text-caption text-ink-faint">
        Reps and load are both optional — a set you did without writing the numbers down is still a set, and it still
        counts toward volume.
      </p>
      {formError ? <p className="text-body-s text-risk-critical">{formError}</p> : null}
      <div>
        <Button onClick={submit} loading={disabled}>
          Log set
        </Button>
      </div>

      {overview.todayWorkouts.length === 0 ? (
        <p className="text-body-s text-ink-muted">Nothing logged today yet.</p>
      ) : (
        overview.todayWorkouts.map((workout) => (
          <WorkoutBlock key={workout.session.id} workout={workout} disabled={disabled} run={run} isOpen={workout === open} />
        ))
      )}
    </Panel>
  );
}

function WorkoutBlock({
  workout,
  disabled,
  run,
  isOpen,
}: {
  workout: TodayWorkout;
  disabled: boolean;
  run: Run;
  isOpen: boolean;
}) {
  const confirmed = workout.session.confirmed_at != null;
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {confirmed ? "Confirmed" : isOpen ? "In progress" : "Draft"} · {workout.sets.length}{" "}
          {workout.sets.length === 1 ? "set" : "sets"}
        </p>
        <Button
          variant="secondary"
          loading={disabled}
          onClick={() =>
            run(
              () => setWorkoutConfirmedAction(workout.session.id, !confirmed),
              confirmed ? "Could not reopen that workout." : "Could not confirm that workout.",
            )
          }
        >
          {confirmed ? "Reopen" : "Confirm workout"}
        </Button>
      </div>

      {workout.sets.length === 0 ? (
        <p className="text-body-s text-ink-muted">No sets in this one yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {workout.sets.map(({ set, exercise }, index) => (
            <li key={set.id} className="flex flex-wrap items-center gap-3 text-body-s">
              <span className="font-mono tabular-nums text-ink-faint">{index + 1}</span>
              <span className="text-ink">{exercise?.name ?? "Removed movement"}</span>
              <span className="font-mono tabular-nums text-ink-muted">
                {/* An em-dash where a number was never recorded. Never a 0 — "did zero reps"
                    and "did not write down the reps" are different facts. */}
                {set.reps == null ? "—" : `${set.reps} reps`} · {set.load == null ? "—" : `${set.load} lb`}
              </span>
              {!confirmed ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => run(() => deleteSetAction(set.id), "Could not remove that set.")}
                  className={cn(
                    "font-mono text-caption text-ink-faint underline underline-offset-2",
                    "outline-none hover:text-ink-muted",
                    "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                    disabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!confirmed ? (
        <p className="text-caption text-ink-faint">
          A workout counts toward the week and toward volume once it is confirmed. Until then it is a draft, and only
          you can see the difference.
        </p>
      ) : null}
    </div>
  );
}

/** `volumeByMuscle` over the week's CONFIRMED sets. With nothing confirmed the panel says so
 *  rather than presenting thirteen zeros as a measurement of an unmeasured week. */
function VolumePanel({ overview }: { overview: FitnessOverview }) {
  const worked = MUSCLE_GROUPS.filter((m) => overview.weekVolume[m] > 0);
  const max = worked.reduce((acc, m) => Math.max(acc, overview.weekVolume[m]), 0);

  return (
    <Panel title="Weekly volume" className="flex flex-col gap-4">
      {overview.weekConfirmedSetCount === 0 ? (
        <p className="text-body-s text-ink-muted">
          Nothing confirmed this week, so there is no volume to report yet. A movement credits its primary muscle one
          set and each secondary half a set, and the totals appear here as soon as a workout is confirmed.
        </p>
      ) : (
        <>
          <p className="text-body-s text-ink-muted">
            From <span className="font-mono tabular-nums text-ink">{overview.weekConfirmedSetCount}</span> confirmed{" "}
            {overview.weekConfirmedSetCount === 1 ? "set" : "sets"}. A primary mover earns one set, a secondary half.
          </p>
          <ul className="flex flex-col gap-2">
            {worked.map((muscle) => (
              <li key={muscle} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-body-s text-ink-muted">{MUSCLE_GROUP_LABELS[muscle]}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                  <span
                    className="block h-full rounded-pill bg-domain-fitness"
                    style={{ width: `${max === 0 ? 0 : (overview.weekVolume[muscle] / max) * 100}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-body-s tabular-nums text-ink">
                  {overview.weekVolume[muscle]}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-ink-faint">
            {/* Untouched muscles are named rather than listed as zeros: the useful fact is
                which ones got nothing, and thirteen rows of 0 buries it. */}
            {worked.length === MUSCLE_GROUPS.length
              ? "Every muscle group got something this week."
              : `Nothing yet this week for ${MUSCLE_GROUPS.filter((m) => overview.weekVolume[m] === 0)
                  .map((m: MuscleGroup) => MUSCLE_GROUP_LABELS[m])
                  .join(", ")}.`}
          </p>
        </>
      )}
    </Panel>
  );
}

/** Body metrics, plus `cycleProgress`'s deltas. A null delta is stated as "nothing to compare",
 *  never as 0.0 — "no change" and "one reading" are different facts and only one is a result. */
function BodyPanel({ overview, disabled, run }: { overview: FitnessOverview; disabled: boolean; run: Run }) {
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const progress = overview.progress;
  const readings = progress?.first == null ? 0 : progress.first.date === progress.latest?.date ? 1 : 2;

  function submit() {
    if (isBadNumber(weight) || isBadNumber(waist)) {
      setFormError("Weight and waist have to be numbers, or left blank.");
      return;
    }
    const parsedWeight = parseOptionalNumber(weight);
    const parsedWaist = parseOptionalNumber(waist);
    if (parsedWeight == null && parsedWaist == null) {
      setFormError("Record a weight, a waist measurement, or both.");
      return;
    }
    setFormError(undefined);
    run(() => logBodyMetricsAction({ weightLb: parsedWeight, waistIn: parsedWaist }), "Could not record that.", () => {
      setWeight("");
      setWaist("");
    });
  }

  return (
    <Panel title="Body" className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-8">
        <Metric
          label="Latest weight"
          value={overview.latestMeasurement?.weight_lb ?? "—"}
          {...(overview.latestMeasurement?.weight_lb == null ? {} : { unit: "lb" })}
        />
        <Metric
          label="Latest waist"
          value={overview.latestMeasurement?.waist_in ?? "—"}
          {...(overview.latestMeasurement?.waist_in == null ? {} : { unit: "in" })}
        />
      </div>
      {overview.latestMeasurement == null ? (
        <p className="text-body-s text-ink-muted">Nothing measured yet. One reading starts the record; two make a delta.</p>
      ) : (
        <p className="text-caption text-ink-faint">
          Measured {formatShortDate(overview.latestMeasurement.local_date as LocalDate)}. An em-dash means that reading
          was never taken, not that it was zero.
        </p>
      )}

      {overview.cycle == null ? (
        <p className="text-body-s text-ink-muted">
          Cycle deltas need a cycle. Start one above and this begins comparing the first and latest reading inside it.
        </p>
      ) : progress == null || readings === 0 ? (
        <p className="text-body-s text-ink-muted">Nothing measured inside this cycle yet.</p>
      ) : readings === 1 ? (
        <p className="text-body-s text-ink-muted">
          One reading in this cycle, on {formatShortDate(progress.first!.date)} — nothing to compare it against yet. A
          delta needs two, so none is shown rather than a zero that would read as &ldquo;no change&rdquo;.
        </p>
      ) : (
        <div className="flex flex-wrap gap-8">
          <Metric
            label="Weight this cycle"
            value={progress.weightDeltaLb == null ? "—" : formatDelta(progress.weightDeltaLb)}
            {...(progress.weightDeltaLb == null ? {} : { unit: "lb" })}
          />
          <Metric
            label="Waist this cycle"
            value={progress.waistDeltaIn == null ? "—" : formatDelta(progress.waistDeltaIn)}
            {...(progress.waistDeltaIn == null ? {} : { unit: "in" })}
          />
        </div>
      )}
      {readings === 2 && (progress?.weightDeltaLb == null || progress?.waistDeltaIn == null) ? (
        <p className="text-caption text-ink-faint">
          An em-dash above means one end of that comparison was never recorded — two readings of weight are needed for
          a weight delta, and the same for waist.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Weight (lb)" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="182.4" inputMode="decimal" />
        <Input label="Waist (in)" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="33" inputMode="decimal" />
      </div>
      {formError ? <p className="text-body-s text-risk-critical">{formError}</p> : null}
      <div>
        <Button onClick={submit} loading={disabled}>
          Record today
        </Button>
      </div>
    </Panel>
  );
}

/** A signed delta reads as a direction, so the sign is never dropped — and `+0` is a real
 *  measured result here (two readings, no change), distinct from the null case above. */
function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function PlanPanel({ overview, disabled, run }: { overview: FitnessOverview; disabled: boolean; run: Run }) {
  const [planName, setPlanName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [sessionDays, setSessionDays] = useState<number[]>([]);
  const [openSessionId, setOpenSessionId] = useState<number | null>(null);

  if (overview.activePlan == null) {
    return (
      <EmptyState
        title="No plan yet"
        description="A plan is a set of named sessions — Push, Pull, Legs — each on the weekdays you train it. Nothing is seeded here on purpose: LifeOS's starter plans carry one person's rep targets, and they are not yours. Name yours and it becomes the active one."
        action={
          <div className="flex flex-wrap items-end gap-3">
            <Input label="Plan name" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Upper / lower" />
            <Button
              variant="secondary"
              loading={disabled}
              onClick={() =>
                run(() => createPlanAction({ name: planName, description: null }), "Could not create that plan.", () =>
                  setPlanName(""),
                )
              }
            >
              Create plan
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <Panel title="Plan" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-body-l text-ink">{overview.activePlan.name}</p>
        {overview.plans.length > 1 ? (
          <Select
            aria-label="Active plan"
            value={String(overview.activePlan.id)}
            onValueChange={(value) => run(() => activatePlanAction(Number(value)), "Could not switch plans.")}
            options={overview.plans.map((p) => ({ value: String(p.id), label: p.name }))}
          />
        ) : null}
      </div>

      {overview.planSessions.length === 0 ? (
        <p className="text-body-s text-ink-muted">
          This plan has no sessions yet. A session is one training day — a name, and the weekdays it lands on.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {overview.planSessions.map(({ session, exercises }) => (
            <li key={session.id} className="flex flex-col gap-2 border-t border-hairline pt-4 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-body-l text-ink">{session.name}</span>
                <span className="font-mono text-body-s text-ink-muted">
                  {session.schedule_days.length === 0
                    ? "No weekday set"
                    : session.schedule_days
                        .map((d) => ISO_WEEKDAYS.find((w) => w.value === d)?.label ?? String(d))
                        .join(" · ")}
                </span>
              </div>
              {exercises.length === 0 ? (
                <p className="text-body-s text-ink-muted">No movements in this session yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {exercises.map(({ planned, exercise }) => (
                    <li key={planned.id} className="flex flex-wrap gap-3 text-body-s">
                      <span className="text-ink">{exercise?.name ?? "Removed movement"}</span>
                      <span className="font-mono tabular-nums text-ink-muted">
                        {[
                          planned.target_sets == null ? null : `${planned.target_sets} sets`,
                          planned.target_reps_low == null && planned.target_reps_high == null
                            ? null
                            : `${planned.target_reps_low ?? "?"}–${planned.target_reps_high ?? "?"} reps`,
                          planned.target_load == null ? null : `${planned.target_load} lb`,
                        ]
                          .filter((part): part is string => part != null)
                          .join(" · ") || "No targets set"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {overview.activeExercises.length > 0 ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenSessionId(openSessionId === session.id ? null : session.id)}
                    className={cn(
                      "font-mono text-caption text-accent underline underline-offset-2",
                      "outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                    )}
                  >
                    {openSessionId === session.id ? "Close" : "Add a movement"}
                  </button>
                  {openSessionId === session.id ? (
                    <AddPlanExerciseForm
                      overview={overview}
                      planSessionId={session.id}
                      disabled={disabled}
                      run={run}
                      onDone={() => setOpenSessionId(null)}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 border-t border-hairline pt-4">
        <Input label="New session" value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="Push" />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Weekdays this session runs">
          {ISO_WEEKDAYS.map((day) => (
            <Chip
              key={day.value}
              label={day.label}
              selected={sessionDays.includes(day.value)}
              disabled={disabled}
              onClick={() =>
                setSessionDays((current) =>
                  current.includes(day.value) ? current.filter((d) => d !== day.value) : [...current, day.value],
                )
              }
            />
          ))}
        </div>
        <p className="text-caption text-ink-faint">Weekdays are optional — a session with none is one you run when you run it.</p>
        <div>
          <Button
            variant="secondary"
            loading={disabled}
            onClick={() =>
              run(
                () =>
                  addPlanSessionAction({
                    planId: overview.activePlan!.id,
                    name: sessionName,
                    scheduleDays: sessionDays,
                  }),
                "Could not add that session.",
                () => {
                  setSessionName("");
                  setSessionDays([]);
                },
              )
            }
          >
            Add session
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function AddPlanExerciseForm({
  overview,
  planSessionId,
  disabled,
  run,
  onDone,
}: {
  overview: FitnessOverview;
  planSessionId: number;
  disabled: boolean;
  run: Run;
  onDone: () => void;
}) {
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [sets, setSets] = useState("");
  const [repsLow, setRepsLow] = useState("");
  const [repsHigh, setRepsHigh] = useState("");
  const [load, setLoad] = useState("");

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <Select
          label="Movement"
          value={exerciseId}
          onValueChange={setExerciseId}
          placeholder="Pick one"
          options={overview.activeExercises.map((e) => ({ value: String(e.id), label: e.name }))}
        />
        <Input label="Sets" value={sets} onChange={(e) => setSets(e.target.value)} inputMode="numeric" />
        <Input label="Reps from" value={repsLow} onChange={(e) => setRepsLow(e.target.value)} inputMode="numeric" />
        <Input label="Reps to" value={repsHigh} onChange={(e) => setRepsHigh(e.target.value)} inputMode="numeric" />
        <Input label="Load (lb)" value={load} onChange={(e) => setLoad(e.target.value)} inputMode="decimal" />
      </div>
      <p className="text-caption text-ink-faint">Every target is optional — &ldquo;bench, three sets&rdquo; is a real plan.</p>
      <div>
        <Button
          variant="secondary"
          loading={disabled}
          onClick={() => {
            if (exerciseId == null) return;
            run(
              () =>
                addPlanExerciseAction({
                  planSessionId,
                  exerciseId: Number(exerciseId),
                  targetSets: parseOptionalNumber(sets),
                  targetRepsLow: parseOptionalNumber(repsLow),
                  targetRepsHigh: parseOptionalNumber(repsHigh),
                  targetLoad: parseOptionalNumber(load),
                }),
              "Could not add that movement.",
              onDone,
            );
          }}
        >
          Add to session
        </Button>
      </div>
    </div>
  );
}

/** The movement library. Retiring, never deleting: `session_sets.exercise_id` is
 *  `on delete restrict` precisely so history cannot be orphaned. */
function ExerciseLibrary({ overview, disabled, run }: { overview: FitnessOverview; disabled: boolean; run: Run }) {
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState<MuscleGroupValue[]>([]);
  const [secondary, setSecondary] = useState<MuscleGroupValue[]>([]);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  function toggle(list: MuscleGroupValue[], set: (v: MuscleGroupValue[]) => void, muscle: MuscleGroupValue) {
    set(list.includes(muscle) ? list.filter((m) => m !== muscle) : [...list, muscle]);
  }

  function submit() {
    if (name.trim() === "") {
      setFormError("An exercise needs a name.");
      return;
    }
    if (primary.length === 0) {
      setFormError("Pick at least one primary muscle — without one, sets of this movement can never count toward volume.");
      return;
    }
    setFormError(undefined);
    run(
      () => addExerciseAction({ name, primaryMuscles: primary, secondaryMuscles: secondary }),
      "Could not add that exercise.",
      () => {
        setName("");
        setPrimary([]);
        setSecondary([]);
      },
    );
  }

  const form = (
    <div className="flex flex-col gap-3">
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Incline dumbbell press" />
      <div className="flex flex-col gap-2">
        <span className="text-label uppercase tracking-[0.1em] text-ink-muted">Primary muscles</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Primary muscles">
          {MUSCLE_GROUPS.map((muscle) => (
            <Chip
              key={muscle}
              label={MUSCLE_GROUP_LABELS[muscle]}
              selected={primary.includes(muscle)}
              disabled={disabled}
              onClick={() => toggle(primary, setPrimary, muscle)}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label uppercase tracking-[0.1em] text-ink-muted">Secondary muscles</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Secondary muscles">
          {MUSCLE_GROUPS.filter((m) => !primary.includes(m)).map((muscle) => (
            <Chip
              key={muscle}
              label={MUSCLE_GROUP_LABELS[muscle]}
              selected={secondary.includes(muscle)}
              disabled={disabled}
              onClick={() => toggle(secondary, setSecondary, muscle)}
            />
          ))}
        </div>
      </div>
      <p className="text-caption text-ink-faint">
        A primary mover earns the movement one set of volume; each secondary earns half. A muscle can only be one or
        the other for a given movement.
      </p>
      {formError ? <p className="text-body-s text-risk-critical">{formError}</p> : null}
      <div>
        <Button variant="secondary" loading={disabled} onClick={submit}>
          Add exercise
        </Button>
      </div>
    </div>
  );

  if (overview.activeExercises.length === 0 && overview.retiredExercises.length === 0) {
    return (
      <EmptyState
        title="Your movement library is empty"
        description="Nothing is seeded here. Every set you log points at a movement, and a movement's muscles are what turn sets into weekly volume — so the first thing to add is the movements you actually train."
        action={form}
      />
    );
  }

  return (
    <Panel title="Movements" className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2">
        {[...overview.activeExercises, ...overview.retiredExercises].map((exercise) => (
          <li key={exercise.id} className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-wrap items-baseline gap-2">
              <span className={cn("text-body", exercise.active ? "text-ink" : "text-ink-faint")}>{exercise.name}</span>
              <span className="font-mono text-caption text-ink-muted">
                {exercise.primary_muscles.map((m) => MUSCLE_GROUP_LABELS[m as MuscleGroup]).join(", ")}
                {exercise.secondary_muscles.length > 0
                  ? ` · ${exercise.secondary_muscles.map((m) => MUSCLE_GROUP_LABELS[m as MuscleGroup]).join(", ")} (half)`
                  : ""}
              </span>
              {!exercise.active ? (
                <span className="font-mono text-caption uppercase tracking-[0.1em] text-ink-faint">Retired</span>
              ) : null}
            </span>
            <Chip
              label={exercise.active ? "Retire" : "Bring back"}
              selected={false}
              disabled={disabled}
              onClick={() =>
                run(
                  () => setExerciseActiveAction(exercise.id, !exercise.active),
                  "Could not update that exercise.",
                )
              }
            />
          </li>
        ))}
      </ul>
      <p className="text-caption text-ink-faint">
        Retiring hides a movement from the pickers and keeps every set ever logged against it. Nothing here deletes.
      </p>
      <div className="border-t border-hairline pt-4">{form}</div>
    </Panel>
  );
}
