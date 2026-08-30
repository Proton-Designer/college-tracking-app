import { BUSINESS_TASK_CATEGORY, type BusinessLens } from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { color, domainColor, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, EmptyState, Input, Metric, NavLink, Panel, Select, Textarea } from "../components/ui";
import { textStyle } from "../design/typography";
import { formatShortDate } from "../lib/dates";
import {
  loadBusiness,
  setBusinessWeeklyGoal,
  setTaskCompleted,
  setWeeklyGoalDone,
} from "../lib/businessActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * Business, mobile. Mirrors apps/web/src/components/business/BusinessClient.tsx.
 *
 * **A lens over four things it does not own** (directive rule 3.4): today's MITs and the open
 * task list are `tasks`, the week's focus is `weekly_goals`, the direction it steps down from
 * is a War Map milestone, and the Hours are `task_sessions` rows tagged `business`.
 *
 * **D37 is the ruling this screen exists to respect.** The MIT system IS the kill list, and it
 * is DB-enforced (`tasks.mit_rank` 1–3, partial unique per day). So the top panel *reads*
 * `mit_rank`; there is no second "today's three" here and there must not be one.
 *
 * **Membership is stated out loud.** A task is in this lens when its category is "business" —
 * said in the empty state rather than left invisible, because a lens whose membership is a
 * secret looks broken rather than empty (D40).
 */

type Run = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  fallback: string,
  onDone?: () => void,
) => Promise<void>;

/** The "no link" choice in the War Map picker. */
const NO_GOAL = "none";

function BusinessPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title}>
      <View style={styles.panelGap}>{children}</View>
    </Panel>
  );
}

