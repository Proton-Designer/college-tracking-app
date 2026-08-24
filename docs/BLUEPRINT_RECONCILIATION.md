# Blueprint Reconciliation — `docs/BLUEPRINT.md` vs. the codebase at HEAD

> Produced 2026-08-24 against commit `257ef79`. Every classification below was checked against
> migrations, `packages/core`, `packages/api`, and `supabase/functions` — not inferred from
> documentation. Where a row says "exists", it names the table or file. Nothing here is built;
> this is a map and a set of rulings the Lead owes before Phase 1 starts.

**Legend:** **(a)** exists as-is · **(b)** exists but diverges — divergence described ·
**(c)** does not exist

---

## The verdict in one paragraph

The blueprint and this codebase are **not** the same product wearing different words, but they are
much closer than the vocabulary suggests — and they overlap in the *opposite* place from what you'd
guess. The blueprint's **Academics module (Part V) and integration layer (Part XI) are largely
already built**, in precisely the architecture the blueprint specifies: LLM at the edges, staged
extractions, a confirm step that is the only path to real data, a deterministic scheduler in the
middle. Meanwhile the blueprint's **spine — the Deep Work Hour, Delta, Chain, Day Won, the Wall —
barely exists at all**. So the honest summary is: *you have built the manager and not the engine.*
Phase 1 as you scoped it is therefore almost entirely new construction sitting on top of an
unusually mature substrate, and the main risk is not missing infrastructure but **concept
collisions**, where an existing table means something subtly different from the blueprint word that
matches it.

---

## Headline findings

1. **`task_sessions` is already 70% of `work_hours`.** It has `actual_start`,
   `planned_duration_min`/`actual_duration_min`, `location`, **`interruptions`** (a distraction
   count), `subjective_focus`, `objective_output`, `phone_usage_min`, and a `status` of
   `active | completed | abandoned` — plus a **unique partial index enforcing one active session per
   user**, explicitly so a timer can be resumed from `actual_start` by wall clock after the app is
   backgrounded or killed. That is the blueprint's background-safe Hour timer, already designed and
   already in the schema.

2. **`tasks.mit_rank` is already "star 3, crown 1".** A `smallint check (mit_rank between 1 and 3)`
   with a partial unique index enforcing at most one task per rank per day. Rank 1 is the crown.
   The Night Plan's central mechanic exists as data; what does not exist is the *nightly,
   forward-looking ritual* that writes it — today MITs are set in the **morning** check-in.

3. **There is no Chain, and the codebase has an explicit position against one.**
   `packages/core/src/bounceback/bounceBack.ts` carries the comment *"Measures time-to-recovery,
   **not streaks**."* No `wake_at`, no `day_won`, no `baseline_hours`, no streak column anywhere.
   The blueprint's Chain + Day Won + repair tokens is not merely missing — it is a **philosophical
   reversal** of a deliberate existing decision, and needs a ruling rather than an implementation.

4. **The Grade Ledger is done.** `grade_categories` (with `weight_pct`, `drop_lowest_n`,
   `expected_item_count`), `grade_items`, `grade_boundaries`, plus `courseGrade.ts`,
   `requiredScore.ts` and `scenario.ts` in `packages/core`. The blueprint models the weight table as
   `weight_table jsonb`; the existing relational version is strictly better and should win.

5. **Whoop is built, and Google Calendar is already anticipated in the schema.**
   `oauth_connections.provider` is a CHECK constraint already listing `whoop`, `google_calendar`,
   `microsoft`, `rescuetime`, with tokens held as `vault_secret_id` — the blueprint's
   `integration_accounts` with encrypted tokens, done. `calendar_events.source` already permits
   `'google'`. Canvas is the only Tier-1 provider absent from both.

6. **The Question Bank has no counterpart at all** — no questions, attempts, intervals, or ease.
   Beware one false friend: `packages/core/src/calibration/` exists but means **duration
   calibration** (estimate vs. actual minutes), *not* the blueprint's confidence-vs-correctness
   calibration. Same word, different concept, and they must not be merged.

