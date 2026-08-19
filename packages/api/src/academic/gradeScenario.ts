import {
  computeCourseGrade,
  computeScenario,
  solveRequiredScore,
  type CourseGradeResult,
  type GradeCategory,
  type GradeItem,
  type GradeScenarioHypothetical,
  type RequiredScoreResult,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';

async function loadCourseGradeShape(
  client: TypedSupabaseClient,
  userId: string,
  courseId: number,
): Promise<DataResult<{ categories: GradeCategory[]; items: GradeItem[] }>> {
  const [{ data: categories, error: catError }, { data: items, error: itemError }] = await Promise.all([
    client.from('grade_categories').select('*').eq('user_id', userId).eq('course_id', courseId),
    client.from('grade_items').select('*').eq('user_id', userId).eq('course_id', courseId),
  ]);
  if (catError) return dataErr(mapDataError(catError));
  if (itemError) return dataErr(mapDataError(itemError));

  return dataOk({
    categories: (categories ?? []).map((c) => ({
      id: String(c.id),
      name: c.name,
      weightPct: Number(c.weight_pct),
      dropLowestN: c.drop_lowest_n,
      expectedItemCount: c.expected_item_count,
    })),
    items: (items ?? []).map((i) => ({
      id: String(i.id),
      categoryId: String(i.category_id),
      name: i.name,
      pointsEarned: i.points_earned == null ? null : Number(i.points_earned),
      pointsPossible: Number(i.points_possible),
      isExcused: i.is_excused,
    })),
  });
}

/**
 * "If Exam 3 = 85 -> final exam required for an A = 96" (the brief's example), exposed
 * for the Courses detail screen. Hypotheticals reference categories by their real
 * `grade_categories.id` (stringified) -- the same ids the category-listing endpoint
 * already returns, so the client never has to invent an id scheme of its own.
 */
export async function computeCourseGradeScenario(
  client: TypedSupabaseClient,
  userId: string,
  courseId: number,
  hypotheticals: GradeScenarioHypothetical[],
): Promise<DataResult<CourseGradeResult>> {
  const shape = await loadCourseGradeShape(client, userId, courseId);
  if (!shape.ok) return shape;

  return dataOk(computeScenario(shape.data.categories, shape.data.items, hypotheticals));
}

/** The required-score solver (packages/core §2) against the course's CURRENT (non-hypothetical) state. */
export async function computeCourseRequiredScore(
  client: TypedSupabaseClient,
  userId: string,
  courseId: number,
  targetPct: number,
): Promise<DataResult<RequiredScoreResult>> {
  const shape = await loadCourseGradeShape(client, userId, courseId);
  if (!shape.ok) return shape;

  const course = computeCourseGrade(shape.data.categories, shape.data.items);
  return dataOk(solveRequiredScore(course, targetPct));
}
