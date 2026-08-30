# Ihsan — Merge Reconciliation & Phased Plan

> **Produced 2026-08-29 against `main` @ `2c52842`, per `MERGE_DIRECTIVE.md`.** No code has been
> written. Sources actually read, not summarized from memory: the directive; the ULM MVP builder
> brief; the learning-science research report; the three-app feature inventory; Ayman's LifeOS
> **code** (github.com/Proton-Designer/life-os, surveyed file-by-file) and its 16-page UI capture;
> this repo's BLUEPRINT.md, BLUEPRINT_RECONCILIATION.md (C1–C9), HANDOVER.md, D1–D26, and the
> codebase at HEAD. Where a row says "exists," it names the table or file.
>
> Sections: §1 verdict · §2 naming (Ihsan) · §3 reconciliation (LifeOS / ULM / Desired Self) ·
> §4 collision map · §5 the ten rulings · §6 design language & navigation · §7 phased plan ·
> §8 infrastructure & cost · §9 what must not break.

---

## 1. The verdict in one paragraph

This merge is cheaper than it looks and expensive in a different place than the directive assumes.
**LifeOS is not a port problem — it is a translation problem with the hard half already solved:**
Ayman's domain logic (prayer astronomy, qada, Signal:Noise windows with prayer suppression,
allocation math, fitness cycles, insights KPIs) lives in pure, tested TypeScript modules with zero
DOM dependencies that drop into `packages/core` nearly verbatim, and his charts are hand-rolled SVG
that ports to `react-native-svg` almost line-for-line. What does *not* port is his views (Tailwind
markup, pointer-event drag code) and — critically — his **base schema: migrations 001–015 are
missing from his repo**, so every LifeOS table must be re-authored as fresh migrations here,
reverse-engineered from his `database.types.ts`. ULM is genuinely new construction, but four-fifths
of its infrastructure (LLM gateway, staging→confirm, async webhook jobs, append-only logs, private
buckets) already exists in this repo as proven patterns; its two real gaps are **pgvector and an
embeddings provider — Anthropic has no embeddings API, so ULM needs a second AI credential the
directive doesn't mention** (§8.2). Desired Self is the only truly blank page, and even it lands on
existing machinery: the habits decay precedent for scoring and the `experiments` engine for the
claim-to-task bridge. The single most important discipline in the whole merge: **one session table,
one truth** — every new surface reads `task_sessions`, and nothing gets its own private notion of
"a session."

State correction since HANDOVER.md: the push blocker is resolved (`main` = `origin/main`), and web
parity waves 1–3 landed post-handover (Wall, Hour, Night Plan, week review, War Map, baselines,
lectures, announcements, cards, habits, worries all have web surfaces now). The restyle in §6
therefore covers both platforms from day one. One open thread: branch
`fix/review-findings-and-parity` + `docs/PENDING_DB_CHANGES.md` hold migrations not yet applied to
cloud — reconcile `supabase migration list` before any new migration is authored (§7 Phase 0).

*Not consulted: Ayman's "Life OS — Complete Feature Guide.docx" — it isn't in either repo's origin
or on this machine yet. Push it and this document gets checked against it; the code survey should
have caught everything, but his own list is the authority on intent.*

---

## 2. Naming — Ihsan

Used in all docs and user-facing copy from now on. Where the rename touches configuration, and
when to do each piece:

