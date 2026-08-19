import { resolveAppEnvironment, type AppEnvironment } from "@collegeos/api";
import { StyleSheet, Text, View } from "react-native";

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
      <Text style={styles.subtitle}>L0 foundation — app shell skeleton. Design system pending.</Text>
      <View style={styles.debugBlock}>
        <Text testID="env-source" style={styles.debugRow}>
          source: {env.debugLabel}
        </Text>
        <Text testID="env-mode" style={styles.debugRow}>
          mode: {env.mode}
        </Text>
        <Text testID="env-supabase-url" style={styles.debugRow}>
          supabaseUrl: {env.supabaseUrl}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 15,
    color: "#525252",
  },
  debugBlock: {
    marginTop: 16,
    gap: 4,
  },
  debugRow: {
    fontFamily: "monospace",
    fontSize: 13,
    color: "#404040",
  },
});
