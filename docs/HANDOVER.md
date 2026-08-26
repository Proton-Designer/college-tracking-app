# HANDOVER — for Ayman, 2026-08-26

> **Read this one document and you know everything.** It is the map; every claim links
> to the territory. Written at the end of the final build-out session, for you to
> debug, review, and merge with your version.
>
> Reading order after this file: `HANDOFF.md` (the deep handoff — machine setup,
> recurring failure patterns, §10 especially) → `docs/VALIDATION_PLAN.md` (the one
> consolidated test pass, 15 features) → `.brain/memory/decisions.md` (full D-number
> reasoning) → `docs/BLUEPRINT_PLAN.md` (session-by-session state headers).

---

## 0. State at handover

- HEAD: see `git log` — the working tree is clean; **~65 commits ahead of
  `origin/main` and UNPUSHED** (this machine has no GitHub auth: no stored HTTPS
  credentials, no `gh`, no SSH keys — see §7.1). Every commit message carries its full
  reasoning; the history IS documentation.
- `npm run verify` exit 0: **448 core + 30 api + 2 mobile** tests. `deno test -A` from
  `supabase/functions/`: **133** (the `-A` matters — without it 4 tests fail on
  env/net permissions; that is the flag, not a regression). `next build` clean.
- **46 migrations**, all applied to the cloud project (`jcikqbxwjmdduwprixpy`).
  17 tables added since migration 34, RLS verified live two ways (anon probes +
  psql role-simulation with stranger/owner subs). pgTAP for 34–46 still owed (Docker).
- **16 edge functions deployed**, including this session's `canvas-sync`,
  `lecture-transcribe`, `lecture-transcript-webhook`.
- **The cron layer is NOW live** — it had never been active in cloud (the Vault
  secrets gating registration were never created; every earlier "nightly" was
  on-demand). Fixed this session: `cron_shared_secret` / `edge_functions_base_url` /
  `edge_functions_anon_key` created in Vault, three jobs registered and active.
- Setup mode on this machine: **cloud, no Docker** (`npm run bootstrap -- --cloud`);
  HANDOFF §3 is the new-machine runbook and was executed against a real fresh clone.

## 1. Feature map — what exists and where

Layout law: UI shells own layout only; every domain calculation is in `packages/core`
(mirrored to `supabase/functions/_shared/core` — the staleness guard is load-bearing);
all data access in `packages/api`; Deno edge functions are the only backend.

| Feature | Core | API | Edge | Mobile | Web |
|---|---|---|---|---|---|
| Closed loop (check-in→review), tasks, focus, interventions, insights, experiments, decisions | `checkin/ planning/ friction/ interventions/ insights/ recovery/ bounceback/` | `day/dayView` etc. | nightly-analysis, weekly-synthesis | tabs | 17 routes |
| Courses, deliverables, grades, risk, scenarios, backplans | `grades/ risk/ backplan/` | `academic/` | — | courses/[id] etc. | same |
| Syllabus → confirm; Brightspace ICS → confirm | — | `syllabusExtractions` etc. | syllabus-extract/-confirm, brightspace-sync/-confirm | upload web-only (N5) | full |
| Work Engine: Hour timer, distractions, Night Plan, Start Day, Delta, Day Won, Wall (**now keyset-paged w/ true count**), routines, cards, habits, worries, goals/War Map, baselines | `hours/ habits/ cards/` | `day/` | — | full | **not ported** (§4.2) |
| Announcements: paste + **Canvas auto-poll** → parse → confirm; **per-course history** | — | `announcements`, `canvas` | parse-announcement, announcement-confirm, canvas-sync | /announcement, /announcements, history on course detail | paste modal |
| **Canvas**: connect (PAT→Vault), human course-mapping, hourly poll, **grades→Ledger staged (4th one-path-to-done)** | — | `data/canvas` | canvas-sync (cron pollAll + user modes + gradeDecision) | Settings card, course-detail grades panel | — |
| S3 Question Bank: SM-2-lite (derived, no stored scheduler state), interleaved drill, confidence calibration, AI drafting | `retrieval/` | `questionBank`, `questionDraft` | question-draft | /bank, /drill | /courses/[id]/bank, /drill |
| Tier 5 (D25): exam retrieval curves (derived), 3-week load forecast, practice tests + 5.6 benchmark, origin='missed' conversion | `retrieval/examCurve`, `planning/loadForecast`, `retrieval/practiceBenchmark` | `practiceTests`, `planning/threeWeekForecast` | — | ExamPrepSection, /week forecast | — |
| **Lecture capture** (import-only; in-app recording FAILED the Expo Go probe and waits for the dev build) | — | `data/lectures` | lecture-transcribe, lecture-transcript-webhook | /lectures + Bank prefill | — |
| **Voice capture** (V2 Phase 1): dictation → deterministic parse → confirm → createTask | `capture/parseUtterance` | — | — | /capture | Capture modal on /today |
| Morning brief (cached once/day, deterministic-first) | — | `morningBrief` | morning-brief | Work Engine header | /today (**new**) |
| Weekly narrative | — | `agentReports` | weekly-synthesis | /week panel (**new**) | — |
| WHOOP, RescueTime (built, offline-proven; Whoop needs credentials to activate) | `integrations/` | `integrations` | whoop-*, rescuetime-sync | Settings | Settings |
| Account export/delete, LLM budget ceiling + usage log (fails CLOSED on unlogged spend) | — | `accountManagement`, `llmUsage` | account-export/-delete | Settings | Settings |

