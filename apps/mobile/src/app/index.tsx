import { aurora, color, space } from "@collegeos/design/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DayReading } from "../components/marketing/DayReading";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { textStyle } from "../design/typography";
import { useReducedMotion } from "../lib/useReducedMotion";
import { useReducedTransparency } from "../lib/useReducedTransparency";

/**
 * The landing page's own bloom -- deliberately NOT `<Aurora band={...} />`. That component's
 * whole contract (DESIGN_LANGUAGE_V2 §6) is "derived from a real computed RiskBand, or nothing";
 * there is no signed-in user here for a band to be computed about, and inventing one just to make
 * this screen look alive is exactly what §6 forbids. Ratified by the Lead: this screen may show
 * atmosphere as pure design, via a fixed stop pair pulled straight from the `aurora` token object
 * -- never through `auroraForRisk`. Pair is `periwinkle` + `lilac` (matches web's landing page
 * choice exactly, so the two platforms don't disagree in the one place a new user forms a first
 * impression). Mirrors Aurora.tsx's own rendering mechanics (single gradient, one opacity
 * multiplier, bloom fading out well before mid-page) and the same reduced-motion/-transparency
 * guards, so it degrades the same way the real Aurora does.
 */
function LandingAurora() {
  const reducedMotion = useReducedMotion();
  const reducedTransparency = useReducedTransparency();
  if (reducedMotion || reducedTransparency) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.auroraContainer]}>
      <LinearGradient
        colors={[aurora.periwinkle, aurora.lilac, "transparent"]}
        locations={[0, 0.3, 0.6]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

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
    <View style={styles.flex}>
      <LandingAurora />
      <ScrollView
        style={[styles.scroll, { paddingTop: insets.top }]}
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

        <Panel>
          <DayReading />
        </Panel>

        <View style={styles.actions}>
          <Button testID="hero-signup" onPress={() => router.push("/signup")}>
            Create your account
          </Button>
          <Button testID="hero-login" variant="secondary" onPress={() => router.push("/login")}>
            Sign in
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.ground },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space[6],
    paddingTop: space[8],
    gap: space[7],
  },
  hero: { gap: space[4] },
  headline: { marginTop: space[3] },
  subhead: {},
  auroraContainer: { opacity: 0.35 },
  actions: { gap: space[3] },
});
