import "server-only";
import {
  getCourse,
  getDeliverable,
  getOwnProfile,
  getUserLocalToday,
  listTasksForDeliverable,
  type Course,
  type Deliverable,
  type Task,
} from "@collegeos/api";
import { loadBackplanChains, type BackplanChain } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface DeliverableDetailData {
  deliverable: Deliverable;
  course: Course;
  tasks: Task[];
  backplanChain: BackplanChain | undefined;
  today: string;
}

export type DeliverableDetailLoadResult = { ok: true; data: DeliverableDetailData } | { ok: false; error: string };

export async function loadDeliverableDetail(deliverableId: number): Promise<DeliverableDetailLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const deliverableResult = await getDeliverable(client, deliverableId);
  if (!deliverableResult.ok) return { ok: false, error: deliverableResult.error.message };
  const deliverable = deliverableResult.data;

  const [profileResult, courseResult, tasksResult, backplanChains] = await Promise.all([
    getOwnProfile(client),
    getCourse(client, deliverable.course_id),
    listTasksForDeliverable(client, deliverableId),
    loadBackplanChains(client, [deliverableId]),
  ]);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  if (!courseResult.ok) return { ok: false, error: courseResult.error.message };
  if (!tasksResult.ok) return { ok: false, error: tasksResult.error.message };

  return {
    ok: true,
    data: {
      deliverable,
      course: courseResult.data,
      tasks: tasksResult.data,
      backplanChain: backplanChains.get(deliverableId),
      today: getUserLocalToday(profileResult.data.timezone, new Date()),
    },
  };
}
