// The one file that knows what a PostgREST chain looks like. Everything the state
// machine does to the database is expressed here, against migration 54's tables, so
// ingest.ts can be tested with an in-memory repo and this file can be reviewed as data
// access rather than as logic.
//
// THE STAGING DISCRIMINATOR, in SQL terms: page-text rows are `source_chunks` rows with
// `sort_order = -page` (negative); real chunks have `sort_order >= 0`. Every query below
// filters on that sign, which is why `loadChunksAfter` can never accidentally hand a raw
// page to the extraction model and `loadPageTexts` can never return a real chunk.

import type {
  CandidateLessonRow,
  ChunkRow,
  IngestJobRow,
  IngestRepo,
  JobPatch,
  NewCandidateLesson,
  NewChunk,
  NewSection,
  PageTextRow,
  SectionRow,
  SourceRow,
} from "./repo.ts";

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

const NON_TERMINAL_STEPS = [
  "queued",
  "extracting_text",
  "parsing_structure",
  "chunking",
  "embedding",
  "extracting_lessons",
  "merging",
];

// deno-lint-ignore no-explicit-any
function toJob(row: any): IngestJobRow {
  return {
    id: row.id,
    userId: row.user_id,
    sourceId: row.source_id,
    step: row.step,
    cursor: (row.cursor ?? {}) as Record<string, unknown>,
    attempts: row.attempts ?? 0,
    costUsd: Number(row.cost_usd ?? 0),
  };
}

/**
 * pgvector round-trips as a string like "[0.1,0.2,...]" through PostgREST, not as a JSON
 * array. Parsing it here (rather than at the call site) keeps every consumer working with
 * `number[] | null` and keeps the "is this embedded?" question a plain null check.
 */
function parseVector(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isFinite(n));
  if (typeof value !== "string") return null;
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (inner.length === 0) return null;
  const parsed = inner.split(",").map((part) => Number(part.trim()));
  return parsed.every((n) => Number.isFinite(n)) ? parsed : null;
}

