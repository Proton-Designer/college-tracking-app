import type { FitnessOverview, MuscleGroupValue, TodayWorkout } from "@collegeos/api";
import {
  CYCLE_LENGTH_DAYS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type LocalDate,
  type MuscleGroup,
} from "@collegeos/core";
import { color, domainColor, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, DatePicker, EmptyState, Input, Metric, NavLink, Panel, Select } from "../components/ui";
import { textStyle } from "../design/typography";
import { tintWithAlpha } from "../lib/colorAlpha";
import { formatShortDate } from "../lib/dates";
import {
  activatePlan,
  addExercise,
  addPlanExercise,
  addPlanSession,
  confirmWorkout,
  createPlan,
  loadFitness,
  logOneSet,
  recordBodyMetrics,
  removeSet,
  setExerciseRetired,
  startCycle,
} from "../lib/fitnessActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * Fitness, mobile. Mirrors apps/web/src/components/fitness/FitnessClient.tsx section for
 * section and word for word; both render `loadFitnessOverview`, which calls `packages/core`'s
 * fitness engine, so neither platform decides anything about a cycle, a week's sets or a
 * muscle's volume on its own (Law 2).
 *
 * **Nothing is seeded, and that is the point (D40).** Migration 52 deliberately does not port
 * LifeOS's three starter plans — they carry one person's rep targets, and three people use
 * this app. So each panel has a real first-run state written as an invitation:
 *
 * - No cycle anchor -> no cycle header, and a prompt to pick the date a block began. Never
 *   "Cycle 1, day 1" from an invented anchor.
 * - A future day in the week strip -> BLANK. Never `0`: a zero on Thursday when it is Tuesday
 *   claims a rest day that has not happened.
 * - A missing measurement -> an em-dash. A cycle with one reading -> "nothing to compare yet".
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

function isBadNumber(raw: string): boolean {
  return raw.trim() !== "" && !Number.isFinite(Number(raw));
}

/** A signed delta reads as a direction, so the sign is never dropped — and `+0` here is a real
 *  measured result (two readings, no change), distinct from the null "nothing to compare". */
function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function Chip({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { borderColor: domainColor.fitness, backgroundColor: tintWithAlpha(domainColor.fitness, 0.2) }
          : { borderColor: color.border, backgroundColor: color.surface },
        { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={textStyle("bodyS", selected ? color.ink : color.inkMuted)}>{label}</Text>
    </Pressable>
  );
}

/** Panel's `style` lands on its outer shadow wrapper rather than the padded body its children
 *  live in, so vertical rhythm goes on an explicit container inside it. Same as DeenPanel. */
function FitnessPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title}>
      <View style={styles.panelGap}>{children}</View>
    </Panel>
  );
}

export default function FitnessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [overview, setOverview] = useState<FitnessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadFitness(userId);
    if (result.ok) setOverview(result.data);
    else setError(result.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>, fallback: string, onDone?: () => void) => {
      setBusy(true);
      setError(null);
      const result = await action();
      if (!result.ok) {
        setBusy(false);
        setError(result.error ?? fallback);
        return;
      }
      onDone?.();
      await refresh();
      setBusy(false);
    },
    [refresh],
  );

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] },
        ]}
      >
        <NavLink label="Life" onPress={() => router.back()} />

        <Text style={textStyle("displayM", color.ink)}>Fitness</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          {overview == null
            ? "Loading…"
            : overview.cycle
              ? `Cycle ${overview.cycle.cycleNumber} · day ${overview.cycle.dayOfCycle} of ${CYCLE_LENGTH_DAYS}`
              : (overview.activePlan?.name ?? "No cycle started")}
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading || overview == null || userId == null ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          <>
            <CycleSection overview={overview} userId={userId} busy={busy} run={run} />
            <WeekSection overview={overview} />
            <TodaySection overview={overview} userId={userId} busy={busy} run={run} />
            <VolumeSection overview={overview} />
            <BodySection overview={overview} userId={userId} busy={busy} run={run} />
            <PlanSection overview={overview} userId={userId} busy={busy} run={run} />
            <LibrarySection overview={overview} userId={userId} busy={busy} run={run} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

type Run = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  fallback: string,
  onDone?: () => void,
) => Promise<void>;

interface SectionProps {
  overview: FitnessOverview;
  userId: string;
  busy: boolean;
  run: Run;
}

