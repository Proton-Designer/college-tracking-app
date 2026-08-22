import { AddCourseModal } from "@/components/courses/AddCourseModal";
import { Panel } from "@/components/ui";

/** E0_ONBOARDING_SPEC.md: the daily ritual (check-in, Day Trace, workload) presupposes a
 *  semester exists. A brand-new (or fully-cleared-out) account has nothing to check in
 *  about, nothing to plan around -- showing it anyway means asking the user to predict
 *  what percentage of nothing they'll finish and name what will stop them from doing
 *  nothing. This replaces the entire Today body, not just an empty-state message inside
 *  it, until a real course exists. */
export function OnboardingGate() {
  return (
    <Panel className="flex flex-col items-start gap-4 py-10">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-sans text-display-l font-semibold tracking-[-0.025em] text-ink">Start with a course</h1>
        <p className="max-w-[52ch] text-body text-ink-muted">
          Today plans around your actual courses and what&apos;s due — add your first course to get a real
          semester in here. It takes under a minute: code, name, and term.
        </p>
      </div>
      <AddCourseModal />
    </Panel>
  );
}
