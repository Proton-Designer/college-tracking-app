import type { Deliverable, GradeCategoryRow, GradeItemRow } from "@collegeos/api";
import { daysRemainingLabel } from "@/lib/dates";

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function pointsLabel(item: GradeItemRow | undefined): string | null {
  if (!item) return null;
  if (item.is_excused) return "Excused";
  if (item.points_earned == null) return `— / ${item.points_possible}`;
  return `${item.points_earned} / ${item.points_possible}`;
}

/** Every deliverable in the course, joined against its grade item (points) and category
 *  (weight) where linked — a deliverable with no grade_item_id yet just shows undated fields
 *  as blank rather than a fabricated weight. */
export function AssignmentsTable({
  deliverables,
  gradeItems,
  categories,
  today,
}: {
  deliverables: Deliverable[];
  gradeItems: GradeItemRow[];
  categories: GradeCategoryRow[];
  today: string;
}) {
  if (deliverables.length === 0) {
    return <p className="text-body-s text-ink-faint">Nothing recorded for this course yet.</p>;
  }

  const gradeItemById = new Map(gradeItems.map((i) => [i.id, i]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-hairline text-left font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
            <th className="py-2 pr-4 font-normal">Item</th>
            <th className="py-2 pr-4 font-normal">Type</th>
            <th className="py-2 pr-4 font-normal">Due</th>
            <th className="py-2 pr-4 font-normal">Category</th>
            <th className="py-2 pr-4 font-normal">Points</th>
            <th className="py-2 pr-4 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {deliverables.map((d) => {
            const item = d.grade_item_id != null ? gradeItemById.get(d.grade_item_id) : undefined;
            const category = item ? categoryById.get(item.category_id) : undefined;
            return (
              <tr key={d.id} className="border-b border-hairline last:border-b-0">
                <td className="py-3 pr-4 text-body-s text-ink">{d.title}</td>
                <td className="py-3 pr-4 font-mono text-body-s text-ink-faint">{typeLabel(d.type)}</td>
                <td className="py-3 pr-4 font-mono text-body-s text-ink-muted">{daysRemainingLabel(today, d.local_due_date)}</td>
                <td className="py-3 pr-4 text-body-s text-ink-muted">{category?.name ?? "—"}</td>
                <td className="py-3 pr-4 font-mono text-body-s tabular-nums text-ink">{pointsLabel(item) ?? "—"}</td>
                <td className="py-3 pr-4 font-mono text-caption uppercase tracking-[0.08em] text-ink-faint">{d.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
