import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { advanceIngestJob, redriveStalledJobs, type IngestDeps } from "./ingest.ts";
import { CARD_LESSONS_PER_INVOCATION } from "./types.ts";
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
  /**
   * Emit lexically DISTINCT lessons instead of the same one repeatedly.
   *
   * The default extractor returns near-identical text on every call, which is fine for testing
   * the provenance gate and is fatal for anything downstream of the merge: near-identical claims
   * land in ONE similarity cluster, one survivor is promoted, and a book ends with a single
   * active lesson. Every test about carding a real library needs a library, so this returns
   * claims built from disjoint vocabulary.
   */
  distinctLessons?: boolean;
  /** How the card writer answers. Default: cards anchored to whichever claim it was handed. */
  cardsFail?: "leak" | "vague";
}

/**
 * 45 disjoint content words — fifteen lessons of three each, and nothing shared between any two
 * triples. Two claims built from different triples share only the template's own two words, which
 * puts them at 0.25 Jaccard: comfortably under LEXICAL_DUPLICATE_THRESHOLD, so they cluster
 * separately, while two lessons built from the SAME triple score 1.0 and correctly merge.
 */
const TOPIC_BANK = [
  "friction", "rehearsal", "deadlines", "feedback", "attention", "sleeping",
  "ownership", "tempo", "constraints", "rituals", "silence", "drafts",
  "meetings", "budgets", "inventory", "calendars", "mentors", "alliances",
  "prototypes", "checklists", "boundaries", "invoices", "backlog", "referrals",
  "margins", "cadence", "artifacts", "interviews", "retention", "onboarding",
  "salary", "portfolio", "roadmap", "latency", "throughput", "briefings",
  "escalation", "forecasts", "hiring", "contracts", "warranty", "packaging",
  "logistics", "telemetry", "dashboards",
];
const DISTINCT_LESSON_COUNT = TOPIC_BANK.length / 3;

function distinctLessonAt(index: number): { title: string; coreClaim: string } {
  const slot = index % DISTINCT_LESSON_COUNT;
  const [a, b, c] = TOPIC_BANK.slice(slot * 3, slot * 3 + 3);
  return { title: `Guard the ${a}`, coreClaim: `Guard your ${a}; ${b} follows ${c}.` };
}

const GUARD_CLAIM = /^Guard your (\w+); (\w+) follows (\w+)\.$/;

/**
 * Cards derived from the claim the writer was actually handed, so they sit inside THE BAND for
 * whichever lesson this is: each prompt reuses that claim's own topic words (clearing the
 * topicality floor) and shares not one content word with its own answer (clearing anti-leak's
 * ceiling). A fixture that ignored the claim would only pass while topicality was unchecked.
 */
function cardsForClaim(coreClaim: string) {
  const guard = GUARD_CLAIM.exec(coreClaim);
  if (guard) {
    const [, a, b, c] = guard;
    return [
      {
        promptType: "free_recall",
        prompt: `Between ${a}, ${b} and ${c}, which one do you guard first?`,
        answer: "Protect the earliest of the three; the rest settle themselves once it holds.",
      },
      {
        promptType: "application",
        prompt: `You have one hour: do you guard ${a}, ${b} or ${c}?`,
        answer: "Whichever one the other two depend on; the rest can wait until tomorrow.",
      },
      {
        promptType: "why",
        prompt: `Why does guarding ${a} matter more than chasing ${b} or ${c}?`,
        answer: "Because the other two are downstream of it, and fixing them leaves the source untouched.",
      },
    ];
  }
  return [
    {
      promptType: "free_recall",
      prompt: "In a study session, does deliberate rehearsal or passive review do more for memory?",
      answer: "Pulling the idea back out of your head builds a stronger trace than seeing it again on the page.",
    },
    {
      promptType: "application",
      prompt: "Twenty minutes, one chapter, passive review or deliberate rehearsal?",
      answer: "Spend the block writing down what you remember, then check the page for what you missed.",
    },
    {
      promptType: "why",
      prompt: "Why does deliberate rehearsal beat passive review for memory?",
      answer: "Every act of pulling something back from your head is itself a learning event; looking at the page is not.",
    },
  ];
}

