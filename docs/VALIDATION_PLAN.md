# Consolidated Validation Plan — 2026-08-26 (final-build revision)

> The single big validation pass the working format promised: everything built since the
> last validated state, organized by feature. Each item says where to stand, what to do,
> and what MUST happen. Items marked 🔑 cannot run until the named credential lands.
> Mobile = physical iPhone through Expo Go against the cloud project (`npx expo start`
> from apps/mobile); web = `npm run dev --workspace=@collegeos/web`.
>
> Automated state at HEAD, all executed in the final-build session: `npm run verify`
> exit 0 (448 core + 30 api + 2 mobile), `deno test -A` 133 passing (whole suite),
> `next build` clean. RLS on every table added since migration 34 verified live BOTH
> ways this time: anon probes (read `200 []`, insert refused) AND psql role-simulation
> (stranger sub sees 0 rows on all 17 tables; the owner's sub sees exactly the admin
> counts on every populated one). **Still owed beneath the green:** pgTAP for
> migrations 34–46 (needs a Docker machine), and the E2E/integration suites have not
> run since the original handoff (local-stack-only).

## 1. S3 — Question Bank, drill, Modes, calibration (built 08-25, still unvalidated)

Mobile, on a course with real material:
1. Course → Question Bank → write a question with prompt+answer, no anchor → must be
   REFUSED with the anchor-or-skip message; add "p. 142" → saves; topic survives to the
   next blank form.
2. Write 2 more; retire 1 → it leaves the list and never appears in a drill.
3. Today → Drill: the calibration chips (Sure / Think so / Guessing) must appear BEFORE
   the answer; after the tap, answer + source anchor show together; verdict Right/Wrong
   advances; queue-clear screen states X of Y.
4. New question written at ~11 PM local must be due TODAY, not tomorrow (B4 on
   created-date).
5. Answer a question "Sure" + Wrong ≥1 time on a topic → next drill shows "weighted up"
   on that topic's card within 14 days.
6. 🔑(needs nothing — key is live) Bank → paste ≥200 chars of notes → Draft questions →
   cards arrive as EDITABLE proposals; accepting one without anchor-or-skip is refused;
   accepted card lands with origin `ai`.
7. Sunday Review (/week): after ≥5 "Sure" answers with >15% wrong in one course, the
   calibration panel appears **naming the course by its code** (this session's fix —
   "course #7" must never appear).

## 2. S3 web parity (new this session)

Web, same account:
1. Course detail → "Question Bank" button → the bank page: add a question (same
   anchor-or-skip refusal), retire it, draft-from-notes with a ≥200-char paste.
2. "Drill what's due →" → /drill: full confidence→reveal→verdict cycle; the card names
   its course code and topic; queue-clear state reads correctly.
3. A question written on web must appear in the phone's drill and vice versa (same
   rows, same due dates — shared data layer, nothing platform-side).

## 3. Canvas connect + announcements poll — token VERIFIED, connect is a 2-minute app step

