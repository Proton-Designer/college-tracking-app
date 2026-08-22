"use server";

import { revalidatePath } from "next/cache";
import {
  confirmSyllabusExtraction,
  listSyllabusExtractions,
  triggerSyllabusExtraction,
  uploadSyllabus,
  type SyllabusExtractionRow,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
}

export type UploadSyllabusActionResult =
  | { ok: true; uploadId: number; extraction: { ok: true; itemCount: number; items: SyllabusExtractionRow[] } | { ok: false; error: string } }
  | { ok: false; error: string };

/** Path B (E4): upload -> extract -> [confirm elsewhere]. Never silently retries and
 *  never fabricates a result -- if extraction can't run (most commonly: no
 *  ANTHROPIC_API_KEY configured on this server), the real server error is returned
 *  as-is so the UI can hand the user back to manual entry (Path A) with an honest
 *  explanation, not a spinner that never resolves. */
export async function uploadSyllabusAction(formData: FormData, courseId: number): Promise<UploadSyllabusActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a PDF, PNG, or JPEG file first." };

  const client = await getServerSupabaseClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploadResult = await uploadSyllabus(client, auth.userId, bytes, file.name, courseId, file.type || "application/pdf");
  if (!uploadResult.ok) return { ok: false, error: uploadResult.error.message };

  const extractResult = await triggerSyllabusExtraction(client, uploadResult.data.id);
  if (!extractResult.ok) {
    return { ok: true, uploadId: uploadResult.data.id, extraction: { ok: false, error: extractResult.error.message } };
  }

  const itemsResult = await listSyllabusExtractions(client, uploadResult.data.id);
  return {
    ok: true,
    uploadId: uploadResult.data.id,
    extraction: { ok: true, itemCount: extractResult.data.itemCount, items: itemsResult.ok ? itemsResult.data : [] },
  };
}

export interface ConfirmExtractionActionResult {
  ok: boolean;
  error?: string;
}

export async function confirmExtractionAction(
  courseId: number,
  extractionId: number,
  decision: "confirmed" | "rejected",
): Promise<ConfirmExtractionActionResult> {
  const client = await getServerSupabaseClient();
  const result = await confirmSyllabusExtraction(client, { extractionId, courseId, decision });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true };
}
