import Link from "next/link";
import { Suspense } from "react";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { RiskPill } from "@/components/ui/RiskPill";
import { DayReading } from "@/components/marketing/DayReading";
import { AuthCodeRedirect } from "./AuthCodeRedirect";

const LOOP = ["Observe", "Plan", "Execute", "Detect deviation", "Intervene", "Reflect", "Learn"];

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <AuthCodeRedirect />
      </Suspense>
      <header className="mx-auto flex w-full max-w-app items-center justify-between px-6 pt-8 sm:px-10">
        <span className="font-sans text-title font-semibold text-ink">CollegeOS</span>
        <Link href="/login" className="text-body-s text-ink-muted underline-offset-2 hover:text-ink hover:underline">
          Sign in
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-app flex-col gap-8 px-6 pb-20 pt-10 sm:px-10">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">
          A closed-loop system for college
        </p>
        <h1
          data-testid="app-heading"
          className="max-w-3xl font-sans text-display-xl font-semibold tracking-[-0.02em] text-ink"
        >
          The day you planned. The day you had.
        </h1>
        <p className="max-w-report text-body-l text-ink-muted">
          CollegeOS measures the gap between the two, explains why it opened, and changes
          tomorrow&apos;s plan because of it. It is not a to-do list, and it does not cheer you on.
        </p>

        <div className="mt-2 rounded-lg border border-hairline bg-surface p-6">
          <DayReading />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link data-testid="hero-signup" href="/signup" className={buttonClassName("primary")}>
            Create your account
          </Link>
          <Link data-testid="hero-login" href="/login" className={buttonClassName("secondary")}>
            Sign in
          </Link>
        </div>
      </section>

      <section className="border-t border-hairline">
        <div className="mx-auto w-full max-w-app px-6 py-14 sm:px-10">
          <p className="mb-6 font-mono text-label uppercase tracking-[0.1em] text-ink-faint">
            The loop
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            {LOOP.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span className="font-sans text-title font-semibold text-ink">{step}</span>
                {i < LOOP.length - 1 ? <span className="text-ink-faint">→</span> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-hairline">
        <div className="mx-auto grid w-full max-w-app gap-10 px-6 py-14 sm:px-10 md:grid-cols-2">
          <div>
            <p className="mb-3 font-mono text-label uppercase tracking-[0.1em] text-ink-faint">
              Built to argue with you
            </p>
            <p className="max-w-report text-body text-ink-muted">
              Every course carries a risk score that recalculates as the semester moves — not a
              vibe, a weighted trace of deadline proximity, grade weight, and how much of the
              planned work actually happened. When the story you&apos;re telling yourself
              disagrees with the evidence, it says so.
            </p>
          </div>
          <div className="rounded-lg border border-hairline bg-surface p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-sans text-title font-semibold text-ink">BME 301</span>
              <RiskPill band="high" label="HIGH ATTENTION" />
            </div>
            <ul className="flex flex-col gap-1.5 text-body-s text-ink-muted">
              <li>Exam worth 22% in 9 days</li>
              <li>Only 1 of 4 planned study sessions completed</li>
              <li>Last three study blocks started 1.4 days late, on average</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-surface">
        <div className="mx-auto w-full max-w-report px-6 py-16 sm:px-10">
          <p className="mb-5 font-mono text-label uppercase tracking-[0.1em] text-ink-faint">
            The report speaks — nightly analysis, skeptic
          </p>
          <p className="font-sans text-display-m leading-[1.35] tracking-[-0.01em] text-ink">
            You&apos;ll probably call today a wash — the study block started late, and the gym
            never happened. But you sat through both classes on schedule, and once you actually
            opened the material, you stayed with it for the full session. The record doesn&apos;t
            dispute that today felt hard. It disputes that nothing happened.
          </p>
        </div>
      </section>

      <section className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-app flex-col items-start gap-4 px-6 py-16 sm:px-10">
          <h2 className="font-sans text-display-m font-semibold tracking-[-0.01em] text-ink">
            Start the semester with a system that keeps score honestly.
          </h2>
          <Link href="/signup" className={buttonClassName("primary")}>
            Create your account
          </Link>
        </div>
      </section>
    </main>
  );
}
