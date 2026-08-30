# ULM's ADRs — carried forward

> **Ayman's architecture decisions from `github.com/Proton-Designer/ULM`, kept verbatim below the
> line.** They are here because the reasoning is hard-won and several of them explain code that now
> lives in this repo. Credit is his; the overrides are ours.
>
> Where an Ihsan ruling supersedes one, it is noted at the top of that ADR rather than by editing
> his text — the original reasoning still explains why the code looks the way it does, which is
> exactly what `.brain`'s "Status: Superseded" convention preserves.

## Where we overrode him, and where we did not

| ADR | Ihsan's position |
|---|---|
| ADR-001 monorepo, shared core, platform UI layers | **Adopted independently.** Our D1 is the same conclusion reached separately, which is some evidence it is right. |
| ADR-002 ingestion in a Node worker, not Edge Functions | **Superseded by D46.** His finding is empirical and correct — for local models. Supabase caps CPU time, and our models are remote HTTP calls. The falsifier and the escape hatch are named in D46. |
| ADR-003 local embeddings, no API key | **Superseded by D41.** Voyage, with a working absent-key path. His 384-dim `vector` becomes our 1024. |
| ADR-004 LLM behind a provider interface with a keyless fallback | **Adopted, narrowed by D45.** The interface stays. The fallback survives only where its output is honest. |
| ADR-005 FSRS via ts-fsrs, state computed at the write | **Adopted by D47**, with our replay kept as the oracle that proves the stored state. |
| ADR-006 security posture | **Adopted.** Identical to ours already. |
| ADR-007 book deletion: hard when unreviewed, soft once history exists | **Adopted wholesale.** The reasoning is exactly right and we had nothing. |
| ADR-008 exactly one door through the append-only log | **Adopted.** Our account-delete path needs the same single sanctioned exception. |
| ADR-009 Ollama as default provider | **Superseded by D45.** Correct for a machine with no key; we have one. |
| ADR-010 progressive lesson availability | **Adopted wholesale.** The single best idea in his repo, and we had nothing like it. |
| ADR-011 quality enforced by invariants, not review | **Adopted wholesale.** Ported with thresholds and calibration notes intact. |

---

## 2. Architectural decisions (ADRs in short form)

### ADR-001 — Monorepo with shared core, platform-native UI layers
```
ULM/
├── apps/
│   ├── mobile/      Expo + expo-router (iOS/Android)
│   ├── web/         Next.js App Router (landing + full app)
│   └── worker/      Node service: PDF ingestion pipeline (long-running jobs)
├── packages/
│   ├── core/        Pure TS. Types, zod schemas, data access, FSRS, session engine,
│   │                streak logic, stats math. NO UI. The single source of behaviour.
│   └── design/      Design tokens (colour, type, space, motion, elevation) as plain TS,
│                    consumed by Tailwind config (web) and StyleSheet (mobile).
├── supabase/
│   ├── migrations/  Versioned SQL. The schema is code.
│   └── functions/   Edge Functions (short-lived work only)
└── docs/
```
**Why not one universal Expo-Router app on RN-Web?** Because the web deliverable includes a
marketing landing page and a desktop-grade app surface where polish is the point; RN-Web
fights us on typography, scroll, hover, SEO and bundle size. **Why this is not double work:**
every hard thing — scheduling, session construction, grading, streak rules, retention math,
data access, validation — lives in `packages/core` and is written and tested once. The
platform layers are presentation only. Behavioural parity is enforced by a shared test suite.
*Tooling:* **npm workspaces** (npm 11.6.0 present; pnpm is not installed; bun is present but
Expo native tooling is least surprising on npm).

