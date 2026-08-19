import Link from "next/link";
import { CourseRiskPanel } from "@/components/courses/CourseRiskPanel";
import { ScenarioPlanner } from "@/components/courses/ScenarioPlanner";
import { Metric, Panel, RiskPill } from "@/components/ui";
import { loadCourseDetail } from "./data";

function formatPct(pct: number | null): string {
  return pct == null ? "—" : `${Math.round(pct)}`;
}

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const courseId = Number(id);

  if (!Number.isInteger(courseId)) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not a valid course.</p>
      </main>
    );
  }

  const result = await loadCourseDetail(courseId);

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load this course</p>
        <p className="text-body text-ink-muted">{result.error}</p>
        <Link href="/courses" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Courses
        </Link>
      </main>
    );
  }

  const { course, gradeResult, courseRisk, deliverableRisks, today } = result.data;
  const weightSumIssue = gradeResult?.issues.find((i) => i.kind === "weightSumWarning");

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/courses" className="font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink">
          ← Courses
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">{course.code}</h1>
            <p className="text-body text-ink-muted">
              {course.name} · {course.term}
            </p>
          </div>
          {courseRisk ? (
            <div className="flex items-center gap-2">
              <RiskPill band={courseRisk.result.band} label={courseRisk.result.band.toUpperCase()} />
              <span className="font-mono text-body-s tabular-nums text-ink-faint">{courseRisk.result.score}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-8">
        <Metric label="Current" value={formatPct(gradeResult?.currentGrade ?? null)} unit="%" />
        <Metric label="Projected" value={formatPct(gradeResult?.projectedGrade ?? null)} unit="%" />
        <Metric label="Target" value={formatPct(course.target_grade_pct)} unit="%" />
        {courseRisk ? (
          <Metric
            label="Risk confidence"
            value={courseRisk.result.confidence}
            delta={{ label: `${courseRisk.result.sampleSize} open item${courseRisk.result.sampleSize === 1 ? "" : "s"}`, direction: "flat" }}
          />
        ) : null}
      </div>

      {weightSumIssue ? (
        <p className="rounded-md border border-risk-high bg-risk-high-wash px-4 py-3 text-body-s text-risk-high">
          {weightSumIssue.message} — category weights are never silently normalized, so this course&apos;s grade
          math is provisional until the weights add up to 100.
        </p>
      ) : null}

      {gradeResult ? (
        <ScenarioPlanner courseId={courseId} categoryResults={gradeResult.categoryResults} defaultTargetPct={course.target_grade_pct} />
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Why this score</h2>
        <CourseRiskPanel deliverableRisks={deliverableRisks} today={today} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Policies</h2>
        <Panel className="flex flex-col gap-3">
          <PolicyRow label="Late work" value={course.late_policy} />
          <PolicyRow label="Attendance" value={course.attendance_policy} />
          {course.allowed_absences != null ? (
            <PolicyRow label="Allowed absences" value={String(course.allowed_absences)} />
          ) : null}
          <p className="text-caption text-ink-faint">
            Grade boundaries aren&apos;t wired up yet — pending a read of grade_boundaries.
          </p>
        </Panel>
      </section>

      <p className="text-caption text-ink-faint">
        Assignments &amp; exams, backplan milestone chains, and grade boundaries are pending backend reads not yet
        exposed — tracked, not silently missing.
      </p>
    </main>
  );
}

function PolicyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{label}</span>
      <span className="text-body-s text-ink">{value ?? "Not recorded"}</span>
    </div>
  );
}
