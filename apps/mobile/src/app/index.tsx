import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../components/ui/Button";
import { textStyle } from "../design/typography";

/**
 * The mobile welcome screen — deliberately NOT a port of web's landing page
 * (apps/web/src/app/page.tsx). Web is a scrolling marketing argument across several
 * sections; a phone wants the same argument in one glance and two taps. Per
 * docs/SCREEN_SPEC.md: calm, inevitable, gets out of the way fast. The hero's core
 * claim survives ("the day you planned / the day you had") but the loop diagram, the
 * BME risk-pill example, and the nightly-report quote are cut — those earn their place
 * on a screen someone scrolls, not one they glance at before tapping in.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Text style={textStyle("title", color.ink)}>CollegeOS</Text>

        <View style={styles.hero}>
          <Text style={textStyle("label", color.inkFaint)}>A closed-loop system for college</Text>
          <Text testID="app-heading" style={[textStyle("displayL", color.ink), styles.headline]}>
            The day you planned.{"\n"}The day you had.
          </Text>
          <Text style={[textStyle("body", color.inkMuted), styles.subhead]}>
            CollegeOS measures the gap between the two, explains why it opened, and changes
            tomorrow&apos;s plan because of it. It doesn&apos;t cheer you on.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button testID="hero-signup" onPress={() => router.push("/signup")}>
            Create your account
          </Button>
          <Button testID="hero-login" variant="secondary" onPress={() => router.push("/login")}>
            Sign in
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.ground },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: space[6],
    paddingVertical: space[8],
  },
  hero: { gap: space[4] },
  headline: { marginTop: space[3] },
  subhead: {},
  actions: { gap: space[3] },
});
