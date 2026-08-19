import { resolveAppEnvironment, type AppEnvironment } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../design/typography";

function getEnvironment(): AppEnvironment {
  return resolveAppEnvironment({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    debugLabel: "mobile",
  });
}

export default function Index() {
  const env = getEnvironment();

  return (
    <View style={styles.container}>
      <Text testID="app-heading" style={styles.title}>
        CollegeOS
      </Text>
      <Text style={styles.subtitle}>L0 foundation — app shell skeleton. See /design for the full system.</Text>
      <View style={styles.debugBlock}>
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>source</Text>
          <Text testID="env-source" style={styles.debugValue}>
            {env.debugLabel}
          </Text>
        </View>
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>mode</Text>
          <Text testID="env-mode" style={styles.debugValue}>
            {env.mode}
          </Text>
        </View>
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>supabaseUrl</Text>
          <Text testID="env-supabase-url" style={styles.debugValue}>
            {env.supabaseUrl}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space[7],
    gap: space[3],
    backgroundColor: color.ground,
  },
  title: textStyle("displayM", color.ink),
  subtitle: textStyle("body", color.inkMuted),
  debugBlock: {
    marginTop: space[5],
    gap: space[2],
  },
  debugRow: {
    flexDirection: "row",
    gap: space[5],
  },
  debugLabel: { ...textStyle("label", color.inkFaint), width: 100 },
  debugValue: textStyle("caption", color.ink),
});