| Touchpoint | Current value | When to rename | Why |
|---|---|---|---|
| **iOS bundle ID** | **not yet chosen** (deliberately — HANDOVER §6) | **At TestFlight cutover, and never before under the old name** | Permanent at first App Store Connect submission. This is the one identifier where a wrong early choice is irreversible. It must be born `…ihsan`. |
| Expo `slug` (`collegeos-mobile`) | `apps/mobile/app.json:4` | Before the **first** `eas build` (i.e., same cutover) | The slug binds to the EAS project on first build; free to change until then, sticky after. |
| Deep-link scheme `collegeos://` | `app.json:8`, `deepLink.ts` | At cutover, riding L1/L2 | Already scheduled for replacement by Universal Links; the scheme swap is a cutover step by design (removing it earlier breaks the Expo Go auth loop — HANDOVER §6.7c). Keep `collegeos://` as a legacy alias for one release. |
| **Production domain** | none yet (universal-links' three blanks) | **Register the Ihsan domain now** | The one place waiting costs real time: AASA/assetlinks hosting must exist *ahead of* the cutover build, and SMTP (L3) wants DNS warmed. Registration is cheap and independent of everything else. |
| Package scope `@collegeos/*` | all internal packages | At cutover in one mechanical commit — or never | Purely internal; zero user impact. One `sed`-style commit at cutover keeps grep sane. Not worth doing piecemeal. |
| Supabase project | ref `jcikqbxwjmdduwprixpy` | Display name: anytime. Ref: immutable — leave it | The ref appears in no user-facing surface. Renaming the dashboard display name to "ihsan" costs nothing and can happen today. |
| Storage buckets | `lectures` (generic) | Never — and name new buckets neutrally (`sources`, not `ulm-…`) | Bucket renames are migrations with data moves; generic names dodge the problem forever. |
| Wordmark, landing copy, demo account | `TopBar.tsx`, marketing pages, `demo@collegeos.app` | **Now** (copy) / at cutover (demo account) | Copy is free and reversible; do it in the Phase 1 restyle. |
| GitHub repo name | `college-tracking-app` | Whenever — GitHub redirects old URLs | Cosmetic. |

**Recommendation: your instinct is right — one deliberate rename at the TestFlight cutover — with
two exceptions.** (1) Register the domain now: it's the only rename artifact with lead time, and
Universal Links + SMTP both queue behind it. (2) User-facing copy and docs go Ihsan now (free,
already this document's convention). Waiting costs nothing else *provided* two disciplines hold:
never choose the bundle ID/EAS slug under the old name, and name every **new** table, bucket, and
component neutrally so the cutover rename stays a config diff, not a code hunt.

---

## 3. Reconciliation

Legend: **(a)** exists as-is · **(b)** exists but diverges (gap described) · **(c)** genuinely new.

### 3.1 LifeOS inventory vs this codebase

His code is richer than the feature inventory suggested — rows below include what the survey found
that the inventory omitted (sunnah/adhkar logs, versioned distraction action plans, the co-op
pipeline, fitness plans/benchmarks, prayer-suppressed check-in scheduling).

**Home / Today**

| LifeOS feature | Class | Notes |
|---|---|---|
| This Week's Focus (weekly Deen + Business goal) | **(b)** | His `weekly_goals` (week_start, domain, headline, milestones jsonb). Collides with War Map (`goals`/`milestones`, top-5 + monthly). Ruling 9. |
| Sector progress chips (5 domains, live status) | **(c)** | New Today component; data exists per domain once Phase 2 lands. |
| "Now" — next prayer + count | **(c)** | Deen port. |
| Focus panel: Deep Work / Deep Study minutes + Lock In | **(b)** | `task_sessions` **is** the session table (C1); his `work_sessions.kind` becomes `task_sessions.session_type`. Merge rule 3.1. |
| Global distractions counter + Action Plan | **(b)** | We count per-Hour with 6-cause chips (`distractions` table). He counts globally with `distraction_triggers` + **versioned** `trigger_action_plans` (supersede-not-edit, forced rewrite after 3 skips w/ zero follows) + outcomes. Additive merge: M5 in §4. |
| The day's shape (prayer-anchored timeline) | **(b)** | `DayTrace` exists and is task/calendar-anchored; extend with prayer anchors + his `day-ribbon` logic (`lib/home/day-ribbon.ts` is pure, ports). |

**Deen** — all **(c)** except noted; the directive says port whole, and his module is the model.

| Feature | Class | Notes |
|---|---|---|
| Prayer times by location, method + Asr configurable | **(c)** | His `lib/prayer-times/calculate.ts` is **hand-rolled solar astronomy, zero deps, fully portable** — goes into `packages/core` as-is (with his tests). MWL/ISNA/Karachi/Egyptian + hanafi/standard Asr + high-latitude nulls handled. `windows.ts` (validity windows, DST-safe) ports too. |
| Salah log (on-time/qada/missed), per-prayer counts | **(c)** | His `prayers` table. New migration here. |
| Qada backlog | **(c)** | His design: `profiles.qada_owed` counter + `prayers.status='qada'`. Port as-is. Islam's own repair mechanic — load-bearing for Ruling 2. |
| Sunnah + adhkar logs | **(c)** | `sunnah_logs`, `adhkar_logs` — in his code, not in the inventory. Port with the module. |
| Qur'an sessions (pages/surah/juz) | **(c)** | `quran_sessions`. |
| Reflection intensity (3 tiers), monthly calendar | **(c)** | `reflection_entries` — note his distraction captures can write a linked reflection (nice loop; keep). Distinct from `journal_entries`; do not merge. |
| 30-day × 5 prayer consistency heatmap | **(c)** | Logic ports (`lib/deen/prayer-consistency.ts`); the grid markup is web-only (`writing-mode`, hover tooltips) — rebuild views per platform. |
| Prayer streak | **(b)** | Exists in his code (`lib/deen/streaks`); collides with D23. **Ruling 2.** |
| Deen Habit Builder (anchor cue, commitment stages) | **(b)** | Collides with our `habits` (7-cap, identity votes, 0.96/day decay). One habits system: ours wins, gains `domain` tag + optional `anchor_cue`. His `deen_habits`/`custom_habits` do not port as tables. |

**Business / School / Fitness / Work**

| Feature | Class | Notes |
|---|---|---|
| Kill list (3 daily priorities) | **(b)** | `tasks.mit_rank` (star 3, crown 1) already **is** this, with DB-enforced uniqueness. Ruling 9. ⚠ Label hazard: "Kill list" already means the *kill-habits* log on our Today (`KillListSection`). One of the two names must go (recommend: the priorities list is "MITs"/"Today's 3"; kill-habits UI keeps "Kill list" or renames to "Quit list"). |
| Weekly headline goal + milestones | **(b)** | Ruling 9 — reconciled with War Map. |
| Incomplete tasks | **(a)** | `tasks`. |
| Completed-goals archive | **(a)** | `goals`/`milestones` cover; add domain filter. |
| School: due today/overdue/this week, task list, filters | **(a)** | Strict subset of S1–S4 (`deliverables`, DeadlineRadar, Grade Ledger). Nothing to port. |
| School: weekly class schedule (Sun–Sat) | **(b)** | We have `course_meetings` + `ThisWeekView`; he has `schedule_events` with **overrides and cancellations**. Absorb the override/cancellation semantics if `course_meetings` lacks them — that's the one thing his School module adds. |
| Fitness: workout plans, daily log, weekly confirmed sets, cycle checks (weight/waist) | **(c)** | His schema is real: `workouts`, `workout_sessions`, `session_sets`, `workout_plans`/`plan_sessions`, `body_metrics` (weight_lb/waist_in), `fitness_benchmarks`, `rep_goals`, cycle anchor. Port whole. ⚠ `lib/fitness/seed-plans.ts` hardcodes Ayman's three plans + personal targets — port as *user-editable seeds*, not constants. `health_daily` (Whoop) stays separate; it's telemetry, not training logs. |
| Work: shift schedule, targets, completed goals | **(c)** | His `coop_targets`/`coop_tasks` pipeline + `schedule_events` shifts. Port; rename co_op → work everywhere in the merged schema. |

**Lock-In / Check-ins / Insights**

| Feature | Class | Notes |
|---|---|---|
| Lock-In sessions (Deep Work / Deep Study) | **(b)** | Absorbed into `task_sessions` via `session_type` + required `domain` (§4 M1). His sessions have no deliverable contract; ours becomes the rule for deep types (interaction language wins). |
| 2-hour allocation check-in engine | **(c)** | Far smarter than the inventory line: 120-min windows, **prayer-time suppression**, Lock-In suppression (replaced by hourly one-tap confirms), 30-min answer window, expired-unknown **never penalized**, missed hours **derived at read time, never cron-written**. Philosophically at home here (derive-don't-store, no guilt). Port the engine (`lib/checkins/*` is pure); Ruling 5 governs the default cadence. |
| Signal:Noise ratio | **(b)** | ⚠ His code hardcodes **Signal = Deen + Business**; School/Fitness/Work are "other commitments." That is Ayman's personal ruling, not a neutral metric. Surfaced as **Ruling 11** (new, from code): make the signal-set per-user (default: all five domains = signal, wasted = noise), with a "priority domains" lens that reproduces his current meaning. |
| Insights (coverage %, noise share, focus map, stat tiles w/ pre-tracking baselines, trends) | **(b)** | Our insights layer is richer but measures different things. His KPI logic ports (`lib/insights/*`); lands as new sections of the merged **Review** tab. |
| Weekly planning modal (goals + hourly week grid) | **(b)** | `weekly_plans`/`weekly_plan_blocks` are stronger (capacity, unplaced disclosure). Keep ours; port his week-grid *visual* only. |
| PWA + web push (his `dispatch-notifications`, service worker) | **(b)** | We have no web push. Not in the directive's scope; note it as the future web-notification pattern (his edge function is a clean precedent). Mobile local notifications remain the Expo Go ⚠ from BLUEPRINT_RECONCILIATION. |
| PIN lock (bcrypt, `profiles.pin_hash`) | **(c)** | Small, portable, not requested. Backlog, not merge scope. |
| **Do-not-port list** | — | `app/api/test/*` (15 secret-gated mutation endpoints), `scripts/fresh-start-wipe.sh`, his `getClaims()`-only auth posture (fine for single-user; this repo's auth stands), create-next-app README. |

### 3.2 ULM brief vs this codebase

| Brief feature | Class | Notes |
|---|---|---|
| PDF upload → Storage → async job | **(b)** | Pattern exists twice (syllabus, lecture/Deepgram). New `sources` bucket + `ingest_jobs` table; job-step state machine per §8.3. |
| Text extraction w/ page numbers | **(b)** | `_shared/syllabus/pdfText.ts` exists for small PDFs; book-scale needs chunked, resumable extraction (§8.3). |
| Structural parse, chunking, **embeddings** | **(c)** | pgvector **absent** (extensions migration enables only pgcrypto/pg_net/vault/pgtap). §8.1–8.2. |
| Per-chunk extraction (tiered models), merge/dedupe/rank, quality gate | **(b)** | Gateway with tiering, Zod schemas, retries, deterministic fallback, budget preflight, fail-closed logging: **all exists.** New: Batch API path in the gateway (current gateway is sync-only) — ingestion is async by nature, so this is clean to add. Provenance-or-drop gate mirrors the syllabus staging philosophy. |
| Lesson card (title/claim/mechanism/**claim_to_task**/evidence/provenance/2–4 prompts) | **(c)** | New tables: `lessons`, `lesson_cards`. ⚠ Naming: our `cards` table is the *motivation rotation* — ULM's cards must not reuse the word bare. `claim_to_task` non-negotiable field kept (it feeds Desired Self via `experiments`). |
| Daily session (warm-up → due → 2–5 new → closer; free recall before reveal; self-grade) | **(c)** | New UI + `lesson_reviews` log. The session itself is a `task_sessions` row (`session_type='learn'`) — see the metrics note in §4 M11. |
| AI grading assist | **(b)** | Gateway + Haiku + deterministic fallback (self-grade) = exactly our deterministic-first shape. **In MVP** (§3.2b Q1). |
| FSRS | **(c)** | `ts-fsrs` (MIT), server-side, in `packages/core` → Deno mirror. Ruling 4 covers QB. State derivation per §3.2b Q4. |
| Append-only review log | **(a)** as pattern | `attempts` is the precedent; `lesson_reviews` copies it (adds rating, elapsed_ms, answered_text, ai_feedback). |
| Streak + repair freeze | **(b)** | Direct D23 collision. **Ruling 1.** |
| Memory-strength viz, weekly recap, 1 daily notification | **(c)** | Weekly recap rides `weekly-synthesis` cron. Notification: mobile local-notif caveat stands. |
| Teach-back | **(c)** | Post-MVP (Q5). |
| Native Swift/SwiftUI | — | **Void per directive §3.6.** Expo + Next on this Supabase project. |

**3.2b The brief's Section 11 open questions, answered in this codebase's context:**

1. **AI grading assist: in the MVP.** The expensive part (gateway, budget guard, schema-validated
   calls, deterministic fallback) already exists; the assist is one Haiku call type. Its fallback
   *is* the brief's own fallback (self-grade alone), so it cannot block the loop. Cost ≈ noise.
2. **EPUB: not at launch; first fast-follow.** PDF-first matches the brief and our existing PDF
   text path. EPUB is *easier* than PDF (structured XHTML) and shares the whole pipeline after
   extraction — slot it as the second source type. Proposed intake order (directive asks):
   **PDF → EPUB → articles/URLs (readability-extract, smallest scope) → YouTube/video (reuses the
   Deepgram lecture pattern verbatim — transcription infra already deployed) → courses (structured
   multi-video, last).**
3. **Edge Functions vs dedicated worker: Edge Functions, with a resumable job-step state machine.**
   There is no Node host in this stack and D16 already litigated this. Batch API ingestion is
   async-by-design (submit, then cron-poll results), so no single invocation needs minutes; the
   only heavy synchronous step is text extraction, which runs in page-range slices across
   invocations, checkpointed on the job row. Decide "worker?" only if one of the three M1
   validation books actually breaks this — not before (§8.3).
4. **FSRS placement: server-side (`ts-fsrs` in `packages/core`, mirrored to Deno).** iOS-first
   Swift is void; offline review is not required. Per-card state (stability/difficulty/due) is
   **derived by replaying `lesson_reviews`** — the exact pattern the Question Bank already proves
   (`retrieval/scheduler.ts` replays `attempts`; migration 42 deliberately stores no scheduler
   state). The review log stays the single truth; a materialized cache is a later optimization if
   replay cost ever shows up, not a day-one table.
5. **Teach-back: first post-MVP feature**, per the brief's own recommendation. The seam (gateway +
   a session step) is free; the scope is not.
6. **Lesson count: keep 30–60, scale within it by length** (~1 lesson per 8–10 pages, floor 20,
   cap 60) and treat the three M1 validation books as the real answer. The cap is a quality
   forcing function — the merge/rank pass earns its keep by cutting, not padding.

### 3.3 Desired Self — new, but landing on existing machinery

All **(c)**, no prior art in any of the three apps — but three deliberate reuses keep it honest:

- **Scoring = the habits precedent.** Same derived decaying score (replay from log, 0.96-style
  decay, never stored, "New" grace period, fades-never-resets). `packages/core/src/habits/` is the
  reference implementation; Desired Self generalizes it per dimension.
- **Evidence = attribution, enforced by derivation.** No `points` column anywhere. A dimension's
  score is computed *from the source rows* (sessions, habit_logs, prayers, lesson_reviews,
  session_sets, milestones…) via a routing map, so tapping a dimension necessarily shows the acts —
  the integrity constraint ("points are evidence, not currency") holds structurally, the same way
  D10 makes confirmation structural.
- **The knowing→doing bridge = the `experiments` engine.** `experiments` +
  `experiment_measurements` already exist with lifecycle and measurement semantics. ULM's
  `claim_to_task` proposes an experiment; running it feeds the dimension its source declares. No
  new trial machinery.

New schema: `dimensions` (user-extensible, seeded with Physique · Deen · Work/Craft · Focus ·
Traits; `parent_id` self-reference gives Traits its sub-dimensions), each holding the user's
written definition of the aimed-at self; a small `dimension_routes` map (source kind + domain/tag →
dimension) that makes "every action declares what it serves" a data rule rather than scattered
switch statements. Overshoot: Ruling 7.

---

## 4. Collision map

C1–C9 (2026-08-24) all stand — nothing below reopens them. New collisions are M-numbered.

| # | Collision | Resolution (recommended) |
|---|---|---|
| **M1** | Hour vs Lock-In vs ULM session | One table. `task_sessions` gains `session_type` (`deep_work · deep_study · learn · anti_worry · exam_prep`) and **required** `domain` (`deen · business · school · fitness · work`); existing rows backfill `deep_work`/`school`. Deliverable contract required for deep types; auto-contract for learn ("clear today's due") and anti-worry. His `work_sessions` data shape is a subset; nothing else survives as a table. |
| **M2** | Kill list vs MIT | MIT absorbs (Ruling 9). His `kill_list_items` doesn't port. |
| **M3** | LifeOS `weekly_goals` vs War Map | Both survive, linked (Ruling 9). |
| **M4** | LifeOS School vs S1–S4 | S1–S4 wins wholesale; absorb only `schedule_events`' override/cancellation semantics into `course_meetings` if missing. |
| **M5** | Distraction models | Per-Hour 6-cause chips stay. Port his `distraction_triggers` + versioned `trigger_action_plans`/`outcomes` as the global layer; `distractions` gains nullable `session_id` (global captures) + optional `trigger_id`. His capture→reflection link is kept. |
| **M6** | Habits: his builders vs ours | Ours wins (identity votes, decay, 7-cap); gains `domain` + optional `anchor_cue`. `deen_habits`/`custom_habits` don't port as tables. |
| **M7** | LifeOS Insights vs Review/Insights tabs | One **Review** tab: Sunday review + our insights + his KPIs (coverage, noise share, focus map, stat tiles, 6-week trends) + the Wall. Mobile's separate Insights tab retires. |
| **M8** | Prayer streak vs D23 | Ruling 2. |
| **M9** | ULM streak+freeze vs D23 | Ruling 1. |
| **M10** | FSRS vs SM-2-lite | Ruling 4. |
| **M11** | "Hours" metric vs learn sessions | Storage identity ≠ metrics identity. The directive's "one session primitive" holds in the table; the **Hours depth metric counts only deep types** (deep_work, deep_study, exam_prep). A 7-minute learn session must not inflate Day Won/baselines/Delta — it counts toward Signal coverage and the Learn surfaces instead. This nuance keeps both metrics honest (merge rule 3.2). |
| **M12** | Reflection entries vs `journal_entries` | Separate tables, both kept. Deen reflections are 3-tier logged acts; journal entries are prose (and sensitive per CLAUDE.md rules). |
| **M13** | Day's shape vs DayTrace | Extend DayTrace: prayer anchors + his day-ribbon derivation. One timeline component, not two. |
| **M14** | ULM "cards" vs `cards` table | ULM tables are `lessons` / `lesson_cards` / `lesson_reviews`. The word "cards" bare keeps meaning the motivation rotation. |
| **M15** | His `profiles` settings vs ours | `profiles` gains: location (label/lat/lng), `prayer_calc_method`, `asr_madhab`, check-in window fields, `qada_owed`, signal-set (Ruling 11). One profile row, additive columns. |
| **M16** | Capture surfaces | One global **+ Capture** (voice/task/worry/note): the existing `/capture` + deterministic parser extends with type chips; worries stay `worries`; "note" lands as D26 did (a task-shaped row or journal entry — spec-first at build time). |
| **M17** | His Postgres RPCs vs D2/D19 | His logic RPCs (`save_allocation_checkin`, `upsert_session_hour`, …) do **not** port as RPCs. Logic → `packages/core`; writes → `packages/api`/edge per D2. Anything that genuinely needs SQL atomicity follows D19's wrapper rules. |

---

## 5. The ten rulings (+1 surfaced by code)

Recommendations with reasoning; you decide. Each ratified ruling becomes a D-number before Phase 1.

**R1 — Streaks in ULM: no streak counter; the due queue *is* the comeback mechanic.**
The brief wants a streak + earned repair freezes; D23 killed exactly that shape (a motivational
device plus its own antidote). But notice what ULM already has natively: **a miss produces a due
backlog that is finite, visible, and clearable — the same structure as qada.** That's the
domain-native "path back" the directive's §3.3 asks for: Deen has qada, work has recovery time,
learning has the due queue. So: per-day "session done" binary (a Day-Won analog), bounce-back as
the recovery stat, comeback framing on return ("3 days away — 12 due; clear them and you're
current"), effortful-win celebrations (the brief's own list: hard card finally recalled, comeback
after a gap, source crossing 80% retention), and memory strength as the real score. **Cost of this
choice:** we give up the loss-aversion pull that makes Duolingo sticky; the research report itself
says streak-optimization drifts products toward easy interactions, and FSRS's whole promise is
*fewer* reviews — a streak fights the scheduler. If engagement proves weak in practice, the fallback
is Option B: streak *language* on the session binary with unlimited "repair by clearing the queue"
— but earn that with evidence, don't pre-build it.

**R2 — Prayer streak: drop the counter, keep everything it was standing on.**
Islam's own repair mechanic is qada — **a miss is a debt to repay, not a chain to reset**, which
makes a consecutive-day streak counter theologically off-key *and* D23-noncompliant at once. Keep:
"days cleared" (all 5 on time — a per-day binary against a standard, exactly the Day Won shape D23
explicitly kept), on-time rate, the 30-day heatmap, and the qada backlog with its 7-day catch-up
view. The streak column in his code simply doesn't port. This is the cleanest of the ten calls: the
domain itself hands us the D23-compatible design.

**R3 — Calibration vs self-grading: both survive; they answer different questions in different
loops.** Sure/Think-so/Guessing is a *pre-reveal confidence* tap — it measures calibration and
feeds the illusion-of-competence rule (>15% sure-but-wrong), which is exam-critical and
load-bearing in S3. Again/Hard/Good/Easy is a *post-reveal difficulty* grade — it is FSRS's input
signal. They are orthogonal (before vs after, confidence vs effort). Question Bank keeps its taps
unchanged; ULM ships FSRS grades only (session friction matters more in a daily 5-minute loop).
The research report does endorse pre-reveal confidence for fighting fluency illusion — so a
confidence tap in ULM is a *v1.1 experiment*, not a launch feature.

**R4 — Schedulers: ULM ships FSRS now; the Question Bank stays on SM-2-lite this semester;
migrate later by swapping the replay function.** The decisive fact: QB scheduler state is
**derived-on-read from the append-only `attempts` log** — there is no stored state to migrate,
ever. "Migration" = a new replay function plus a rating mapping (correct+sure→Good/Easy,
correct+think-so→Good, correct+guessing→Hard — preserving today's guessing-holds semantics,
wrong→Again). Lossless, reversible, testable side-by-side on the same log. Given that, the only
question is *when*, and mid-semester is the wrong time: QB's scheduling is dominated by exam
curves (D-21/-14/-7/-3 overrides) where FSRS's long-horizon efficiency gains barely bite, and the
current ladder is working and user-validated. Let ULM prove `ts-fsrs` in production for a few
months, then migrate QB in a quiet week — or don't, if the exam-curve layer turns out to be doing
all the real work. Both libraries keep their own logs either way; nothing merges (scope rule 3.5).

**R5 — The 2-hour check-in: keep the engine, fold its triggers into moments we already touch, and
make the interrupting nudge opt-in.** His engine already concedes the directive's premise — it
suppresses windows during prayers and Lock-In sessions, replaces allocation with one-tap hourly
confirms *inside* sessions, never penalizes an expired window, and derives missed hours at read
time. That's most of the way to "don't interrupt the day." Finish the thought: (a) a completed
Hour auto-accounts its window (deliverable + domain = signal; never ask about time we already
know); (b) prayer logs and workout confirms auto-account their spans the same way; (c) the Night
Plan close-out shows the day's unaccounted windows for one-tap backfill (inside an existing
ritual, honoring the blueprint's no-fourth-touchpoint law that D24 enforced); (d) the every-2-hours
notification exists but ships **off**, per-day opt-in for grind days. Signal:Noise stays fully
computable; what changes is *who does the asking* — mostly the data we already have.

**R6 — Global score: agree — per-dimension, no grand total.** Concurring, not just deferring: the
dimensions are incommensurable (there is no exchange rate between Deen and Physique, and any
weighting *is* a philosophy of value smuggled in as a constant); a single number invites optimizing
the number (the exact failure the evidence-not-currency constraint exists to prevent); and
Aristotle's mean is per-virtue by construction — courage's mean and generosity's mean don't sum.
Dimensions stand side by side. The only cross-dimension surface should be *attention*: "Focus got
14 acts this week; Deen got 2" is information, not a score.

**R7 — Overshoot: yes — narrowly, objectively, and starting with the two dimensions where excess
is measurable.** It is philosophically right (the mean has two failure modes, and a no-guilt app
that can say *stop* proves the no-guilt copy isn't just marketing for *go*). But arrogance and
obsession are not machine-detectable, and an app guessing at character flaws is worse than silent.
So v1: overshoot fires only on **objective, user-set ceilings** — Focus (sustained daily deep
hours above the user's own ceiling while other dimensions starve) and Physique (training volume
above plan; Whoop recovery when connected). Copy in the refusal-that-explains-itself voice
("Six 10-hour days against a 6-hour ceiling. The mean cuts both ways — this week, less is the
virtue."). Traits overshoot is a monthly self-review prompt, never automated. Every other
dimension: fade-only until someone asks for more.

**R8 — Default home: one merged Today for everyone; the composition is context-aware, not
user-configured.** The prayers-first vs delta-first tension mostly dissolves in a time-aware
layout: the day's shape (prayer-anchored) is the spine, and the top slot follows the moment —
next prayer when one is imminent, Start Day before the day starts, the running Hour during one.
Per-user ordering is a settings surface, a test-matrix multiplier, and divergent muscle memory
between the three of you, purchased to solve a problem the layout doesn't have. Revisit only if
real use shows someone fighting the default. (Location unset → the shape row simply isn't there;
honest empty state points at Settings, as his UI already does.)

**R9 — Kill list vs MIT: one primitive, MIT wins. Weekly goals vs War Map: both, linked.**
The kill list and the MIT system are the same idea with the same cardinality (3), and ours is
already DB-enforced (`mit_rank` 1–3, unique per day) and fed by the Night Plan's risk-ranked dump —
the merged app must not carry two "today's 3" concepts. Business's page shows the business-tagged
MITs plus incomplete business tasks (a lens, per merge rule 3.4). Retire the "kill list" label per
M2's naming hazard. War Map (top-5 goals, monthly milestones) is the *store* of direction; his
weekly headline (`weekly_goals`: per-domain, week-scoped, milestones as lines) is the *cadence* —
port it with a nullable `goal_id` link so a weekly focus can (and usually should) be a War Map
milestone stepped down to this week. Today's focus chips read `weekly_goals`; Sunday review closes
them. Nothing merges into one table because they answer different questions (where am I going vs
what is this week for).

**R10 — Name: Ihsan.** Settled by you three. §2 is the config flag-and-timing answer. Worth
saying: the name is unusually apt — ihsan's classical sense (doing a thing with excellence *as if
seen*) is precisely the Desired Self pillar's frame.

**R11 (new, surfaced by code) — What counts as Signal?** His `sn-ratio.ts` hardcodes Signal =
Deen + Business; School/Fitness/Work are "other commitments," reported separately. That is a
personal priority ruling compiled into a metric — right for Ayman's app, wrong as a fixed law for
a multi-user one (a student's School hours are not semi-noise). Recommend: **signal-set on the
profile** — default "all five domains = signal, wasted = noise" (pure coverage semantics, matching
the directive's own definition of Signal:Noise as *where all the time went*), with a "priority
domains" lens preserving his current view exactly (he sets Deen+Business). One metric, one
personal lens, no hardcoded philosophy.

---

## 6. Design language & navigation

### 6.1 What "LifeOS is the design base" means in tokens

Aurora v2 (light liquid-glass + dark island) is **superseded as the surface**; its token
*architecture* (single source in `packages/design/tokens.ts` → `tailwind.css` → `native.ts`,
three-tier surfaces, two-edge rule, 11-step type ramp, radius/motion scales, the no-invented-values
discipline) survives and carries the new skin. From his `globals.css`, the actual system:

- **Ground/surfaces**: bg `#0a0a0c` · card/sidebar `#131316` · raised `#1c1c20` · borders
  `white/10` (inputs `white/15`) · text `#f2efec` / muted `#9a9aa2`. Shadows ~unused; hierarchy is
  border + `color-mix` tint, not elevation. The three-tier system maps 1:1 (ground/card/raised).
- **Domain accents** (the load-bearing idea): Deen `#e0a030` · Business `#4caf7d` · School
  `#6aa9ff` · Fitness `#9085e9` · Work `#d55181`, plus noise `#e85050`, and a separate
  **darker CVD-validated chart series** set (deen `#c98500`, business `#199e70`, school `#3987e5`,
  work `#d55181`, fitness `#9085e9`, noise `#e66767`). Adopt both scales as tokens; domain color
  threads through everything (Wall tiles glow their domain, Signal ring segments, chart series,
  sidebar active states).
- **Type**: Geist Sans + Geist Mono, numbers always mono + `tabular-nums` — adopt; it's half of
  what makes his data surfaces read calm. Our type *ramp* stays; the faces change.
- **Ambient**: his oxblood radial glow (`#2b0e13`) behind body + sidebar replaces the aurora wash.
  Aurora stops retire.
- **Grammar** (from the 16-page capture): big page title; sectioned panels (`rounded-2xl`, 1px
  border) with the three tile tiers (KPI accent-tinted / panel with hero value + delta pill / stat
  tile with "before you started tracking" baseline); Sun–Sat week strips; consistency heatmaps;
  quiet empty states with one CTA. **Ours to keep on top of it**: contracts, one-tap ceremonies,
  honest empty states, no-guilt copy, refusals that explain themselves, and the solid-opaque
  commit button rule (a decision is not a translucent surface — that ruling is grammar-independent
  and stays).
- Dark-only, like his (`color-scheme: dark`). No light theme in v1 — one theme, done well.

### 6.2 Five tabs ↔ the sidebar

Same IA everywhere; presentation differs by platform — they are the same thing *unfolded* on web:

**Web (his sidebar pattern, his groups):**
```
MAIN      Today · Learn · Self
LIFE      Deen · Business · School · Fitness · Work   ← the "Life tab", unfolded
REVIEW    Review
SYSTEM    Settings
          [+ Capture]  (persistent button above the groups)
```
His `app-sidebar` behavior (72px icon rail at lg, 248px expanded at xl, domain-tinted active
state) is the reference; no `/life` hub page needed on web — the group header does that job, and
the sector-progress chips live on Today. (A `/life` overview route can exist for symmetry; it's
low-priority.)

**Mobile (our Island dock, re-themed dark):**
```
Today · Learn · Life · Self · Review        + Capture as the Island's raised center action
```
`Life` is a hub screen: five domain cards (his sector-chip visual) → domain pages. Courses tab
retires into Life▸School; Insights tab merges into Review (M7). Tabs join the dock **when their
pillar ships** (Learn at Phase 4, Self at Phase 5) — a dock item that does nothing isn't an honest
empty state; until then the roadmap lives on Today, not in dead navigation.

### 6.3 Restyle vs replace vs port — the component ledger

**Restyle (retheme via tokens; logic and structure intact):** every `ui/` primitive on both
platforms (Panel, Button, Metric, Badge, EmptyState, Modal, Input, Toast, SegmentedControl, …);
all feature clients — HourClient, NightPlanClient, WallClient (+ domain glow), WeekReview,
Bank/Drill, the Grade Ledger suite, ScenarioPlanner, review forms, insights components, settings
sections, CheckinFlow, DeadlineRadar, FocusLauncher. The Island (mobile) restyles and takes the
5-tab config.

**Replace (new shells in the new grammar):** the web shell (TopBar+Island dock → sidebar app-shell
with rail); PageHeader (→ page-title + section-header grammar); the Aurora background component
(→ dark ground + oxblood glow); Today's composition (new layout: shape spine + sector chips +
Work Engine panel + morning brief).

**Port from LifeOS (logic verbatim into `packages/core`, views rebuilt per platform):**
- Pure modules, near-zero edits: `lib/prayer-times/*`, `lib/deen/*`, `lib/checkins/*` (windows,
  suppression, allocation math, session-hour resolution), `lib/business/{sn-ratio→per R11,
  sn-trend, focus-time}`, `lib/fitness/*`, `lib/insights/*`, `lib/home/day-ribbon`,
  `lib/charts/{donut,path,scale,ranked-bars}` — with his Vitest suites (201 test files; the pure
  ones come along).
- SVG components, near-direct ports (swap CSS vars for resolved tokens; `react-native-svg` on
  mobile): ProgressRing, DonutChart, AreaChart, BarChart, Sparkline, RankedBars.
- Rebuild views (web-only markup): ConsistencyGrid (heatmap), ReflectionMonthCalendar,
  the WeekHourGrid family, StatTile/DeltaPill/KpiCard (trivial), and AllocationCheckin — his drag
  code is pointer-events; mobile needs a Gesture Handler rewrite around the untouched
  `allocation.ts` math.
- Carry his `PROJECT_STATUS.md` + `docs/superpowers/specs/*` into `docs/lifeos/` as the "why"
  record for ported logic (his source comments cite them constantly).

---

## 7. Phased plan

Ordered so something is testable early, the app is never broken between phases, and every phase
ends with the consolidated-test-plan checkpoint the directive's process section requires. ULM's
backend (Phase 4a) is edge-side and can run in parallel from Phase 2 onward.

**Phase 0 — Rulings, rails, and a clean baseline** *(no user-visible change)*
Ratify §5 → D27+. Reconcile migration state (the `fix/review-findings-and-parity` branch and
`PENDING_DB_CHANGES.md` vs cloud — nothing new gets authored until `supabase migration list` is
coherent). Enable pgvector (§8.1) + choose the embeddings provider (§8.2). Additive migrations:
`task_sessions.session_type`/`domain` (backfilled), `profiles` columns (M15). Design tokens v3
drafted in `packages/design` (dark palette, domain scales, Geist) behind an unused flag.
**Gate:** run the still-unrun `VALIDATION_PLAN.md` on-device pass *before* the repaint — otherwise
every pre-existing bug found later gets blamed on the restyle. (Needs your 10-minute Canvas
connect first, per HANDOVER §6.2 — it's still pending.)
**Exit test:** verify green, cloud migrations coherent, validation baseline recorded.

**Phase 1 — The Ihsan shell** *(first visible milestone, ~everything restyles at once)*
Token flip + primitive restyle on both platforms; web sidebar shell; mobile Island → Today · Life ·
Review; Today recomposed (Work Engine spine + sector chips + brief; shape row appears when location
is set); Courses under Life▸School; Insights merged into Review (M7); wordmark → Ihsan.
**Exit test:** every existing feature reachable and working in the new shell; zero schema change
beyond Phase 0's; Ayman/Rayan can click through the whole app dark.

**Phase 2 — Life domains** *(shippable one domain at a time, in this order)*
**Deen** (prayer lib + salah/sunnah/adhkar/qada/Qur'an/reflection + heatmaps + location & method
settings + Today's shape anchors) → **Fitness** (plans/log/sets/cycle checks, seeds made editable)
→ **Work** (shifts, targets pipeline) → **Business** (MIT lens, weekly_goals + War Map link per
R9, ported action-plan layer per M5). Each is its own reviewable chunk with its own migrations.
**Exit test:** five live domain pages; a prayer logged on iPhone shows in web's heatmap; nothing
in School regressed.

**Phase 3 — One session, two metrics**
Session unification surfaces (type picker on the timer, Lock-In = Hour, required domain); global
distraction capture + triggers/action plans; the check-in engine per R5 (auto-accounting from
Hours/prayers/workouts, Night Plan backfill, opt-in nudge); Signal ring on Today (domain-segmented)
beside Hours depth; Review gains coverage/noise/focus-map/stat tiles.
**Exit test:** a full real day produces both metrics from one `task_sessions` table; a day with
Hours but no check-ins still shows honest (not zero, not guessed) coverage.

**Phase 4 — ULM (Learn tab ships at 4b)**
**4a (parallel-capable):** `sources` bucket, `ingest_jobs` state machine, extraction→chunk→embed→
extract→merge pipeline behind the gateway + Batch API, lessons with provenance gate, debug browse.
**Cost gate: validate $/book on three real books before optimizing (brief M1's exit test).**
**4b:** lesson cards UI, daily session (warm-up → due → new → closer, free recall before reveal,
AI grading assist w/ self-grade fallback), `ts-fsrs` + `lesson_reviews`, Learn tab joins the dock.
**4c:** memory-strength viz, weekly recap (rides weekly-synthesis), daily notification, R1's
comeback framing. Budget ceiling raise lands at 4a start (§8.4).
**Exit test:** the brief's own — a 300-page book → deck in <10 min; 7 consecutive founder-days
without a friction complaint; due queue tomorrow reflects today's ratings.

**Phase 5 — Desired Self (Self tab ships)**
`dimensions` (+ traits as children) with written definitions; `dimension_routes`; evidence streams
+ derived decaying scores (habits precedent); per-dimension pages (score ← tap → the acts);
claim_to_task → experiments bridge; overshoot v1 (Focus + Physique, R7).
**Exit test:** every dimension's number decomposes to visible acts; an ULM lesson tried as an
experiment shows up in its dimension within the day.

**Phase 6 — Cutover**
Consolidated validation pass over the merged app; TestFlight/EAS; **the §2 rename batch** (bundle
ID, slug, scheme→Universal Links on the Ihsan domain, SMTP, package scope); L1–L3; Whoop
registration if desired. **Exit test:** external tester onboards cold, per the ULM brief's M4 bar.

---

## 8. Infrastructure & cost notes

**8.1 pgvector** — required (chunk + lesson embeddings, day one per the brief's non-negotiables).
Available on the cloud project; one migration (`create extension if not exists vector` + the
embedding columns/indexes). Local Docker stack ships it too, so pgTAP coverage stays possible.

**8.2 ⚠ Embeddings provider — the credential the directive doesn't list.** Anthropic has no
embeddings API; the gateway cannot produce vectors. Options: **Voyage AI** (Anthropic-recommended,
`voyage-3.5-lite` class is more than enough and costs pennies per book) or OpenAI
`text-embedding-3-small`. Recommend Voyage. Consequences: a second AI vendor secret in edge
function config, a `llm_usage_log`-style cost line (fold into the same log with a `provider`
column), and a privacy note — book text now flows to a second processor (same server-side-only
rules apply). Needs your sign-off + key before Phase 4a.

**8.3 Ingestion runtime** — Edge Functions with a resumable job-step state machine (`ingest_jobs`:
step, cursor, error, attempt count; cron re-drives stalled jobs — same shape as the Deepgram
webhook flow, adapted to steps). Batch API for the extraction passes (submit → cron-poll →
collect), which both halves cost and removes the long-running-invocation problem entirely. Page-
range slicing bounds the only heavy synchronous step (text extraction). A dedicated worker is a
*response to a real failed book in M1 validation*, not a precaution.

**8.4 LLM budget** — current ceiling $5/month. Until Phase 4: leave it (the merge adds ~nothing;
note Sonnet's 2026-09-01 price step is already encoded in `costs.ts`). At Phase 4a: **raise to
$25/month** — covers the three validation books, then ~8–10 ingestions/month at the brief's
$0.50–$1.50 target plus grading assists (fractions of a cent × ~30 cards/day ≈ <$1/mo) plus the
existing crons, with honest headroom. Revisit against real numbers after the M1 cost validation;
the budget-block degrade path already fails safe (deterministic output, never an error).

**8.5 Migration hygiene** — everything additive; every migration touching existing tables
reversible; RLS on every new table with the same owner-only pattern; `npm run db:types` after each;
pgTAP debt (34–46, plus everything new) clears at the first Docker session per HANDOVER §4.1.
LifeOS tables are re-authored fresh (his 001–015 are unrecoverable from his repo) — treat his
`database.types.ts` as the spec of record, and expect small deliberate divergences (lb/in columns
gain a unit strategy decision, `co_op` → `work`, FK to our `profiles`).

**8.6 Notifications** — ULM's one-per-day notification and the check-in nudge both hit the known
Expo Go local-notification caveat (BLUEPRINT_RECONCILIATION's ⚠, still unprobed). The 10-minute
on-device probe is now doubly worth doing early; his PWA web-push stack (`dispatch-notifications`,
service worker) is the eventual web answer but is not merge scope.

---

## 9. What must not break

Everything in the directive's §9 list maps to a phase-boundary check: the consolidated test plan
at each exit reruns the affected slice of `VALIDATION_PLAN.md`, and `npm run verify` + the Deno
suite stay green throughout (D12: typecheck alone is not evidence). Specific tripwires this
document creates deliberately:

- **`task_sessions` changes (M1) are the highest-blast-radius edit in the plan** — calibration,
  friction analytics, DayTrace, Wall, Efficiency, and Day Won all read it. The `session_type`/
  `domain` columns are additive with defaults; no existing query may change semantics. C1's
  reasoning (don't corrupt abandoned-session semantics) still governs.
- Hours-depth metrics must exclude `learn` sessions from day one (M11), or Day Won quietly
  inflates and D23's whole structure loses meaning.
- The QB scheduler is untouched until the R4 migration is explicitly scheduled — no FSRS code
  path may import into `retrieval/` in the meantime.
- Nothing writes points, streak counters, or stored scores anywhere (R1/R2/R6 + the habits
  precedent): every score in Ihsan is derived from a log, and that is now a review-checkable rule.
- If any merge step would degrade a working feature, stop and surface it (directive §9) — the
  precedent is D15/D20 discipline, not silent trade-offs.

---

*Next step: your rulings on §5 (R1–R9, R11 — R10 is settled). On approval, Phase 0 starts under
the established format: reviewable chunks, per-chunk commits, D-numbers for every decision,
spec-first where genuinely ambiguous.*
