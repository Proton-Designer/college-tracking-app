import type { SelfView } from "@collegeos/api";
import { EVIDENCE_KIND_LABELS, MIN_ACTS_TO_JUDGE, type DimensionStanding } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, EmptyState, NavLink, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { addDimension, loadSelfView } from "../lib/selfActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * Desired Self, mobile.
 *
 * The rule this screen enforces, same as web: **a number never appears without the acts behind
 * it.** Every standing renders its evidence directly beneath it — there is no collapsed state that
 * shows a score alone, and no sort or summary that ranks dimensions by standing.
 *
 * There is no total anywhere (D34). The only cross-dimension view is attention: how many acts each
 * received this week, which is information about where a life is going rather than a ranking of
 * the parts of it.
 */

/** The directive's starting structure, offered as one-tap adds -- inserted for nobody (D39). */
const SUGGESTED = [
  { name: "Physique", definition: "The body I'm building, and what it lets me do." },
  { name: "Deen", definition: "The practice I want to be consistent in, not just sincere about." },
  { name: "Work/Craft", definition: "What I can make, and how well I can make it." },
  { name: "Focus", definition: "The ability to stay on one hard thing until it's finished." },
  { name: "Traits", definition: "Character — the sub-dimensions live under this one." },
];

export default function SelfScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [view, setView] = useState<SelfView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const result = await loadSelfView(userId);
    if (result.ok) {
      setView(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(name: string, definition: string) {
    if (!userId) return;
    setBusy(true);
    const result = await addDimension(userId, { name, definition });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    void refresh();
  }

  const content = () => {
    if (loading && view === null) {
      return <Text style={textStyle("body", color.inkMuted)}>Loading…</Text>;
    }
    if (error !== null && view === null) {
      return (
        <Panel>
          <Text style={textStyle("label", color.riskCritical)}>COULDN&apos;T LOAD SELF</Text>
          <Text style={[textStyle("body", color.inkMuted), styles.gapTop]}>{error}</Text>
          <View style={styles.gapTop}>
            <Button onPress={() => void refresh()}>Try again</Button>
          </View>
        </Panel>
      );
    }
    if (!view) return null;

    if (view.dimensions.length === 0) {
      return (
        <View style={styles.stack}>
          <Panel>
            <EmptyState
              title="Nothing aimed at yet"
              description="A dimension is a part of yourself you're deliberately training — with your own written definition of the version you're aiming at, and the acts that count toward it. Nothing is scored until there are acts behind it, and there is never a total: these stand side by side rather than adding up."
            />
          </Panel>
          <Panel>
            <Text style={textStyle("label", color.inkMuted)}>START FROM THESE, OR WRITE YOUR OWN ON WEB</Text>
            <View style={styles.chips}>
              {SUGGESTED.map((suggestion) => (
                <Pressable
                  key={suggestion.name}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void create(suggestion.name, suggestion.definition)}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, busy && styles.chipDisabled]}
                >
                  <Text style={textStyle("body", color.ink)}>+ {suggestion.name}</Text>
                </Pressable>
              ))}
            </View>
          </Panel>
        </View>
      );
    }

    const parents = view.standings.filter((s) => s.parentId === null);

    return (
      <View style={styles.stack}>
        {view.unroutedActs > 0 ? (
          <Panel>
            <Text style={textStyle("label", color.inkMuted)}>ROUTING</Text>
            <Text style={[textStyle("body", color.ink), styles.gapTopSm]}>
              {view.unroutedActs} {view.unroutedActs === 1 ? "act isn't" : "acts aren't"} feeding any dimension
              yet.
            </Text>
            <Text style={[textStyle("bodyS", color.inkMuted), styles.gapTopSm]}>
              Nothing counts where you haven&apos;t said it should. Add a rule on the web app and it starts
              counting from the same history — no act is lost by being unrouted, only unclaimed.
            </Text>
          </Panel>
        ) : null}

        {parents.map((standing) => (
          <DimensionCard
            key={standing.dimensionId}
            standing={standing}
            subDimensions={view.standings.filter((s) => s.parentId === standing.dimensionId)}
          />
        ))}

        <Panel>
          <Text style={textStyle("label", color.inkMuted)}>ATTENTION THIS WEEK</Text>
          {/* Act counts, never scores. Ranking by standing would be the grand total D34 refuses. */}
          <View style={styles.gapTop}>
            {view.attention.map((row) => (
              <View key={row.dimensionId} style={styles.row}>
                <Text style={textStyle("body", color.ink)}>{row.name}</Text>
                <Text style={textStyle("bodyS", color.inkMuted)}>
                  {row.acts} {row.acts === 1 ? "act" : "acts"}
                </Text>
              </View>
            ))}
          </View>
          <Text style={[textStyle("bodyS", color.inkMuted), styles.gapTop]}>
            Where your attention went — not a ranking. These aren&apos;t comparable to each other, and
            nothing here adds up to a score.
          </Text>
        </Panel>
      </View>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.screen,
        { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[10] },
      ]}
    >
      <NavLink label="Today" onPress={() => router.replace("/(tabs)/today")} />
      <Text style={[textStyle("displayM", color.ink), styles.gapTop]}>Self</Text>
      <Text style={textStyle("bodyS", color.inkMuted)}>Last 90 days</Text>
      <View style={styles.gapTop}>{content()}</View>
    </ScrollView>
  );
}

