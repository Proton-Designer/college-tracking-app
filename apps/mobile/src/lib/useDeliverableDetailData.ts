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
import { useCallback, useEffect, useState } from "react";
import { loadBackplanChains, type BackplanChain } from "./loadBackplanChains";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export interface DeliverableDetailData {
  deliverable: Deliverable;
  course: Course;
  tasks: Task[];
  backplanChain: BackplanChain | undefined;
  today: string;
}

export type DeliverableDetailFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: DeliverableDetailData };

/** Mirrors apps/web/src/app/(app)/deliverables/[id]/data.ts's loadDeliverableDetail exactly.
 *
 *  Deliberately computes no risk data -- DESIGN_LANGUAGE_V2's §6.1 table originally listed
 *  this screen's Aurora band as "that deliverable's own result.band," corrected after review:
 *  the only real source for that is computeRiskAssessment (course facts, grade projections,
 *  sleep baseline, timezone), a heavy call this leaf screen has no other reason to make.
 *  Paying that cost purely to tint an ambient background inverts the Aurora's own contract
 *  (§6: ambient only, a colourblind user loses nothing without it) and moves the wrong
 *  direction on the already-open 45-round-trip finding in HANDOFF.md §7.5. A lighter,
 *  locally-computed stand-in was considered and rejected: it would be a second definition of
 *  risk alongside computeRiskAssessment, exactly the class of bug D16's core-mirror guard
 *  exists to prevent (see B1/B2, B8 in FOLLOWUPS). This screen gets flat ground, same as
 *  calendar/insights/settings/focus/auth/landing -- "none" is the majority answer in that
 *  table, not a gap to fill. Do not add a risk query here to close this comment out. */
export function useDeliverableDetailData(deliverableId: number) {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<DeliverableDetailFetchState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (authLoading || !userId) return;
    let cancelled = false;
    const client = getMobileSupabaseClient();

    getDeliverable(client, deliverableId).then((deliverableResult) => {
      if (cancelled) return;
      if (!deliverableResult.ok) {
        setFetchState({ status: "error", error: deliverableResult.error.message });
        return;
      }
      const deliverable = deliverableResult.data;

      Promise.all([
        getOwnProfile(client),
        getCourse(client, deliverable.course_id),
        listTasksForDeliverable(client, deliverableId),
        loadBackplanChains(client, [deliverableId]),
      ]).then(([profileResult, courseResult, tasksResult, backplanChains]) => {
        if (cancelled) return;
        if (!profileResult.ok) {
          setFetchState({ status: "error", error: profileResult.error.message });
          return;
        }
        if (!courseResult.ok) {
          setFetchState({ status: "error", error: courseResult.error.message });
          return;
        }
        if (!tasksResult.ok) {
          setFetchState({ status: "error", error: tasksResult.error.message });
          return;
        }

        setFetchState({
          status: "ready",
          data: {
            deliverable,
            course: courseResult.data,
            tasks: tasksResult.data,
            backplanChain: backplanChains.get(deliverableId),
            today: getUserLocalToday(profileResult.data.timezone, new Date()),
          },
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, deliverableId, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
