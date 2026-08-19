import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type Deliverable = Database['public']['Tables']['deliverables']['Row'];

/** Raw deliverables rows for one course, ordered soonest-due-first -- for rendering an
 *  assignments table (due_at, type, status). DeliverableRisk (day/risk.ts) only carries
 *  title + courseId, which is enough to score risk but not enough to render a list. */
export async function listDeliverables(
  client: TypedSupabaseClient,
  courseId: number,
): Promise<DataResult<Deliverable[]>> {
  const { data, error } = await client.from('deliverables').select('*').eq('course_id', courseId).order('due_at');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
