import { computeCourseGrade, type CourseGradeResult, type GradeCategory, type GradeItem } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';

export interface CourseGradeProjection {
  courseId: number;
  result: CourseGradeResult;
}

/**
 * Loads every grade category/item for the user in two queries (not one per course) and
 * projects each course's grade via packages/core §2. Nothing here computes a percentage
 * itself — that's the engine's job; this only shapes rows into the engine's input types.
 */
export async function loadCourseGradeProjections(
  client: TypedSupabaseClient,
  userId: string,
): Promise<CourseGradeProjection[]> {
  const [{ data: categories, error: catError }, { data: items, error: itemError }] = await Promise.all([
    client.from('grade_categories').select('*').eq('user_id', userId),
    client.from('grade_items').select('*').eq('user_id', userId),
  ]);
  if (catError) throw catError;
  if (itemError) throw itemError;

  const categoriesByCourse = new Map<number, GradeCategory[]>();
  for (const row of categories ?? []) {
    const category: GradeCategory = {
      id: String(row.id),
      name: row.name,
      weightPct: Number(row.weight_pct),
      dropLowestN: row.drop_lowest_n,
      expectedItemCount: row.expected_item_count,
    };
    const list = categoriesByCourse.get(row.course_id) ?? [];
    list.push(category);
    categoriesByCourse.set(row.course_id, list);
  }

  const itemsByCourse = new Map<number, GradeItem[]>();
  for (const row of items ?? []) {
    const item: GradeItem = {
      id: String(row.id),
      categoryId: String(row.category_id),
      name: row.name,
      pointsEarned: row.points_earned == null ? null : Number(row.points_earned),
      pointsPossible: Number(row.points_possible),
      isExcused: row.is_excused,
    };
    const list = itemsByCourse.get(row.course_id) ?? [];
    list.push(item);
    itemsByCourse.set(row.course_id, list);
  }

  const courseIds = new Set([...categoriesByCourse.keys(), ...itemsByCourse.keys()]);
  return [...courseIds].map((courseId) => ({
    courseId,
    result: computeCourseGrade(categoriesByCourse.get(courseId) ?? [], itemsByCourse.get(courseId) ?? [], {
      assumption: 'current',
    }),
  }));
}
