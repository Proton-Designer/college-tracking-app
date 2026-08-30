import type { WorkOverview, WorkTargetStatus, WorkTargetWithTasks } from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { color, domainColor, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, DatePicker, EmptyState, Input, NavLink, Panel, Select } from "../components/ui";
import { textStyle } from "../design/typography";
import { tintWithAlpha } from "../lib/colorAlpha";
import { formatShortDate, formatTimeOfDay } from "../lib/dates";
import {
  addShift,
  addTarget,
  addTargetTask,
  loadWork,
  removeShift,
  setTargetStatus,
  setTaskStatus,
} from "../lib/workActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * Work, mobile. Mirrors apps/web/src/components/work/WorkClient.tsx section for section; both
 * render `loadWorkOverview`.
 *
 * **Two shapes of shift, one week.** Migration 53 stores a shift as recurring-by-weekday XOR
 * dated, because the read is always "what am I working this week". `loadWorkOverview` resolves
 * both onto the same Sun–Sat days; this screen only labels which kind each one is, because
 * "every Tuesday" and "this Tuesday" are different commitments to the person reading them.
 *
 * **D40.** Nothing is seeded. An empty lane inside a real pipeline says "nothing here", never a
 * zero; a day with no shifts says "nothing scheduled", which is a different fact from never
 * having entered a schedule at all — and this screen distinguishes the two.
 */

const LANES: { status: "active" | "blocked" | "done"; title: string; blurb: string }[] = [
  { status: "active", title: "Active", blurb: "Moving." },
  { status: "blocked", title: "Blocked", blurb: "Waiting on something outside you." },
  { status: "done", title: "Done", blurb: "Finished." },
];

const STATUS_OPTIONS: { value: WorkTargetStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "dropped", label: "Dropped" },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** ISO weekdays, 1 = Monday .. 7 = Sunday — the schema's single weekday convention. */
const ISO_WEEKDAY_OPTIONS = [
  { value: "1", label: "Every Monday" },
  { value: "2", label: "Every Tuesday" },
  { value: "3", label: "Every Wednesday" },
  { value: "4", label: "Every Thursday" },
  { value: "5", label: "Every Friday" },
  { value: "6", label: "Every Saturday" },
  { value: "7", label: "Every Sunday" },
];

type Run = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  fallback: string,
  onDone?: () => void,
) => Promise<void>;

function Chip({
  label,
  selected,
  disabled,
  onPress,
  asRadio,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  asRadio?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={asRadio ? "radio" : "button"}
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { borderColor: domainColor.work, backgroundColor: tintWithAlpha(domainColor.work, 0.2) }
          : { borderColor: color.border, backgroundColor: color.surface },
        { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={textStyle("bodyS", selected ? color.ink : color.inkMuted)}>{label}</Text>
    </Pressable>
  );
}

function WorkPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title}>
      <View style={styles.panelGap}>{children}</View>
    </Panel>
  );
}