function createRoutingProvider(options: RoutingOptions = {}): LlmProvider & { seen: () => LlmToolCallRequest[] } {
  const seen: LlmToolCallRequest[] = [];
  const quoteFor = options.quoteFor ?? ((text: string) => text.slice(0, 120));
  const lessonsPerChunk = options.lessonsPerChunk ?? 1;
  let lessonSeq = 0;

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
        const lessons = Array.from({ length: lessonsPerChunk }, (_, i) => {
          const shape = options.distinctLessons
            ? distinctLessonAt(lessonSeq++)
            : {
              title: `Rehearse the idea instead of rereading it (${i})`,
              coreClaim: `Deliberate rehearsal beats passive review because retrieval strengthens memory (${i}).`,
            };
          return {
            ...shape,
            mechanism: null,
            claimToTask: "Try it once this week.",
            evidenceStrength: "single_study",
            provenanceQuote: quoteFor(request.userContent),
          };
        });
        return Promise.resolve({ toolInput: { lessons }, usage, latencyMs: 5 });
      }

      // Cards that actually survive the write-time gates, for the same reason the extraction
      // fixture above had to: a fixture whose output production would reject is not modelling
      // production. These sit inside THE BAND deliberately — each prompt reuses the claim's own
      // topic words (so topicality clears its floor) while sharing not one content word with its
      // own answer (so anti-leak clears its ceiling). `cloze` is absent because the model is not
      // permitted to write one; the deterministic rule adds the fourth card.
      if (request.callType === "lesson_card_generation") {
        const { coreClaim } = JSON.parse(request.userContent) as { coreClaim: string };
        if (options.cardsFail === "leak") {
          // Every prompt is its own answer with a question mark on it — the failure ULM measured
          // its keyless card writer at, reproduced deliberately.
          return Promise.resolve({
            toolInput: {
              cards: [
                { promptType: "free_recall", prompt: `${coreClaim.replace(/\.$/, "")}?`, answer: coreClaim },
                { promptType: "application", prompt: `${coreClaim.replace(/\.$/, "")}?`, answer: coreClaim },
                { promptType: "why", prompt: `${coreClaim.replace(/\.$/, "")}?`, answer: coreClaim },
              ],
            },
            usage,
            latencyMs: 5,
          });
        }
        if (options.cardsFail === "vague") {
          return Promise.resolve({
            toolInput: {
              cards: [
                {
                  promptType: "free_recall",
                  prompt: "What is the main idea of the lesson?",
                  answer: "It changes how you spend the next hour, and the one after that.",
                },
                ...cardsForClaim(coreClaim).slice(1),
              ],
            },
            usage,
            latencyMs: 5,
          });
        }
        return Promise.resolve({ toolInput: { cards: cardsForClaim(coreClaim) }, usage, latencyMs: 5 });
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
  // Nothing is deleted by the merge pass any more: survivors are promoted, losers archived.
  assertEquals(lessons.every((l) => l.status === "active" || l.status === "archived"), true);
  assertEquals(lessons.some((l) => l.status === "active"), true, "the merge promoted survivors");
  // ACTIVE lessons, not every row. Archived losers stay in the table (they must — a review
  // may reference their cards) and counting them would inflate the library list.
  assertEquals(
    repo.state.sources.get(10)!.lessonCount,
    lessons.filter((l) => l.status === "active").length,
    "lesson_count is denormalised from the active set, not guessed",
  );

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
    progressCurrent: null,
    progressTotal: null,
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

// ============================================================================
// Progressive availability (ULM ADR-010, addendum §1.1)
// ============================================================================

Deno.test("advanceIngestJob: item-level progress is scoped to the current step and RESET between steps", async () => {
  // The failure this exists to prevent is the one ULM measured: a stage label sitting
  // unchanged for thirteen minutes of a healthy run, indistinguishable from a hung job to
  // the user AND to the operator reading the table.
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, {}, 60);
  const job = () => repo.state.jobs.get(1)!;

  await advanceIngestJob(deps, 1); // queued -> extracting_text
  assertEquals(job().progressCurrent, 0);
  assertEquals(job().progressTotal, null, "the page count is unknown until the first slice reads it");

  await advanceIngestJob(deps, 1); // pages 1-25
  assertEquals(job().progressCurrent, 25);
  assertEquals(job().progressTotal, 60);

  await advanceIngestJob(deps, 1); // pages 26-50
  assertEquals(job().progressCurrent, 50);

  await advanceIngestJob(deps, 1); // pages 51-60, then the step moves on
  assertEquals(job().step, "parsing_structure");
  assertEquals(job().progressCurrent, 0, "reset, not carried: the next step counts its own work");
  assertEquals(job().progressTotal, 60);
});

