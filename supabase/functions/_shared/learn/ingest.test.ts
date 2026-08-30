import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { advanceIngestJob, redriveStalledJobs, type IngestDeps } from "./ingest.ts";
import { createMemoryRepo, type MemoryRepo } from "./__fixtures__/memoryRepo.ts";
import { createDeterministicEmbeddingsProvider } from "../embeddings/__fixtures__/fixtureEmbeddingsProvider.ts";
import type { GatewayDeps } from "../llm/gateway.ts";
import type { LlmProvider, LlmToolCallRequest, UsageLogEntry } from "../llm/types.ts";
import type { PdfPageRangeResult } from "./pdfPages.ts";

// ============================================================================
// A model that answers by ROLE, and quotes the passage it was actually given
// ============================================================================

interface RoutingOptions {
  /** Which of the passages triage keeps. Default: all. */
  triageKeeps?: (index: number) => boolean;
  /** How the extractor builds its quote from the chunk it was handed. Default: a genuine
   *  verbatim slice. Override to simulate a hallucinated citation. */
  quoteFor?: (chunkText: string) => string;
  lessonsPerChunk?: number;
}

function createRoutingProvider(options: RoutingOptions = {}): LlmProvider & { seen: () => LlmToolCallRequest[] } {
  const seen: LlmToolCallRequest[] = [];
  const quoteFor = options.quoteFor ?? ((text: string) => text.slice(0, 120));
  const lessonsPerChunk = options.lessonsPerChunk ?? 1;

  return {
    seen: () => seen,
    call(request: LlmToolCallRequest) {
      seen.push(request);
      const usage = { inputTokens: 900, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 };

      if (request.callType === "lesson_triage") {
        const count = (request.userContent.match(/<<PASSAGE \d+>>/g) ?? []).length;
        const chunks = Array.from({ length: count }, (_, index) => ({
          index,
          hasLessons: options.triageKeeps ? options.triageKeeps(index) : true,
        }));
        return Promise.resolve({ toolInput: { chunks }, usage, latencyMs: 5 });
      }

      if (request.callType === "lesson_extraction") {
        // These have to survive the write-time gates, which is the point: a fixture that would
        // be rejected in production is not modelling production. The first version of this
        // generator echoed a slice of the chunk back as the claim, which is precisely the
        // selection-not-transformation failure `passesClaimNotQuote` exists to catch -- so the
        // gates rejected every synthetic lesson and the pipeline tests went red. The gates were
        // right; the fixture was lying about what a model returns.
        const lessons = Array.from({ length: lessonsPerChunk }, (_, i) => ({
          title: `Rehearse the idea instead of rereading it (${i})`,
          coreClaim: `Deliberate rehearsal beats passive review because retrieval strengthens memory (${i}).`,
          mechanism: null,
          claimToTask: "Try it once this week.",
          evidenceStrength: "single_study",
          provenanceQuote: quoteFor(request.userContent),
        }));
        return Promise.resolve({ toolInput: { lessons }, usage, latencyMs: 5 });
      }

      if (request.callType === "lesson_merge") {
        const payload = JSON.parse(request.userContent) as { candidates: Array<{ id: number }> };
        const keep = payload.candidates.map((candidate, index) => ({ id: candidate.id, rank: index + 1 }));
        return Promise.resolve({ toolInput: { keep }, usage, latencyMs: 5 });
      }

      return Promise.reject(new Error(`unexpected callType ${request.callType}`));
    },
  };
}

function makeGateway(provider: LlmProvider, logged: UsageLogEntry[]): GatewayDeps {
  return {
    provider,
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: (entry) => {
      logged.push(entry);
      return Promise.resolve();
    },
    now: () => new Date("2026-08-30T00:00:00Z"),
  };
}

// ============================================================================
// A book made of real prose, so chunk text and quotes are real strings
// ============================================================================

const PARAGRAPH = [
  "Habits are the compound interest of self-improvement and their effects multiply",
  "quietly across months. A change that seems trivial on any single day becomes",
  "decisive across a year, which is why the size of the first step matters far less",
  "than whether the step is repeatable at all. Reduce the starting friction until",
  "refusing takes more effort than beginning.",
].join(" ");