export default function WorkScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [overview, setOverview] = useState<WorkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadWork(userId);
    if (result.ok) setOverview(result.data);
    else setError(result.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback<Run>(
    async (action, fallback, onDone) => {
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

  const active = overview?.pipeline.active.length ?? 0;
  const blocked = overview?.pipeline.blocked.length ?? 0;

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

        <Text style={textStyle("displayM", color.ink)}>Work</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          {overview == null
            ? "Loading…"
            : active + blocked === 0
              ? "Nothing in the pipeline"
              : `${active} active · ${blocked} blocked`}
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
            <PipelineSection overview={overview} userId={userId} busy={busy} run={run} />
            <ScheduleSection overview={overview} userId={userId} busy={busy} run={run} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

interface SectionProps {
  overview: WorkOverview;
  userId: string;
  busy: boolean;
  run: Run;
}

function PipelineSection({ overview, userId, busy, run }: SectionProps) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState<string | null>(null);

  const total = LANES.reduce((acc, lane) => acc + overview.pipeline[lane.status].length, 0);

  const addForm = (
    <View style={styles.panelGap}>
      <Input label="New target" value={title} onChangeText={setTitle} placeholder="Ship the intake form" />
      <DatePicker label="Deadline (optional)" value={deadline} onValueChange={setDeadline} />
      <Button
        variant="secondary"
        disabled={busy}
        onPress={() =>
          void run(
            () => addTarget(userId, { title, deadline: (deadline as LocalDate | null) ?? null }),
            "Could not add that target.",
            () => {
              setTitle("");
              setDeadline(null);
            },
          )
        }
      >
        Add target
      </Button>
    </View>
  );

  if (total === 0 && overview.droppedCount === 0) {
    return (
      <EmptyState
        title="Nothing in the pipeline"
        description="A target is one outcome you are working toward at your job — not a task, an outcome. Tasks go underneath it, and anything waiting on someone else moves to Blocked with a note saying who. Nothing is seeded here; the pipeline starts when you name the first one."
        action={addForm}
      />
    );
  }

  return (
    <WorkPanel title="Pipeline">
      {LANES.map((lane) => (
        <View key={lane.status} style={styles.panelGap}>
          <Text style={textStyle("label", color.inkMuted)}>
            {lane.title} · {overview.pipeline[lane.status].length}
          </Text>
          {overview.pipeline[lane.status].length === 0 ? (
            <Text style={textStyle("bodyS", color.inkFaint)}>Nothing here. {lane.blurb}</Text>
          ) : (
            overview.pipeline[lane.status].map((entry) => (
              <TargetRow key={entry.target.id} entry={entry} userId={userId} busy={busy} run={run} />
            ))
          )}
        </View>
      ))}

      {overview.droppedCount > 0 ? (
        <Text style={textStyle("caption", color.inkFaint)}>
          Plus {overview.droppedCount} dropped. They keep their record without taking up a lane.
        </Text>
      ) : null}

      <View style={styles.block}>{addForm}</View>
    </WorkPanel>
  );
}

function TargetRow({
  entry,
  userId,
  busy,
  run,
}: {
  entry: WorkTargetWithTasks;
  userId: string;
  busy: boolean;
  run: Run;
}) {
  const [taskTitle, setTaskTitle] = useState("");
  const [reasonDrafts, setReasonDrafts] = useState<Record<number, string>>({});
  const { target, tasks } = entry;

  return (
    <View style={styles.block}>
      <View style={styles.rowBetween}>
        <Text style={textStyle("bodyL", color.ink)}>{target.title}</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          {target.deadline == null ? "No deadline" : formatShortDate(target.deadline as LocalDate)}
        </Text>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={`${target.title} status`} style={styles.chipRow}>
        {STATUS_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            asRadio
            label={option.label}
            selected={target.status === option.value}
            disabled={busy}
            onPress={() =>
              void run(() => setTargetStatus(userId, target.id, option.value), "Could not move that target.")
            }
          />
        ))}
      </View>

      {tasks.length === 0 ? (
        <Text style={textStyle("bodyS", color.inkFaint)}>No tasks under this target yet.</Text>
      ) : (
        tasks.map((task) => (
          <View key={task.id} style={styles.panelGap}>
            <Text style={textStyle("bodyS", task.status === "done" ? color.inkFaint : color.ink)}>{task.title}</Text>
            {task.status === "blocked" ? (
              <Text style={textStyle("caption", color.inkMuted)}>
                {task.blocked_reason == null || task.blocked_reason.trim() === ""
                  ? "Blocked — no reason written down yet."
                  : `Waiting on: ${task.blocked_reason}`}
              </Text>
            ) : null}
            <View accessibilityRole="radiogroup" accessibilityLabel={`${task.title} status`} style={styles.chipRow}>
              {STATUS_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  asRadio
                  label={option.label}
                  selected={task.status === option.value}
                  disabled={busy}
                  onPress={() =>
                    void run(
                      () =>
                        setTaskStatus(userId, task.id, option.value, reasonDrafts[task.id] ?? task.blocked_reason),
                      "Could not move that task.",
                    )
                  }
                />
              ))}
            </View>
            {task.status === "blocked" ? (
              <>
                <Input
                  label="Waiting on"
                  value={reasonDrafts[task.id] ?? task.blocked_reason ?? ""}
                  onChangeText={(value) => setReasonDrafts((current) => ({ ...current, [task.id]: value }))}
                  placeholder="A reply from payroll"
                />
                <Button
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    void run(
                      () => setTaskStatus(userId, task.id, "blocked", reasonDrafts[task.id] ?? task.blocked_reason),
                      "Could not save that.",
                    )
                  }
                >
                  Save reason
                </Button>
              </>
            ) : null}
          </View>
        ))
      )}

      <Input label="Add a task" value={taskTitle} onChangeText={setTaskTitle} placeholder="Draft the copy" />
      <Button
        variant="secondary"
        disabled={busy}
        onPress={() =>
          void run(
            () => addTargetTask(userId, { targetId: target.id, title: taskTitle, deadline: null }),
            "Could not add that task.",
            () => setTaskTitle(""),
          )
        }
      >
        Add
      </Button>
    </View>
  );
}

