# Ihsan — Build Report

> **What was actually built, phase by phase, and what was deliberately left.** Written at the end
> of the continuous build. `docs/IHSAN_RECONCILIATION.md` is the plan this executed;
> `.brain/memory/decisions.md` D27–D43 are the rulings; `docs/CONNECTION_CHECKLIST.md` is what to
> plug in; `docs/VALIDATION_PLAN_IHSAN.md` is how to test it.
>
> Every number in the "Verified" section was executed, not recalled.

---

## The shape of it

Phases 0 through 5 all landed. The merged app has five pillars where there were two, and every one
of them is reachable, typed, and building on both platforms.

| Phase | What shipped |
|---|---|
| **P0** — rails | D27–D43 recorded. Migrations 48–50: `session_type` + `domain` on `task_sessions`, per-user life settings on `profiles`, pgvector. Design tokens v3 (dark, domain-coloured, Geist). |
| **P1** — the shell | Web sidebar (72px rail → 248px expanded), narrow-screen Island retained, Insights merged into Review, product renamed Ihsan in every user-facing string. |
| **P2** — Life | Deen (schema, prayer engine, surfaces, settings), Fitness, Work, Business, the Life hub. |
| **P3** — one session, two metrics | `startHour`/`startSession` split, the Signal:Noise engine, allocation check-in schema, the unaccounted-time question in the Night Plan, global distraction capture. |
| **P4** — Learn | Schema, FSRS scheduler, ingestion pipeline with the provenance firewall, embeddings provider with a working absent-key path, session and library surfaces. |
| **P5** — Desired Self | Schema, the evidence-derived standing engine, routing map, surfaces on both platforms. |
| **P6** — the ULM port | ULM's ten write-time invariant gates with calibration intact; progressive availability; `card_states` + a transactional RPC with our replay kept as the oracle; two live bugs his gap list exposed in our code; his ADRs and `.brain` conventions carried across. |
| **P7** — the vision chain | 10-Year Vision → 3-Year Beachhead → 1-Year Mission → 90-Day M.O.M., nullable-linked down to the Night Plan MIT, plus the 90-day review ritual. |
| **P8** — Goal Ecology | Pair relationships (competing/neutral/synergistic) with unmarked kept distinct from neutral, and the optional Priority Matrix. |
| **P9** — per-dimension Hell | The second written field, five drift triggers over data we already had, a hard rate limit, and a confrontation that quotes the user back to themselves and always carries both doors. |
| **P10** — screen time | Screenshot upload through the existing parse → stage → confirm pipeline, a weekly series where a missed week is a hole, and a Focus drift input measured only against the user's own baseline. |

Navigation ended where the plan said it would: **Today · Learn · Life · Self · Review** on a phone,
the same architecture unfolded in the web sidebar with the five domains listed directly. Every tab
arrived only on the day its destination became real — that rule held from P1 through P5 without an
exception.

---

## The decisions that shaped the code most

**One session table, two metrics.** `task_sessions` carries every kind of session — Hour, Lock-In,
Learn, Anti-Worry, Exam Prep — with a required domain. But the Hours count that Day Won, the
baselines, Delta and Efficiency are defined against counts only the deep types. That is enforced
from both sides: `countsTowardHours()` in `packages/core` is the single read-side judgement, and
migration 48's check constraint means a row that would disagree with it cannot be stored. Without
this, a five-minute retention session would inflate a number the user calibrated against deep work
and silently redefine every baseline they had already set.

**Nothing derives a verdict from silence.** Prayer status, window coverage, FSRS schedules and
Desired Self standings are all computed at read time from logs, and every one of them has a state
for "we do not know" that is distinct from zero. A null prayer window never becomes `missed`. An
unanswered check-in window is `unknown` and is excluded from the coverage denominator rather than
scored as a miss. A dimension with too few acts shows no number at all. This is one rule, applied
five times, and it is the difference between an honest instrument and a discouraging one.

**The provenance firewall is real, not a prompt instruction.** `lessons.provenance_quote` is NOT
NULL, which stops a null — it cannot stop a model from inventing a fluent sentence and calling it a
quote. So the pipeline verifies the quote is present in the actual chunk text, normalising both
sides for the typographic differences between a PDF text layer and a model's retyping, and stores
**the chunk's own substring** rather than the model's rendition. The model chooses where to point;
it never authors what the citation says.

**Where our own pattern lost, and should have.** Deterministic-first says every AI feature has a
no-API floor. ULM's ADR-009 says lesson extraction must never degrade to its keyless path, because
that path measured 3/10 on a real book — selection where the product requires transformation, with
`core_claim` coming out byte-identical to the provenance quote. Both rules are right, and they
collide because deterministic-first was never about having *an* output; it is about having one we
can stand behind. D45 splits it: triage, merge clustering and cloze cards keep a floor, and
extraction refuses. That is the same logic the provenance firewall already follows.

