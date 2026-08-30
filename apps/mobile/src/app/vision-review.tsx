import type { MomOutcome, VisionChainView } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, ChipGroup, DatePicker, Input, NavLink, Panel, Textarea } from "../components/ui";
import { textStyle } from "../design/typography";
import { useAuthSession } from "../lib/useAuthSession";
import { loadVision, saveMomReviewAction } from "../lib/visionActions";

/**
 * The 90-day review ritual, mobile (D48). Mirrors apps/web/src/components/vision/MomReviewClient.tsx
 * word for word.
 *
 * **The route is `/vision-review`, not `/vision/review`.** Expo Router builds routes from files,
 * and `app/vision.tsx` already owns the `vision` segment; a sibling `vision/` directory beside it
 * is the kind of ambiguity that resolves differently between Metro versions. Web nests it, mobile
 * hyphenates it, and both are reached the same way — from the chain and from Review, on the days
 * it is due.
 *
 * **`changed` is offered beside `hit`, not below `missed`** — same row, same weight, same wording.
 * A beachhead that turned out to be the wrong beachhead is information, and a form that filed it
 * as a failure would teach people to stop noticing.
 */

const OUTCOMES: { value: MomOutcome; label: string; blurb: string }[] = [
  { value: "hit", label: "Hit", blurb: "The outcome happened." },
  { value: "partial", label: "Partial", blurb: "Some of it happened." },
  { value: "missed", label: "Missed", blurb: "It did not happen." },
  {
    value: "changed",
    label: "Changed",
    blurb: "This stopped being the right ninety days. That is information, not a miss.",
  },
];

export default function MomReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [view, setView] = useState<VisionChainView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [outcome, setOutcome] = useState<MomOutcome | null>(null);
  const [whatHappened, setWhatHappened] = useState("");
  const [settingNext, setSettingNext] = useState(false);
  const [nextTitle, setNextTitle] = useState("");
  const [nextTarget, setNextTarget] = useState("");
  const [nextStarts, setNextStarts] = useState<string | null>(null);
  const [nextEnds, setNextEnds] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadVision(userId);
    if (result.ok) {
      setView(result.data);
      setOutcome(result.data.activeMomReview?.outcome ?? null);
      setWhatHappened(result.data.activeMomReview?.what_happened ?? "");
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = useCallback(async () => {
    const mom = view?.mom;
    if (userId == null || mom == null) return;
    if (outcome == null) {
      setError("Pick how this M.O.M. actually went before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await saveMomReviewAction(userId, {
      momId: mom.id,
      outcome,
      ...(whatHappened.trim().length > 0 ? { whatHappened } : {}),
      next:
        settingNext && nextTitle.trim().length > 0
          ? {
              title: nextTitle,
              ...(nextTarget.trim().length > 0 ? { target: nextTarget } : {}),
              startsOn: nextStarts,
              endsOn: nextEnds,
            }
          : null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save the review.");
      return;
    }
    router.replace("/vision");
  }, [userId, view, outcome, whatHappened, settingNext, nextTitle, nextTarget, nextStarts, nextEnds, router]);

  const mom = view?.mom ?? null;

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] },
        ]}
      >
        <NavLink label="Vision" onPress={() => router.back()} />

        <Text style={textStyle("displayM", color.ink)}>The 90-day review</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Score the M.O.M. on its own terms, write what happened, and set the next one if you are
          ready to.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading ? <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text> : null}

        {!loading && mom == null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.inkMuted)}>
              There is no M.O.M. open right now, so there is nothing to close. Set one on the chain
              and this ritual comes back when its ninety days are up.
            </Text>
          </Panel>
        ) : null}

        {!loading && mom != null && view != null ? (
          <>
            {view.activeMomReview != null ? (
              <Panel>
                <View style={styles.gap}>
                  <Text style={textStyle("label", color.inkMuted)}>
                    ALREADY REVIEWED ON {view.activeMomReview.local_date}
                  </Text>
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    Saving again replaces what is written below. Nothing is lost by leaving this
                    screen.
                  </Text>
                </View>
              </Panel>
            ) : null}

            <Panel>
              <View style={styles.gap}>
                <Text style={textStyle("label", color.inkMuted)}>THE M.O.M. CLOSING</Text>
                <Text style={textStyle("bodyL", color.ink)}>{mom.title}</Text>
                {mom.target != null ? (
                  <Text style={textStyle("bodyS", color.inkMuted)}>{mom.target}</Text>
                ) : null}
                {mom.ends_on != null ? (
                  <Text style={textStyle("label", color.inkMuted)}>Ended {mom.ends_on}</Text>
                ) : null}
              </View>
            </Panel>

            <Panel title="How it actually went">
              <View style={styles.gap}>
                <ChipGroup
                  label="Outcome"
                  options={OUTCOMES.map((o) => ({ value: o.value, label: o.label }))}
                  value={outcome}
                  onValueChange={(value) => setOutcome(value as MomOutcome)}
                  disabled={busy}
                />
                {outcome != null ? (
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    {OUTCOMES.find((o) => o.value === outcome)?.blurb}
                  </Text>
                ) : null}
              </View>
            </Panel>

            <Panel title="What happened">
              <Textarea
                label="In your own words"
                rows={6}
                value={whatHappened}
                onChangeText={setWhatHappened}
                editable={!busy}
                placeholder="Optional. Nothing here is read by anything else in the app."
              />
            </Panel>

            <Panel title="The next ninety days">
              <View style={styles.gap}>
                {settingNext ? (
                  <>
                    <Input
                      label="The next M.O.M."
                      value={nextTitle}
                      onChangeText={setNextTitle}
                      editable={!busy}
                    />
                    <Input
                      label="Measurable target (optional)"
                      value={nextTarget}
                      onChangeText={setNextTarget}
                      editable={!busy}
                    />
                    <DatePicker label="Starts" value={nextStarts} onValueChange={setNextStarts} disabled={busy} />
                    <DatePicker label="Ends" value={nextEnds} onValueChange={setNextEnds} disabled={busy} />
                    <Text style={textStyle("bodyS", color.inkMuted)}>
                      It inherits the mission above this one. If the mission is what changed, edit it
                      on the chain — that is a separate decision from this one.
                    </Text>
                    <Button variant="ghost" onPress={() => setSettingNext(false)}>
                      Actually, not yet
                    </Button>
                  </>
                ) : (
                  <>
                    <Text style={textStyle("bodyS", color.inkMuted)}>
                      Closing without setting the next one is a complete review. Nothing is waiting on
                      it.
                    </Text>
                    <Button variant="secondary" onPress={() => setSettingNext(true)}>
                      Set the next M.O.M.
                    </Button>
                  </>
                )}
              </View>
            </Panel>

            <Button onPress={() => void onSave()} loading={busy}>
              Close the ninety days
            </Button>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  gap: { gap: space[3] },
});