function ScheduleSection({ overview, userId, busy, run }: SectionProps) {
  const [mode, setMode] = useState<"recurring" | "one_off">("recurring");
  const [weekday, setWeekday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [label, setLabel] = useState("");

  const addForm = (
    <View style={styles.panelGap}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Shift kind" style={styles.chipRow}>
        <Chip asRadio label="Repeats weekly" selected={mode === "recurring"} disabled={busy} onPress={() => setMode("recurring")} />
        <Chip asRadio label="One-off" selected={mode === "one_off"} disabled={busy} onPress={() => setMode("one_off")} />
      </View>
      {mode === "recurring" ? (
        <Select label="Weekday" value={weekday} onValueChange={setWeekday} placeholder="Pick one" options={ISO_WEEKDAY_OPTIONS} />
      ) : (
        <DatePicker label="Date" value={date} onValueChange={setDate} />
      )}
      <Input label="Starts" value={start} onChangeText={setStart} placeholder="09:00" />
      <Input label="Ends" value={end} onChangeText={setEnd} placeholder="17:00" />
      <Input label="Label (optional)" value={label} onChangeText={setLabel} placeholder="Front desk" />
      <Text style={textStyle("caption", color.inkFaint)}>
        Times go in as HH:MM on a 24-hour clock. An end before a start is an overnight shift, not a mistake.
      </Text>
      <Button
        variant="secondary"
        disabled={busy}
        onPress={() =>
          void run(
            () =>
              addShift(userId, {
                weekday: mode === "recurring" && weekday != null ? Number(weekday) : null,
                localDate: mode === "one_off" ? ((date as LocalDate | null) ?? null) : null,
                startTime: start,
                endTime: end,
                label: label.trim() === "" ? null : label.trim(),
              }),
            "Could not add that shift.",
            () => setLabel(""),
          )
        }
      >
        Add shift
      </Button>
    </View>
  );

  if (!overview.hasAnyShift) {
    return (
      <EmptyState
        title="No schedule entered"
        description="Shifts either repeat on a weekday or land on one date. Add the ones that repeat first — they fill in every week from then on, and a one-off can always be added on top."
        action={addForm}
      />
    );
  }

  return (
    <WorkPanel title="This week">
      <Text style={textStyle("bodyS", color.inkMuted)}>
        {formatShortDate(overview.weekStart)} – {formatShortDate(overview.weekEnd)}
      </Text>
      {overview.week.map((day, index) => (
        <View key={day.date} style={styles.dayRow}>
          <Text style={textStyle("label", day.isToday ? domainColor.work : color.inkFaint)}>
            {WEEKDAY_LABELS[index]} {formatShortDate(day.date)}
          </Text>
          {day.shifts.length === 0 ? (
            <Text style={textStyle("bodyS", color.inkFaint)}>Nothing scheduled</Text>
          ) : (
            day.shifts.map(({ shift, recurring }) => (
              <View key={shift.id} style={styles.setRow}>
                <Text style={textStyle("bodyS", color.ink)}>
                  {formatTimeOfDay(shift.start_time)} – {formatTimeOfDay(shift.end_time)}
                </Text>
                {shift.label ? <Text style={textStyle("bodyS", color.inkMuted)}>{shift.label}</Text> : null}
                <Text style={textStyle("caption", color.inkFaint)}>{recurring ? "weekly" : "one-off"}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove shift"
                  disabled={busy}
                  hitSlop={8}
                  onPress={() => void run(() => removeShift(userId, shift.id), "Could not remove that shift.")}
                >
                  <Text style={textStyle("caption", color.inkFaint)}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      ))}
      <View style={styles.block}>{addForm}</View>
    </WorkPanel>
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
  dayRow: {
    gap: space[1],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
});