Deno.test("advanceIngestJob: a finished job clears its progress rather than freezing at N of N", async () => {
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, {}, 12);
  await driveToCompletion(deps);

  assertEquals(repo.state.jobs.get(1)!.step, "done");
  assertEquals(repo.state.jobs.get(1)!.progressCurrent, null);
  assertEquals(repo.state.jobs.get(1)!.progressTotal, null);
});

Deno.test("advanceIngestJob: a failed job clears its progress too", async () => {
  const repo = createMemoryRepo({ storagePath: null });
  const deps = makeDeps(repo);

  const outcome = await advanceIngestJob(deps, 1);
  assertEquals(outcome.kind, "failed");
  assertEquals(repo.state.jobs.get(1)!.progressCurrent, null);
  assertEquals(repo.state.jobs.get(1)!.progressTotal, null);
});

/**
 * Walks a job to `extracting_lessons` and runs one slice, so candidates exist.
 *
 * 150 pages is chosen, not arbitrary: it yields 21 chunks, which is three extraction slices
 * at EXTRACT_CHUNKS_PER_INVOCATION=8. The progressive-availability latch is evaluated at the
 * end of every slice, so a book with only one slice could not show the gate opening BETWEEN
 * two of them, which is the behaviour under test.
 */
async function driveToFirstExtractionSlice(repo: MemoryRepo, deps: IngestDeps) {
  let guard = 0;
  while (repo.state.jobs.get(1)!.step !== "extracting_lessons" && guard++ < 400) {
    await advanceIngestJob(deps, 1);
  }
  await advanceIngestJob(deps, 1);
}

Deno.test("progressive availability: the source flips to 'partial' once enough lessons have cards", async () => {
  // 150 pages -> targetLessonCount = 20 (the floor still binds) -> computePartialThreshold = 10.
  // Cards are added by hand because nothing in this pipeline generates them yet; the LATCH is
  // what is under test, and it has to fire on carded lessons rather than on lessons alone.
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, { gateway: makeGateway(createRoutingProvider({ lessonsPerChunk: 2 }), []) }, 150);
  await driveToFirstExtractionSlice(repo, deps);

  const ids = repo.state.lessons.map((l) => l.id);
  assertEquals(ids.length >= 10, true, "the fixture needs at least ten candidates to test the boundary");
  assertEquals(repo.state.sources.get(10)!.status, "processing", "lessons alone are not a session");

  // Card up nine lessons: still one short of the threshold.
  for (const id of ids.slice(0, 9)) repo.addCard(id);
  await advanceIngestJob(deps, 1);
  assertEquals(repo.state.sources.get(10)!.status, "processing", "nine carded lessons is below the gate");

  repo.addCard(ids[9]!);
  const outcome = await advanceIngestJob(deps, 1);
  assertEquals(repo.state.sources.get(10)!.status, "partial");
  if (outcome.kind === "advanced") assertStringIncludes(outcome.note ?? "", "source now partial");
});

Deno.test("progressive availability: a suspended or retired card does not count toward the gate", async () => {
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, { gateway: makeGateway(createRoutingProvider({ lessonsPerChunk: 2 }), []) }, 150);
  await driveToFirstExtractionSlice(repo, deps);

  const ids = repo.state.lessons.map((l) => l.id).slice(0, 10);
  assertEquals(ids.length, 10);
  for (const id of ids.slice(0, 8)) repo.addCard(id);
  repo.addCard(ids[8]!, { suspendedAt: new Date() });
  repo.addCard(ids[9]!, { active: false });

  await advanceIngestJob(deps, 1);
  assertEquals(
    repo.state.sources.get(10)!.status,
    "processing",
    "a card nobody can be shown is not a card the offer can be made on",
  );
});

