import type { LifeHub } from "@collegeos/api";
import { DOMAIN_LABELS, type LifeDomain, type LocalDate } from "@collegeos/core";
import { color, domainColor, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Aurora, Panel, Skeleton, TabScreenScrollView } from "../../components/ui";
import { textStyle } from "../../design/typography";
import { daysRemainingLabel } from "../../lib/dates";
import { loadLife } from "../../lib/lifeActions";
import { useAuthSession } from "../../lib/useAuthSession";

/**
 * The Life hub, mobile: five domain cards, each with its domain colour and a live one-line
 * status, each opening its own screen.
 *
 * **This is the tab that replaced Courses.** A phone shows five destinations, so on mobile the
 * five tabs are the whole IA and Life is the hub the domains live inside — Courses is still
 * reachable, as School (DESIGN_LANGUAGE_V3 §4.1). A tab joins the dock on the day its
 * destination becomes real, and with Fitness, Work and Business shipped, all five domains are.
 *
 * **Domain colour is information here, not decoration** (§1.3): the tint identifies which
 * domain a card is, and it is always accompanied by the domain's name, so nothing carries
 * meaning by colour alone.
 *
 * **The status lines are composed here, from facts.** `loadLifeHub` returns counts, dates and
 * booleans and no sentences. Each line distinguishes "never set up" from "set up and currently
 * empty", because a card showing `0` for both tells one of them a lie (D40). Web's
 * `apps/web/src/app/(app)/life/page.tsx` composes the same sentences from the same facts.
 */

function deenStatus(hub: LifeHub): string {
  if (!hub.deen.hasLocation) return "Prayer times aren't set up yet";
  if (hub.deen.loggedToday === 0) return "Nothing logged today yet";
  return `${hub.deen.loggedToday} of ${hub.deen.totalPrayers} recorded today`;
}

function businessStatus(hub: LifeHub): string {
  const { mitsToday, openTasks, hasWeeklyGoal } = hub.business;
  if (!hasWeeklyGoal && openTasks === 0 && mitsToday === 0) return "Nothing tagged business yet";
  const parts: string[] = [];
  if (mitsToday > 0) parts.push(`${mitsToday} MIT${mitsToday === 1 ? "" : "s"} today`);
  parts.push(openTasks === 0 ? "nothing open" : `${openTasks} open`);
  parts.push(hasWeeklyGoal ? "focus set" : "no focus this week");
  return parts.join(" · ");
}

function schoolStatus(hub: LifeHub, today: LocalDate): string {
  if (hub.school.courses === 0) return "No courses yet";
  if (hub.school.openDeliverables === 0) return `${hub.school.courses} courses · nothing open`;
  const next = hub.school.nextDueDate;
  return `${hub.school.openDeliverables} open · next ${next == null ? "unscheduled" : daysRemainingLabel(today, next)}`;
}

function fitnessStatus(hub: LifeHub): string {
  const { hasActivePlan, confirmedWorkoutsThisWeek, hasOpenWorkoutToday, exerciseCount } = hub.fitness;
  if (!hasActivePlan && exerciseCount === 0) return "Not set up yet";
  if (!hasActivePlan) return `${exerciseCount} movements · no plan yet`;
  if (confirmedWorkoutsThisWeek === 0) {
    return hasOpenWorkoutToday ? "A workout is open today" : "Nothing confirmed this week yet";
  }
  return `${confirmedWorkoutsThisWeek} confirmed this week${hasOpenWorkoutToday ? " · one open today" : ""}`;
}

function workStatus(hub: LifeHub): string {
  const { activeTargets, blockedTargets, shiftsToday, hasAnyShift } = hub.work;
  if (activeTargets === 0 && blockedTargets === 0 && !hasAnyShift) return "Nothing in the pipeline yet";
  const parts: string[] = [];
  parts.push(activeTargets === 0 ? "nothing active" : `${activeTargets} active`);
  if (blockedTargets > 0) parts.push(`${blockedTargets} blocked`);
  parts.push(
    !hasAnyShift
      ? "no schedule entered"
      : shiftsToday === 0
        ? "no shift today"
        : `${shiftsToday} shift${shiftsToday === 1 ? "" : "s"} today`,
  );
  return parts.join(" · ");
}

interface DomainCard {
  domain: LifeDomain;
  /** A literal union rather than `string`: expo-router's typed routes reject a widened href,
   *  which is the check that catches a card pointing at a screen that does not exist. */
  href: "/deen" | "/business" | "/courses" | "/fitness" | "/work";
  status: string;
  tint: string;
}

function buildCards(hub: LifeHub): DomainCard[] {
  return [
    { domain: "deen", href: "/deen", status: deenStatus(hub), tint: domainColor.deen },
    { domain: "business", href: "/business", status: businessStatus(hub), tint: domainColor.business },
    { domain: "school", href: "/courses", status: schoolStatus(hub, hub.today), tint: domainColor.school },
    { domain: "fitness", href: "/fitness", status: fitnessStatus(hub), tint: domainColor.fitness },
    { domain: "work", href: "/work", status: workStatus(hub), tint: domainColor.work },
  ];
}

export default function LifeScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [hub, setHub] = useState<LifeHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadLife(userId);
    if (result.ok) setHub(result.data);
    else setError(result.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <TabScreenScrollView transparent>
        <Text style={textStyle("displayM", color.ink)}>Life</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>Five domains, one system</Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading || hub == null ? (
          <View style={styles.list}>
            <Skeleton height={72} radius="lg" />
            <Skeleton height={72} radius="lg" />
            <Skeleton height={72} radius="lg" />
          </View>
        ) : (
          <>
            <View style={styles.list}>
              {buildCards(hub).map((card) => (
                <Pressable
                  key={card.domain}
                  accessibilityRole="link"
                  accessibilityLabel={`${DOMAIN_LABELS[card.domain]}. ${card.status}`}
                  onPress={() => router.push(card.href)}
                  style={({ pressed }) => [styles.card, { borderLeftColor: card.tint, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={textStyle("label", card.tint)}>{DOMAIN_LABELS[card.domain]}</Text>
                  <Text style={textStyle("body", color.ink)}>{card.status}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={textStyle("caption", color.inkFaint)}>
              Each line is what that domain actually knows right now. Where a domain has never been set up it says so
              rather than reporting a zero.
            </Text>
          </>
        )}
      </TabScreenScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  list: { gap: space[3] },
  card: {
    gap: space[1],
    padding: space[5],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    borderLeftWidth: 4,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
});
