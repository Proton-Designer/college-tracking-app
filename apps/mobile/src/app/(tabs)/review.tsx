import type { DailyPredictionRow, DailyReview } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActiveExperiments } from "../../components/insights/ActiveExperiments";
import { BounceBackSection } from "../../components/insights/BounceBackSection";
import { CalibrationTable } from "../../components/insights/CalibrationTable";
import { DecisionJournal } from "../../components/insights/DecisionJournal";
import { FrictionDistributionSection } from "../../components/insights/FrictionDistributionSection";
import { InsightsList } from "../../components/insights/InsightsList";
import { PlanningExecutionQuadrant } from "../../components/insights/PlanningExecutionQuadrant";
import { Aurora, Button, NavLink, PageHeader, Panel, Skeleton, TabScreenScrollView } from "../../components/ui";
import { ReviewForm } from "../../components/review/ReviewForm";
import { ScreenTimeStep } from "../../components/review/ScreenTimeStep";
import { textStyle } from "../../design/typography";
import { useAuthSession } from "../../lib/useAuthSession";
import { useInsightsData } from "../../lib/useInsightsData";
import { useReviewData } from "../../lib/useReviewData";

/**
 * M7 (docs/IHSAN_RECONCILIATION.md §4). The Insights tab is retired and its screen lives here:
 * one Review destination for "how am I doing" instead of two competing ones. Tonight's review
 * first, then what the last 30 days say about it. (The Wall joins this screen later, same
 * ruling.)
 *
 * Mirrors web's merged `/review` in order, headings and content. The one deliberate divergence
 * is the same one the old Insights screen recorded: web pairs the four analytical readouts into
 * two columns at >=1280px, and that does NOT port -- a phone has one column, and forcing a
 * side-by-side here would shrink measured values below legibility. Same information, same
 * order, same rhythm; different layout, which is the divergence SCREEN_SPEC allows.
 *
 * The two hooks stay separate and fail separately: a broken analytics query must not blank
 * tonight's review, so each half carries its own loading, error and "Try again".
 */
export default function ReviewScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const review = useReviewData();
  const insights = useInsightsData();

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <TabScreenScrollView transparent>
        <PageHeader
          title="Review"
          actions={
            review.status === "ready" ? (
              <NavLink label="Nightly report" direction="forward" onPress={() => router.push(`/review/${review.data.today}`)} />
            ) : undefined
          }
        />
        <WeekLink />

        {/* D48 -- the 90-day ritual is its own screen, linked from here only on the days it is
            actually due. A permanent link to a quarterly ceremony is how a ceremony becomes
            furniture; this one appears when the ninety days are up and disappears once it is
            written. */}
        {review.status === "ready" && review.data.momReviewDue ? (
          <Panel>
            <View style={{ gap: space[3] }}>
              <Text style={textStyle("label", color.inkMuted)}>THE 90 DAYS ARE UP</Text>
              <Text style={textStyle("bodyS", color.inkMuted)}>
                Score the M.O.M. on its own terms, write what happened, and set the next one when you
                are ready to.
              </Text>
              <Button variant="secondary" onPress={() => router.push("/vision-review")}>
                Open the 90-day review
              </Button>
            </View>
          </Panel>
        ) : null}

        <SurfaceGroup title="Tonight">
          {review.status === "loading" ? <ReviewLoading /> : null}

          {review.status === "error" ? (
            <View style={styles.errorBox}>
              <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load tonight&apos;s review</Text>
              <Text style={textStyle("body", color.inkMuted)}>{review.error}</Text>
              <Button variant="secondary" onPress={review.refetch}>
                Try again
              </Button>
            </View>
          ) : null}

          {review.status === "ready" && session?.user.id ? (
            review.data.existingReview ? (
              <ReviewSaved review={review.data.existingReview} prediction={review.data.prediction} />
            ) : (
              <ReviewForm
                userId={session.user.id}
                today={review.data.today}
                incompleteMits={review.data.incompleteMits}
                draft={review.data.draft}
                draftCompletionPct={review.data.draftCompletionPct}
                prediction={review.data.prediction}
                onSaved={review.refetch}
              />
            )
          ) : null}
        </SurfaceGroup>

        {/* D51 -- the week's screen time, alongside the Hours and Signal:Noise the rest of the
            weekly picture is made of. AFTER tonight's review on purpose: tonight's five minutes
            must never be blocked behind a screenshot, and the offer is an invitation rather than a
            step to clear. It drops entirely if its read failed. */}
        {review.status === "ready" && review.data.screenTime && session?.user.id ? (
          <SurfaceGroup title="Screen time" context="This week">
            <ScreenTimeStep
              userId={session.user.id}
              view={review.data.screenTime}
              onChanged={review.refetch}
            />
          </SurfaceGroup>
        ) : null}

        <SurfaceGroup title="Patterns" context="Last 30 days">
          {insights.status === "loading" ? (
            <View style={{ gap: space[4] }}>
              <Skeleton height={80} radius="lg" />
              <Skeleton height={120} radius="lg" />
              <Skeleton height={80} radius="lg" />
            </View>
          ) : null}

          {insights.status === "error" ? (
            <View style={styles.errorBox}>
              <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load insights</Text>
              <Text style={textStyle("body", color.inkMuted)}>{insights.error}</Text>
              <Button variant="secondary" onPress={insights.refetch}>
                Try again
              </Button>
            </View>
          ) : null}

          {insights.status === "ready" && session?.user.id ? (
            <View style={{ gap: space[8] }}>
              <InsightsList userId={session.user.id} insightsByTier={insights.data.insightsByTier} />

              <Section title="Active experiments">
                <ActiveExperiments
                  experiments={insights.data.activeExperiments}
                  today={insights.data.today}
                  userId={session.user.id}
                  onChanged={insights.refetch}
                />
              </Section>

              {/* U7 sits beside experiments on purpose: both are observe-then-score, and seeing
                  an unscored decision next to an unscored trial is what makes closing the loop a
                  habit rather than a feature. */}
              <Section title="Decision journal">
                <DecisionJournal decisions={insights.data.decisions} userId={session.user.id} onChanged={insights.refetch} />
              </Section>

              <Section title="Task-duration calibration">
                <CalibrationTable rows={insights.data.calibrationTable} />
              </Section>

              <Section title="Friction, last 30 days">
                <FrictionDistributionSection distribution={insights.data.frictionDistribution} trend={insights.data.frictionTrend} />
              </Section>

              <Section title="Bounce-back">
                <BounceBackSection items={insights.data.bounceBackByHabit} />
              </Section>

              <Section title="Planning vs. execution — yesterday">
                <PlanningExecutionQuadrant result={insights.data.planningExecution} />
              </Section>
            </View>
          ) : null}
        </SurfaceGroup>
      </TabScreenScrollView>
    </View>
  );
}