---

## Part IV — Core (the Work Engine, Planning, Cards, Habits, Insights, Accountability)

| Blueprint feature | Class | Evidence / divergence |
|---|---|---|
| Hour timer, 60 min, persisted, background-safe | **(b)** | `task_sessions` + migration 12 give a resumable wall-clock timer with one-active-per-user enforced in the DB. **Diverges:** it is bound to a `task_id` (NOT NULL) and has a flexible `planned_duration_min`; the blueprint's Hour is a fixed 60-minute unit with an `index` within a day and a free-text `deliverable`, not necessarily a task row. Web route `/focus/[sessionId]` exists. |
| Distraction counter | **(b)** | `task_sessions.interruptions` is a plain `smallint`. **Diverges:** no cause taxonomy. The blueprint wants 6 cause chips and a `distractions` row per tap (needed for the Pareto chart). Today you can know *how many*, never *why*. |
| End-of-Hour flow (log → cards → submit) | **(c)** | Session completion fields exist (`subjective_focus`, `objective_output`); the three-step flow, the category chip, and the card rotation do not. |
| Delta clock (wake → first Hour) | **(c)** | No `wake_at` / Start Day anywhere. Note `daily_checkins` is the morning ritual but records **energy/mood/capacity**, not wake time. |
| Per-weekday baseline, Day Won | **(c)** | No `baseline_hours`, no `day_won`. Nearest existing concept is `packages/core`'s Floor/Target/Stretch **capacity in minutes** (snapshotted on `daily_checkins`) — a different unit and a different philosophy (capacity ceiling vs. achievement floor). |
| Break timer | **(c)** | — |
| Chain calendar + repair tokens | **(c)** | See headline 3. Direct conflict with `bounceBack`'s stated anti-streak position. |
| Sticky Wall (all Hours as tiles) | **(c)** | No proof-surface UI. Data to build it partially exists once Hours do. |
| Night Plan: dump → star 3 → crown MIT | **(b)** | `tasks.mit_rank` models star/crown exactly (headline 2), and `rankSuggestedMits` already ranks candidates by risk-reduction-per-minute. **Diverges hard on timing and direction:** MITs are written by `submitMorningCheckin` (morning, for today); `daily_reviews` is the night ritual and is **backward-looking** (`proud_text`, `went_wrong_text`, `important_note_text`). The blueprint moves the anchor to night and makes it forward-looking. |
| Night close-out stats | **(b)** | `daily_reviews` already captures `mits_planned/completed`, `deep_work_planned/actual_min`, screen time, workout. Blueprint shows these as auto-derived stats rather than asking; most are already derivable. |
| War Map Lite (Top 5 Goals → monthly milestones) | **(c)** | No goals or milestones tables. False friend: `deliverable_backplans` / `backplan_milestones` exist but decompose an **academic deliverable**, not a life goal. |
| Worry List | **(c)** | — |
| Cards library (goal / motivation / thought habit / 2.0 trait / 10X) | **(c)** | Nothing comparable. |
| Habits: 6 keystones, identity votes, decaying 0-100 score | **(c)** | **False friend:** `kill_habits` is the *inverse* concept — habits to **quit**, with a 5-level escalation ladder (`commitment_level`), trigger/urge/replacement fields, and `kill_events`. There is no positive-habit, vote, or decaying-score model anywhere. |
| Insights: delta, efficiency ratio, hours by category, distraction Pareto | **(b)** | A substantially **richer** insight layer already exists — `insights` with a confidence gate, `experiments` + measurements, `decision_journal`, `risk_snapshots`, friction analytics, and the daily→weekly→monthly→`semester_lessons` summary pyramid. **Diverges:** none of the blueprint's *specific* metrics exist, because they all derive from Hours/Delta, which don't. |
| Accountability: group, shared feed, leaderboard | **(c)** | No group tables. **Architectural note:** every RLS policy in this schema is `auth.uid() = user_id` single-owner. A shared feed needs genuinely new policy design, and `N3` in FOLLOWUPS records the product as deliberately single-user. This is the largest structural change in the whole blueprint. |
| Advanced: output metric, 100-Hour Sprint, stacked hours | **(b)/(c)** | `objective_output` is free text; blueprint wants `output_value` + `output_unit` (numeric, chartable). Sprints and stacked hours: none. |

