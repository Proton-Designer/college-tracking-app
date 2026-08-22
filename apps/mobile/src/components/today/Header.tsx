import type { TodayHealth } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

function formatSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDelta(hours: number, baselineHours: number): string {
  const diff = hours - baselineHours;
  const arrow = diff < 0 ? "↓" : diff > 0 ? "↑" : "→";
  return `${arrow}${Math.abs(diff).toFixed(1)}h vs baseline`;
}

/** §8 -- the date was never the point of Today, and burying the real answer ("what do I do
 *  today") under it read as if a timestamp were the headline. `headline` (the day's top
 *  outstanding MIT title, or "All N done" once nothing's outstanding, or a mode fallback like
 *  "Recovery day" -- a real value resolved by the caller from the same array MitList renders;
 *  this component invents nothing) leads at `displayL` when one exists; the date demotes to
 *  supporting context alongside `progressLine` ("2 of 3 priorities done") and health. A day
 *  with nothing to focus on yet (onboarding, a brand-new account) falls back to the date as
 *  the headline -- still real, just not competing with a MIT that doesn't exist. */
export function TodayHeader({
  today,
  health,
  sleepBaselineHours,
  headline,
  progressLine,
}: {
  today: string;
  health: TodayHealth | null;
  sleepBaselineHours: number | null;
  headline: string | null;
  progressLine: string | null;
}) {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${today}T00:00:00Z`));

  const readoutParts: string[] = [];
  if (health?.sleepHours != null) {
    readoutParts.push(
      sleepBaselineHours != null
        ? `Sleep ${formatSleep(health.sleepHours)} (${formatDelta(health.sleepHours, sleepBaselineHours)})`
        : `Sleep ${formatSleep(health.sleepHours)}`,
    );
  }
  if (health?.whoopRecoveryPct != null) {
    readoutParts.push(`Recovery ${Math.round(health.whoopRecoveryPct)}`);
  }

  const contextParts = headline
    ? [dateLabel, ...(progressLine ? [progressLine] : []), ...readoutParts]
    : readoutParts;

  return (
    <View style={styles.container}>
      {headline ? <Text style={textStyle("label", color.inkMuted)}>TODAY&apos;S FOCUS</Text> : null}
      <Text style={textStyle("displayL", color.ink)}>{headline ?? dateLabel}</Text>
      {contextParts.length > 0 ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>{contextParts.join(" · ")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[1],
  },
});