Deno.test("merging: losers are ARCHIVED, never deleted, and their cards are suspended", async () => {
  const repo = createMemoryRepo();
  // The merge model keeps only the first candidate, so everything else must be archived.
  const provider = createRoutingProvider({ lessonsPerChunk: 2 });
  const narrowing: typeof provider = {
    seen: provider.seen,
    call(request) {
      if (request.callType !== "lesson_merge") return provider.call(request);
      const payload = JSON.parse(request.userContent) as { candidates: Array<{ id: number }> };
      return Promise.resolve({
        toolInput: { keep: payload.candidates.slice(0, 1).map((c, i) => ({ id: c.id, rank: i + 1 })) },
        usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
        latencyMs: 1,
      });
    },
  };
  const deps = makeDeps(repo, { gateway: makeGateway(narrowing, []) }, 12);

  let guard = 0;
  while (repo.state.jobs.get(1)!.step !== "merging" && guard++ < 100) await advanceIngestJob(deps, 1);
  const before = repo.state.lessons.length;
  // Give every candidate a card, so suspension is observable.
  for (const lesson of repo.state.lessons) repo.addCard(lesson.id);

  await advanceIngestJob(deps, 1);

  // `merging` hands off to `generating_cards` rather than finishing: the source is not 'ready'
  // until its surviving lessons have cards, which is what makes 'partial' reachable at all.
  assertEquals(repo.state.jobs.get(1)!.step, "generating_cards");
  assertEquals(repo.state.sources.get(10)!.status, "processing", "a lesson set with no cards is not a ready source");
  assertEquals(repo.state.lessons.length, before, "not one lesson row was deleted");
  const archived = repo.state.lessons.filter((l) => l.status === "archived");
  const active = repo.state.lessons.filter((l) => l.status === "active");
  assertEquals(active.length, 1);
  assertEquals(archived.length, before - 1);

  const archivedIds = new Set(archived.map((l) => l.id));
  const activeIds = new Set(active.map((l) => l.id));
  assertEquals(
    repo.state.cards.filter((c) => archivedIds.has(c.lessonId)).every((c) => c.suspendedAt !== null),
    true,
    "every archived lesson's cards stopped being served",
  );
  assertEquals(
    repo.state.cards.filter((c) => activeIds.has(c.lessonId)).every((c) => c.suspendedAt === null),
    true,
    "a survivor's cards are untouched",
  );
});


// ============================================================================
// generating_cards — the step that makes a session possible
// ============================================================================

/** Drives to a named step, then stops. */
async function driveToStep(deps: IngestDeps, step: string, jobId = 1) {
  let guard = 0;
  while (repoStep(deps, jobId) !== step && guard++ < 400) {
    const outcome = await advanceIngestJob(deps, jobId);
    if (outcome.kind !== "advanced") break;
  }
}

function repoStep(deps: IngestDeps, jobId: number): string | undefined {
  return (deps.repo as MemoryRepo).state.jobs.get(jobId)?.step;
}

Deno.test("generating_cards: the full pipeline now ends with a REVIEWABLE library, not just lessons", async () => {
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, {}, 12);

  const steps = await driveToCompletion(deps);

  assertEquals(steps[steps.length - 1], "done");
  assertEquals(steps.includes("generating_cards"), true, "the new step really ran");
  assertEquals(repo.state.sources.get(10)!.status, "ready");

  const active = repo.state.lessons.filter((l) => l.status === "active");
  assertEquals(active.length > 0, true);
  for (const lesson of active) {
    const cards = repo.cardsFor(lesson.id);
    // 2-4 cards, mixed, with the generation effect always represented.
    assertEquals(cards.length >= 2 && cards.length <= 4, true, `${lesson.id} got ${cards.length} cards`);
    assertEquals(cards.some((c) => c.promptType === "free_recall"), true, "every deck carries a free_recall card");
    assertEquals(cards.some((c) => c.promptType !== "free_recall"), true, "and at least one other type");
    assertEquals(cards.map((c) => c.sortOrder), cards.map((_, i) => i), "sort_order is dense and stable");
    for (const card of cards) {
      assertEquals(card.prompt.trim().length > 0, true);
      assertEquals(card.answer.trim().length > 0, true);
      assertEquals(card.userId, "user-1", "every card carries the JOB's owner");
    }
  }

  // A typical lesson gets all four: three written by the model, one derived by the cloze rule.
  assertEquals(repo.cardsFor(active[0]!.id).map((c) => c.promptType), ["free_recall", "cloze", "application", "why"]);
});