---

## Part V — Academics

| Blueprint feature | Class | Evidence / divergence |
|---|---|---|
| Syllabus ingest → structured data → **diff you confirm** | **(a)** | `syllabus-extract` stages into `syllabus_extractions` (`status='pending'`) and **never** writes academic data; `syllabus-confirm` is documented as *"the ONLY HTTP path from a staged extraction to real academic data"*, deployed server-side specifically so the check cannot be bypassed client-side. This is the blueprint's architecture, already implemented, with a stronger guarantee than the blueprint asks for. Gated on `ANTHROPIC_API_KEY`. |
| Announcement paste → diff → apply | **(c)** | No `parse_announcement`, no `announcements` table. **But the pattern is fully established** — this is a near-clone of the syllabus pipeline (stage → confirm), plus the ICS staging precedent in `ics_event_extractions`. Cheapest high-value academic addition. |
| Assessment taxonomy (8 types) | **(b)** | `deliverables.type` is an enum of `paper, report, problem_set, exam, project, reading`. **Missing:** `quiz`, `post` (discussion post), `admin`. Enum extension, plus `deliverables` already has `due_at` + a trigger-computed `local_due_date`, `weight` via `grade_items`, `estimated_minutes`, `status`. |
| Method Modes (retrieval / interleave / draft / recite / compose / cards) | **(c)** | Nothing. No `sessions.mode`, nothing shown on a timer screen. This is the blueprint's single biggest *pedagogical* addition and it is entirely absent. |
| Question Bank + SM-2-lite + confidence taps | **(c)** | Entirely new (headline 6). |
| School Today (ordered list feeding the Night Plan) | **(b)** | `today.ts`/`dayView`, `rankSuggestedMits`, and `weekly_plans`/`weekly_plan_blocks` (free-interval placement against a capacity ceiling, with `weekly_plan_unplaced` disclosing what didn't fit) do most of the thinking. **Diverges:** no per-course ordered "tomorrow" list, no Mode annotation, and it feeds a *weekly* surface rather than a nightly dump. |
| Load forecasting / overflow warnings | **(b)** | Weekly planning respects a capacity ceiling and reports unplaced work explicitly. **Diverges:** no 3-week forward overflow warning; horizon is one week. |
| Grade Ledger (projection + target calculator) | **(a)** | Headline 4. `requiredScore.ts` is literally *"need ≥ 84 on the final"*. |
| Feedback rules (5.6 benchmark rules) | **(b)** | A rules layer exists — `interventions`, `escalationLadder`, `deviationPrompt`, `staleTaskPrompt`, `confidenceGate`, `calibrationInsight`, `experimentOutcome`. **Diverges:** none of the blueprint's five specific benchmark rules exist, and two of them depend on data that doesn't (practice-test scores, confidence calibration). |

---

## Part XI — Integrations

| Blueprint feature | Class | Evidence / divergence |
|---|---|---|
| Unified `signals` table | **(b)** | `telemetry_events` (`source`, `type`, `metric`, `value`, `unit`, `occurred_at`, `local_date`) is signal-shaped and already carries `external_id` (migration 21). **Diverges:** it is *metric*-shaped (one numeric value) where the blueprint's `signals` is *payload*-shaped (`jsonb`) with a `processed` flag. Events like `geofence_enter` or `announcement` don't fit a numeric metric. |
| `integration_accounts` with encrypted tokens | **(a)** | `oauth_connections` + `vault_secret_id` → Vault. Headline 5. |
| Whoop OAuth + webhook + reconcile | **(a)** | `whoop-oauth-callback`, `whoop-webhook` (HMAC signature check **is** the authentication, `verify_jwt = false`), `_shared/whoop/*` (tokenStore, refresh, resource fetch, ingest, normalize), `health_daily` rollups. Essentially the blueprint's spec, shipped. |
| Canvas token poll + ICS feed | **(b)/(c)** | The **ICS half is a near-clone of an existing, working feature**: `brightspace-sync` fetches a Vault-stored feed URL, parses it, stages into `ics_event_extractions`, and only `brightspace-confirm` writes `calendar_events`. Canvas ICS is the same shape with a different provider. The **REST poll (announcements, grades) is new**, and `oauth_connections.provider` needs `'canvas'` added to its CHECK. |
| Google Calendar read/write | **(b)** | Schema anticipates it (`provider` includes `google_calendar`; `calendar_events.source` includes `'google'`; `is_class_meeting`, `course_id` present). **No sync function exists** — the whole `gcal_sync` job is unbuilt. |
| Rules engine on signal insert | **(b)** | `interventions` + the core rule functions constitute a rules engine, but it is **hard-coded domain logic**, not the blueprint's data-driven `rules` table (`trigger`/`condition`/`action` jsonb). |
| `origin: auto` tagging on machine writes | **(c)** | No provenance column on the affected tables. Worth adopting regardless of the rest — it's the same instinct as `syllabus_extractions`' staging. |
| Screen Time | **(b)** | Blueprint correctly concludes there is no read API. **The repo already ships the workaround:** `rescuetime-sync` + `screen_daily` + `screenDailyRollup`. That is a real asset the blueprint doesn't credit. |
| HealthKit steps/sleep | **(c)** | Needs dev build. |
| Geofencing | **(c)** | Needs dev build (background location). |
| Shortcuts / App Intents / NFC | **(b)/(c)** | A URL scheme exists (`collegeos://`, `deepLink.ts`) — but see the security caveat: **L1 in FOLLOWUPS says `collegeos://` is hijackable** and must move to Universal Links. App Intents and NFC are absent. |

---

## Collisions requiring an extend-vs-replace ruling

These are the seven places where a blueprint concept lands on an existing one. My recommendation is
given, but **the ruling is yours** — several of these are philosophy, not engineering.

| # | Collision | Recommendation | Why |
|---|---|---|---|
| **C1** | **Hour** vs `task_sessions` | **Extend** | The hard parts — resumability from a wall-clock timestamp, one-active-per-user enforced in the DB, the active/completed/abandoned distinction the calibration engine depends on — are done and were expensive to get right. Add `hour_index`, `deliverable`, `category`, and relax `task_id` to nullable so an Hour can exist without a task row. Replacing this table would throw away the abandoned-session semantics and silently corrupt duration calibration. |
| **C2** | **Distraction causes** vs `task_sessions.interruptions` | **Extend, additively** | Keep the counter (it feeds existing analytics) and add a `distractions` child table with the 6-cause enum. The count becomes derivable, but leave the column — rewriting it to a view would break `frictionAnalytics`. |
| **C3** | **Night Plan** vs `daily_checkins` (morning MITs) + `daily_reviews` (night reflection) | **Extend, but move the ritual** | `mit_rank` already models star/crown. What changes is *when* MITs get written (night, for tomorrow) and that `daily_reviews` gains the forward-looking dump. This is the highest-value behavioural change in the blueprint and the cheapest structurally — but it makes `submitMorningCheckin` partly redundant, which needs your call. |
| **C4** | **`assessments`** vs `deliverables` | **Extend** | `deliverables` already carries the trigger-computed `local_due_date` that keeps the B4 timezone bug from recurring, plus FK links to `grade_items`. Add `quiz`/`post`/`admin` to the enum. **Do not create a second table** — two due-date tables is exactly the "two sources of truth" failure `check:core-mirror` exists to prevent. |
| **C5** | **`sessions`** (study block, mode-annotated) vs `task_sessions` **and** `weekly_plan_blocks` | **Extend `weekly_plan_blocks`; add `mode`** | This is the messiest collision: the blueprint's `sessions` is a *planned* block (which `weekly_plan_blocks` already is, with a link to a task added in migration 33) that later becomes an *executed* Hour (which `task_sessions` already is). Keep the plan/execute split that already exists rather than collapsing it into one table. `mode` is a new column on the planned side. |
| **C6** | **Habits** vs `kill_habits` | **Add alongside — do not merge** | They are opposites: quit-with-escalation vs. build-with-identity-votes. Merging them would produce a table where half the columns are always null. A new `habits` + `habit_logs` pair, capped at 7 as the blueprint insists. |
| **C7** | **`signals`** vs `telemetry_events` | **Extend if payloads stay numeric; add alongside if not** | Genuinely borderline. `telemetry_events` is a good fit for sleep/recovery/steps (numeric metrics) and a poor fit for announcements and geofence events (structured payloads). My lean: **add a `payload jsonb` + `processed` column to `telemetry_events`** and keep one table, because two event tables will drift. |

Two further items are **philosophy rulings, not collisions**, and I will not pick them for you:

- **C8 — Chain / Day Won / repair tokens.** The codebase currently rejects streaks by name. Adopting
  the Chain is a deliberate reversal. It is defensible (the blueprint's repair tokens and decaying
  scores are exactly the guilt-churn mitigation the habit research prescribes) but it should be
  recorded as a decision in `.brain/memory/decisions.md`, not slipped in.
- **C9 — Accountability group.** Every RLS policy in this schema is single-owner. Multiplayer is the
  one blueprint feature that changes the security model rather than adding to it, and FOLLOWUPS' four
  🔴 security items (L1–L4) should be closed before real people are on a shared feed — the blueprint
  says as much itself.

---

## Cannot work in Expo Go on the SDK 54 baseline

Verified against SDK 54's `bundledNativeModules.json`, so "in Expo Go" here means the module ships
with the client, not merely that it exists.

| Feature | Phase | Status |
|---|---|---|
| Home-screen widget (Chain + MIT) | 4 | **Dev build.** No Expo Go path at all. |
| Live Activity timer | 4 | **Dev build.** |
| HealthKit steps/sleep | 4 / I2 | **Dev build.** |
| Background geofencing | I3 | **Dev build.** `expo-location` ships in Expo Go, but *background* region monitoring needs `expo-task-manager` with background modes declared via config plugin. |
| **Remote push notifications** (group pings, server-sent morning nudge) | 4 / F | **Dev build.** Since SDK 53 Expo Go has no Android push and iOS push requires a dev build. |
| App Intents / NFC automation | I2 | **Dev build.** |
| FamilyControls / Screen Time panel | I4 | **Dev build + Apple entitlement approval.** |
| **Local scheduled notifications** (Hour-end at 60:00, Night Plan 9:30 PM) | **1** | ⚠️ **Needs a 10-minute on-device check before Phase 1 commits.** `expo-notifications ~0.32.17` ships in Expo Go and *local* scheduling is expected to work where *push* does not — but Expo has been narrowing Expo Go's notification support release over release, and **Phase 1's two most important rituals both depend on it.** If local scheduling turns out to be unavailable, the fallback is in-app-only timing (works while the app is foregrounded, useless for the 9:30 PM anchor), which would materially weaken the retention thesis in Part VII. Verify first, design second. |

Everything else in your Phase 1 scope — timer, counter, End-of-Hour, Night Plan, Start Day, delta,
Chain, Wall — is plain React Native and Supabase. **No dev build required for Phase 1.**

---

## Credentials to prepare

| Credential | Unlocks | Status |
|---|---|---|
| **`ANTHROPIC_API_KEY`** | Syllabus parsing (built, currently refuses with an honest 503), `parse_announcement`, LLM enrichment on nightly/weekly reports, morning brief, weekly narrative | **Unset.** Already tracked as 🔴 L4. `docs/SUPABASE_SETUP.md` §7 has the 5-step activation checklist. Nothing in Phase 1 or Phase 2/S1 needs it. |
| **Canvas personal access token** | Announcement poll, assignment reconciliation, auto-filled Grade Ledger | Not present. Generated by you in Canvas → Account → Settings. Needs `'canvas'` added to `oauth_connections.provider`'s CHECK and Vault storage. |
| **Canvas per-user ICS URL** | Redundancy check on dated items | Not present. Treat as a **bearer credential** → Vault, per the F3 ruling already made for the Brightspace `ics_url`. |
| **Google OAuth client (+ refresh token)** | Calendar read (real free/busy for the scheduler) and write (Hours as calendar blocks) | Not present. `oauth_connections` already lists `google_calendar`; only the client credentials and sync function are missing. |
| **Whoop OAuth** | Sleep/recovery/workout signals, automatic Train + Sleep votes | **Integration built.** Needs live credentials + webhook secret to activate. |
| Custom SMTP, Universal Links | Not blueprint features, but 🔴 L1/L3 — and **prerequisites for C9 (multiplayer)** | Outstanding. |

---

## Rulings — decided 2026-08-24

All nine are settled. This section is now a record, not a request.

| # | Ruling | Outcome |
|---|---|---|
| **C1** | Hour vs `task_sessions` | **Extend `task_sessions`.** No separate `work_hours` table. |
| **C2** | Distraction causes | **Extend additively** — keep `interruptions`, add a `distractions` child table with the 6-cause enum. |
| **C3** | Night Plan vs morning check-in | **MIT-setting moves to the Night Plan.** The morning check-in is **kept but slimmed to a confirm-and-start step** — not deleted. `submitMorningCheckin` shrinks; it does not disappear. |
| **C4** | `assessments` | **Absorbed into `deliverables`.** Extend the enum with `quiz`/`post`/`admin`. No second due-date table. |
| **C5** | `sessions` | **Plan/execute split stays.** `weekly_plan_blocks` plans (gains `mode`), `task_sessions` executes. |
| **C6** | Habits | **New `habits`/`habit_logs` alongside `kill_habits`.** Never merged — they are opposites. |
| **C7** | `signals` | **One table.** `telemetry_events` gains `payload jsonb` + `processed`. |
| **C8** | Chain / Day Won / repair tokens | **🔴 Chain rejected.** Anti-streak position holds; bounce-back / time-to-recovery stays the core metric. Recorded as **D23** in `.brain/memory/decisions.md`. **Day Won and the Wall are kept** — see below. |
| **C9** | Accountability group | **Out of scope this semester.** Nothing is designed toward it; every RLS policy stays single-owner. |
| **Units** | Hours vs capacity minutes | **Hours are the user-facing unit; minutes stay internal.** Day Won is defined in Hours. |

### What C8 changes, precisely

The Chain is the *only* thing removed. Retained from that part of the blueprint:

- **Day Won** — a per-weekday baseline hit. A daily binary against a standard, not a streak.
- **The Wall** — the proof surface, which only grows and carries no penalty. Part VII's "proof
  compounds, never debt" property survives intact; it was never the Chain that delivered it.

Dropped: consecutive-day counters, the Seinfeld calendar, repair tokens, and the
`chain_repair_used` column from the planned `days` table. Recovery is surfaced instead as
**bounce-back** — time from a missed baseline back to a Day Won — reusing
`packages/core/src/bounceback/`, which already exists and already means this.

Full reasoning, including why the blueprint's own case for the Chain does not overturn the existing
position, is in **D23**.