### ADR-002 — Ingestion runs in a dedicated Node worker, not an Edge Function
A 300-page PDF parse + structural detection + ~100 chunk embeddings + multi-pass LLM
extraction is a multi-minute, memory-hungry job. Supabase Edge Functions are Deno with hard
CPU/wall-clock/memory ceilings — the wrong tool. `apps/worker` leases jobs from an
`ingestion_jobs` table (lease + heartbeat, so a crashed worker's job is recoverable),
streams progress back into `books.status` / `books.progress`, and is horizontally scalable.
Edge Functions are retained only for genuinely short work (single-answer AI grading).

### ADR-003 — Embeddings run locally, no API key required
pgvector from day one (brief §10 makes this non-negotiable). Embeddings are produced in the
worker by a local sentence-transformer (`all-MiniLM-L6-v2`, 384-dim) via transformers.js.
Zero cost, zero keys, fully testable offline, and entirely sufficient for the MVP's actual
uses (dedup clustering + future cross-referencing). Vector columns are `vector(384)`; the
migration path to a hosted embedding model is a column swap plus a re-embed job.

### ADR-004 — LLM access is behind a provider interface with a working keyless fallback
No `ANTHROPIC_API_KEY` exists in this environment. Therefore:
```ts
interface LlmProvider {
  triageChunk(...)      // is there a lesson here?
  extractLessons(...)   // chunk → candidate lessons w/ provenance
  mergeLessons(...)     // whole-book dedup + rank
  generateCards(...)    // lesson → 2-4 retrieval prompts
  gradeAnswer(...)      // free-recall answer → suggested grade + one line of feedback
}
```
Two implementations ship: `AnthropicProvider` (real, tiered Haiku/Sonnet, strict JSON schema
validation, one retry then flag) and `HeuristicProvider` (deterministic — embedding-cluster
+ salience ranking + template card generation, no network). The heuristic path is **not a
stub**: it must produce a genuinely usable deck, because it is what runs end-to-end in
testing and demo. Selection is by env var; both are covered by the same contract tests.
**The hallucination firewall is provider-independent:** any lesson whose grounding quote does
not verbatim-match its source chunk is dropped before it reaches the database.

### ADR-005 — FSRS via `ts-fsrs`, state in Postgres, computed at the edge of the write
Never hand-roll a scheduler. `packages/core` wraps `ts-fsrs` so mobile, web and worker share
one scheduler. A review posts `{rating, elapsed_ms, answered_text}`; the next card state is
computed and persisted in a single transactional RPC so the review log and card state can
never disagree. The **review log is append-only and sacred** (brief §10) — enforced in the
database with a trigger that rejects UPDATE and DELETE, not merely by convention.

### ADR-007 — Book deletion: hard when unreviewed, soft once history exists
`delete_book` decides internally and looks identical to the user. **Zero reviews → hard
delete** (the overwhelmingly common case is "I uploaded the wrong PDF"; don't accumulate
tombstones for it). **Any reviews → soft delete** via `books.deleted_at`; the book leaves
the library and its cards leave the FSRS queue, but review history survives. The Storage
object is removed either way — once lessons are extracted the PDF isn't needed, and "delete"
should mean the file is actually gone. `source_chunks` are retained so provenance keeps
resolving. `restore_book` supports a 10-second undo.

Storage deletion cannot happen from SQL (Supabase blocks direct DELETE on `storage.objects`
even from a SECURITY DEFINER function). Rather than embed a service-role credential in a
function body — a real security regression — `delete_book` returns the path and enqueues it
into `pending_storage_deletions`. The client deletes immediately under its own session and
clears the row; the worker sweeps any leftovers. Deletion is therefore eventually consistent
even if the immediate call fails offline.

**All read paths must filter `deleted_at is null`** — and this is enforced in `books_select`
RLS itself, not by each query remembering. Structural guarantee over recurring discipline.

### ADR-008 — Exactly one door through the append-only log
A user must be able to leave, but the `reviews` trigger blocks the cascade. Resolution: one
security-definer `purge_user_data(p_user_id)` that disables the trigger **for its own
transaction only**, self-or-service-role gated, unmistakably named, documented as the sole
sanctioned exception. **No general role exemption is ever added to the trigger.** It also
enqueues the user's storage objects before the cascade, so account deletion doesn't strand an
orphaned library.

### ADR-009 — Ollama is the default LLM provider for this build
The keyless `HeuristicProvider` was measured at **3/10** on a real book: it did *selection*
(picking existing sentences) where the product requires *transformation*. `core_claim` came
out byte-identical to the provenance quote, and card prompts contained their own answers —
fatal, since retrieval practice is the entire product thesis.

Resolution: `ollama` + `qwen2.5:7b-instruct-q4_K_M` for extraction/merge and
`qwen2.5:3b-instruct` for cards (tiering per brief §6), on this M4 Pro / 24GB machine.
Measured `OLLAMA_NUM_PARALLEL=3` as optimal — **4 is worse** (memory-bandwidth-bound, not
core-bound). Quality moved to ~7.5/10.

Precedence: **Ollama if reachable → Anthropic if a key exists → Heuristic**. Correct for
*this* build (no API key, capable local machine); a production deployment flips Anthropic
first, which is a config change precisely because ADR-004 built the interface. The heuristic
path is retained for triage and cloze generation, where it is genuinely good, but
**extraction never silently degrades to it** — with no capable provider the job fails with an
actionable message. Refusing beats shipping lessons we can't stand behind, the same logic as
the provenance firewall.

### ADR-010 — Progressive lesson availability
Ingestion is not all-or-nothing. Lessons are written as each chunk completes with status
`provisional`; the merge pass promotes survivors to `active` and marks losers **`archived`,
never deleted** — same philosophy as the append-only log, and it keeps `reviews`
referentially intact if a user already reviewed a card whose lesson later loses a dedup
contest. `books.status` gains `partial`: usable at ~10 provisional lessons.

Rationale, in priority order: (1) nobody watches a progress bar for 30 minutes, and a new
user who must wait that long for their first session may never return — brief §3 wants value
on day one; (2) a job that dies at 80% still leaves a usable deck; (3) it makes the progress
rail honest. **This dissolves the wait rather than optimising it**, which matters more than
the raw ingestion number.

### ADR-011 — Quality is enforced by invariants, not by review
Every quality property that can be machine-checked is a **write-time gate with a counter**,
because review doesn't scale and regresses silently. Currently enforced: verbatim provenance
grounding; claim↔provenance relevance; claim ≠ quote (substring *and* lexical overlap);
mechanism↔claim relevance; title↔claim relevance; card anti-leak; card topicality; cloze term
quality; language sanity; card-text sanity.

**The card gates are a band, not a ceiling** — a prompt must be topically anchored (embedding
cosine to the claim above a floor) *and* lexically distinct (Jaccard below a ceiling). High
semantic similarity with low lexical overlap is precisely "names the topic, withholds the
answer." Anti-leak alone over-corrects into prompts like "What is the main idea of the
lesson?", which leak nothing but are unanswerable in an interleaved session.

Thresholds are **calibrated against measured distributions on real books**, never guessed.

> **The standing lesson behind this ADR:** an invariant that can pass for a degenerate reason
> is not an invariant. "24/24 provenance passed" was true both when the claim was a verbatim
> copy of the quote (nothing generated to check) and when a real quote was attached to an
> unrelated claim (string matching, not grounding). Ask of every gate: *what is the cheapest
> way for output to satisfy this while still being wrong?*

### ADR-006 — Security posture
RLS on every user-scoped table, deny-by-default. The client only ever holds the publishable/
anon key. The service-role key exists only in the worker and Edge Function environment.
Storage buckets are private; PDFs are reached through signed URLs scoped to the owner.

---