export default function BusinessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [lens, setLens] = useState<BusinessLens | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadBusiness(userId);
    if (result.ok) setLens(result.data);
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

        <Text style={textStyle("displayM", color.ink)}>Business</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          {lens == null ? "Loading…" : (lens.weeklyGoal?.headline ?? "No focus set this week")}
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading || lens == null || userId == null ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          <>
            <BusinessPanel title="Today's MITs">
              {lens.mits.length === 0 ? (
                <>
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    {lens.mitsTodayTotal === 0
                      ? "No MITs are set for today yet. They are chosen in the morning check-in, three at most, ranked."
                      : `Today's ${lens.mitsTodayTotal} ${lens.mitsTodayTotal === 1 ? "MIT is" : "MITs are"} in other domains. That is a real answer, not a gap.`}
                  </Text>
                  <Text style={textStyle("caption", color.inkFaint)}>
                    This panel reads your day&apos;s MITs — the same three the morning check-in ranks. Business does
                    not keep a separate list of three.
                  </Text>
                  <Button variant="secondary" onPress={() => router.push("/today")}>
                    Go to Today
                  </Button>
                </>
              ) : (
                lens.mits.map((task) => (
                  <View key={task.id} style={styles.rowBetween}>
                    <View style={styles.rowText}>
                      <Text style={textStyle("bodyS", domainColor.business)}>#{task.mit_rank}</Text>
                      <Text style={textStyle("body", task.status === "completed" ? color.inkFaint : color.ink)}>
                        {task.title}
                      </Text>
                    </View>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onPress={() =>
                        void run(
                          () => setTaskCompleted(task.id, task.status !== "completed"),
                          "Could not update that task.",
                        )
                      }
                    >
                      {task.status === "completed" ? "Reopen" : "Done"}
                    </Button>
                  </View>
                ))
              )}
            </BusinessPanel>

            <WeeklyGoalSection lens={lens} userId={userId} busy={busy} run={run} />

            <BusinessPanel title="Hours today">
              <View style={styles.metricRow}>
                <Metric label="Hours" value={String(lens.hoursToday.hours)} />
                <Metric
                  label="Logged"
                  value={lens.hoursToday.minutes == null ? "—" : String(lens.hoursToday.minutes)}
                  {...(lens.hoursToday.minutes == null ? {} : { unit: "min" })}
                />
              </View>
              <Text style={textStyle("bodyS", color.inkMuted)}>
                {lens.hoursToday.hours === 0
                  ? "No business Hour has been completed today. An Hour starts with a one-line deliverable, and only deep work counts toward this number."
                  : "Completed sessions tagged business. Learn and anti-worry sessions are real sessions and are counted separately — they are not Hours."}
              </Text>
              {lens.hoursToday.minutes == null && lens.hoursToday.hours > 0 ? (
                <Text style={textStyle("caption", color.inkFaint)}>
                  None of them recorded a duration, so there are no minutes to report — an em-dash rather than a zero.
                </Text>
              ) : null}
              {lens.hoursToday.otherSessions > 0 ? (
                <Text style={textStyle("caption", color.inkFaint)}>
                  Plus {lens.hoursToday.otherSessions} shorter business{" "}
                  {lens.hoursToday.otherSessions === 1 ? "session" : "sessions"} that do not count as Hours.
                </Text>
              ) : null}
            </BusinessPanel>

            {lens.openTasks.length === 0 ? (
              <EmptyState
                title="Nothing tagged business yet"
                description={`A task joins this lens when its category is "${BUSINESS_TASK_CATEGORY}". Tag one on Today or in Capture and it appears here — Business does not hold tasks of its own, it just looks at yours through one filter.`}
                actionLabel="Go to Today"
                onAction={() => router.push("/today")}
              />
            ) : (
              <BusinessPanel title="Open work">
                {lens.openTasks.map((task) => (
                  <View key={task.id} style={styles.rowBetween}>
                    <View style={styles.rowText}>
                      <Text style={textStyle("body", color.ink)}>{task.title}</Text>
                      <Text style={textStyle("caption", color.inkMuted)}>
                        {formatShortDate(task.planned_date as LocalDate)}
                        {task.mit_rank != null ? ` · MIT #${task.mit_rank}` : ""}
                      </Text>
                    </View>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onPress={() => void run(() => setTaskCompleted(task.id, true), "Could not update that task.")}
                    >
                      Done
                    </Button>
                  </View>
                ))}
              </BusinessPanel>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * The week's focus and its optional link up to a War Map milestone.
 *
 * D37 keeps both: `goals`/`milestones` is the store of direction, `weekly_goals` is the
 * cadence. The link is nullable on purpose — some weeks are honestly about something
 * unplanned, and forcing a lineage would make this unusable exactly on those weeks.
 */
function WeeklyGoalSection({
  lens,
  userId,
  busy,
  run,
}: {
  lens: BusinessLens;
  userId: string;
  busy: boolean;
  run: Run;
}) {
  const [headline, setHeadline] = useState(lens.weeklyGoal?.headline ?? "");
  const [milestones, setMilestones] = useState(lens.weeklyGoal?.milestones ?? "");
  // A sentinel rather than null: "not linked" is a real, choosable answer here (D37 makes the
  // link deliberately optional), and a picker with no way back to it would trap the first
  // choice forever.
  const [goalId, setGoalId] = useState<string>(
    lens.weeklyGoal?.goal_id == null ? NO_GOAL : String(lens.weeklyGoal.goal_id),
  );

  const form = (
    <View style={styles.panelGap}>
      <Input
        label="This week, business is about"
        value={headline}
        onChangeText={setHeadline}
        placeholder="Get the first three paying customers"
      />
      <Textarea label="Milestones (one per line)" value={milestones} onChangeText={setMilestones} rows={3} />
      {lens.warMapGoals.length > 0 ? (
        <Select
          label="Steps down from"
          value={goalId}
          onValueChange={setGoalId}
          options={[
            { value: NO_GOAL, label: "Not linked to a goal" },
            ...lens.warMapGoals.map((g) => ({ value: String(g.id), label: g.title })),
          ]}
        />
      ) : (
        <Text style={textStyle("caption", color.inkFaint)}>
          No War Map goals yet. A week can stand on its own — the link is optional, and some weeks are honestly about
          something unplanned.
        </Text>
      )}
      <Button
        disabled={busy}
        onPress={() =>
          void run(
            () =>
              setBusinessWeeklyGoal(userId, {
                headline,
                milestones: milestones.trim() === "" ? null : milestones,
                goalId: goalId === NO_GOAL ? null : Number(goalId),
              }),
            "Could not save this week's focus.",
          )
        }
      >
        {lens.weeklyGoal == null ? "Set the week" : "Update the week"}
      </Button>
    </View>
  );

  if (lens.weeklyGoal == null) {
    return (
      <EmptyState
        title="No focus set for this week"
        description="One sentence for what business is about this week. It is the cadence layer — the War Map holds the direction, and this is the week that steps toward it. Weeks without one are not failures; they are just unwritten."
        action={form}
      />
    );
  }

  const weeklyGoal = lens.weeklyGoal;
  const done = weeklyGoal.completed_at != null;
  return (
    <BusinessPanel title="This week">
      <View style={styles.rowBetween}>
        <Text style={[textStyle("bodyL", done ? color.inkFaint : color.ink), styles.rowText]}>
          {weeklyGoal.headline}
        </Text>
        <Button
          variant="secondary"
          disabled={busy}
          onPress={() => void run(() => setWeeklyGoalDone(userId, weeklyGoal.id, !done), "Could not update this week.")}
        >
          {done ? "Reopen" : "Mark done"}
        </Button>
      </View>
      <Text style={textStyle("caption", color.inkFaint)}>Week of {formatShortDate(lens.weekStart)}</Text>

      {weeklyGoal.milestones
        ? weeklyGoal.milestones
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line, index) => (
              <Text key={index} style={textStyle("bodyS", color.inkMuted)}>
                {line}
              </Text>
            ))
        : null}

      {lens.linkedGoal ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Steps down from {lens.linkedGoal.title}
          {lens.linkedMilestone ? ` · this month: ${lens.linkedMilestone.title}` : " · no milestone set for this month"}
        </Text>
      ) : (
        <Text style={textStyle("caption", color.inkFaint)}>
          Not linked to a War Map goal. That is allowed — a week can be about something unplanned.
        </Text>
      )}

      <View style={styles.block}>{form}</View>
    </BusinessPanel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  panelGap: { gap: space[3] },
  metricRow: { flexDirection: "row", gap: space[8], flexWrap: "wrap" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    flexWrap: "wrap",
  },
  rowText: { flex: 1, gap: 2 },
  block: {
    gap: space[2],
    paddingTop: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
});