> Status update (final-build session): the token was verified live against
> `https://uta.instructure.com` (200, "Kareem Badawi", 8 course sites listed) and the
> cron layer is registered and active. The in-app connect itself could not be performed
> by the agent (production-data writes via psql are declined by the runtime's
> permission layer, and the connect gesture requires the owner's signed-in session) —
> so step 1 below is the owner's, ~2 minutes, and everything after it follows.
> Mapping note for step 1: local courses exist only for MATH 1308 (twice — id 2,
> "Elementary Statistical Analysis", is the real one; id 1 "STAT 1308" looks like test
> data worth archiving). ECON 2306 / ENGL 1301 / UNIV 1131 need local course rows
> created first (Courses tab) to be mappable; the two 2265-term Canvas sites and two
> non-course sites should stay unmapped.

Mobile Settings → Canvas card:
1. Connect with the real base URL + token → toast names the Canvas display name; the
   mapping picker lists active Canvas courses; map each to a local course (leave any
   extra unmapped); save.
2. Sync now → first poll stages up to 14 days of announcements; toast reports staged +
   parsed counts, and "skipped (unmapped course)" only if something was left unmapped.
3. Settings → Review announcements (/announcements): each staged row names the course
   CODE and "Canvas"; a parsed row's "Review changes" opens the SAME diff-review screen
   as the paste flow; confirm one date change → the deliverable actually moves; reject
   one → nothing moves.
4. Immediately Sync now again → "Nothing new." (dedupe on external_id, overlap window).
5. Disconnect → token deleted (reconnect requires a fresh paste); staged/applied
   announcements SURVIVE (user data, same rule as Brightspace disconnect).
6. Cron: after `CRON_SHARED_SECRET` is regenerated (`supabase secrets set` + Vault
   secret), confirm the hourly `canvas-sync-poll` job fires (llm_usage_log rows or the
   announcements table advancing without a manual sync).

## 4. Canvas grades → Ledger 🔑 same token

1. With a graded, posted Canvas assignment in a linked course: Sync now → course detail
   shows "Canvas grades — N staged"; a row whose name exactly matches a Ledger item
   comes pre-picked with that suggestion.
2. Apply with a Ledger row of a DIFFERENT points scale → refused with both scales named;
   nothing written (check the Ledger row unchanged).
3. Fix/pick the right row → Apply → grade lands in the Ledger, course grade recomputes,
   the staged row leaves the queue, and re-deciding it is refused.
4. Reject one → Ledger untouched, row settled.
5. A muted (unposted) grade in Canvas must NOT appear staged at all.

## 5. Exam retrieval curves (Tier 5 / D25)

Mobile, deliverable detail of an exam or quiz:
1. An exam ~3 weeks out shows the full curve: D-21/-14 retrieval, D-7 practice test,
   D-3 retrieval, D-2 practice test, D-1 light review — one session per day, D-7 shows
   ONLY the practice test.
2. An exam 5 days out shows only D-3/D-2/D-1 plus the "late start" note.
3. A paper/reading deliverable shows NO exam-prep section at all.

## 6. Practice tests + benchmark

1. Log two practice tests (e.g. 92%, 94%) on an exam deliverable → both listed; the
   missed-item panel appears; add a missed item → it must show in that course's Bank
   with origin `missed` and enter the drill queue.
2. With ONE practice test only: no benchmark verdict of any kind (sample floor).
3. Enter the real exam score in the Ledger (the deliverable's linked grade item), e.g.
   78% → the panel must flag: practice avg 93%, real 78%, with the spacing/harden/move-
   earlier recommendation. Change the real score to 90% → verdict flips to "agree".

## 7. 3-week load forecast

Sunday Review (/week), "Next 3 weeks" panel:
1. With no backplans and no exams: the empty-state line naming its two sources.
2. Generate a backplan on a deliverable with real minutes → planned load appears on
   those days; overload only when a day exceeds that weekday's baseline.
3. Set a low baseline for one weekday (Baselines screen), stack a backplan onto it →
   that date warns with both numbers, and the pull-earlier suggestion points at an
   EARLIER date with spare capacity.
4. An exam WITH a backplan must not double-count (its curve is replaced by the
   backplan's milestones).

## 8. Announcement worklist (paste-flow regression)

1. The original paste flow must be unchanged: course → Paste an announcement → parse →
   review → confirm (it now travels with `source='paste'` and no external id).
2. A paste abandoned after parsing appears in /announcements and its "Review changes"
   resumes exactly where the paste left off.

## 9. SDK 57 / EAS (assessment only — one manual check)

1. Owner: open Expo Go on the iPhone and read its SDK version (docs/SDK57_ASSESSMENT.md
   §1 decides the migration timing). Nothing else to validate — nothing was migrated,
   nothing submitted.

## 10. Security items (state to confirm, not features)

1. L2: `exp://127.0.0.1:8081/**` is still IN the cloud redirect list — deliberate
   (dev flow depends on it); the removal is the owner's 30-second dashboard action,
   timed per docs/universal-links/README.md.
2. L1: the two association templates exist with three named blanks; nothing claims
   Universal Links work yet.
3. New tables (canvas_connections, canvas_course_links, practice_tests,
   canvas_grade_extractions, lecture_transcripts): anon probes AND role-simulation
   probes both passed live (see the header); pgTAP remains the outstanding stronger
   form, when a Docker machine exists.

## 11. Lecture capture 🎙 (Deepgram key is SET; needs a real audio file)

Mobile, course detail → Lectures:
1. Record ~2 minutes in Voice Memos, lock the phone mid-recording (proving the
   import-first premise), export/share the m4a.
2. Lectures → set the lecture date → Pick audio file → select it. Status shows
   "Transcribing…"; within ~a minute of refreshing, "Ready" with real text.
3. The transcript must survive: Delete audio → flag flips, transcript stays; deleting
   BEFORE ready must be refused with the reason.
4. Draft questions → lands in the Bank's draft flow with the transcript prefilled
   (and the 60k truncation note ONLY when the transcript exceeds it); accepted cards
   carry origin 'ai' and enter the drill queue.
5. Failure honesty: import a non-audio file renamed .m4a → the row must go 'failed'
   with Deepgram's reason on screen, not sit in "Transcribing…" forever.
6. Webhook auth (already probed live): POST with no/bogus token → 401.

## 12. Voice capture (V2 Phase 1)

Mobile (/capture via the Capture quick link) and web (/today → Capture):
1. Dictate "remind me to submit my econ homework tomorrow at 6pm" → preview shows
   title "submit my econ homework", tomorrow's date, 18:00, and "Understood: at 6pm ·
   tomorrow". Save → the task is on tomorrow's Today with a planned start.
2. "gym at 9am" spoken in the afternoon → date rolls to TOMORROW (next occurrence).
3. "meet ta at 6" → time stays empty (ambiguous is never guessed); "outline the essay
   tonight" → today's date, NO invented evening hour.
4. No temporal phrase at all → date field says "none heard; defaults to today".
5. The saved task reads "Filed as Admin" in the preview — and lands as category admin,
   editable on Today. A voice task must be indistinguishable from a typed one
   everywhere downstream (Top 3, workload, start-delay measurement).

## 13. The Wall's paging

1. On an account with >200 completed Hours (or temporarily lower the page size in
   listWall to test), the header count must state the TRUE all-time number while the
   grid shows the first page; "Show older Hours" appends without reordering or
   duplicating, and a day split across the page boundary merges into one block.

## 14. Weekly narrative · morning brief on web · announcement history

1. /week shows "Weekly synthesis — week of <date>" once a weekly agent report exists
   (next Monday 12:00 UTC, or invoke weekly-synthesis with the cron secret): headline,
   four notes, System Failure list, proposed experiment. A deterministic-only report
   says so instead of fabricating prose.
2. Web /today shows the same three-line morning brief mobile shows, once per day.
3. Course detail → "Announcements — N on record" expands to the full history including
   filed no-schedulable-content ones (previously invisible after filing).

## 15. The cron layer (registered live this session — was NEVER active in cloud before)

1. `select jobname, schedule, active from cron.job` shows nightly-analysis (0 12 * * *),
   weekly-synthesis (0 12 * * 1), canvas-sync-poll (15 * * * *), all active.
2. After the next 12:00 UTC: a fresh nightly agent_reports row exists without anyone
   opening the app. After the next hour boundary: canvas-sync logs a pollAll run
   (per-user results; 'notConnected' until §3 step 1 is done — that is the honest
   expected result, not a failure).
3. `cron.job_run_details` shows succeeded runs, not silent failures.