function fakeBook(pageCount: number): (bytes: Uint8Array, from: number, to: number) => Promise<PdfPageRangeResult> {
  return (_bytes, from, to) => {
    const pages = [];
    for (let page = Math.max(1, from); page <= Math.min(pageCount, to); page++) {
      pages.push({
        page,
        text: page % 5 === 1
          ? `Chapter ${Math.ceil(page / 5)}: Beginning Small\n${PARAGRAPH} Page ${page} adds its own sentence about deliberate practice.`
          : `${PARAGRAPH} Page ${page} adds its own sentence about deliberate practice.`,
      });
    }
    return Promise.resolve({ pageCount, pages });
  };
}

function makeDeps(
  repo: MemoryRepo,
  overrides: Partial<IngestDeps> = {},
  pageCount = 12,
  logged: UsageLogEntry[] = [],
): IngestDeps {
  return {
    repo,
    gateway: makeGateway(createRoutingProvider(), logged),
    embeddings: null,
    extractPages: fakeBook(pageCount) as IngestDeps["extractPages"],
    logUsage: (entry) => {
      logged.push(entry);
      return Promise.resolve();
    },
    now: () => new Date("2026-08-30T00:00:00Z"),
    ...overrides,
  };
}

/** Drive the machine the way the cron does: one invocation, one step, repeat. */
async function driveToCompletion(deps: IngestDeps, jobId = 1, maxInvocations = 400) {
  const steps: string[] = [];
  for (let i = 0; i < maxInvocations; i++) {
    const outcome = await advanceIngestJob(deps, jobId);
    steps.push(outcome.kind === "advanced" ? outcome.step : outcome.kind);
    if (outcome.kind === "failed" || outcome.kind === "done" || outcome.kind === "blocked" || outcome.kind === "notFound") break;
    if (outcome.kind === "advanced" && !outcome.moreWork) break;
  }
  return steps;
}

// ============================================================================
// The state machine
// ============================================================================

Deno.test("advanceIngestJob: ONE invocation advances ONE step and returns", async () => {
  const repo = createMemoryRepo();
  const deps = makeDeps(repo);

  const first = await advanceIngestJob(deps, 1);
  assertEquals(first, { kind: "advanced", step: "extracting_text", moreWork: true, note: null });
  assertEquals(repo.state.jobs.get(1)!.step, "extracting_text");
  assertEquals(repo.state.sources.get(10)!.status, "processing");
  // Nothing beyond the first transition happened — no pages, no chunks.
  assertEquals(repo.state.chunks.length, 0);
});

Deno.test("advanceIngestJob: text extraction runs in page-range slices, checkpointing between them", async () => {
  // 60 pages at TEXT_SLICE_PAGES=25 is three slices: 1-25, 26-50, 51-60.
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, {}, 60);

  await advanceIngestJob(deps, 1); // queued -> extracting_text

  const slice1 = await advanceIngestJob(deps, 1);
  assertEquals(slice1.kind, "advanced");
  if (slice1.kind === "advanced") {
    assertEquals(slice1.step, "extracting_text", "the STEP does not move while a slice remains");
    assertStringIncludes(slice1.note ?? "", "pages 1-25 of 60");
  }
  assertEquals(repo.pageRows().length, 25);
  assertEquals(repo.state.jobs.get(1)!.cursor.nextPage, 26, "the cursor is the resume point");
  assertEquals(repo.state.sources.get(10)!.pageCount, 60, "the real page count comes from the document");

  await advanceIngestJob(deps, 1);
  assertEquals(repo.pageRows().length, 50);
  assertEquals(repo.state.jobs.get(1)!.cursor.nextPage, 51);

  const slice3 = await advanceIngestJob(deps, 1);
  assertEquals(repo.pageRows().length, 60);
  if (slice3.kind === "advanced") assertEquals(slice3.step, "parsing_structure", "the last slice moves the step on");
});

Deno.test("advanceIngestJob: a job resumes from its cursor after an interruption, never from the start", async () => {
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, {}, 60);
  await advanceIngestJob(deps, 1);
  await advanceIngestJob(deps, 1); // pages 1-25

  // Simulate the runtime killing the invocation: a brand-new deps object, no memory of
  // anything except what is in the database.
  const freshDeps = makeDeps(repo, {}, 60);
  await advanceIngestJob(freshDeps, 1);

  assertEquals(repo.pageRows().map((c) => c.pageStart).sort((a, b) => a - b)[0], 1);
  assertEquals(repo.pageRows().length, 50, "pages 1-25 were not re-extracted into duplicates");
});

