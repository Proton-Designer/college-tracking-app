import type { DailyPredictionRow, DailyReview } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, NavLink, PageHeader, Panel, Skeleton, TabScreenScrollView } from "../../components/ui";
import { ReviewForm } from "../../components/review/ReviewForm";
import { textStyle } from "../../design/typography";
import { useAuthSession } from "../../lib/useAuthSession";
import { useReviewData } from "../../lib/useReviewData";

export default function ReviewScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const result = useReviewData();

  return (
    <TabScreenScrollView>
      <PageHeader
        title="Night review"
        actions={
          result.status === "ready" ? (
            <NavLink label="Nightly report" direction="forward" onPress={() => router.push(`/review/${result.data.today}`)} />
          ) : undefined
        }
      />

      {result.status === "loading" ? <ReviewLoading /> : null}

      {result.status === "error" ? (
        <View style={styles.errorBox}>
          <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load tonight&apos;s review</Text>
          <Text style={textStyle("body", color.inkMuted)}>{result.error}</Text>
          <Button variant="secondary" onPress={result.refetch}>
            Try again
          </Button>
        </View>
      ) : null}

      {result.status === "ready" && session?.user.id ? (
        result.data.existingReview ? (
          <ReviewSaved review={result.data.existingReview} prediction={result.data.prediction} />
        ) : (
          <ReviewForm
            userId={session.user.id}
            today={result.data.today}
            incompleteMits={result.data.incompleteMits}
            draft={result.data.draft}
            draftCompletionPct={result.data.draftCompletionPct}
            prediction={result.data.prediction}
            onSaved={result.refetch}
          />
        )
      ) : null}
    </TabScreenScrollView>
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
        MITs {review.mits_completed}/{review.mits_planned} ·{" "}
        {review.deep_work_actual_min != null ? `${review.deep_work_actual_min} min deep work` : "no session data"}
      </Text>
      {prediction && prediction.actual_completion_pct != null ? (
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
});
