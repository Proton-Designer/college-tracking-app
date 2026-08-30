// An in-memory IngestRepo. Not a mock that records calls — a real, working
// implementation of the same contract supabaseRepo.ts implements, so the state machine's
// tests exercise genuine read-after-write behaviour (a cursor written by one invocation
// really is what the next invocation reads) rather than a script of canned answers.
//
// No database is reachable on this machine, and the driver is the piece most worth
// testing. This is how it gets tested.

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
} from "../repo.ts";

interface StoredChunk {
  id: number;
  /** Reproduces the NOT NULL `user_id` every migration-54 table carries. A fake that let
   *  an unowned row through would hide exactly the bug this records. */
  userId: string;
  sourceId: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  sortOrder: number;
  sectionId: number | null;
  embedding: number[] | null;
}

interface StoredLesson extends NewCandidateLesson {
  id: number;
  userId: string;
  sourceId: number;
  active: boolean;
}

interface StoredSection extends NewSection {
  id: number;
  userId: string;
  sourceId: number;
}

export interface MemoryRepoState {
  jobs: Map<number, IngestJobRow & { heartbeatAt: Date; lastError: string | null }>;
  sources: Map<number, SourceRow & { lessonCount: number }>;
  chunks: StoredChunk[];
  sections: StoredSection[];
  lessons: StoredLesson[];
  files: Map<string, Uint8Array>;
  budgetCeilingUsd: number;
}

export interface MemoryRepo extends IngestRepo {
  state: MemoryRepoState;
  /** Real chunks only — what the extraction step would see. */
  realChunks(): StoredChunk[];
  /** Staging page rows — negative sort_order. */
  pageRows(): StoredChunk[];
}