Deno.test("advanceIngestJob: the full pipeline reaches done with grounded, active lessons", async () => {
  const repo = createMemoryRepo();
  const logged: UsageLogEntry[] = [];
  const deps = makeDeps(repo, {}, 12, logged);

  const steps = await driveToCompletion(deps);

  assertEquals(steps[steps.length - 1], "done");
  assertEquals(repo.state.jobs.get(1)!.step, "done");
  assertEquals(repo.state.sources.get(10)!.status, "ready");

  const lessons = repo.state.lessons;
  assertEquals(lessons.length > 0, true);
  assertEquals(lessons.every((l) => l.active), true, "every surviving lesson is active");
  assertEquals(repo.state.sources.get(10)!.lessonCount, lessons.length, "lesson_count is denormalised, not guessed");

  for (const lesson of lessons) {
    assertEquals(lesson.provenanceQuote.trim().length > 0, true);
  }

  // Every staging page row is gone; only real chunks remain.
  assertEquals(repo.pageRows().length, 0);
  assertEquals(repo.realChunks().length > 0, true);
  assertEquals(repo.state.jobs.get(1)!.costUsd > 0, true, "spend is accumulated on the job, per migration 54");
});

Deno.test("advanceIngestJob: page-text staging rows are never handed to the extraction model", async () => {
  const repo = createMemoryRepo();
  const provider = createRoutingProvider();
  const deps = makeDeps(repo, { gateway: makeGateway(provider, []) }, 12);
  await driveToCompletion(deps);

  const chunkTexts = new Set(repo.realChunks().map((c) => c.text));
  const extractionInputs = provider.seen().filter((r) => r.callType === "lesson_extraction").map((r) => r.userContent);
  assertEquals(extractionInputs.length > 0, true);
  for (const input of extractionInputs) {
    assertEquals(chunkTexts.has(input), true, "the model must only ever see real chunks");
  }
});

// ============================================================================
// THE PROVENANCE GATE, at the pipeline level
// ============================================================================

Deno.test("advanceIngestJob: a model that fabricates every quote produces ZERO lessons and a failed job", async () => {
  const repo = createMemoryRepo();
  const provider = createRoutingProvider({
    // Fluent, plausible, and nowhere in the chunk it was given.
    quoteFor: () => "The author is unambiguous that willpower is a finite resource depleted by every trivial decision.",
  });
  const deps = makeDeps(repo, { gateway: makeGateway(provider, []) }, 12);

  const steps = await driveToCompletion(deps);

  assertEquals(steps[steps.length - 1], "failed");
  assertEquals(repo.state.lessons.length, 0, "not one ungrounded lesson reached the table");
  assertEquals(repo.state.sources.get(10)!.status, "failed");
  assertStringIncludes(repo.state.jobs.get(1)!.lastError ?? "", "verbatim passage");
  assertEquals(repo.state.sources.get(10)!.lessonCount, 0, "a source that grounded nothing is not 'ready with zero'");
});

Deno.test("advanceIngestJob: with a mix of real and fabricated quotes, only the grounded lessons survive", async () => {
  const repo = createMemoryRepo();
  let call = 0;
  const provider = createRoutingProvider({
    lessonsPerChunk: 2,
    quoteFor: (chunkText) => (call++ % 2 === 0 ? chunkText.slice(0, 120) : "A sentence this book does not contain anywhere at all."),
  });
  const deps = makeDeps(repo, { gateway: makeGateway(provider, []) }, 12);

  await driveToCompletion(deps);

  assertEquals(repo.state.lessons.length > 0, true);
  const chunkTexts = repo.realChunks().map((c) => c.text);
  for (const lesson of repo.state.lessons) {
    const grounded = chunkTexts.some((text) => text.includes(lesson.provenanceQuote));
    assertEquals(grounded, true, `stored quote must appear in a chunk: ${lesson.provenanceQuote.slice(0, 60)}`);
  }
});

// ============================================================================
// D41 — the no-VOYAGE_API_KEY path
// ============================================================================

Deno.test("advanceIngestJob: with NO embeddings provider, ingestion completes and records WHY", async () => {
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, { embeddings: null }, 12);

  const steps = await driveToCompletion(deps);

  assertEquals(steps[steps.length - 1], "done", "an absent key must not stop ingestion");
  assertEquals(repo.realChunks().every((c) => c.embedding == null), true, "embedding stays null, as migration 54 expects");
  assertEquals(repo.state.lessons.length > 0, true, "lessons are still stored");

  const cursor = repo.state.jobs.get(1)!.cursor;
  assertEquals(cursor.embeddingsSkipped, true);
  assertStringIncludes(String(cursor.embeddingsSkippedReason), "VOYAGE_API_KEY");
  assertEquals(cursor.similarityMetric, "lexical", "the merge pass degraded to lexical similarity, as D41 specifies");
  assertEquals(repo.state.jobs.get(1)!.lastError, null, "an absent key is a STATE, never an error");
});

