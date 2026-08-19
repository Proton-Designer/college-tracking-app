import type { Deliverable, GradeCategoryRow, GradeItemRow } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { daysRemainingLabel } from "../../lib/dates";
import type { BackplanChain as BackplanChainData } from "../../lib/loadBackplanChains";
import { BackplanChain } from "./BackplanChain";

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function pointsLabel(item: GradeItemRow | undefined): string | null {
  if (!item) return null;
  if (item.is_excused) return "Excused";
  if (item.points_earned == null) return `— / ${item.points_possible}`;
  return `${item.points_earned} / ${item.points_possible}`;
}

/** Every deliverable in the course as a card list (mobile has no HTML table idiom) —
 *  same underlying fields as web's AssignmentsTable: joined against grade item, category,
 *  and backplan where linked, blank rather than fabricated when unlinked. */
export function AssignmentsTable({
  deliverables,
  gradeItems,
  categories,
  backplanChains,
  today,
}: {
  deliverables: Deliverable[];
  gradeItems: GradeItemRow[];
  categories: GradeCategoryRow[];
  backplanChains: Map<number, BackplanChainData>;
  today: string;
}) {
  if (deliverables.length === 0) {
    return <Text style={textStyle("bodyS", color.inkFaint)}>Nothing recorded for this course yet.</Text>;
  }

  const gradeItemById = new Map(gradeItems.map((i) => [i.id, i]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <View style={styles.list}>
      {deliverables.map((d, i) => {
        const item = d.grade_item_id != null ? gradeItemById.get(d.grade_item_id) : undefined;
        const category = item ? categoryById.get(item.category_id) : undefined;
        const chain = backplanChains.get(d.id);
        const points = pointsLabel(item);

        return (
          <View key={d.id} style={[styles.row, i === deliverables.length - 1 ? styles.rowLast : styles.rowBorder]}>
            <Text style={textStyle("bodyS", color.ink)}>{d.title}</Text>
            <Text style={textStyle("caption", color.inkFaint)}>
              {typeLabel(d.type)} · {daysRemainingLabel(today, d.local_due_date)} · {category?.name ?? "—"}
              {points ? ` · ${points}` : ""}
            </Text>
            <Text style={textStyle("caption", color.inkFaint)}>{d.status}</Text>
            <BackplanChain chain={chain} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 0,
  },
  row: {
    gap: 2,
    paddingBottom: space[4],
    marginBottom: space[4],
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  rowLast: {
    paddingBottom: 0,
    marginBottom: 0,
  },
});
