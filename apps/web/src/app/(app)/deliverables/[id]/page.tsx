import Link from "next/link";
import { DeliverableTasksSection } from "@/components/deliverables/DeliverableTasksSection";
import { EditDeliverableModal } from "@/components/deliverables/EditDeliverableModal";
import { GenerateBackplanSection } from "@/components/deliverables/GenerateBackplanSection";
import { PageHeader } from "@/components/ui";
import { daysRemainingLabel } from "@/lib/dates";
import { loadDeliverableDetail } from "./data";

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

export default async function DeliverableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deliverableId = Number(id);

  if (!Number.isInteger(deliverableId)) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not a valid assignment.</p>
      </main>
    );
  }

  const result = await loadDeliverableDetail(deliverableId);

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load this assignment</p>
        <p className="text-body text-ink-muted">{result.error}</p>
        <Link href="/courses" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Courses
        </Link>
      </main>
    );
  }

  const { deliverable, course, tasks, backplanChain, today } = result.data;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <div className="flex flex-col gap-1">
        <Link
          href={`/courses/${course.id}`}
          className="font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink"
        >
          ← {course.code}
        </Link>
        <PageHeader
          title={deliverable.title}
          titleTestId="deliverable-detail-title"
          context={`${typeLabel(deliverable.type)} · ${daysRemainingLabel(today, deliverable.local_due_date)} · ${deliverable.status.replace(/_/g, " ")}`}
          actions={<EditDeliverableModal deliverable={deliverable} />}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Backplan</h2>
        <GenerateBackplanSection deliverableId={deliverableId} chain={backplanChain} />
      </section>

      <DeliverableTasksSection deliverableId={deliverableId} courseId={course.id} tasks={tasks} today={today} />
    </main>
  );
}