function DimensionCard({
  standing,
  subDimensions,
}: {
  standing: DimensionStanding;
  /** Named explicitly rather than `children`, which would collide with React's own slot. */
  subDimensions: DimensionStanding[];
}) {
  const tooEarly = standing.standing === null;

  return (
    <Panel>
      <View style={styles.row}>
        <Text style={textStyle("title", color.ink)}>{standing.name}</Text>
        {tooEarly ? (
          <Text style={textStyle("metric", color.inkFaint)}>—</Text>
        ) : (
          <Text style={textStyle("metric", color.ink)}>{standing.standing}</Text>
        )}
      </View>

      {tooEarly ? (
        <Text style={[textStyle("bodyS", color.inkMuted), styles.gapTopSm]}>
          {standing.observedActs} of {MIN_ACTS_TO_JUDGE} acts — too early to say
        </Text>
      ) : (
        <Text style={[textStyle("caption", color.inkFaint), styles.gapTopSm]}>
          {standing.observedActs} acts · {standing.actsThisWeek} this week
        </Text>
      )}

      {standing.overshoot === "over" ? (
        // D35's voice: a refusal that explains itself, reading as "stop" rather than as failure.
        // Only fires against a ceiling the user set for themselves.
        <Text style={[textStyle("bodyS", color.riskModerate), styles.gapTopSm]}>
          {standing.actsThisWeek} this week, against your own ceiling. The mean cuts both ways — this
          week, less is the virtue.
        </Text>
      ) : null}

      {/* The acts, never separable from the number -- they are what the score IS. */}
      {standing.evidence.length > 0 ? (
        <View style={styles.evidence}>
          <Text style={textStyle("label", color.inkFaint)}>WHAT&apos;S BEHIND THIS</Text>
          {standing.evidence.slice(0, 8).map((act, i) => (
            <View key={`${act.date}-${i}`} style={styles.evidenceRow}>
              <Text style={[textStyle("bodyS", color.ink), styles.evidenceLabel]} numberOfLines={1}>
                {act.label}
              </Text>
              <Text style={textStyle("caption", color.inkFaint)}>
                {EVIDENCE_KIND_LABELS[act.kind]} · {act.date}
              </Text>
            </View>
          ))}
          {standing.evidence.length > 8 ? (
            <Text style={[textStyle("caption", color.inkFaint), styles.gapTopSm]}>
              + {standing.evidence.length - 8} more
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={[textStyle("bodyS", color.inkMuted), styles.gapTop]}>
          No acts route here yet. Add a rule on the web app and this starts counting.
        </Text>
      )}

      {subDimensions.length > 0 ? (
        <View style={styles.subs}>
          {subDimensions.map((child) => (
            <View key={child.dimensionId} style={styles.row}>
              <Text style={textStyle("body", color.inkMuted)}>{child.name}</Text>
              <Text style={textStyle("bodyS", color.inkFaint)}>
                {child.standing === null ? "—" : child.standing}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: space[5], gap: space[2] },
  stack: { gap: space[4] },
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[4] },
  gapTop: { marginTop: space[4] },
  gapTopSm: { marginTop: space[3] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[3], marginTop: space[4] },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space[5],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipPressed: { backgroundColor: color.surfaceSunken },
  chipDisabled: { opacity: 0.4 },
  evidence: { marginTop: space[5], gap: space[2] },
  evidenceRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[4] },
  evidenceLabel: { flexShrink: 1 },
  subs: {
    marginTop: space[5],
    paddingTop: space[4],
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    gap: space[2],
  },
});
