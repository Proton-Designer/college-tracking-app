import type { WeeklyPlanBlockStatus, WeeklyPlanBlockView, WeeklyPlanView } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { startOfWeek } from "@collegeos/core";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, ChipGroup, EmptyState, Panel, RiskPill } from "../ui";
import { textStyle } from "../../design/typography";
import { daysRemainingLabel } from "../../lib/dates";
import { generateThisWeekPlan, updateWeeklyPlanBlockStatus } from "../../lib/calendarActions";

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirm" },
  { value: "skipped", label: "Skip" },
  { value: "completed", label: "Complete" },
];

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatBlockRange(startAt: string, endAt: string, timeZone: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(start);
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(d);
  const startStr = fmt(start);
  const endStr = fmt(end);
  const samePeriod = startStr.slice(-2) === endStr.slice(-2);
  return `${weekday} ${samePeriod ? startStr.slice(0, -3) : startStr}–${endStr}`;
}

function UnplacedDisclosure({ unplaced }: { unplaced: WeeklyPlanView["unplaced"] }) {
  if (unplaced.length === 0) return null;
  return (
    <Panel tone="sunken" style={{ gap: space[2] }}>
      <Text style={textStyle("label", color.riskHigh)}>Didn&apos;t fit this week ({unplaced.length})</Text>
      <View style={{ gap: space[1] }}>
        {unplaced.map((u) => (
          <Text key={u.id} style={textStyle("bodyS", color.inkMuted)}>
            {u.title ?? "Untitled"}
            {u.courseCode ? ` · ${u.courseCode}` : ""} —{" "}
            {u.reason === "due_before_window" ? "due before this week starts" : `${formatMinutes(u.minutesShortfall)} short of capacity`}
          </Text>
        ))}
      </View>
    </Panel>
  );
}

function BlockRow({
  block,
  timezone,
  userId,
}: {
  block: WeeklyPlanBlockView;
  timezone: string;
  userId: string;
}) {
  const [status, setStatus] = useState<WeeklyPlanBlockStatus>(block.status);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const next = value as WeeklyPlanBlockStatus;
    const prev = status;
    setStatus(next);
    setFailed(false);
    startTransition(async () => {
      const result = await updateWeeklyPlanBlockStatus(userId, block.id, next);
      if (!result.ok) {
        setStatus(prev);
        setFailed(true);
      }
    });
  }

  return (
    <View style={styles.blockRow}>
      <View style={styles.blockText}>
        <Text style={textStyle("bodyS", color.ink)}>{formatBlockRange(block.startAt, block.endAt, timezone)}</Text>
        <Text style={textStyle("caption", color.inkFaint)}>
          {block.title ?? "Untitled"}
          {block.courseCode ? ` · ${block.courseCode}` : ""} · {formatMinutes(block.minutes)}
        </Text>
      </View>
      <ChipGroup
        label="Status"
        options={STATUS_OPTIONS}
        value={status === "suggested" ? null : status}
        onValueChange={handleChange}
        disabled={isPending}
      />
      {failed ? <Text style={textStyle("caption", color.riskCritical)}>Couldn&apos;t save — try again.</Text> : null}
    </View>
  );
}

export function ThisWeekView({
  userId,
  today,
  timezone,
  plan,
  onGenerated,
}: {
  userId: string;
  today: string;
  timezone: string;
  plan: WeeklyPlanView | null;
  onGenerated: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateThisWeekPlan(userId, startOfWeek(today), today);
      if (!result.ok) {
        setError(result.error ?? "Couldn't generate a plan — try again.");
        return;
      }
      onGenerated();
    });
  }

  if (!plan) {
    return (
      <EmptyState
        title="No plan for this week yet"
        description="Generate a plan from your calendar availability, deadlines, and course risk -- deep-work blocks suggested and ranked, nothing hidden."
        actionLabel={isPending ? "Generating…" : "Generate this week's plan"}
        onAction={handleGenerate}
      />
    );
  }

  return (
    <View style={{ gap: space[7] }}>
      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}

      <View style={styles.loadRow}>
        <Badge tone="accent">Academic load: {plan.academicLoad.toUpperCase()}</Badge>
        <Text style={textStyle("caption", color.inkFaint)}>
          {formatMinutes(plan.totalNeededMinutes)} needed of {formatMinutes(plan.totalCapacityMinutes)} available
        </Text>
      </View>

      {plan.highestRisk.length > 0 ? (
        <View style={{ gap: space[3] }}>
          <Text style={textStyle("label", color.inkMuted)}>Highest risk</Text>
          {plan.highestRisk.map((r, i) => (
            <View key={r.deliverableId} style={styles.riskItem}>
              <Text style={textStyle("bodyS", color.inkFaint)}>{i + 1}.</Text>
              <View style={styles.riskItemText}>
                <Text style={textStyle("bodyS", color.ink)}>
                  <Text style={textStyle("bodyS", color.inkFaint)}>{r.courseCode} </Text>
                  {r.title}
                </Text>
                <Text style={textStyle("caption", color.inkFaint)}>{daysRemainingLabel(today, r.dueDate)}</Text>
              </View>
              <RiskPill band={r.riskBand} label={r.riskBand.toUpperCase()} />
            </View>
          ))}
        </View>
      ) : null}

      {plan.courseAllocations.length > 0 ? (
        <View style={{ gap: space[3] }}>
          <Text style={textStyle("label", color.inkMuted)}>Recommended deep-work allocation</Text>
          <View style={styles.allocationRow}>
            {plan.courseAllocations.map((a) => (
              <Text key={a.courseId} style={textStyle("bodyS", color.ink)}>
                {a.courseCode} <Text style={textStyle("bodyS", color.inkFaint)}>{formatMinutes(a.minutesAllocated)}</Text>
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: space[3] }}>
        <Text style={textStyle("label", color.inkMuted)}>Suggested focus blocks</Text>
        {plan.blocks.length === 0 ? (
          <Text style={textStyle("bodyS", color.inkFaint)}>Nothing placed this week.</Text>
        ) : (
          <View style={styles.list}>
            {plan.blocks.map((block) => (
              <BlockRow key={block.id} block={block} timezone={timezone} userId={userId} />
            ))}
          </View>
        )}
      </View>

      <UnplacedDisclosure unplaced={plan.unplaced} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    flexWrap: "wrap",
  },
  riskItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  riskItemText: {
    flex: 1,
    gap: 2,
  },
  allocationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[5],
  },
  list: {
    gap: space[5],
  },
  blockRow: {
    gap: space[2],
    paddingBottom: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  blockText: {
    gap: 2,
  },
});
