import type { AgentReport } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

function formatDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00Z`),
  );
}

/** SCREEN_SPEC §6 — "history plus the nightly report": a date list to navigate prior
 *  reports, alongside whichever one is currently open. Ported from web's ReportHistoryList. */
export function ReportHistoryList({ history, currentDate }: { history: AgentReport[]; currentDate: string }) {
  const router = useRouter();

  if (history.length === 0) {
    return <Text style={textStyle("caption", color.inkFaint)}>No reports yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {history.map((report) => {
        const active = report.local_date === currentDate;
        return (
          <Pressable
            key={report.id}
            onPress={() => router.replace(`/review/${report.local_date}`)}
            style={({ pressed }) => [styles.row, active ? styles.rowActive : null, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={4}
          >
            <Text style={textStyle("caption", active ? color.ink : color.inkFaint)}>{formatDate(report.local_date)}</Text>
            {report.model === "deterministic" ? null : <Text style={textStyle("caption", color.accent)}> ·</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 2,
  },
  row: {
    flexDirection: "row",
    borderRadius: 4,
    paddingHorizontal: space[2],
    paddingVertical: space[2],
  },
  rowActive: {
    backgroundColor: color.accentWash,
  },
});