**Two owner amendments went in verbatim.** The Learn comeback is a visible moment fired from the
server's own count of what is still due, not a property of the schema (D29). And auto-accounting
may pre-fill a window only from evidence that already carries its own account of the time — an Hour
with a deliverable — while every other gap is presented as an explicit question about a named span
(D33). Both are enforced in code with tests, not left as intentions.

---

## Verified

Executed at the end of the build:

- `npm run verify` — exit 0. Four guards, typecheck across five workspaces, lint, tests.
- Core tests: **598** across 55 files (up from 458 at the start).
- API tests: 30. Mobile: 7 (1 skipped). Deno: **259**, run twice consecutively per D14 (up from
  133 before the merge).
- 59 migrations · 96 tables · 32 commits, none pushed (nobody asked; `main` is 32 ahead of
  `origin/main`).
- `next build` — clean, every route including `/deen`, `/fitness`, `/work`, `/business`, `/life`,
  `/learn`, `/learn/library`, `/self`.
- RLS audited across migrations 51–58: every new table has `enable` + `force` + an owner-scoped
  policy; 34 policies, all referencing `auth.uid()`.
- `check:core-mirror` green — the Deno mirror matches `packages/core/src` byte for byte.

**Not verified, and the reason:** this machine has no Docker and no Supabase credentials, so no
migration has touched a database and no live query has run. `database.types.ts` was hand-written for
33 tables. Regenerating it with `db:types:cloud` is step 0.3 of the connection checklist and is
required rather than advisory — a regeneration that changes the file means a transcription error.

---

## What was deliberately not built

**Left for Ayman**, with seams and no half-work: L1–L3 (Universal Links, redirect cleanup, SMTP),
the Ihsan domain and AASA hosting, WHOOP registration, pgTAP on a Docker machine, App Store Connect
and the TestFlight submission. `docs/CONNECTION_CHECKLIST.md` §6 names what each needs.

**Left for the credential pass**: no keys, no connections, no personal content. Every gap renders as
a first-run state that names the missing input — an unset prayer location says so rather than
showing 5:00 AM, an empty Self explains what a dimension is for rather than showing a 0% ring.
Nothing anywhere is seeded, including LifeOS's three starter workout plans, which encode one
person's targets and would have presented themselves as yours.

**Deliberately not ported from ULM**: his Ollama provider and local HuggingFace embeddings (D45,
D41 — both require a worker on someone's laptop); his light "Reading Room" design system (the merge
directive already ruled LifeOS's dark system is the base, though his build-failing contrast test is
worth taking); and the streak half of his `complete_session` (D23/D29 — the effortful-win idea
lands on our comeback moment instead, including his write-once milestone columns so a crossed
threshold fires once rather than every session after).

**Deferred with reasons recorded**: EPUB and other source types beyond PDF (the pipeline branches on
`source_kind`; only PDF has an extractor); Teach-Back mode; the Question Bank's FSRS migration
(D32 — it can happen any quiet week, losslessly, because neither scheduler stores state); AI grading
assist beyond the gateway seam; Batch API ingestion (the pipeline is sequential and works; what a
batch path would need is written up in the ingestion notes).

---

## Things found the hard way, worth knowing

- **A `*/` inside a path written in a block comment terminates the comment.** Twenty-one parser
  errors, all pointing at the wrong lines. Typecheck caught it; nothing else would have.
- **The obvious anchor for appending tables to `database.types.ts` matches `graphql_public` first**,
  which silently inserted 28 public tables into a mapped type that permits no properties.
- **FSRS puts a first-time card into `learning` with a minutes-long step**, so "reviewed yesterday"
  is still due today. Two test premises were wrong about this and the code was right; the corrected
  tests now document the behaviour, because it looks like a bug the first time it is seen.
- **FSRS fuzz has to be off.** It spreads due dates randomly, which is right for a huge Anki deck and
  fatal here: replaying one log would produce a different answer on every render, quietly destroying
  the derive-don't-store design.
- **Two engineers writing the same generated file collide silently.** Duplicate table definitions
  appeared in `database.types.ts`, and later duplicate barrel exports within seconds of each other;
  only typecheck caught either. D22's commit-by-pathspec is what kept the workstreams separable.
- **A ported gate applied to the wrong shape breaks everything at once, which is the good case.**
  `passesCardTextSanity` requires terminal punctuation — correct for a card prompt, wrong for a
  lesson title, which is an imperative headline. Every fixture caught it immediately.
- **Fixtures can lie about what a model returns.** Porting the invariant gates turned six pipeline
  tests red because the fixtures echoed a slice of the chunk back as the `core_claim` — precisely
  the selection-not-transformation failure the gate exists to catch. The gates were right; every
  prior green on those tests had been measuring nothing.
- **A retryable error on unstorable data is a poison pill.** A NUL byte in extracted PDF text is
  rejected by Postgres outright and the resulting plain `Error` has no structured code, so a
  retrying pipeline retries forever against text that can never be stored. One byte kills a whole
  book, permanently. Found in ULM's gap list; our pipeline had it too.
- **A call with no timeout plus a progress-independent heartbeat is an immortal job.** Two
  individually-correct decisions combining into harm — the shape to look for, not the instance.
