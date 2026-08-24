import { daysBetween, isoWeekday, type LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import type { Course } from '../data/courses';
import { loadCourseGradeProjections } from './grades';
import { computeRiskAssessment } from './risk';

/**
 * School Today -- BLUEPRINT 5.5, adjusted by D24: a FEED, not a screen. The ordered
 * school list for tomorrow that pre-populates the Night Plan's dump, and (post-merge) a
 * section of the merged day surface. Deterministic, no LLM.
 */

export interface SchoolTodayItem {
  deliverableId: number;
  /** "MATH 1308 · PSet 4 part 2 · due Thu" -- the line the Night Plan dump receives. */
  text: string;
  courseCode: string;
  title: string;
  dueDate: LocalDate;
  daysUntilDue: number;
  riskScore: number;
  riskBand: string;
}

/** Items further out than this don't make tomorrow's list -- the weekly plan owns them. */
const HORIZON_DAYS = 14;

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dueLabel(today: LocalDate, dueDate: LocalDate): string {
  const days = daysBetween(today, dueDate);
  if (days <= 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 7) {
    // Weekday name for the near week -- "due Thu" reads; "due in 4 days" is arithmetic.
    return `due ${WEEKDAY_LABELS[isoWeekday(dueDate) - 1]}`;
  }
  return `due in ${days} days`;
}

/**
 * The ordered school list for one target day (typically tomorrow, from the Night Plan).
 *
 * Ranked by the EXISTING risk engine -- deliverableRisks from computeRiskAssessment --
 * rather than a fresh due-date sort. This repo already ruled once (weekly planning) that
 * there is one definition of priority, not a per-surface one; a second ranking here would
 * quietly disagree with the risk numbers the user sees everywhere else.
 *
 * Capped at 5: the dump is a starting point the user stars and crowns, not a backlog
 * mirror. Anything past five is the weekly plan's business.
 */
export async function listSchoolTodayItems(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  timezone: string,
  sleepBaselineHours: number | null,
  limit = 5,
): Promise<DataResult<SchoolTodayItem[]>> {
  const { data: courses, error: courseError } = await client
    .from('courses')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null);
  if (courseError) return dataErr(mapDataError(courseError));
  if (courses == null || courses.length === 0) return dataOk([]);

  const gradeProjections = await loadCourseGradeProjections(client, userId);
  const risk = await computeRiskAssessment(
    client,
    userId,
    today,
    courses as Course[],
    gradeProjections,
    sleepBaselineHours,
    timezone,
  );

  const items = risk.deliverableRisks
    .filter((dr) => {
      const days = daysBetween(today, dr.input.dueDate);
      return days >= 0 && days <= HORIZON_DAYS;
    })
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, limit)
    .map((dr) => ({
      deliverableId: dr.deliverableId,
      text: `${dr.courseCode} · ${dr.title} · ${dueLabel(today, dr.input.dueDate)}`,
      courseCode: dr.courseCode,
      title: dr.title,
      dueDate: dr.input.dueDate,
      daysUntilDue: daysBetween(today, dr.input.dueDate),
      riskScore: dr.result.score,
      riskBand: dr.result.band,
    }));

  return dataOk(items);
}
