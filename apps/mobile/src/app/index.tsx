import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DayReading } from "../components/marketing/DayReading";
import { Button } from "../components/ui/Button";
import { textStyle } from "../design/typography";

/**
 * The mobile welcome screen — deliberately NOT a port of web's landing page
 * (apps/web/src/app/page.tsx). Web is a scrolling marketing argument across several
 * sections; a phone wants the same argument in one glance and two taps. Per
 * docs/SCREEN_SPEC.md: calm, inevitable, gets out of the way fast. The loop diagram, the
 * BME risk-pill example, and the nightly-report quote are cut — those earn their place on
 * a screen someone scrolls, not one they glance at before tapping in. The Day Trace demo
 * stays, though: it's the single best thing in the product (web leads with it above the
 * fold), and a screen of type plus two buttons was leaving ~230px and ~240px of void where
 * it belongs rather than actually being calmer for cutting it.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.flex, { paddingTop: insets.top }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[8] }]}
    >
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

      <View style={styles.demoPanel}>
        <DayReading />
      </View>

      <View style={styles.actions}>
        <Button testID="hero-signup" onPress={() => router.push("/signup")}>
          Create your account
        </Button>
        <Button testID="hero-login" variant="secondary" onPress={() => router.push("/login")}>
          Sign in
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.ground },
  content: {
    paddingHorizontal: space[6],
    paddingTop: space[8],
    gap: space[7],
  },
  hero: { gap: space[4] },
  headline: { marginTop: space[3] },
  subhead: {},
  demoPanel: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    padding: space[5],
  },
  actions: { gap: space[3] },
});