Deno.test("generating_cards: cards are written ONLY for lessons the merge promoted", async () => {
  const repo = createMemoryRepo();
  const provider = createRoutingProvider({ lessonsPerChunk: 2 });
  const narrowing: typeof provider = {
    seen: provider.seen,
    call(request) {
      if (request.callType !== "lesson_merge") return provider.call(request);
      const payload = JSON.parse(request.userContent) as { candidates: Array<{ id: number }> };
      return Promise.resolve({
        toolInput: { keep: payload.candidates.slice(0, 1).map((c, i) => ({ id: c.id, rank: i + 1 })) },
        usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
        latencyMs: 1,
      });
    },
  };
  const deps = makeDeps(repo, { gateway: makeGateway(narrowing, []) }, 12);
  await driveToCompletion(deps);

  const archived = repo.state.lessons.filter((l) => l.status === "archived");
  assertEquals(archived.length > 0, true, "the fixture needs archived losers to make the point");
  for (const lesson of archived) {
    assertEquals(repo.cardsFor(lesson.id).length, 0, "a card here would be suspended the moment it was written");
  }
  assertEquals(repo.state.cards.length > 0, true);
});

Deno.test("generating_cards: one invocation cards a SLICE and checkpoints, never the whole book", async () => {
  // 150 pages of distinct lessons -> 15 surviving lessons, which is three slices of five.
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, { gateway: makeGateway(createRoutingProvider({ distinctLessons: true }), []) }, 150);
  await driveToStep(deps, "generating_cards");

  const active = repo.state.lessons.filter((l) => l.status === "active");
  assertEquals(active.length > CARD_LESSONS_PER_INVOCATION, true, `${active.length} lessons — a slice must not finish them`);
  assertEquals(repo.state.cards.length, 0, "no card is written until the step itself runs");

  await advanceIngestJob(deps, 1);
  const afterOne = repo.state.jobs.get(1)!;
  assertEquals(afterOne.step, "generating_cards", "the step stays put; the cursor moves");
  assertEquals(afterOne.cursor.lessonsCarded, CARD_LESSONS_PER_INVOCATION);
  assertEquals(afterOne.progressCurrent, CARD_LESSONS_PER_INVOCATION);
  assertEquals(afterOne.progressTotal, active.length, "the denominator is surviving lessons, this step's own unit");

  // The next invocation resumes from the cursor rather than re-carding the first five.
  const cardedFirst = new Set(repo.state.cards.map((c) => c.lessonId));
  await advanceIngestJob(deps, 1);
  assertEquals(repo.state.jobs.get(1)!.cursor.lessonsCarded, CARD_LESSONS_PER_INVOCATION * 2);
  for (const lessonId of cardedFirst) {
    assertEquals(repo.cardsFor(lessonId).length, 4, "a lesson carded by an earlier slice is never carded twice");
  }
});

Deno.test("progressive availability: the latch fires FOR REAL now, between two card slices", async () => {
  // The whole point of the step. No card is added by hand anywhere in this test: 150 pages ->
  // targetLessonCount 20 -> computePartialThreshold 10, and slices of five cross that on the
  // second one.
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, { gateway: makeGateway(createRoutingProvider({ distinctLessons: true }), []) }, 150);
  await driveToStep(deps, "generating_cards");

  assertEquals(repo.state.sources.get(10)!.status, "processing", "lessons without cards are not a session");

  await advanceIngestJob(deps, 1);
  assertEquals(repo.state.sources.get(10)!.status, "processing", "five carded lessons is below the gate");

  const second = await advanceIngestJob(deps, 1);
  assertEquals(repo.state.sources.get(10)!.status, "partial", "ten carded lessons opens the offer");
  if (second.kind === "advanced") assertStringIncludes(second.note ?? "", "source now partial");

  // And it is a one-way latch on the way to 'ready' — never back to 'processing'.
  await driveToCompletion(deps);
  assertEquals(repo.state.jobs.get(1)!.step, "done");
  assertEquals(repo.state.sources.get(10)!.status, "ready");
});