## 2. Every decision, one line each (full reasoning: `.brain/memory/decisions.md`)

| # | Decision — why |
|---|---|
| D1 | Two UI shells, one shared brain — web/mobile craft differs; logic must not. |
| D2 | Edge functions are the only backend — one backend for two clients, keys server-side. |
| D3 | Local Supabase first, cloud = two env vars — real stack either way. |
| D4 | Internal packages source-resolved, no dist — a build step reintroduces stale-dist traps. |
| D5 | Version pins (TS 5.9.3, Jest 29, expo-install-only natives) — "latest" broke each one in ways that look like success. |
| D6 | Risk is weighted-additive, not the brief's pure product — one zero factor must not zero the score. |
| D7 | Missing risk factors excluded + renormalized, never defaulted — a default is a fabricated measurement. |
| D8 | Crash plans never drop the submission phase — a plan that skips submitting isn't compression. |
| D9 | LLM never calculates, never chooses what matters — Law 2's enforcement. |
| D10 | Extraction never auto-writes academic data — confirmation is structural (no write path exists). |
| D11 | `@collegeos/api` platform subpath exports — one package, per-platform clients. |
| D12 | `verify` must mean something — the four guards each caught a real bug; never disable one. |
| D13 | Local GoTrue reads config.toml at container start — edit-without-restart looks like a code bug. |
| D14 | Integration tests idempotent and run twice — green once is not green. |
| D15 | Realistic seed data is a bug-finding tool — sparse seeds hide real failures. |
| D16 | core is mirrored into Deno; the staleness guard is load-bearing — drift = two risk engines. |
| D17 | Scheduling gated on a Vault secret, not extension detection — **and note §3.4: the cloud Vault secrets didn't exist until this session.** |
| D18 | Every integration-test assertion scoped by user_id — unscoped queries matched prior runs and passed. |
| D19 | `private.*` needs explicit public wrappers — PostgREST can't reach private; pgTAP alone proved nothing. |
| D20 | Not done until a real request path calls it — five features shipped correct and unreachable. |
| D21 | Green verify says nothing about what's committed — uncommitted peer state burned us. |
| D22 | Commit by pathspec in a shared tree — a bare commit swept in a peer's staged work. |
| D23 | No Chain; bounce-back is the recovery metric — the Chain needs antidotes; bounce-back measures what they protect. |
| D24 | /day + /today merged, Work Engine as the spine — the blueprint's Part II/V/X, all three. |
| D25 | "Tier 5" = the S4 block — interpretation, flagged for you to overrule cheaply. |
| D26 | Reminder ≡ task with planned_start_at — no second concept; voice-created = typed. |
| C1–C9 | Blueprint collision rulings — `docs/BLUEPRINT_RECONCILIATION.md` (C1 Hours extend task_sessions; C9 multiplayer out of scope, RLS stays single-owner). |

## 3. Facts from this session you'd otherwise discover the hard way

1. **The cron layer was dead in cloud until today** (§0). If you see months of missing
   nightly rows, that's why — not a code bug.
