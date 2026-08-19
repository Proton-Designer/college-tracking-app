import { color, space } from "@collegeos/design/native";
import { signOut } from "@collegeos/api";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../components/ui/Button";
import { textStyle } from "../design/typography";
import { useAuthSession } from "../lib/useAuthSession";
import { getMobileSupabaseClient } from "../lib/supabase/client";

// Placeholder authenticated home — proves route protection + session persistence for
// mobile L3, mirroring web's today/page.tsx exactly. The real Today screen (Day Trace,
// §6.1) is built once, deliberately, when Today ships.
export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuthSession();
  const [submitting, setSubmitting] = useState(false);

  async function handleSignOut() {
    setSubmitting(true);
    await signOut(getMobileSupabaseClient());
    setSubmitting(false);
    router.replace("/login");
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Text style={textStyle("label", color.inkFaint)}>Today</Text>
        <Text style={[textStyle("displayM", color.ink), styles.title]}>Signed in</Text>
        <Text testID="today-user-email" style={[textStyle("body", color.inkMuted), styles.email]}>
          {session?.user.email}
        </Text>
        <View style={styles.action}>
          <Button testID="sign-out" variant="secondary" loading={submitting} onPress={handleSignOut}>
            Sign out
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[6], gap: space[3] },
  title: {},
  email: {},
  action: { marginTop: space[3], alignSelf: "flex-start" },
});
