import Link from "next/link";
import type { Deliverable, GradeCategoryRow, GradeItemRow } from "@collegeos/api";
import { BackplanChain } from "@/components/courses/BackplanChain";
import { daysRemainingLabel } from "@/lib/dates";
import type { BackplanChain as BackplanChainData } from "@/lib/loadBackplanChains";

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function pointsLabel(item: GradeItemRow | undefined): string | null {
  if (!item) return null;
  if (item.is_excused) return "Excused";
  if (item.points_earned == null) return `— / ${item.points_possible}`;
  return `${item.points_earned} / ${item.points_possible}`;
}

/** Every deliverable in the course, joined against its grade item (points), category
 *  (weight), and backplan (milestone chain) where linked — a deliverable with no
 *  grade_item_id yet just shows blank fields rather than a fabricated weight. */
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
    return <p className="text-body-s text-ink-faint">Nothing recorded for this course yet.</p>;
  }

  const gradeItemById = new Map(gradeItems.map((i) => [i.id, i]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="max-w-[820px] overflow-x-auto">
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
            const chain = backplanChains.get(d.id);
            return (
              <tr key={d.id} className="border-b border-hairline last:border-b-0">
                <td className="py-3 pr-4 align-top text-body-s text-ink">
                  <Link href={`/deliverables/${d.id}`} className="hover:underline">
                    {d.title}
                  </Link>
                  <BackplanChain chain={chain} />
                </td>
                <td className="py-3 pr-4 align-top font-mono text-body-s text-ink-faint">{typeLabel(d.type)}</td>
                <td className="py-3 pr-4 align-top font-mono text-body-s text-ink-muted">{daysRemainingLabel(today, d.local_due_date)}</td>
                <td className="py-3 pr-4 align-top text-body-s text-ink-muted">{category?.name ?? "—"}</td>
                <td className="py-3 pr-4 align-top font-mono text-body-s tabular-nums text-ink">{pointsLabel(item) ?? "—"}</td>
                <td className="py-3 pr-4 align-top font-mono text-caption uppercase tracking-[0.08em] text-ink-faint">{d.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
