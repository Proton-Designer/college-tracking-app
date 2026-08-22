import Link from "next/link";
import { EmptyState, PageHeader, RiskPill } from "@/components/ui";
import { AddCourseModal } from "@/components/courses/AddCourseModal";
import { daysRemainingLabel } from "@/lib/dates";
import { loadCoursesIndex, type CoursesIndexRow } from "./data";

function formatPct(pct: number | null): string {
  return pct == null ? "—" : `${Math.round(pct)}%`;
}

export default async function CoursesPage() {
  const result = await loadCoursesIndex();

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load courses</p>
        <p className="text-body text-ink-muted">{result.error}</p>
        <Link href="/courses" className="font-mono text-body-s text-accent underline underline-offset-2">
          Try again
        </Link>
      </main>
    );
  }

  const { rows, today } = result.data;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-6 px-8 py-10">
      <PageHeader title="Courses" actions={rows.length > 0 ? <AddCourseModal /> : null} />

      {rows.length === 0 ? (
        <EmptyState
          title="No courses yet"
          description="Add your first course to start tracking assignments, grades, and risk."
          action={<AddCourseModal />}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
                <th className="py-2 pr-4 font-normal">Course</th>
                <th className="py-2 pr-4 font-normal">Risk</th>
                <th className="py-2 pr-4 font-normal">Current</th>
                <th className="py-2 pr-4 font-normal">Target</th>
                <th className="py-2 pr-4 font-normal">Next deadline</th>
                <th className="py-2 w-6" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <CourseRow key={row.course.id} row={row} today={today} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function CourseRow({ row, today }: { row: CoursesIndexRow; today: string }) {
  const { course, gradeResult, courseRisk, nextDeadline } = row;

  return (
    <tr className="group border-b border-hairline transition-colors duration-90 last:border-b-0 hover:bg-surface-sunken">
      <td className="py-3 pr-4">
        <Link href={`/courses/${course.id}`} className="flex flex-col hover:underline">
          <span className="font-mono text-body-s text-ink">{course.code}</span>
          <span className="text-body-s text-ink-faint">{course.name}</span>
        </Link>
      </td>
      <td className="py-3 pr-4">
        {courseRisk ? (
          <div className="flex items-center gap-2">
            <RiskPill band={courseRisk.result.band} label={courseRisk.result.band.toUpperCase()} />
            <span className="font-mono text-body-s tabular-nums text-ink-faint">{courseRisk.result.score}</span>
          </div>
        ) : (
          <span className="text-body-s text-ink-faint">—</span>
        )}
      </td>
      <td className="py-3 pr-4 font-mono text-body-s tabular-nums text-ink">{formatPct(gradeResult?.currentGrade ?? null)}</td>
      <td className="py-3 pr-4 font-mono text-body-s tabular-nums text-ink-muted">{formatPct(course.target_grade_pct)}</td>
      <td className="py-3 pr-4 text-body-s text-ink-muted">
        {nextDeadline ? (
          <>
            {nextDeadline.title} <span className="text-ink-faint">· {daysRemainingLabel(today, nextDeadline.localDueDate)}</span>
          </>
        ) : (
          <span className="text-ink-faint">Nothing open</span>
        )}
      </td>
      <td className="py-3 text-ink-faint transition-colors duration-90 group-hover:text-ink" aria-hidden="true">
        ›
      </td>
    </tr>
  );
}