function CycleSection({ overview, userId, busy, run }: SectionProps) {
  const [anchor, setAnchor] = useState<string | null>(overview.today);

  if (overview.cycle == null) {
    return (
      <EmptyState
        title="No cycle started"
        description={`Ihsan counts training in ${CYCLE_LENGTH_DAYS}-day cycles from one date you pick — the day your current block actually began, which does not have to be today. Until you pick it there is no cycle, and nothing here pretends there is one.`}
        action={
          <View style={styles.panelGap}>
            <DatePicker label="Cycle started on" value={anchor} onValueChange={setAnchor} maxDate={overview.today} />
            <Button
              variant="secondary"
              disabled={busy}
              onPress={() => {
                if (anchor == null) return;
                void run(() => startCycle(userId, anchor as LocalDate), "Could not set the cycle start.");
              }}
            >
              Start the cycle
            </Button>
          </View>
        }
      />
    );
  }

  const { cycle } = overview;
  return (
    <FitnessPanel title="Cycle">
      <View style={styles.metricRow}>
        <Metric label="Cycle" value={String(cycle.cycleNumber)} />
        <Metric label="Day" value={String(cycle.dayOfCycle)} unit={`of ${CYCLE_LENGTH_DAYS}`} />
        <Metric label="Days left" value={String(cycle.daysLeft)} />
      </View>
      <Text style={textStyle("bodyS", color.inkMuted)}>
        {formatShortDate(cycle.startDate)} – {formatShortDate(cycle.endDate)}. The last day of a cycle is where a
        benchmark belongs.
      </Text>
    </FitnessPanel>
  );
}

/** The Sun–Sat strip from `weekStrip`. A future day carries `null` and renders as an empty
 *  cell — never `0`. */