export function createSupabaseIngestRepo(client: AnySupabaseClient): IngestRepo {
  return {
    async loadJob(jobId) {
      const { data, error } = await client
        .from("ingest_jobs")
        .select("id, user_id, source_id, step, cursor, attempts, cost_usd")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toJob(data) : null;
    },

    async findStalledJobs(staleBefore, limit) {
      const { data, error } = await client
        .from("ingest_jobs")
        .select("id, user_id, source_id, step, cursor, attempts, cost_usd")
        .in("step", NON_TERMINAL_STEPS)
        .lt("heartbeat_at", staleBefore.toISOString())
        // Oldest heartbeat first: the job that has been waiting longest is served first,
        // so one wedged job cannot starve the queue behind it.
        .order("heartbeat_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((row: any) => toJob(row));
    },

    async saveJob(jobId: number, patch: JobPatch) {
      // Any write from the driver IS a sign of life, so heartbeat_at moves on every
      // save — including a failed attempt, which is progress information too.
      const update: Record<string, unknown> = { heartbeat_at: new Date().toISOString() };
      if (patch.step !== undefined) update.step = patch.step;
      if (patch.cursor !== undefined) update.cursor = patch.cursor;
      if (patch.attempts !== undefined) update.attempts = patch.attempts;
      if (patch.lastError !== undefined) update.last_error = patch.lastError;
      // `!== undefined`, not a truthiness check: `null` is the meaningful value that CLEARS
      // these at a terminal step, and 0 is a legitimate "none done yet".
      if (patch.progressCurrent !== undefined) update.progress_current = patch.progressCurrent;
      if (patch.progressTotal !== undefined) update.progress_total = patch.progressTotal;

      if (patch.addCostUsd != null && patch.addCostUsd > 0) {
        // Read-then-add rather than an atomic increment: PostgREST cannot express
        // `cost_usd = cost_usd + x`, and a job is advanced by exactly one worker at a
        // time (the unique constraint is per source, and the re-driver takes the oldest
        // heartbeat), so there is no concurrent writer to lose an update to.
        const { data, error } = await client.from("ingest_jobs").select("cost_usd").eq("id", jobId).maybeSingle();
        if (error) throw new Error(error.message);
        update.cost_usd = Number(data?.cost_usd ?? 0) + patch.addCostUsd;
      }

      const { error } = await client.from("ingest_jobs").update(update).eq("id", jobId);
      if (error) throw new Error(error.message);
    },

    async loadSource(sourceId) {
      const { data, error } = await client
        .from("sources")
        .select("id, user_id, storage_path, page_count, status")
        .eq("id", sourceId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id,
        userId: data.user_id,
        storagePath: data.storage_path,
        pageCount: data.page_count,
        status: data.status,
      } satisfies SourceRow;
    },

    async saveSource(sourceId, patch) {
      const update: Record<string, unknown> = {};
      if (patch.status !== undefined) update.status = patch.status;
      if (patch.pageCount !== undefined) update.page_count = patch.pageCount;
      if (patch.lessonCount !== undefined) update.lesson_count = patch.lessonCount;
      if (Object.keys(update).length === 0) return;
      const { error } = await client.from("sources").update(update).eq("id", sourceId);
      if (error) throw new Error(error.message);
    },

    async downloadSource(storagePath) {
      const { data, error } = await client.storage.from("sources").download(storagePath);
      if (error || !data) throw new Error(`Could not read the source file: ${error?.message ?? "unknown error"}`);
      return new Uint8Array(await data.arrayBuffer());
    },

    async insertPageTexts(userId, sourceId, rows: PageTextRow[]) {
      if (rows.length === 0) return;
      const { error } = await client.from("source_chunks").insert(
        rows.map((row) => ({
          user_id: userId,
          source_id: sourceId,
          text: row.text,
          page_start: row.page,
          page_end: row.page,
          // NEGATIVE: this is a staging page row, not a chunk. See the file header.
          sort_order: -row.page,
        })),
      );
      if (error) throw new Error(error.message);
    },

    async loadPageTexts(sourceId, fromPage, toPage) {
      const { data, error } = await client
        .from("source_chunks")
        .select("text, page_start")
        .eq("source_id", sourceId)
        .lt("sort_order", 0)
        .gte("page_start", fromPage)
        .lte("page_start", toPage)
        .order("page_start", { ascending: true });
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((row: any) => ({ page: row.page_start, text: row.text }));
    },

    async deletePageTexts(sourceId, fromPage, toPage) {
      const { error } = await client
        .from("source_chunks")
        .delete()
        .eq("source_id", sourceId)
        .lt("sort_order", 0)
        .gte("page_start", fromPage)
        .lte("page_start", toPage);
      if (error) throw new Error(error.message);
    },

    async insertSections(userId, sourceId, rows: NewSection[]) {
      if (rows.length === 0) return;
      const { error } = await client.from("source_sections").insert(
        rows.map((row) => ({
          user_id: userId,
          source_id: sourceId,
          title: row.title,
          sort_order: row.sortOrder,
          page_start: row.pageStart,
          page_end: row.pageEnd,
        })),
      );
      if (error) throw new Error(error.message);
    },

    async loadSections(sourceId) {
      const { data, error } = await client
        .from("source_sections")
        .select("id, page_start, page_end")
        .eq("source_id", sourceId)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((row: any) => ({ id: row.id, pageStart: row.page_start, pageEnd: row.page_end } satisfies SectionRow));
    },

    async insertChunks(userId, sourceId, rows: NewChunk[]) {
      if (rows.length === 0) return;
      const { error } = await client.from("source_chunks").insert(
        rows.map((row) => ({
          user_id: userId,
          source_id: sourceId,
          section_id: row.sectionId,
          text: row.text,
          page_start: row.pageStart,
          page_end: row.pageEnd,
          sort_order: row.sortOrder,
        })),
      );
      if (error) throw new Error(error.message);
    },

    async loadChunksAfter(sourceId, afterChunkId, limit) {
      const { data, error } = await client
        .from("source_chunks")
        .select("id, text, page_start, page_end")
        .eq("source_id", sourceId)
        .gte("sort_order", 0)
        .gt("id", afterChunkId)
        .order("id", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((row: any) => ({ id: row.id, text: row.text, pageStart: row.page_start, pageEnd: row.page_end } satisfies ChunkRow));
    },

    async loadChunksWithoutEmbedding(sourceId, limit) {
      const { data, error } = await client
        .from("source_chunks")
        .select("id, text, page_start, page_end")
        .eq("source_id", sourceId)
        .gte("sort_order", 0)
        .is("embedding", null)
        .order("id", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((row: any) => ({ id: row.id, text: row.text, pageStart: row.page_start, pageEnd: row.page_end } satisfies ChunkRow));
    },

    async countChunks(sourceId) {
      const { count, error } = await client
        .from("source_chunks")
        .select("id", { count: "exact", head: true })
        .eq("source_id", sourceId)
        .gte("sort_order", 0);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async saveChunkEmbeddings(updates) {
      // One statement per row: PostgREST's bulk upsert would need every non-null column
      // restated, and restating `text` to write a vector is how a chunk's text gets
      // silently rewritten by a bug in the mapping.
      for (const update of updates) {
        const { error } = await client
          .from("source_chunks")
          .update({ embedding: JSON.stringify(update.embedding) })
          .eq("id", update.id);
        if (error) throw new Error(error.message);
      }
    },

    async insertCandidateLessons(userId, sourceId, rows: NewCandidateLesson[]) {
      if (rows.length === 0) return;
      const { error } = await client.from("lessons").insert(
        rows.map((row) => ({
          user_id: userId,
          source_id: sourceId,
          section_id: row.sectionId,
          title: row.title,
          core_claim: row.coreClaim,
          mechanism: row.mechanism,
          claim_to_task: row.claimToTask,
          evidence_strength: row.evidenceStrength,
          // Already verified against the chunk text by provenance.ts. The NOT NULL
          // constraint is the second lock, not the first.
          provenance_quote: row.provenanceQuote,
          page_ref: row.pageRef,
          // pgvector takes the JSON-array text form over PostgREST. Null on the D41 path.
          embedding: row.embedding ? JSON.stringify(row.embedding) : null,
          // A CANDIDATE, and readable as one from this moment (ULM ADR-010). `merging`
          // promotes the survivors to 'active' and archives the rest — never deletes.
          status: "provisional",
        })),
      );
      if (error) throw new Error(error.message);
    },

    async loadCandidateLessons(sourceId) {
      const { data, error } = await client
        .from("lessons")
        .select("id, title, core_claim, page_ref, embedding")
        .eq("source_id", sourceId)
        .eq("status", "provisional")
        .order("id", { ascending: true });
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title,
        coreClaim: row.core_claim,
        pageRef: row.page_ref,
        embedding: parseVector(row.embedding),
      } satisfies CandidateLessonRow));
    },

    async countCandidateLessons(sourceId) {
      const { count, error } = await client
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("source_id", sourceId)
        .eq("status", "provisional");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async countLessonsWithCards(sourceId) {
      // `lesson_cards!inner` on a head+count query is a semi-join: PostgREST counts LESSON rows
      // that have at least one matching card, not cards. Counting cards here would let two
      // lessons with five cards each satisfy a ten-lesson gate.
      const { count, error } = await client
        .from("lessons")
        .select("id, lesson_cards!inner(id)", { count: "exact", head: true })
        .eq("source_id", sourceId)
        .neq("status", "archived")
        .eq("lesson_cards.active", true)
        .is("lesson_cards.suspended_at", null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async promoteLessons(ids) {
      if (ids.length === 0) return;
      const { error } = await client.from("lessons").update({ status: "active" }).in("id", ids);
      if (error) throw new Error(error.message);
    },

    async archiveLessons(ids) {
      if (ids.length === 0) return;
      // UPDATE, not DELETE. A review of a card belonging to a lesson that loses a dedup contest
      // has to stay referentially intact; migration 60's trigger suspends the cards.
      const { error } = await client.from("lessons").update({ status: "archived" }).in("id", ids);
      if (error) throw new Error(error.message);
    },

    async loadBudgetCeilingUsd(profileId) {
      const { data, error } = await client
        .from("profiles")
        .select("llm_monthly_budget_usd")
        .eq("id", profileId)
        .single();
      if (error) throw new Error(error.message);
      return Number(data.llm_monthly_budget_usd);
    },
  };
}
