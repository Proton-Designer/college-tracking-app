import type { Course, DayView, MitTimebox, Task } from "@collegeos/api";
import { localTimeToInstant } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { Button, ChipGroup, GlassSurface, Panel, SegmentedControl } from "../ui";
import { textStyle } from "../../design/typography";
import { submitCheckin } from "../../lib/todayActions";

const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Formats an already-known instant back into "HH:MM" for display, in the user's own
 *  timezone -- presentational only; localTimeToInstant (the actual local-time -> instant
 *  conversion this form submits through) is the packages/core call that does real work. */
function instantToTimeInputValue(iso: string | null, timezone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

interface TimeboxFieldState {
  time: string; // "HH:MM" or a partial/invalid string mid-edit, or ""
  location: string;
  revealed: boolean;
}

function initialTimeboxState(task: Task | undefined, timezone: string): TimeboxFieldState {
  const time = instantToTimeInputValue(task?.planned_start_at ?? null, timezone);
  const location = task?.planned_location ?? "";
  return { time, location, revealed: time !== "" || location !== "" };
}

const DERAILMENT_OPTIONS = [
  { value: "phone", label: "Phone" },
  { value: "fatigue", label: "Fatigue" },
  { value: "avoidance", label: "Avoidance" },
  { value: "schedule", label: "Schedule" },
  { value: "other", label: "Other" },
];

const COMPLETION_STEPS = [0, 20, 40, 60, 80, 100];

function formatSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

type StepId = "physio" | "energy" | "mood" | "mits" | "completion" | "derailment";

function buildSteps(hasHealth: boolean): StepId[] {
  return hasHealth ? ["physio", "energy", "mood", "mits", "completion", "derailment"] : ["energy", "mood", "mits", "completion", "derailment"];
}

/** A text-only tap target (Skip, Remove, Cancel, etc.) with a real press acknowledgment --
 *  these were bare Pressables with zero feedback of any kind. */
function TextLink({ onPress, style, children }: { onPress: () => void; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function CheckinFlow({
  userId,
  today,
  timezone,
  todayTasks,
  courses,
  suggestedMits,
  todayHealth,
  workload,
  recoveryMode,
  onDone,
  onSkip,
}: {
  userId: string;
  today: string;
  timezone: string;
  todayTasks: Task[];
  courses: Record<number, Course>;
  suggestedMits: DayView["suggestedMits"];
  todayHealth: DayView["todayHealth"];
  workload: DayView["workload"];
  recoveryMode: DayView["recoveryMode"];
  onDone: () => void;
  onSkip: () => void;
}) {
  const hasHealth = todayHealth?.sleepHours != null || todayHealth?.whoopRecoveryPct != null;
  const steps = useMemo(() => buildSteps(hasHealth), [hasHealth]);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex] ?? steps[0];

  const tasksById = useMemo(() => new Map(todayTasks.map((t) => [t.id, t])), [todayTasks]);
  const availableTasks = useMemo(
    () => todayTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled"),
    [todayTasks],
  );

  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [timeboxes, setTimeboxes] = useState<Record<number, TimeboxFieldState>>({});

  function timeboxFor(taskId: number): TimeboxFieldState {
    return timeboxes[taskId] ?? initialTimeboxState(tasksById.get(taskId), timezone);
  }

  function updateTimebox(taskId: number, patch: Partial<TimeboxFieldState>) {
    setTimeboxes((prev) => ({ ...prev, [taskId]: { ...timeboxFor(taskId), ...patch } }));
  }
  const [selectedIds, setSelectedIds] = useState<number[]>(() => suggestedMits.map((m) => m.taskId).slice(0, 3));
  // No default: a completion prediction is a claim about work, and a pre-set value that
  // submits unchanged is indistinguishable from a real answer. Stays null (never
  // answered) whenever there are no MITs to predict against -- goNext/goBack skip the
  // "completion" step entirely in that case, so this never blocks submission.
  const [predictedCompletionPct, setPredictedCompletionPct] = useState<number | null>(null);
  const [derailment, setDerailment] = useState<string | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remainingTasks = availableTasks.filter((t) => !selectedIds.includes(t.id));

  // Zero MITs means there's no work to predict against, so the "completion" step is
  // skipped in both directions rather than asked-and-ignored -- steps stays a static
  // array (buildSteps doesn't depend on selectedIds) so this only ever adjusts which
  // index goNext/goBack land on, never resizes the array under an in-flight stepIndex.
  function nextLandableIndex(from: number): number {
    let i = from;
    while (i < steps.length && steps[i] === "completion" && selectedIds.length === 0) i += 1;
    return i;
  }

  function prevLandableIndex(from: number): number {
    let i = from;
    while (i > 0 && steps[i] === "completion" && selectedIds.length === 0) i -= 1;
    return i;
  }

  function goNext() {
    setError(null);
    if (step === "energy" && energy == null) {
      setError("Pick an energy level.");
      return;
    }
    if (step === "mood" && mood == null) {
      setError("Pick a mood.");
      return;
    }
    if (step === "completion" && selectedIds.length > 0 && predictedCompletionPct == null) {
      setError("Pick how much of today you'll actually finish.");
      return;
    }
    const next = nextLandableIndex(stepIndex + 1);
    if (next < steps.length) {
      setStepIndex(next);
    } else {
      handleSubmit();
    }
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => prevLandableIndex(Math.max(0, i - 1)));
  }

  function handleSubmit() {
    setError(null);

    // Every selected MIT gets a real entry -- for an untouched task this just resolves
    // to whatever it already had (initialTimeboxState mirrors the existing DB value), so
    // this is never a silent clear. A malformed/partial time (the field is free text on
    // mobile) is treated as not-set rather than sent to localTimeToInstant.
    const mitTimeboxes: Record<number, MitTimebox> = {};
    for (const taskId of selectedIds) {
      const box = timeboxFor(taskId);
      const match = TIME_INPUT_PATTERN.exec(box.time);
      mitTimeboxes[taskId] = {
        plannedStartAt: match ? localTimeToInstant(today, Number(match[1]), Number(match[2]), timezone) : null,
        plannedLocation: box.location.trim() || null,
      };
    }

    startTransition(async () => {
      const result = await submitCheckin({
        userId,
        localDate: today,
        energy: energy ?? 5,
        mood: mood ?? 5,
        topMitTaskIds: selectedIds,
        mitTimeboxes,
        predictedCompletionPct,
        capacityMinutes: workload.capacityMinutes,
        floorMinutes: workload.floorMinutes,
        targetMinutes: workload.targetMinutes,
        recoveryModeTriggered: recoveryMode.triggered,
        recoveryModeTotal: recoveryMode.total,
        ...(derailment ? { derailmentReason: derailment, likelyFailureMode: derailment } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save — try again.");
        return;
      }
      onDone();
    });
  }

  return (
    <Panel style={styles.panel}>
      <View style={styles.progressHeader}>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${((stepIndex + 1) / steps.length) * 100}%` }]} />
        </View>
        <View style={styles.progressRow}>
          <Text style={textStyle("caption", color.inkFaint)}>
            Step {stepIndex + 1} of {steps.length}
          </Text>
          <TextLink onPress={onSkip}>
            <Text style={textStyle("caption", color.inkFaint)}>Skip for today</Text>
          </TextLink>
        </View>
      </View>

      <View style={styles.stepBody}>
        {step === "physio" ? (
          <View style={styles.stepGap}>
            <Text style={textStyle("title", color.ink)}>This morning</Text>
            <Text style={textStyle("body", color.inkMuted)}>
              {[
                todayHealth?.sleepHours != null ? `Slept ${formatSleep(todayHealth.sleepHours)}` : null,
                todayHealth?.whoopRecoveryPct != null ? `Recovery ${Math.round(todayHealth.whoopRecoveryPct)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        ) : null}

        {step === "energy" ? <ScaleStep title="Energy" value={energy} onChange={setEnergy} /> : null}
        {step === "mood" ? <ScaleStep title="Mood" value={mood} onChange={setMood} /> : null}

        {step === "mits" ? (
          <View style={styles.stepGap}>
            <View style={styles.mitsHeader}>
              <Text style={textStyle("title", color.ink)}>Top 3 for today</Text>
              {selectedIds.length === 0 ? (
                <TextLink onPress={() => setSelectedIds(suggestedMits.map((m) => m.taskId).slice(0, 3))}>
                  <Text style={textStyle("caption", color.accent)}>Accept all</Text>
                </TextLink>
              ) : null}
            </View>
            {selectedIds.length === 0 ? (
              <Text style={textStyle("bodyS", color.inkFaint)}>Nothing selected.</Text>
            ) : (
              selectedIds.map((taskId) => {
                const task = tasksById.get(taskId);
                const c = task?.course_id != null ? courses[task.course_id] : undefined;
                const box = timeboxFor(taskId);
                return (
                  <View key={taskId} style={styles.mitCard}>
                    <View style={styles.mitRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={textStyle("bodyS", color.ink)}>{task?.title ?? "Untitled task"}</Text>
                        {c ? <Text style={textStyle("caption", color.inkFaint)}>{c.code}</Text> : null}
                      </View>
                      <TextLink onPress={() => setSelectedIds((prev) => prev.filter((id) => id !== taskId))}>
                        <Text style={textStyle("caption", color.inkFaint)}>Remove</Text>
                      </TextLink>
                    </View>

                    {box.revealed ? (
                      <View style={styles.timeboxRow}>
                        <GlassSurface tier="sunken" style={styles.timeInputClip}>
                          <TextInput
                            value={box.time}
                            onChangeText={(text) => updateTimebox(taskId, { time: text })}
                            placeholder="HH:MM"
                            placeholderTextColor={color.inkFaint}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                            accessibilityLabel={`When for ${task?.title ?? "this task"}`}
                            style={[styles.timeInput, textStyle("caption", color.ink)]}
                          />
                        </GlassSurface>
                        <GlassSurface tier="sunken" style={styles.locationInputClip}>
                          <TextInput
                            value={box.location}
                            onChangeText={(text) => updateTimebox(taskId, { location: text })}
                            placeholder="Where? (optional)"
                            placeholderTextColor={color.inkFaint}
                            accessibilityLabel={`Where for ${task?.title ?? "this task"}`}
                            style={[styles.locationInput, textStyle("bodyS", color.ink)]}
                          />
                        </GlassSurface>
                        {box.time === "" && box.location === "" ? (
                          <TextLink onPress={() => updateTimebox(taskId, { revealed: false })}>
                            <Text style={textStyle("caption", color.inkFaint)}>Cancel</Text>
                          </TextLink>
                        ) : null}
                      </View>
                    ) : (
                      <TextLink onPress={() => updateTimebox(taskId, { revealed: true })} style={styles.addTimeButton}>
                        <Text style={textStyle("caption", color.inkFaint)}>+ Add time</Text>
                      </TextLink>
                    )}
                  </View>
                );
              })
            )}
            {selectedIds.length < 3 && remainingTasks.length > 0 ? (
              <View>
                <TextLink onPress={() => setShowTaskPicker((v) => !v)} style={styles.addTaskButton}>
                  <Text style={textStyle("bodyS", color.accent)}>+ Add a task</Text>
                </TextLink>
                {showTaskPicker
                  ? remainingTasks.map((t) => (
                      <TextLink
                        key={t.id}
                        onPress={() => {
                          setSelectedIds((prev) => (prev.length >= 3 ? prev : [...prev, t.id]));
                          setShowTaskPicker(false);
                        }}
                        style={styles.pickerRow}
                      >
                        <Text style={textStyle("bodyS", color.ink)}>{t.title}</Text>
                      </TextLink>
                    ))
                  : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {step === "completion" ? (
          <View style={styles.stepGap}>
            <Text style={textStyle("title", color.ink)}>How much of today will you actually finish?</Text>
            <View style={styles.percentRow}>
              {COMPLETION_STEPS.map((pct) => (
                <PercentCell
                  key={pct}
                  pct={pct}
                  selected={predictedCompletionPct === pct}
                  onPress={() => setPredictedCompletionPct(pct)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {step === "derailment" ? (
          <View style={styles.stepGap}>
            <ChipGroup label="Most likely to derail you" options={DERAILMENT_OPTIONS} value={derailment} onValueChange={setDerailment} />
          </View>
        ) : null}

        {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        {stepIndex > 0 ? (
          <Button variant="secondary" onPress={goBack}>
            Back
          </Button>
        ) : (
          <View />
        )}
        <Button onPress={goNext} loading={isPending}>
          {stepIndex === steps.length - 1 ? "Start the day" : "Next"}
        </Button>
      </View>
    </Panel>
  );
}

// Reuses the shared SegmentedControl rather than a local 1-10 cell grid -- this was a bare
// reimplementation with no press/focus feedback (SegmentedControl already has both).
function ScaleStep({ title, value, onChange }: { title: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepGap}>
      <Text style={textStyle("title", color.ink)}>{title}</Text>
      <SegmentedControl label="1–10" value={value} onValueChange={onChange} />
    </View>
  );
}

// Discrete, non-contiguous values (0/20/40/60/80/100) -- SegmentedControl assumes a
// contiguous 1..max range, so this can't reuse it, but it gets the same press/focus feedback.
function PercentCell({ pct, selected, onPress }: { pct: number; selected: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.percentCell,
        {
          borderColor: selected ? color.accent : color.border,
          backgroundColor: selected ? color.accent : color.surfaceSunken,
          opacity: pressed ? 0.85 : 1,
        },
        focused ? styles.focusRing : null,
      ]}
    >
      <Text style={textStyle("bodyS", selected ? "#FFFFFF" : color.ink)}>{pct}%</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 0,
  },
  progressHeader: {
    gap: space[2],
    marginBottom: space[5],
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: color.accent,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stepBody: {
    minHeight: 220,
    gap: space[3],
  },
  stepGap: {
    gap: space[3],
  },
  mitsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mitCard: {
    gap: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: space[3],
  },
  mitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  timeboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  timeInputClip: {
    width: 64,
    height: 32,
    borderRadius: radius.sm,
  },
  timeInput: {
    height: 32,
    paddingHorizontal: space[2],
    backgroundColor: "transparent",
  },
  locationInputClip: {
    flex: 1,
    height: 32,
    borderRadius: radius.sm,
  },
  locationInput: {
    height: 32,
    paddingHorizontal: space[2],
    backgroundColor: "transparent",
  },
  addTimeButton: {
    alignSelf: "flex-start",
    minHeight: 32,
    justifyContent: "center",
  },
  addTaskButton: {
    minHeight: 44,
    justifyContent: "center",
  },
  pickerRow: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  percentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  percentCell: {
    minWidth: 60,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[3],
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space[6],
  },
});
