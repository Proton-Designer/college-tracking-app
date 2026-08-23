import Link from "next/link";
import { AddAssignmentModal } from "@/components/courses/AddAssignmentModal";
import { AssignmentsTable } from "@/components/courses/AssignmentsTable";
import { CourseRiskPanel } from "@/components/courses/CourseRiskPanel";
import { EditCourseModal } from "@/components/courses/EditCourseModal";
import { GradeBoundariesSection } from "@/components/courses/GradeBoundariesSection";
import { GradeCategoriesSection } from "@/components/courses/GradeCategoriesSection";
import { ScenarioPlanner } from "@/components/courses/ScenarioPlanner";
import { UploadSyllabusModal } from "@/components/courses/UploadSyllabusModal";
import { Aurora, Metric, PageHeader, Panel, RiskPill, WarningCard } from "@/components/ui";
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

  const { course, gradeResult, courseRisk, deliverableRisks, today, categories, gradeItems, gradeBoundaries, deliverables, backplanChains, officeHours } =
    result.data;
  const weightSumIssue = gradeResult?.issues.find((i) => i.kind === "weightSumWarning");
  const categoryNameById = new Map(categories.map((c) => [String(c.id), c.name]));

  // §6.1 -- a single course's own already-computed band, not deriveDayBand (that's the list
  // view's question -- every course's deliverables -- a different source for a different page).
  const dayBand = courseRisk?.result.band ?? null;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={dayBand} />
      <div className="flex flex-col gap-1">
        <Link href="/courses" className="font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink">
          ← Courses
        </Link>
        <PageHeader
          title={course.code}
          titleTestId="course-detail-code"
          context={course.archived_at != null ? `${course.name} · ${course.term} · Archived` : `${course.name} · ${course.term}`}
          actions={
            <>
              {courseRisk ? (
                <div className="flex items-center gap-2">
                  <RiskPill band={courseRisk.result.band} label={courseRisk.result.band.toUpperCase()} />
                  <span className="font-mono text-body-s tabular-nums text-ink-muted">{courseRisk.result.score}</span>
                </div>
              ) : null}
              <EditCourseModal course={course} />
            </>
          }
        />
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
        <WarningCard className="rounded-md" contentClassName="px-4 py-3">
          <p className="text-body-s text-risk-high">
            {weightSumIssue.message} — category weights are never silently normalized, so this course&apos;s grade
            math is provisional until the weights add up to 100.
          </p>
        </WarningCard>
      ) : null}

      <GradeCategoriesSection courseId={courseId} categories={categories} />

      {gradeResult ? (
        <ScenarioPlanner
          courseId={courseId}
          categoryResults={gradeResult.categoryResults}
          categoryNameById={categoryNameById}
          defaultTargetPct={course.target_grade_pct}
        />
      ) : null}

      {/* §2 (Lead's ruling): a panel is earned by a coherent group of content that reads as one
          unit -- a table, a list of rows. Both of these are exactly that, and sat bare on the
          ground while GradeBoundariesSection and office hours (same page, same level) sit in
          real glass right next to them. Siblings at the same level get the same treatment. */}
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Why this score</h2>
        <Panel>
          <CourseRiskPanel deliverableRisks={deliverableRisks} today={today} />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Assignments &amp; exams</h2>
          <div className="flex items-center gap-3">
            <UploadSyllabusModal courseId={courseId} />
            <AddAssignmentModal courseId={courseId} />
          </div>
        </div>
        <Panel>
          <AssignmentsTable
            deliverables={deliverables}
            gradeItems={gradeItems}
            categories={categories}
            backplanChains={backplanChains}
            today={today}
          />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Policies</h2>
        <Panel className="flex flex-col gap-3">
          <PolicyRow label="Late work" value={course.late_policy} />
          <PolicyRow label="Attendance" value={course.attendance_policy} />
          {course.allowed_absences != null ? (
            <PolicyRow label="Allowed absences" value={String(course.allowed_absences)} />
          ) : null}
          <GradeBoundariesSection courseId={courseId} boundaries={gradeBoundaries} />
        </Panel>
      </section>

      {/* U5. `course_office_hours` has carried real data since the academic schema and
          nothing in the repo ever read it. SCREEN_SPEC §4 additionally wants these surfaced
          *contextually* when a topic is repeatedly flagged confusing -- that part is not
          built, because "repeatedly" needs a real threshold and inventing one would be the
          fabricated-constant failure this build spent its time removing. Shown as reference
          data, which is honest and useful on its own. */}
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Office hours</h2>
        {officeHours.length === 0 ? (
          <p className="text-body-s text-ink-muted">None recorded for this course.</p>
        ) : (
          <Panel className="flex flex-col gap-2">
            {officeHours.map((oh) => (
              <div key={oh.id} className="flex items-baseline justify-between gap-4">
                <span className="text-body text-ink">
                  {DAY_NAMES[oh.day_of_week] ?? `Day ${oh.day_of_week}`}{" "}
                  <span className="font-mono text-body-s tabular-nums text-ink-muted">
                    {formatClock(oh.start_time)}–{formatClock(oh.end_time)}
                  </span>
                </span>
                {oh.location ? <span className="font-mono text-caption text-ink-faint">{oh.location}</span> : null}
              </div>
            ))}
          </Panel>
        )}
      </section>
    </main>
  );
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** `HH:MM:SS` from a Postgres `time` column into `2:00 PM`. No timezone conversion, ever:
 *  office hours are a recurring campus wall-clock slot, not an instant, so treating them as
 *  one would drift them across DST. */
function formatClock(value: string): string {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

function PolicyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{label}</span>
      <span className="text-body-s text-ink">{value ?? "Not recorded"}</span>
    </div>
  );
}
