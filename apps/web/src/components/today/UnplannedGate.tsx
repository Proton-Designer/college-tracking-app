"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CheckinForm } from "./CheckinForm";
import type { Course, DayView, Task } from "@collegeos/api";

/**
 * Unplanned mode's primary call to action (SCREEN_SPEC §1): the check-in form takes over the
 * top of the screen until it's submitted or explicitly skipped, at which point the normal
 * server-rendered body (passed as `children`) takes its place. Skipping doesn't call any
 * mutation — its absence is itself the signal the recovery engine reads on a later day.
 */
export function UnplannedGate({
  today,
  timezone,
  todayTasks,
  courses,
  suggestedMits,
  todayHealth,
  workload,
  recoveryMode,
  children,
}: {
  today: string;
  timezone: string;
  todayTasks: Task[];
  courses: Record<number, Course>;
  suggestedMits: DayView["suggestedMits"];
  todayHealth: DayView["todayHealth"];
  workload: DayView["workload"];
  recoveryMode: DayView["recoveryMode"];
  children: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return <>{children}</>;

  return (
    <CheckinForm
      today={today}
      timezone={timezone}
      todayTasks={todayTasks}
      courses={courses}
      suggestedMits={suggestedMits}
      todayHealth={todayHealth}
      workload={workload}
      recoveryMode={recoveryMode}
      onDone={() => setDismissed(true)}
      onSkip={() => setDismissed(true)}
    />
  );
}
