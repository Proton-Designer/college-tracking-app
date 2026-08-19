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

export function TodayHeader({
  today,
  health,
  sleepBaselineHours,
}: {
  today: string;
  health: TodayHealth | null;
  sleepBaselineHours: number | null;
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

  return (
    <View style={styles.container}>
      <Text style={textStyle("displayM", color.ink)}>{dateLabel}</Text>
      {readoutParts.length > 0 ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>{readoutParts.join(" · ")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[1],
  },
});