Deno.test("advanceIngestJob: WITH an embeddings provider, chunks are embedded and clustering uses cosine", async () => {
  const repo = createMemoryRepo();
  const embeddings = createDeterministicEmbeddingsProvider();
  const logged: UsageLogEntry[] = [];
  const deps = makeDeps(repo, { embeddings }, 12, logged);

  const steps = await driveToCompletion(deps);

  assertEquals(steps[steps.length - 1], "done");
  assertEquals(repo.realChunks().every((c) => c.embedding != null), true);
  assertEquals(repo.realChunks()[0]!.embedding!.length, 1024, "the stored width must match vector(1024)");

  const voyageRows = logged.filter((entry) => entry.provider === "voyage");
  assertEquals(voyageRows.length > 0, true, "Voyage spend must reach the same ledger the budget gate sums");
  assertEquals(voyageRows[0]!.callType, "lesson_embedding");
  assertEquals(voyageRows[0]!.model, "voyage-3.5-lite");
  assertEquals(voyageRows[0]!.usage.outputTokens, 0, "an embedding call has no output side");
});

Deno.test("advanceIngestJob: the SAME pipeline runs with and without the key — only the metric differs", async () => {
  // The D41 claim, as a test: supplying the key must not switch on a code path that has
  // never run. Both runs walk the same steps and produce the same lessons.
  const withoutKey = createMemoryRepo();
  await driveToCompletion(makeDeps(withoutKey, { embeddings: null }, 12));

  const withKey = createMemoryRepo();
  await driveToCompletion(makeDeps(withKey, { embeddings: createDeterministicEmbeddingsProvider() }, 12));

  assertEquals(withoutKey.state.jobs.get(1)!.step, "done");
  assertEquals(withKey.state.jobs.get(1)!.step, "done");
  assertEquals(
    withoutKey.state.lessons.map((l) => l.title),
    withKey.state.lessons.map((l) => l.title),
  );
  assertEquals(withoutKey.state.jobs.get(1)!.cursor.similarityMetric, "lexical");
  assertEquals(withKey.state.jobs.get(1)!.cursor.similarityMetric, "cosine");
});

Deno.test("advanceIngestJob: a TRANSIENT embeddings failure retries; it is not treated as an absent key", async () => {
  const repo = createMemoryRepo();
  const flaky = {
    model: "voyage-3.5-lite" as const,
    dimensions: 1024,
    embed: () =>
      Promise.resolve({ kind: "deterministicFallback" as const, reason: "provider_status_503", keyAbsent: false }),
  };
  const deps = makeDeps(repo, { embeddings: flaky }, 12);

  // Walk to the embedding step.
  let outcome = await advanceIngestJob(deps, 1);
  while (outcome.kind === "advanced" && outcome.step !== "embedding") {
    outcome = await advanceIngestJob(deps, 1);
  }
  const retry = await advanceIngestJob(deps, 1);

  assertEquals(retry.kind, "retry");
  if (retry.kind === "retry") {
    assertEquals(retry.attempts, 1);
    assertStringIncludes(retry.reason, "503");
  }
  assertEquals(repo.state.jobs.get(1)!.step, "embedding", "a retryable failure does NOT skip the step");
});

// ============================================================================
// Missing Anthropic key, failure ladder, cron re-drive
// ============================================================================

Deno.test("advanceIngestJob: no Anthropic key BLOCKS at extraction — not failed, no attempt burned", async () => {
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, { gateway: null }, 12);

  let outcome = await advanceIngestJob(deps, 1);
  while (outcome.kind === "advanced" && outcome.step !== "extracting_lessons") {
    outcome = await advanceIngestJob(deps, 1);
  }
  const blocked = await advanceIngestJob(deps, 1);

  assertEquals(blocked.kind, "blocked");
  assertEquals(repo.state.jobs.get(1)!.step, "extracting_lessons", "the job waits where it is");
  assertEquals(repo.state.jobs.get(1)!.attempts, 0, "a server misconfiguration is not the job's fault");
  assertStringIncludes(repo.state.jobs.get(1)!.lastError ?? "", "Anthropic API key");

  // The moment a key exists, the SAME job resumes from the same cursor.
  const configured = makeDeps(repo, {}, 12);
  const resumed = await advanceIngestJob(configured, 1);
  assertEquals(resumed.kind, "advanced");
});