/** The two halves of the merged screen. Same hairline-plus-eyebrow device as `Section` one rank
 *  up -- `color.ink` instead of `color.inkMuted` and more air above -- so the split between
 *  "what happened tonight" and "what the last 30 days say" reads without inventing a new mark. */
function SurfaceGroup({ title, context, children }: { title: string; context?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeading}>
        <Text style={textStyle("label", color.ink)}>{title}</Text>
        {context ? <Text style={textStyle("label", color.inkFaint)}>{context}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Matches web's analytics composition (L13.1): a hairline above each heading gives the
 *  screen rhythm instead of leaving the readouts as one undifferentiated scroll. The
 *  "layered hairlines, not shadows" rule from docs/L13_DESIGN_PASS.md. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={textStyle("label", color.inkMuted)}>{title}</Text>
      {children}
    </View>
  );
}

/** Entry to the Sunday Review (/week) -- a link, not a section: the week review is its own
 *  surface and duplicating its numbers here would be a second copy to drift. */
function WeekLink() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push("/week")} accessibilityRole="link" hitSlop={6}>
      <Text style={textStyle("bodyS", color.accent)}>This week in review →</Text>
    </Pressable>
  );
}

function ReviewSaved({ review, prediction }: { review: DailyReview; prediction: DailyPredictionRow | null }) {
  return (
    <Panel style={styles.savedPanel}>
      <Text style={textStyle("label", color.inkMuted)}>Already saved tonight</Text>
      {review.proud_text ? <ReviewField label="What went well" value={review.proud_text} /> : null}
      {review.went_wrong_text ? <ReviewField label="What went wrong" value={review.went_wrong_text} /> : null}
      {review.important_note_text ? <ReviewField label="Anything important" value={review.important_note_text} /> : null}
      <Text style={textStyle("caption", color.inkFaint)}>
        {review.mits_planned === 0
          ? "No MITs planned"
          : `MITs ${review.mits_completed}/${review.mits_planned}`}{" "}
        ·{" "}
        {review.deep_work_actual_min != null ? `${review.deep_work_actual_min} min deep work` : "no session data"}
      </Text>
      {prediction && prediction.predicted_completion_pct != null && prediction.actual_completion_pct != null ? (
        <Text style={textStyle("caption", color.inkFaint)}>
          Predicted {Math.round(prediction.predicted_completion_pct)}% · actual {Math.round(prediction.actual_completion_pct)}%
        </Text>
      ) : null}
    </Panel>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldGap}>
      <Text style={textStyle("label", color.inkMuted)}>{label}</Text>
      <Text style={textStyle("body", color.ink)}>{value}</Text>
    </View>
  );
}

function ReviewLoading() {
  return (
    <View style={{ gap: space[4] }}>
      <Skeleton height={120} radius="lg" />
      <Skeleton height={160} radius="lg" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ground,
  },
  errorBox: {
    gap: space[3],
    alignItems: "flex-start",
  },
  savedPanel: {
    gap: space[4],
  },
  fieldGap: {
    gap: space[1],
  },
  group: {
    gap: space[5],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: space[6],
  },
  groupHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space[3],
  },
  section: {
    gap: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: space[5],
  },
});
