import { color, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EditDeliverableModal } from "../../components/deliverables/EditDeliverableModal";
import { ExamPrepSection } from "../../components/deliverables/ExamPrepSection";
import { GenerateBackplanSection } from "../../components/deliverables/GenerateBackplanSection";
import { DeliverableTasksSection } from "../../components/deliverables/DeliverableTasksSection";
import { Aurora, Button, NavLink, PageHeader, Skeleton } from "../../components/ui";
import { textStyle } from "../../design/typography";
import { daysRemainingLabel } from "../../lib/dates";
import { useAuthSession } from "../../lib/useAuthSession";
import { type DeliverableDetailData, useDeliverableDetailData } from "../../lib/useDeliverableDetailData";

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

/** Ported from web's /deliverables/[id] page -- E5/U3: backplan generation and
 *  per-task proof-of-work configuration, reached by pressing an assignment row on the
 *  course detail screen. */
export default function DeliverableDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const deliverableId = Number(id);
  const result = useDeliverableDetailData(deliverableId);

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}
      >
        <NavLink label="Back" direction="back" onPress={() => router.back()} />

        {!Number.isInteger(deliverableId) ? <Text style={textStyle("body", color.inkMuted)}>Not a valid assignment.</Text> : null}

        {Number.isInteger(deliverableId) && result.status === "loading" ? (
          <View style={{ gap: space[4] }}>
            <Skeleton height={48} width={200} />
            <Skeleton height={120} radius="lg" />
            <Skeleton height={160} radius="lg" />
          </View>
        ) : null}

        {Number.isInteger(deliverableId) && result.status === "error" ? (
          <View style={styles.errorBox}>
            <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load this assignment</Text>
            <Text style={textStyle("body", color.inkMuted)}>{result.error}</Text>
            <Button variant="secondary" onPress={result.refetch}>
              Try again
            </Button>
          </View>
        ) : null}

        {Number.isInteger(deliverableId) && result.status === "ready" && session?.user.id ? (
          <DeliverableDetailReady userId={session.user.id} deliverableId={deliverableId} data={result.data} onChanged={result.refetch} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function DeliverableDetailReady({
  userId,
  deliverableId,
  data,
  onChanged,
}: {
  userId: string;
  deliverableId: number;
  data: DeliverableDetailData;
  onChanged: () => void;
}) {
  const { deliverable, course, tasks, backplanChain, today } = data;

  return (
    <View style={styles.stack}>
      <View style={{ gap: space[1] }}>
        <PageHeader
          title={deliverable.title}
          context={`${typeLabel(deliverable.type)} · ${daysRemainingLabel(today, deliverable.local_due_date)} · ${deliverable.status.replace(/_/g, " ")}`}
          actions={<EditDeliverableModal userId={userId} deliverable={deliverable} onSaved={onChanged} />}
        />
      </View>

      {deliverable.type === "exam" || deliverable.type === "quiz" ? (
        <ExamPrepSection userId={userId} deliverable={deliverable} today={today} />
      ) : null}

      <View style={{ gap: space[3] }}>
        <Text style={textStyle("label", color.inkMuted)}>Backplan</Text>
        <GenerateBackplanSection userId={userId} deliverableId={deliverableId} chain={backplanChain} onGenerated={onChanged} />
      </View>

      <DeliverableTasksSection
        userId={userId}
        deliverableId={deliverableId}
        courseId={course.id}
        tasks={tasks}
        today={today}
        onChanged={onChanged}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ground,
  },
  flex: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    paddingHorizontal: space[5],
    gap: space[5],
  },
  errorBox: {
    gap: space[2],
    alignItems: "flex-start",
  },
  stack: {
    gap: space[7],
  },
});