2. **The Canvas token is verified good** (200 against uta.instructure.com, name +
   courses returned) **but not connected in-app**: the runtime's permission layer
   declined agent writes to production data, and connect needs the owner's session.
   It is a 2-minute step — VALIDATION_PLAN §3 has it, including the course-mapping
   notes (local course id 1 looks like test data; three real courses need local rows).
3. **Deepgram webhook auth is possession-of-URL** (per-row token), because Deepgram
   callbacks carry no HMAC — the deliberate adaptation of the whoop-webhook pattern;
   reasoning in `_shared/lectures/deepgram.ts`'s header. Missing/bogus token → 401,
   probed live.
4. **The "DayTrace ignores task-less Hours" flag was stale** — retired by inspection,
   not fixed: `startHour` sets `planned_start = now` deliberately; ad-hoc Hours render
   in both lanes; only the late-starts caption excludes them (correctly — they can't
   be late). Commit `406b992` has the full trail.
5. **Sonnet pricing steps up 2026-09-01**; `_shared/llm/costs.ts` already encodes it.
6. `deno test` needs `-A`. `supabase db diff --linked` needs Docker. `functions deploy`
   needs the config.toml `import_map` entries (CLI ≥2.115). All in HANDOFF §3.2.

## 4. Debt list — the honest ledger

### 4.1 Verification debt
- **pgTAP for migrations 34–46** — needs any Docker machine; the RLS record until then
  is live anon probes + role-simulation (both passed, both weaker than pgTAP).
- **E2E (28 specs) + api integration (101) + Deno live-DB suites have not run since
  the original handoff** — local-stack-only by design. First Docker session: run all.
- Nearly all mobile verification ran through Expo Web; HANDOFF §9.4 lists the four
  interaction classes that harness structurally cannot see. The consolidated
  validation pass (VALIDATION_PLAN) is on-device for exactly that reason — and it has
  NOT been run yet; it is the next human step.
