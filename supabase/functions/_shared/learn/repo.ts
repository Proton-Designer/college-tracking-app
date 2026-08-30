// The data surface the ingestion state machine needs, as an interface.
//
// WHY AN INTERFACE AND NOT A SUPABASE CLIENT. The driver in ingest.ts is the piece whose
// correctness matters most and is hardest to reason about — eight steps, a checkpointed
// cursor, a retry ladder, three degrade paths. It has to be testable without a database,
// and no database is reachable on this machine at all. Handing it a hand-rolled fake of
// PostgREST's chained builder (`.from().select().eq().order().range()`) would mean the
// driver's tests mostly test the fake. Behind this interface an in-memory repo is 150
// honest lines, and supabaseRepo.ts is the only file that has to know what a PostgREST
// chain looks like.
//
// Every method is user-scoped by the client it is built on (the Supabase implementation
// runs as the calling user under RLS, or as service_role for cron re-drives, which then
// passes user_id explicitly) — D18's "scope every query" rule, made structural.

export type IngestStep =
  | "queued"
  | "extracting_text"
  | "parsing_structure"
  | "chunking"
  | "embedding"
  | "extracting_lessons"
  | "merging"
  /** One slice of surviving lessons per invocation gets its cards written. Migration 54's
   *  enum comment has the full reasoning for why this is a step rather than the tail of
   *  `merging`. */
  | "generating_cards"
  | "done"
  | "failed";

export interface IngestJobRow {
  id: number;
  userId: string;
  sourceId: number;
  step: IngestStep;
  cursor: Record<string, unknown>;
  attempts: number;
  costUsd: number;
}

export interface SourceRow {
  id: number;
  userId: string;
  /** Null once the raw upload has been dropped (migration 54 allows retaining a source
   *  only as its lessons). Ingestion cannot start from that state and says so. */
  storagePath: string | null;
  pageCount: number | null;
  status: string;
}

export interface PageTextRow {
  page: number;
  text: string;
}

export interface SectionRow {
  id: number;
  pageStart: number | null;
  pageEnd: number | null;
}

export interface ChunkRow {
  id: number;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
}

export interface CandidateLessonRow {
  id: number;
  title: string;
  coreClaim: string;
  pageRef: number | null;
  embedding: number[] | null;
}

/**
 * A promoted lesson, as the card-generation step needs it.
 *
 * Wider than `CandidateLessonRow` on purpose, and every extra field earns its place: `mechanism`
 * and `claimToTask` are what a `why` and an `application` card are written FROM, and
 * `provenanceQuote` is what makes a `free_recall` answer answerable from the source rather than
 * from the model's memory. The card writer never sees the chunk text — it works from the lesson,
 * which has already been through the provenance gate.
 */
export interface ActiveLessonRow {
  id: number;
  title: string;
  coreClaim: string;
  mechanism: string | null;
  claimToTask: string | null;
  provenanceQuote: string;
}

export type LessonPromptType = "free_recall" | "application" | "cloze" | "why";

/** One `lesson_cards` row, after every write-time gate has already accepted it. */
export interface NewLessonCard {
  promptType: LessonPromptType;
  prompt: string;
  answer: string;
  sortOrder: number;
}

export interface NewChunk {
  text: string;
  pageStart: number;
  pageEnd: number;
  sortOrder: number;
  sectionId: number | null;
}

export interface NewSection {
  title: string;
  pageStart: number;
  pageEnd: number;
  sortOrder: number;
}

export interface NewCandidateLesson {
  title: string;
  coreClaim: string;
  mechanism: string | null;
  claimToTask: string | null;
  evidenceStrength: string | null;
  provenanceQuote: string;
  pageRef: number | null;
  sectionId: number | null;
  /** Written at creation when a provider exists, so the merge pass's clustering has
   *  vectors to use. Null on the D41 path, which is what `lessons.embedding` being
   *  nullable is for. */
  embedding: number[] | null;
}

export interface JobPatch {
  step?: IngestStep;
  cursor?: Record<string, unknown>;
  attempts?: number;
  lastError?: string | null;
  /** Added to the existing `cost_usd`, never overwriting it — the column accumulates
   *  spend across every invocation of a job. */
  addCostUsd?: number;
  /** Migration 60's item-level progress, scoped to the CURRENT step's own unit of work and
   *  reset at every step transition. Explicit `null` clears them, which is what a terminal
   *  step does — 'done' and 'failed' have no denominator, and leaving the last step's
   *  numbers behind would show a finished job frozen at "43 of 51". `undefined` leaves
   *  them alone, like every other field here. */
  progressCurrent?: number | null;
  progressTotal?: number | null;
}