export function createMemoryRepo(options: {
  userId?: string;
  jobId?: number;
  sourceId?: number;
  storagePath?: string | null;
  pageCount?: number | null;
  budgetCeilingUsd?: number;
  fileBytes?: Uint8Array;
} = {}): MemoryRepo {
  const userId = options.userId ?? "user-1";
  const jobId = options.jobId ?? 1;
  const sourceId = options.sourceId ?? 10;
  const storagePath = options.storagePath === undefined ? `${userId}/book.pdf` : options.storagePath;

  const state: MemoryRepoState = {
    jobs: new Map([[
      jobId,
      {
        id: jobId,
        userId,
        sourceId,
        step: "queued",
        cursor: {},
        attempts: 0,
        costUsd: 0,
        heartbeatAt: new Date("2026-08-30T00:00:00Z"),
        lastError: null,
      },
    ]]),
    sources: new Map([[
      sourceId,
      { id: sourceId, userId, storagePath, pageCount: options.pageCount ?? null, status: "uploaded", lessonCount: 0 },
    ]]),
    chunks: [],
    sections: [],
    lessons: [],
    files: new Map(storagePath ? [[storagePath, options.fileBytes ?? new Uint8Array([1, 2, 3])]] : []),
    budgetCeilingUsd: options.budgetCeilingUsd ?? 20,
  };

  /** Postgres would reject `user_id = ''` against a uuid column; the fake rejects it too,
   *  so an unowned write fails a test instead of failing in production. */
  function requireOwner(owner: string): void {
    if (owner == null || owner.trim().length === 0) {
      throw new Error("user_id must not be empty — every migration-54 table has NOT NULL user_id");
    }
  }

  let nextChunkId = 1;
  let nextSectionId = 1;
  let nextLessonId = 1;

  const realChunks = () => state.chunks.filter((c) => c.sortOrder >= 0);
  const pageRows = () => state.chunks.filter((c) => c.sortOrder < 0);

  return {
    state,
    realChunks,
    pageRows,

    loadJob(id) {
      const job = state.jobs.get(id);
      if (!job) return Promise.resolve(null);
      // A copy: the driver must never be able to mutate stored state by accident, which
      // is exactly the bug a shared object would hide.
      return Promise.resolve({ ...job, cursor: { ...job.cursor } });
    },

    findStalledJobs(staleBefore, limit) {
      const terminal = new Set(["done", "failed"]);
      const stalled = [...state.jobs.values()]
        .filter((job) => !terminal.has(job.step) && job.heartbeatAt < staleBefore)
        .sort((a, b) => a.heartbeatAt.getTime() - b.heartbeatAt.getTime())
        .slice(0, limit)
        .map((job) => ({ ...job, cursor: { ...job.cursor } }));
      return Promise.resolve(stalled);
    },

    saveJob(id: number, patch: JobPatch) {
      const job = state.jobs.get(id);
      if (!job) throw new Error(`no job ${id}`);
      if (patch.step !== undefined) job.step = patch.step;
      if (patch.cursor !== undefined) job.cursor = { ...patch.cursor };
      if (patch.attempts !== undefined) job.attempts = patch.attempts;
      if (patch.lastError !== undefined) job.lastError = patch.lastError;
      if (patch.addCostUsd != null) job.costUsd += patch.addCostUsd;
      job.heartbeatAt = new Date(job.heartbeatAt.getTime() + 1000);
      return Promise.resolve();
    },

    loadSource(id) {
      const source = state.sources.get(id);
      return Promise.resolve(source ? { ...source } : null);
    },

    saveSource(id, patch) {
      const source = state.sources.get(id);
      if (!source) throw new Error(`no source ${id}`);
      if (patch.status !== undefined) source.status = patch.status;
      if (patch.pageCount !== undefined) source.pageCount = patch.pageCount;
      if (patch.lessonCount !== undefined) source.lessonCount = patch.lessonCount;
      return Promise.resolve();
    },

    downloadSource(path) {
      const bytes = state.files.get(path);
      if (!bytes) throw new Error(`no stored file at ${path}`);
      return Promise.resolve(bytes);
    },

    insertPageTexts(owner: string, source: number, rows: PageTextRow[]) {
      requireOwner(owner);
      for (const row of rows) {
        state.chunks.push({
          id: nextChunkId++,
          userId: owner,
          sourceId: source,
          text: row.text,
          pageStart: row.page,
          pageEnd: row.page,
          sortOrder: -row.page,
          sectionId: null,
          embedding: null,
        });
      }
      return Promise.resolve();
    },

    loadPageTexts(source, fromPage, toPage) {
      const rows = pageRows()
        .filter((c) => c.sourceId === source && c.pageStart >= fromPage && c.pageStart <= toPage)
        .sort((a, b) => a.pageStart - b.pageStart)
        .map((c) => ({ page: c.pageStart, text: c.text }));
      return Promise.resolve(rows);
    },

    deletePageTexts(source, fromPage, toPage) {
      state.chunks = state.chunks.filter(
        (c) => !(c.sortOrder < 0 && c.sourceId === source && c.pageStart >= fromPage && c.pageStart <= toPage),
      );
      return Promise.resolve();
    },

    insertSections(owner: string, source: number, rows: NewSection[]) {
      requireOwner(owner);
      for (const row of rows) state.sections.push({ ...row, id: nextSectionId++, userId: owner, sourceId: source });
      return Promise.resolve();
    },

    loadSections(source) {
      const rows: SectionRow[] = state.sections
        .filter((s) => s.sourceId === source)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ id: s.id, pageStart: s.pageStart, pageEnd: s.pageEnd }));
      return Promise.resolve(rows);
    },

    insertChunks(owner: string, source: number, rows: NewChunk[]) {
      requireOwner(owner);
      for (const row of rows) {
        state.chunks.push({
          id: nextChunkId++,
          userId: owner,
          sourceId: source,
          text: row.text,
          pageStart: row.pageStart,
          pageEnd: row.pageEnd,
          sortOrder: row.sortOrder,
          sectionId: row.sectionId,
          embedding: null,
        });
      }
      return Promise.resolve();
    },

    loadChunksAfter(source, afterChunkId, limit) {
      const rows: ChunkRow[] = realChunks()
        .filter((c) => c.sourceId === source && c.id > afterChunkId)
        .sort((a, b) => a.id - b.id)
        .slice(0, limit)
        .map((c) => ({ id: c.id, text: c.text, pageStart: c.pageStart, pageEnd: c.pageEnd }));
      return Promise.resolve(rows);
    },

    loadChunksWithoutEmbedding(source, limit) {
      const rows: ChunkRow[] = realChunks()
        .filter((c) => c.sourceId === source && c.embedding == null)
        .sort((a, b) => a.id - b.id)
        .slice(0, limit)
        .map((c) => ({ id: c.id, text: c.text, pageStart: c.pageStart, pageEnd: c.pageEnd }));
      return Promise.resolve(rows);
    },

    saveChunkEmbeddings(updates) {
      for (const update of updates) {
        const chunk = state.chunks.find((c) => c.id === update.id);
        if (chunk) chunk.embedding = update.embedding;
      }
      return Promise.resolve();
    },

    insertCandidateLessons(owner: string, source: number, rows: NewCandidateLesson[]) {
      requireOwner(owner);
      for (const row of rows) {
        // The schema's NOT NULL / not-blank constraints, reproduced: a fake that accepts
        // what Postgres would reject is a fake that hides the bug.
        if (row.provenanceQuote == null || row.provenanceQuote.trim().length === 0) {
          throw new Error("lessons_provenance_not_blank violated");
        }
        state.lessons.push({ ...row, id: nextLessonId++, userId: owner, sourceId: source, active: false });
      }
      return Promise.resolve();
    },

    loadCandidateLessons(source) {
      const rows: CandidateLessonRow[] = state.lessons
        .filter((l) => l.sourceId === source && !l.active)
        .sort((a, b) => a.id - b.id)
        .map((l) => ({ id: l.id, title: l.title, coreClaim: l.coreClaim, pageRef: l.pageRef, embedding: l.embedding }));
      return Promise.resolve(rows);
    },

    countCandidateLessons(source) {
      return Promise.resolve(state.lessons.filter((l) => l.sourceId === source && !l.active).length);
    },

    activateLessons(ids) {
      for (const lesson of state.lessons) if (ids.includes(lesson.id)) lesson.active = true;
      return Promise.resolve();
    },

    deleteLessons(ids) {
      state.lessons = state.lessons.filter((l) => !ids.includes(l.id));
      return Promise.resolve();
    },

    loadBudgetCeilingUsd() {
      return Promise.resolve(state.budgetCeilingUsd);
    },
  };
}