function WeekSection({ overview }: { overview: FitnessOverview }) {
  return (
    <FitnessPanel title="This week">
      <View style={styles.weekRow}>
        {overview.week.map((day, index) => {
          const future = day.confirmedSets === null;
          const isToday = day.date === overview.today;
          return (
            <View
              key={day.date}
              accessibilityLabel={
                future
                  ? `${formatShortDate(day.date)}: still to come`
                  : `${formatShortDate(day.date)}: ${day.confirmedSets} confirmed sets`
              }
              style={[
                styles.weekCell,
                { borderColor: isToday ? domainColor.fitness : color.hairline },
              ]}
            >
              <Text style={textStyle("caption", color.inkFaint)}>{WEEKDAY_INITIALS[index]}</Text>
              <Text
                style={textStyle(
                  "bodyL",
                  future ? color.inkFaint : day.confirmedSets === 0 ? color.inkMuted : domainColor.fitness,
                )}
              >
                {/* Blank, not a dash and not a zero. There is no number here yet. */}
                {future ? "" : String(day.confirmedSets)}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={textStyle("caption", color.inkFaint)}>
        Confirmed sets. Days still to come are blank rather than zero — a zero would be a claim about a day that has
        not happened.
      </Text>
    </FitnessPanel>
  );
}

function TodaySection({ overview, userId, busy, run }: SectionProps) {
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [reps, setReps] = useState("");
  const [load, setLoad] = useState("");
  const [planSessionId, setPlanSessionId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (overview.activeExercises.length === 0) {
    return (
      <FitnessPanel title="Today">
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Sets are logged against a movement, so the library below comes first. Add one exercise and this becomes a
          three-field form.
        </Text>
      </FitnessPanel>
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
    setFormError(null);
    void run(
      () =>
        logOneSet(userId, {
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
    <FitnessPanel title="Today">
      <Select
        label="Movement"
        value={exerciseId}
        onValueChange={setExerciseId}
        placeholder="Pick one"
        options={overview.activeExercises.map((e) => ({ value: String(e.id), label: e.name }))}
      />
      <Input label="Reps" value={reps} onChangeText={setReps} placeholder="8" keyboardType="number-pad" />
      <Input label="Load (lb)" value={load} onChangeText={setLoad} placeholder="135" keyboardType="decimal-pad" />
      {overview.planSessions.length > 0 ? (
        <Select
          label="Under session"
          value={planSessionId}
          onValueChange={setPlanSessionId}
          placeholder="Unplanned"
          options={overview.planSessions.map((p) => ({ value: String(p.session.id), label: p.session.name }))}
        />
      ) : null}
      <Text style={textStyle("caption", color.inkFaint)}>
        Reps and load are both optional — a set you did without writing the numbers down is still a set, and it still
        counts toward volume.
      </Text>
      {formError != null ? <Text style={textStyle("bodyS", color.riskCritical)}>{formError}</Text> : null}
      <Button onPress={submit} disabled={busy}>
        Log set
      </Button>

      {overview.todayWorkouts.length === 0 ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>Nothing logged today yet.</Text>
      ) : (
        overview.todayWorkouts.map((workout) => (
          <WorkoutBlock key={workout.session.id} workout={workout} userId={userId} busy={busy} run={run} />
        ))
      )}
    </FitnessPanel>
  );
}

function WorkoutBlock({
  workout,
  userId,
  busy,
  run,
}: {
  workout: TodayWorkout;
  userId: string;
  busy: boolean;
  run: Run;
}) {
  const confirmed = workout.session.confirmed_at != null;
  return (
    <View style={styles.block}>
      <View style={styles.rowBetween}>
        <Text style={textStyle("label", color.inkMuted)}>
          {confirmed ? "Confirmed" : "In progress"} · {workout.sets.length}{" "}
          {workout.sets.length === 1 ? "set" : "sets"}
        </Text>
        <Button
          variant="secondary"
          disabled={busy}
          onPress={() =>
            void run(
              () => confirmWorkout(userId, workout.session.id, !confirmed),
              confirmed ? "Could not reopen that workout." : "Could not confirm that workout.",
            )
          }
        >
          {confirmed ? "Reopen" : "Confirm workout"}
        </Button>
      </View>

      {workout.sets.length === 0 ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>No sets in this one yet.</Text>
      ) : (
        workout.sets.map(({ set, exercise }, index) => (
          <View key={set.id} style={styles.setRow}>
            <Text style={textStyle("bodyS", color.inkFaint)}>{index + 1}</Text>
            <Text style={textStyle("bodyS", color.ink)}>{exercise?.name ?? "Removed movement"}</Text>
            <Text style={textStyle("bodyS", color.inkMuted)}>
              {/* An em-dash where a number was never recorded. Never a 0. */}
              {set.reps == null ? "—" : `${set.reps} reps`} · {set.load == null ? "—" : `${set.load} lb`}
            </Text>
            {!confirmed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove set ${index + 1}`}
                disabled={busy}
                onPress={() => void run(() => removeSet(userId, set.id), "Could not remove that set.")}
                hitSlop={8}
              >
                <Text style={textStyle("caption", color.inkFaint)}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}

      {!confirmed ? (
        <Text style={textStyle("caption", color.inkFaint)}>
          A workout counts toward the week and toward volume once it is confirmed. Until then it is a draft.
        </Text>
      ) : null}
    </View>
  );
}

/** `volumeByMuscle` over the week's CONFIRMED sets. With nothing confirmed the panel says so
 *  rather than presenting thirteen zeros as a measurement of an unmeasured week. */
function VolumeSection({ overview }: { overview: FitnessOverview }) {
  const worked = MUSCLE_GROUPS.filter((m) => overview.weekVolume[m] > 0);
  const max = worked.reduce((acc, m) => Math.max(acc, overview.weekVolume[m]), 0);
  const untouched = MUSCLE_GROUPS.filter((m) => overview.weekVolume[m] === 0);

  return (
    <FitnessPanel title="Weekly volume">
      {overview.weekConfirmedSetCount === 0 ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Nothing confirmed this week, so there is no volume to report yet. A movement credits its primary muscle one
          set and each secondary half a set, and the totals appear here as soon as a workout is confirmed.
        </Text>
      ) : (
        <>
          <Text style={textStyle("bodyS", color.inkMuted)}>
            From {overview.weekConfirmedSetCount} confirmed {overview.weekConfirmedSetCount === 1 ? "set" : "sets"}. A
            primary mover earns one set, a secondary half.
          </Text>
          {worked.map((muscle) => (
            <View key={muscle} style={styles.volumeRow}>
              <Text style={[textStyle("bodyS", color.inkMuted), styles.volumeLabel]}>
                {MUSCLE_GROUP_LABELS[muscle]}
              </Text>
              <View style={styles.volumeTrack}>
                <View
                  style={[
                    styles.volumeFill,
                    { width: `${max === 0 ? 0 : (overview.weekVolume[muscle] / max) * 100}%` },
                  ]}
                />
              </View>
              <Text style={[textStyle("bodyS", color.ink), styles.volumeValue]}>{overview.weekVolume[muscle]}</Text>
            </View>
          ))}
          <Text style={textStyle("caption", color.inkFaint)}>
            {untouched.length === 0
              ? "Every muscle group got something this week."
              : `Nothing yet this week for ${untouched.map((m: MuscleGroup) => MUSCLE_GROUP_LABELS[m]).join(", ")}.`}
          </Text>
        </>
      )}
    </FitnessPanel>
  );
}

function BodySection({ overview, userId, busy, run }: SectionProps) {
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

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
    setFormError(null);
    void run(
      () => recordBodyMetrics(userId, { weightLb: parsedWeight, waistIn: parsedWaist }),
      "Could not record that.",
      () => {
        setWeight("");
        setWaist("");
      },
    );
  }

  return (
    <FitnessPanel title="Body">
      <View style={styles.metricRow}>
        <Metric
          label="Latest weight"
          value={overview.latestMeasurement?.weight_lb == null ? "—" : String(overview.latestMeasurement.weight_lb)}
          {...(overview.latestMeasurement?.weight_lb == null ? {} : { unit: "lb" })}
        />
        <Metric
          label="Latest waist"
          value={overview.latestMeasurement?.waist_in == null ? "—" : String(overview.latestMeasurement.waist_in)}
          {...(overview.latestMeasurement?.waist_in == null ? {} : { unit: "in" })}
        />
      </View>
      {overview.latestMeasurement == null ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Nothing measured yet. One reading starts the record; two make a delta.
        </Text>
      ) : (
        <Text style={textStyle("caption", color.inkFaint)}>
          Measured {formatShortDate(overview.latestMeasurement.local_date as LocalDate)}. An em-dash means that reading
          was never taken, not that it was zero.
        </Text>
      )}

      {overview.cycle == null ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Cycle deltas need a cycle. Start one above and this begins comparing the first and latest reading inside it.
        </Text>
      ) : progress == null || readings === 0 ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>Nothing measured inside this cycle yet.</Text>
      ) : readings === 1 ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>
          One reading in this cycle, on {formatShortDate(progress.first!.date)} — nothing to compare it against yet. A
          delta needs two, so none is shown rather than a zero that would read as &ldquo;no change&rdquo;.
        </Text>
      ) : (
        <View style={styles.metricRow}>
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
        </View>
      )}

      <Input label="Weight (lb)" value={weight} onChangeText={setWeight} placeholder="182.4" keyboardType="decimal-pad" />
      <Input label="Waist (in)" value={waist} onChangeText={setWaist} placeholder="33" keyboardType="decimal-pad" />
      {formError != null ? <Text style={textStyle("bodyS", color.riskCritical)}>{formError}</Text> : null}
      <Button onPress={submit} disabled={busy}>
        Record today
      </Button>
    </FitnessPanel>
  );
}

function PlanSection({ overview, userId, busy, run }: SectionProps) {
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
          <View style={styles.panelGap}>
            <Input label="Plan name" value={planName} onChangeText={setPlanName} placeholder="Upper / lower" />
            <Button
              variant="secondary"
              disabled={busy}
              onPress={() =>
                void run(() => createPlan(userId, planName), "Could not create that plan.", () => setPlanName(""))
              }
            >
              Create plan
            </Button>
          </View>
        }
      />
    );
  }

  const activePlan = overview.activePlan;
  return (
    <FitnessPanel title="Plan">
      <Text style={textStyle("bodyL", color.ink)}>{activePlan.name}</Text>
      {overview.plans.length > 1 ? (
        <Select
          label="Active plan"
          value={String(activePlan.id)}
          onValueChange={(value) => void run(() => activatePlan(userId, Number(value)), "Could not switch plans.")}
          options={overview.plans.map((p) => ({ value: String(p.id), label: p.name }))}
        />
      ) : null}

      {overview.planSessions.length === 0 ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>
          This plan has no sessions yet. A session is one training day — a name, and the weekdays it lands on.
        </Text>
      ) : (
        overview.planSessions.map(({ session, exercises }) => (
          <View key={session.id} style={styles.block}>
            <View style={styles.rowBetween}>
              <Text style={textStyle("bodyL", color.ink)}>{session.name}</Text>
              <Text style={textStyle("bodyS", color.inkMuted)}>
                {session.schedule_days.length === 0
                  ? "No weekday set"
                  : session.schedule_days
                      .map((d) => ISO_WEEKDAYS.find((w) => w.value === d)?.label ?? String(d))
                      .join(" · ")}
              </Text>
            </View>
            {exercises.length === 0 ? (
              <Text style={textStyle("bodyS", color.inkMuted)}>No movements in this session yet.</Text>
            ) : (
              exercises.map(({ planned, exercise }) => (
                <View key={planned.id} style={styles.setRow}>
                  <Text style={textStyle("bodyS", color.ink)}>{exercise?.name ?? "Removed movement"}</Text>
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    {[
                      planned.target_sets == null ? null : `${planned.target_sets} sets`,
                      planned.target_reps_low == null && planned.target_reps_high == null
                        ? null
                        : `${planned.target_reps_low ?? "?"}–${planned.target_reps_high ?? "?"} reps`,
                      planned.target_load == null ? null : `${planned.target_load} lb`,
                    ]
                      .filter((part): part is string => part != null)
                      .join(" · ") || "No targets set"}
                  </Text>
                </View>
              ))
            )}
            {overview.activeExercises.length > 0 ? (
              <>
                <Chip
                  label={openSessionId === session.id ? "Close" : "Add a movement"}
                  selected={openSessionId === session.id}
                  disabled={busy}
                  onPress={() => setOpenSessionId(openSessionId === session.id ? null : session.id)}
                />
                {openSessionId === session.id ? (
                  <AddPlanExerciseForm
                    overview={overview}
                    userId={userId}
                    planSessionId={session.id}
                    busy={busy}
                    run={run}
                    onDone={() => setOpenSessionId(null)}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        ))
      )}

      <View style={styles.block}>
        <Input label="New session" value={sessionName} onChangeText={setSessionName} placeholder="Push" />
        <View style={styles.chipRow}>
          {ISO_WEEKDAYS.map((day) => (
            <Chip
              key={day.value}
              label={day.label}
              selected={sessionDays.includes(day.value)}
              disabled={busy}
              onPress={() =>
                setSessionDays((current) =>
                  current.includes(day.value) ? current.filter((d) => d !== day.value) : [...current, day.value],
                )
              }
            />
          ))}
        </View>
        <Text style={textStyle("caption", color.inkFaint)}>
          Weekdays are optional — a session with none is one you run when you run it.
        </Text>
        <Button
          variant="secondary"
          disabled={busy}
          onPress={() =>
            void run(
              () => addPlanSession(userId, { planId: activePlan.id, name: sessionName, scheduleDays: sessionDays }),
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
      </View>
    </FitnessPanel>
  );
}

function AddPlanExerciseForm({
  overview,
  userId,
  planSessionId,
  busy,
  run,
  onDone,
}: {
  overview: FitnessOverview;
  userId: string;
  planSessionId: number;
  busy: boolean;
  run: Run;
  onDone: () => void;
}) {
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [sets, setSets] = useState("");
  const [repsLow, setRepsLow] = useState("");
  const [repsHigh, setRepsHigh] = useState("");
  const [load, setLoad] = useState("");

  return (
    <View style={styles.panelGap}>
      <Select
        label="Movement"
        value={exerciseId}
        onValueChange={setExerciseId}
        placeholder="Pick one"
        options={overview.activeExercises.map((e) => ({ value: String(e.id), label: e.name }))}
      />
      <Input label="Sets" value={sets} onChangeText={setSets} keyboardType="number-pad" />
      <Input label="Reps from" value={repsLow} onChangeText={setRepsLow} keyboardType="number-pad" />
      <Input label="Reps to" value={repsHigh} onChangeText={setRepsHigh} keyboardType="number-pad" />
      <Input label="Load (lb)" value={load} onChangeText={setLoad} keyboardType="decimal-pad" />
      <Text style={textStyle("caption", color.inkFaint)}>
        Every target is optional — &ldquo;bench, three sets&rdquo; is a real plan.
      </Text>
      <Button
        variant="secondary"
        disabled={busy}
        onPress={() => {
          if (exerciseId == null) return;
          void run(
            () =>
              addPlanExercise(userId, {
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
    </View>
  );
}

/** The movement library. Retiring, never deleting: `session_sets.exercise_id` is
 *  `on delete restrict` precisely so history cannot be orphaned. */
function LibrarySection({ overview, userId, busy, run }: SectionProps) {
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState<MuscleGroupValue[]>([]);
  const [secondary, setSecondary] = useState<MuscleGroupValue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  function submit() {
    if (name.trim() === "") {
      setFormError("An exercise needs a name.");
      return;
    }
    if (primary.length === 0) {
      setFormError(
        "Pick at least one primary muscle — without one, sets of this movement can never count toward volume.",
      );
      return;
    }
    setFormError(null);
    void run(
      () => addExercise(userId, { name, primaryMuscles: primary, secondaryMuscles: secondary }),
      "Could not add that exercise.",
      () => {
        setName("");
        setPrimary([]);
        setSecondary([]);
      },
    );
  }

  const form = (
    <View style={styles.panelGap}>
      <Input label="Name" value={name} onChangeText={setName} placeholder="Incline dumbbell press" />
      <Text style={textStyle("label", color.inkMuted)}>Primary muscles</Text>
      <View style={styles.chipRow}>
        {MUSCLE_GROUPS.map((muscle) => (
          <Chip
            key={muscle}
            label={MUSCLE_GROUP_LABELS[muscle]}
            selected={primary.includes(muscle)}
            disabled={busy}
            onPress={() =>
              setPrimary((current) =>
                current.includes(muscle) ? current.filter((m) => m !== muscle) : [...current, muscle],
              )
            }
          />
        ))}
      </View>
      <Text style={textStyle("label", color.inkMuted)}>Secondary muscles</Text>
      <View style={styles.chipRow}>
        {MUSCLE_GROUPS.filter((m) => !primary.includes(m)).map((muscle) => (
          <Chip
            key={muscle}
            label={MUSCLE_GROUP_LABELS[muscle]}
            selected={secondary.includes(muscle)}
            disabled={busy}
            onPress={() =>
              setSecondary((current) =>
                current.includes(muscle) ? current.filter((m) => m !== muscle) : [...current, muscle],
              )
            }
          />
        ))}
      </View>
      <Text style={textStyle("caption", color.inkFaint)}>
        A primary mover earns the movement one set of volume; each secondary earns half. A muscle can only be one or
        the other for a given movement.
      </Text>
      {formError != null ? <Text style={textStyle("bodyS", color.riskCritical)}>{formError}</Text> : null}
      <Button variant="secondary" disabled={busy} onPress={submit}>
        Add exercise
      </Button>
    </View>
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
    <FitnessPanel title="Movements">
      {[...overview.activeExercises, ...overview.retiredExercises].map((exercise) => (
        <View key={exercise.id} style={styles.rowBetween}>
          <View style={styles.exerciseText}>
            <Text style={textStyle("body", exercise.active ? color.ink : color.inkFaint)}>{exercise.name}</Text>
            <Text style={textStyle("caption", color.inkMuted)}>
              {exercise.primary_muscles.map((m) => MUSCLE_GROUP_LABELS[m as MuscleGroup]).join(", ")}
              {exercise.secondary_muscles.length > 0
                ? ` · ${exercise.secondary_muscles.map((m) => MUSCLE_GROUP_LABELS[m as MuscleGroup]).join(", ")} (half)`
                : ""}
              {exercise.active ? "" : " · retired"}
            </Text>
          </View>
          <Chip
            label={exercise.active ? "Retire" : "Bring back"}
            selected={false}
            disabled={busy}
            onPress={() =>
              void run(
                () => setExerciseRetired(userId, exercise.id, !exercise.active),
                "Could not update that exercise.",
              )
            }
          />
        </View>
      ))}
      <Text style={textStyle("caption", color.inkFaint)}>
        Retiring hides a movement from the pickers and keeps every set ever logged against it. Nothing here deletes.
      </Text>
      <View style={styles.block}>{form}</View>
    </FitnessPanel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  panelGap: { gap: space[3] },
  chip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  metricRow: { flexDirection: "row", gap: space[8], flexWrap: "wrap" },
  weekRow: { flexDirection: "row", gap: space[1] },
  weekCell: {
    flex: 1,
    alignItems: "center",
    gap: space[1],
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: space[3],
    backgroundColor: color.surfaceSunken,
    minHeight: 56,
  },
  block: {
    gap: space[2],
    paddingTop: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    flexWrap: "wrap",
  },
  setRow: { flexDirection: "row", alignItems: "center", gap: space[3], flexWrap: "wrap" },
  exerciseText: { flex: 1, gap: 2 },
  volumeRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  volumeLabel: { width: 90 },
  volumeTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  volumeFill: { height: "100%", borderRadius: radius.pill, backgroundColor: domainColor.fitness },
  volumeValue: { width: 40, textAlign: "right" },
});