Deno.test("advanceIngestJob: a source with no stored file fails immediately rather than retrying a download of nothing", async () => {
  const repo = createMemoryRepo({ storagePath: null });
  const outcome = await advanceIngestJob(makeDeps(repo), 1);

  assertEquals(outcome.kind, "failed");
  assertEquals(repo.state.jobs.get(1)!.step, "failed");
  assertEquals(repo.state.sources.get(10)!.status, "failed");
});

Deno.test("advanceIngestJob: repeated step failures climb the attempt ladder, then fail the job", async () => {
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, {
    extractPages: (() => Promise.reject(new Error("pdf worker died"))) as IngestDeps["extractPages"],
  });

  await advanceIngestJob(deps, 1); // queued -> extracting_text

  const outcomes = [];
  for (let i = 0; i < 5; i++) outcomes.push(await advanceIngestJob(deps, 1));

  assertEquals(outcomes.slice(0, 4).map((o) => o.kind), ["retry", "retry", "retry", "retry"]);
  assertEquals(outcomes[4]!.kind, "failed");
  assertEquals(repo.state.jobs.get(1)!.step, "failed");
  assertStringIncludes(repo.state.jobs.get(1)!.lastError ?? "", "pdf worker died");
  assertEquals(repo.state.sources.get(10)!.status, "failed");
});

Deno.test("redriveStalledJobs: picks up an old heartbeat, advances it ONE step, and leaves fresh jobs alone", async () => {
  const repo = createMemoryRepo();
  repo.state.jobs.set(2, {
    id: 2,
    userId: "user-1",
    sourceId: 10,
    step: "queued",
    cursor: {},
    attempts: 0,
    costUsd: 0,
    heartbeatAt: new Date("2026-08-30T12:00:00Z"), // fresh
    lastError: null,
  });
  const deps = makeDeps(repo);

  const results = await redriveStalledJobs(deps, new Date("2026-08-30T06:00:00Z"), 10);

  assertEquals(results.map((r) => r.jobId), [1], "only the stalled job is re-driven");
  assertEquals(repo.state.jobs.get(1)!.step, "extracting_text");
  assertEquals(repo.state.jobs.get(2)!.step, "queued", "a fresh job is not touched");
});

Deno.test("redriveStalledJobs: terminal jobs are never re-driven", async () => {
  const repo = createMemoryRepo();
  repo.state.jobs.get(1)!.step = "done";
  const results = await redriveStalledJobs(makeDeps(repo), new Date("2030-01-01T00:00:00Z"), 10);
  assertEquals(results, []);
});

Deno.test("advanceIngestJob: every row written carries the JOB's owner, not the caller's", async () => {
  // The cron re-driver runs as service_role across every user's jobs and has no caller
  // identity of its own. Every insert must therefore be owned by `job.userId`. The
  // memory repo refuses an empty owner the way a NOT NULL uuid column would, so a
  // regression here fails loudly instead of writing mis-owned rows.
  const repo = createMemoryRepo({ userId: "owner-abc" });
  await driveToCompletion(makeDeps(repo, { embeddings: createDeterministicEmbeddingsProvider() }, 12));

  assertEquals(repo.state.jobs.get(1)!.step, "done");
  assertEquals(repo.state.chunks.every((c) => c.userId === "owner-abc"), true);
  assertEquals(repo.state.sections.every((s) => s.userId === "owner-abc"), true);
  assertEquals(repo.state.lessons.every((l) => l.userId === "owner-abc"), true);
  assertEquals(repo.state.lessons.length > 0, true);
});

Deno.test("advanceIngestJob: triage keeps the passages it says to and skips the rest", async () => {
  const repo = createMemoryRepo();
  const provider = createRoutingProvider({ triageKeeps: (index) => index === 0 });
  const deps = makeDeps(repo, { gateway: makeGateway(provider, []) }, 12);

  await driveToCompletion(deps);

  const triageCalls = provider.seen().filter((r) => r.callType === "lesson_triage").length;
  const extractionCalls = provider.seen().filter((r) => r.callType === "lesson_extraction").length;
  assertEquals(triageCalls > 0, true);
  assertEquals(
    extractionCalls < repo.realChunks().length + triageCalls,
    true,
    "triage must actually keep the mid-tier model off filtered passages",
  );
});