export interface IngestRepo {
  loadJob(jobId: number): Promise<IngestJobRow | null>;
  /** Jobs in a non-terminal step whose heartbeat predates `staleBefore` — the cron
   *  re-driver's whole query. */
  findStalledJobs(staleBefore: Date, limit: number): Promise<IngestJobRow[]>;
  /** Always bumps `heartbeat_at`: any write from the driver IS a sign of life. */
  saveJob(jobId: number, patch: JobPatch): Promise<void>;

  loadSource(sourceId: number): Promise<SourceRow | null>;
  saveSource(sourceId: number, patch: { status?: string; pageCount?: number; lessonCount?: number }): Promise<void>;
  downloadSource(storagePath: string): Promise<Uint8Array>;

  // EVERY write takes the owning `userId` EXPLICITLY rather than the repo capturing one
  // at construction. Found the hard way while reviewing the cron path: the re-driver runs
  // as service_role across every user's jobs and has no single caller identity, so a
  // captured owner would have been an empty string on exactly that path — writing
  // `user_id: ''` (a constraint violation at best, a mis-owned row at worst). The driver
  // always has `job.userId`; passing it makes the owner of every row visible at the call
  // site instead of implied by how the repo happened to be built.

  /** `source_chunks` rows holding ONE PAGE of raw text each — the staging form described
   *  in ingest.ts's header. Written by `extracting_text`, consumed and deleted by
   *  `chunking`. */
  insertPageTexts(userId: string, sourceId: number, rows: PageTextRow[]): Promise<void>;
  loadPageTexts(sourceId: number, fromPage: number, toPage: number): Promise<PageTextRow[]>;
  deletePageTexts(sourceId: number, fromPage: number, toPage: number): Promise<void>;

  insertSections(userId: string, sourceId: number, rows: NewSection[]): Promise<void>;
  loadSections(sourceId: number): Promise<SectionRow[]>;

  insertChunks(userId: string, sourceId: number, rows: NewChunk[]): Promise<void>;
  /** Real chunks only (never the page-text staging rows), id-ordered, id > afterId. */
  loadChunksAfter(sourceId: number, afterChunkId: number, limit: number): Promise<ChunkRow[]>;
  loadChunksWithoutEmbedding(sourceId: number, limit: number): Promise<ChunkRow[]>;
  saveChunkEmbeddings(updates: Array<{ id: number; embedding: number[] }>): Promise<void>;

  /** Real chunks for one source (never the page-text staging rows). The denominator for the
   *  embedding and extraction steps' item-level progress. */
  countChunks(sourceId: number): Promise<number>;

  /** Candidates land as `lessons` rows with `status = 'provisional'` — readable immediately,
   *  judged later. See ingest.ts's header for why that, and not a new staging table. */
  insertCandidateLessons(userId: string, sourceId: number, rows: NewCandidateLesson[]): Promise<void>;
  loadCandidateLessons(sourceId: number): Promise<CandidateLessonRow[]>;
  countCandidateLessons(sourceId: number): Promise<number>;
  /**
   * How many of this source's lessons have at least one servable card.
   *
   * The progressive-availability gate (ULM ADR-010): a source becomes `partial` when this
   * reaches `computePartialThreshold(...)`. Counts LESSONS, not cards, deliberately — the
   * question the status answers is "is there a real queue to draw from", and ten cards on
   * two lessons is not a session.
   */
  countLessonsWithCards(sourceId: number): Promise<number>;
  /** Merge survivors: 'provisional' -> 'active'. */
  promoteLessons(ids: number[]): Promise<void>;
  /**
   * Merge losers: 'provisional' -> 'archived'. NEVER deleted — migration 54's `lesson_status`
   * comment has the full reasoning, and migration 60's trigger suspends their cards.
   */
  archiveLessons(ids: number[]): Promise<void>;

  /**
   * Promoted ('active') lessons for one source, id-ordered, id > `afterLessonId`.
   *
   * Keyed by id rather than by offset for the same reason `loadChunksAfter` is: a cursor that
   * counts rows can skip one the moment anything else touches the set, and the merge pass is
   * still archiving losers while this step runs.
   *
   * ARCHIVED LESSONS ARE EXCLUDED, which is the point of running after the merge: a card
   * written for an archived lesson would be suspended by migration 60's trigger the instant it
   * was inserted, so paying a model to write it is pure waste.
   */
  loadActiveLessonsAfter(sourceId: number, afterLessonId: number, limit: number): Promise<ActiveLessonRow[]>;
  /** How many of this source's lessons are 'active' — the denominator for `generating_cards`. */
  countActiveLessons(sourceId: number): Promise<number>;
  /** Writes one lesson's cards. Everything here has already passed the write-time gates. */
  insertCards(userId: string, lessonId: number, rows: NewLessonCard[]): Promise<void>;

  /** `profiles.llm_monthly_budget_usd` — the gateway's ceiling for this user. */
  loadBudgetCeilingUsd(userId: string): Promise<number>;
}