Deno.test("generating_cards: no Anthropic key BLOCKS — it does not ship a cloze-only deck", async () => {
  // D45's refusal at the point it actually bites: a key that vanished after extraction finished.
  const repo = createMemoryRepo();
  const configured = makeDeps(repo, {}, 12);
  await driveToStep(configured, "generating_cards");

  const keyless = makeDeps(repo, { gateway: null }, 12);
  const blocked = await advanceIngestJob(keyless, 1);

  assertEquals(blocked.kind, "blocked");
  assertEquals(repo.state.cards.length, 0, "not one recognition-only card was written");
  assertEquals(repo.state.jobs.get(1)!.step, "generating_cards", "the job waits where it is");
  assertEquals(repo.state.jobs.get(1)!.attempts, 0, "a server misconfiguration is not the job's fault");
  assertStringIncludes(repo.state.jobs.get(1)!.lastError ?? "", "Anthropic API key");
  assertEquals(repo.state.sources.get(10)!.status, "processing", "and the source is never advertised as ready");

  // The moment a key exists, the SAME job resumes from the same cursor.
  const resumed = await advanceIngestJob(configured, 1);
  assertEquals(resumed.kind, "advanced");
  assertEquals(repo.state.cards.length > 0, true);
});

Deno.test("generating_cards: the invariant counters reach the job, so a keyless run is distinguishable", async () => {
  const withoutVectors = createMemoryRepo();
  await driveToCompletion(makeDeps(withoutVectors, { embeddings: null }, 12));

  const cursor = withoutVectors.state.jobs.get(1)!.cursor;
  const counters = cursor.invariants as Record<string, number>;
  assertEquals(cursor.topicalityChecked, false, "the record says the semantic gate did not run");
  assertEquals(counters.topicalityUnknown > 0, true, "unknown is COUNTED, never folded into passed");
  assertEquals(counters.topicalityFailedDropped, 0);
  assertEquals(Number(cursor.cardsWritten) > 0, true);

  const withVectors = createMemoryRepo();
  await driveToCompletion(makeDeps(withVectors, { embeddings: createDeterministicEmbeddingsProvider() }, 12));
  const checkedCursor = withVectors.state.jobs.get(1)!.cursor;
  assertEquals(checkedCursor.topicalityChecked, true);
  assertEquals((checkedCursor.invariants as Record<string, number>).topicalityUnknown, 0);
  // The same pipeline, the same cards — only the strength of the evidence about them differs.
  assertEquals(Number(checkedCursor.cardsWritten), Number(cursor.cardsWritten));
});

Deno.test("generating_cards: a model whose every prompt leaks fails the source honestly", async () => {
  const repo = createMemoryRepo();
  const deps = makeDeps(repo, { gateway: makeGateway(createRoutingProvider({ cardsFail: "leak" }), []) }, 12);

  const steps = await driveToCompletion(deps);

  assertEquals(steps[steps.length - 1], "failed");
  assertEquals(repo.state.cards.length, 0, "a card that hands over its answer is never stored");
  assertEquals(repo.state.sources.get(10)!.status, "failed");
  assertStringIncludes(repo.state.jobs.get(1)!.lastError ?? "", "nothing to review");
  // The lessons themselves are untouched — they are grounded and real; only the cards failed.
  assertEquals(repo.state.lessons.some((l) => l.status === "active"), true);
});

Deno.test("generating_cards: an unanswerable prompt is caught by TOPICALITY, not by anti-leak", async () => {
  // The band, at the pipeline level. "What is the main idea of the lesson?" leaks nothing, so
  // anti-leak passes it; with vectors present the free_recall card is dropped and the lesson is
  // left without a deck rather than given a useless one.
  const repo = createMemoryRepo();
  const deps = makeDeps(
    repo,
    {
      gateway: makeGateway(createRoutingProvider({ cardsFail: "vague" }), []),
      embeddings: createDeterministicEmbeddingsProvider(),
    },
    12,
  );

  const steps = await driveToCompletion(deps);

  assertEquals(steps[steps.length - 1], "failed", "no free_recall survivor means no deck, for any lesson");
  const counters = repo.state.jobs.get(1)!.cursor.invariants as Record<string, number>;
  assertEquals(counters.topicalityFailedDropped > 0, true);
  assertEquals(counters.antiLeakDropped, 0, "anti-leak passed it — which is exactly why the second gate exists");
  assertEquals(repo.state.cards.length, 0);
});