- S3 and everything after was built verify-green but never user-validated (deferred
  by the owner's working format to the one consolidated pass).

### 4.2 Product debt (largest first)
- **Web parity for the Work-Engine surfaces** (Hours timer, Night Plan, Wall, week,
  cards/habits/worries/goals) — deliberately NOT built in the final session: you are
  merging with your own version, and five pre-built web screens would be merge
  conflict, not progress. The shared data layer makes each a thin port.
- Announcements worklist + Canvas card + lectures + exam-prep surfaces are
  mobile-only (web has the paste modal + bank/drill).
- Lecture upload is a blob round-trip (memory ≈ file size); the spec's TUS resumable
  upgrade is the fix if 2-hour imports fail on older devices.
- Voice capture Phases 2 (LLM parse branch behind the existing key — nightly's seam)
  and 3 (Siri Shortcut + per-user bearer token, F3 rules) are specced in FOLLOWUPS V2
  with estimates, unbuilt.
- Practice-test → question conversion is manual-entry ('missed' origin); itemized
  auto-conversion needs itemized practice tests, deliberately not modeled (migration
  44's header).
- `expo-doctor` 16/18: the two known, documented failures (monorepo watchFolders, the
  deliberate dual React on disk).

### 4.3 Stale docs — YOURS, flagged not edited (per the standing rule)
- `docs/SCREEN_SPEC.md` §0 mobile route list — predates D24's merge and everything
  since (bank/drill/lectures/capture/announcements/week...).
- `docs/DATA_MODEL.md` — enum lists and tables predate migrations 34–46.
- `docs/FOLLOWUPS.md` — V2 is now partially RESOLVED (Phase 1 built); other rows
  were updated only where touched. Cross-check any row against HEAD before acting.
- `docs/STATUS.md` — updated this session to point here.
- REVIEW_2026-08-25 §6's list still applies where not superseded above.

## 5. Credential inventory

### Set in the cloud project (Edge Function secrets + Vault) — no values in this repo
| Credential | State |
|---|---|
| `ANTHROPIC_API_KEY` | Set (earlier session), live-verified end-to-end. Do not re-set. |
| `DEEPGRAM_API_KEY` | Set this session. First live transcription still pending (VALIDATION_PLAN §11). |
| `CRON_SHARED_SECRET` | Regenerated this session; edge secret + Vault `cron_shared_secret` MATCH. |
| Vault: `edge_functions_base_url`, `edge_functions_anon_key` | Created this session (cron jobs read them). |
| Whoop/RescueTime token slots | Empty — see "his/hers" below. |

### In Kareem's vault (he supplies on request)
Canvas personal access token (verified good this session) · per-user Canvas ICS URL ·
database password · Anthropic/Deepgram key originals.

### Needed from a person, not yet existing anywhere
| What | Who | For |
|---|---|---|
| WHOOP developer app (client id/secret + webhook secret) | Kareem registers | Activates already-built Whoop code (I2) |
| Google OAuth client | Kareem/you | Calendar read+write (I1's other half; schema anticipates it) |
| Apple Developer Program + App Store Connect | Kareem's Apple ID | EAS build → TestFlight |
| Production domain + AASA/assetlinks hosting | Kareem/you | L1 Universal Links (`docs/universal-links/`, three blanks) |
| SMTP provider (Resend/Postmark/SES) | either | L3 |
| GitHub auth on this machine (or push from yours) | either | §7.1 |

## 6. Remaining work that needs a person — sequenced

1. **Push** (§7.1) → you pull.
2. **Kareem, ~10 min in the app**: connect Canvas (VALIDATION_PLAN §3 — create the 3
   missing course rows first, archive the test course), first sync; import one lecture
   (§11). These two light up everything built this session.
3. **Run the consolidated validation pass** (VALIDATION_PLAN, 15 sections, on-device).
4. **First Docker session (you)**: `npm run db:reset && npm run db:test` — pgTAP over
   all 46 migrations — then E2E + integration suites.
5. **SDK 57 decision** (`docs/SDK57_ASSESSMENT.md`): check the iPhone's Expo Go SDK
   (~1 min). On 57 → migrate now (half-day, retraces commit `13b3c80`). Still 54 →
   fold into the dev-build fork.
6. **TestFlight/EAS** (`eas.json` ready, nothing submitted): eas login → Apple
   Developer → choose the bundle id (permanent at first submission — deliberately
   left unset) → `eas build` → `eas submit`. **Before any external tester: L1–L3.**
7. **L1–L3 execution order, coupled to the TestFlight cutover** (details in
   `docs/universal-links/README.md`):
   a. Domain exists → serve AASA/assetlinks (works ahead of time).
   b. Dev-build/TestFlight build carries associatedDomains (Expo Go can't — L1
      completes only at the dev-build fork).
   c. THEN dashboard: add `https://<domain>/auth/callback`, remove
      `exp://127.0.0.1:8081/**` (L2) and later `collegeos://**` — removing L2 earlier
      breaks the Expo Go dev loop's auth returns; it is a cutover step, not a hotfix.
   d. L3 SMTP before real users depend on confirmation emails.
8. **Whoop** (I2): register the app, set secrets, done — the code path is built and
   offline-proven; no new code expected.
9. The dev-build fork itself (Phase 4: push, widget, Live Activity, in-app recording
   re-probe, HealthKit…) under the standing ≥3-items rule.

## 7. Operational notes for your first hour

### 7.1 The unpushed commits
`git push origin main` fails on this machine ("could not read Username"): no stored
HTTPS credentials, no `gh` CLI, no SSH keys. Per Kareem's instruction this was NOT
worked around. Fix: `gh auth login` (or a PAT / SSH key) on this machine, then
`git push origin main` — or Kareem zips the repo to you and you push. **Until then
this laptop holds the only copy.**

### 7.2 Merging with your version
Everything since your last review (`REVIEW_2026-08-25.md` covers up to `1b53547`) is
linear on `main` with reasoning-dense messages. The schema is append-only migrations
43–46 (no edits to yours). The likeliest merge friction: web /today (morning brief +
capture modal added), the barrel `packages/api/src/index.ts` (many additive exports),
and `supabase/config.toml` (three function blocks appended).

### 7.3 Rules that keep biting (HANDOFF §10, distilled)
Local days never from UTC (B4 — it reappeared in test fixtures after being fixed in 15
product sites) · real zero ≠ absent (three occurrences, once inside its own fix) · an
inspection is not an interaction (the app-breaking bug all four inspection passes
missed) · a doc row is a claim about the past (the DayTrace flag above is this
session's instance) · name every new component's production caller out loud (D20).
