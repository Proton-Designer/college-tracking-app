# Ihsan — Consolidated Validation Plan

> **The whole merged app, organised by feature.** Supersedes `VALIDATION_PLAN.md` as the pass to
> run; that document's sections 1–15 cover the pre-merge app and are folded in below where they
> still apply, and it stays on disk as the record of what was owed before the merge.
>
> Each item says where to stand, what to do, and what MUST happen. Items marked 🔑 cannot run until
> the named credential or setting lands — `docs/CONNECTION_CHECKLIST.md` is the order to supply
> them. Items marked ⛔ are expected to be blocked and are listed so their blockage is confirmed
> rather than assumed.
>
> Mobile = a physical iPhone through Expo Go against the cloud project (`npx expo start` from
> `apps/mobile`). Web = `npm run dev --workspace=@collegeos/web`.
>
> **Run §0 first.** It is the one section that can invalidate every other section's result.

---

## 0. Preconditions — do these before judging anything else

| # | Do | Must happen |
|---|---|---|
| 0.1 | `supabase migration list` | Remote is at 46. Migrations 47–64 are pending. |
| 0.2 | `supabase db push` | All eighteen apply cleanly, in order, with no manual intervention. |
| 0.3 | **`npm run db:types:cloud`**, then `npm run verify` | ⚠️ **The single highest-risk step in this plan.** `database.types.ts` was hand-written for 33 tables because this build had no database. A regeneration that changes the file means a transcription error; verify must still exit 0 afterwards. **Any type error here is a real defect, not noise.** |
| 0.4 | `npm run verify` | Exit 0. Baseline at handover: 598 core + 30 api tests. |
| 0.5 | `cd supabase/functions && deno test -A` | The `-A` matters — without it 4 tests fail on env/net permissions. That is the flag, not a regression. |
| 0.6 | `cd apps/web && npx next build` | Clean. |
| 0.7 | Sign in as **all three users** and confirm each sees only their own data | D39 made this a live property. Every table added in migrations 48–64 is owner-only; one cross-account check per new surface is cheaper than discovering a leak later. |

---

## 1. The shell and navigation

**Web**, at ≥1280px, then at ~1100px, then at ~700px:
1. At `xl`: the sidebar is 248px with group headers (Main / Life / Review / System) and labels. At
   `lg`: it collapses to a 72px icon rail with no labels and no group headers. Below `lg`: the
   sidebar disappears entirely and the floating Island dock appears.
2. The TopBar (wordmark + email + sign out) appears **only** below `lg`. Above it, the sidebar
   carries all three and the strip must not be duplicated.
3. Content never sits under the rail at any width, and never under the dock below `lg`.
4. The active nav item tints with its domain colour where it has one (Deen amber, School blue).
5. **Capture** in the sidebar opens the capture modal. Press it while already on `/today` — it must
   still open (this is the soft-navigation case the URL-derived state exists for). Close it: the
   `?capture=1` must clear from the URL, and a refresh must not reopen it.
6. Every page reads on the dark ground: no white flash on navigation, no invisible text, no
   element that only became legible on the old light surface.

**Mobile**:
7. Tabs are Today · Learn · Life · Self · Review — the full five. No Insights tab, and no Courses tab (it lives inside Life as School).
8. The Island renders detached, and no scroll view traps content beneath it.

**Both**:
9. `/insights` → redirects to `/review` (308). The old URL must not 404.
10. Nothing anywhere says "CollegeOS".

---

## 2. Review — the merged surface (collision M7)

1. `/review` shows **Tonight** (the day's review form or the saved review) above **Patterns** (the
   analytics that used to be `/insights`).
2. At ≥1280px the four analytical readouts pair into two columns; the interactive sections stay
   full width.
3. **Break one half deliberately** (sign out in another tab, or point at a bad date): the failing
   half renders its own error **in place** and the other half still works. A failed analytics query
   must not cost you tonight's review.
4. Mobile: same two halves, same order, each with its own loading and error state.

---

## 3. One session, two metrics (D27, D28) — the highest-blast-radius change

1. Start an Hour with a deliverable and a domain. It appears on the Wall glowing that domain's
   colour, and counts toward "N of M Hours today".
2. **The refusal**: attempt to start a `learn` or `anti_worry` session through the Hour path. It
   must be refused with the sentence explaining that those still land on the Wall and in coverage —
   **not** a database constraint error.
3. Start a Learn session. It appears on the Wall, it accounts for its time in coverage, and
   **Day Won, the Hours count, Delta and Efficiency do not move.** This is D28 and it is the single
   most important assertion in this plan: if a five-minute retention session inflates Day Won, every
   baseline the user calibrated silently changed meaning.
4. Existing pre-merge Hours still render, still count, and show a domain (backfilled from category
   where it was unambiguous, `school` otherwise).
5. Duration calibration, friction analytics, the Day Trace and Efficiency all still produce the same
   numbers they did before migration 48. Anything that moved is a regression.
6. End-of-Hour: deliverable + distraction recap → card rotation → Submit still works unchanged.

---

## 4. Deen 🔑 (needs a location — but validate the no-location state FIRST)

**4a. With no location set** (the default for all three users; do this before setting one):
1. Every prayer row reads **"Awaiting a time"** with an em-dash for the time. Not "pending", not
   "missed", never a fabricated clock time.
2. All five log buttons still work — you can record a prayer the app cannot time.
3. Days cleared and On-time both read **—**, not 0 and not 0%.
4. Qada says plainly that Ihsan cannot work out which windows have closed. The hand-tracked
   `qada_owed` shows separately and is never folded into a derived count.
5. The heatmap renders every cell as awaiting, with its legend relabelled to match.
6. **Nothing anywhere reads as failure.** This whole sub-section is D40, and it is the state a new
   user actually meets.

**4b. With a location set** (Settings → Prayer):
7. Prayer times appear and are **correct for your city** — check two against a source you trust.
   A wrong prayer time is the one bug in this app that would read as the app lying about an
   obligation.
8. Change the calculation method: Fajr and Isha move; **Dhuhr and Maghrib do not.** Switch Asr to
   Hanafi: only Asr moves, and it moves later.
9. Log one prayer on time, one as qada, leave one unlogged past its window. The unlogged one derives
   as missed; the qada one leaves the backlog; the on-time one counts toward days cleared.
10. **No streak appears anywhere.** No counter, no word "streak" (D30).
11. Missed renders grey, never red, and always sits next to the qada path.
12. A prayer logged on the phone appears on web's heatmap.
13. Sunnah, adhkar, Qur'an sessions and reflection intensity each log and persist; Qur'an pages read
    an em-dash when no session recorded a count, not 0.
14. Cross a day boundary at ~11:45 PM local: the day rolls at midnight **local**, not UTC (B4).

---

## 5. Fitness, Work, Business, and the Life hub

1. **Nothing is seeded** — no plans, no exercises, no targets, no weekly goal. Each empty state
   reads as an invitation rather than a failure (D39/D40 — LifeOS's three starter plans encode one
   person's targets and deliberately did not port).
2. Fitness: create a plan and an exercise; log sets; the Sun–Sat strip shows a real 0 for a past day
   with no sets and **blank for a future day** — never 0.
3. Body metrics: one measurement shows the value and **no delta** ("not enough to compare"); a
   second produces a real delta.
4. The cycle header counts down inclusively — the last day of a cycle shows 1 day left, not 0.
5. Work: a target moves active → blocked (with a reason) → done, and the completion timestamp
   appears only in the done state.
6. Business is a **lens**: the MITs it shows are the same `tasks.mit_rank` rows as the Night Plan's,
   editing one changes both, and there is **no second "today's three"** anywhere (D37).
7. The weekly goal links to a War Map milestone when set, and works without one.
8. Life hub: five domain cards, each with its colour and a live status line; School links to
   Courses.

---

## 6. Signal:Noise and the check-in engine (D33, D38)

1. **The confession rule.** Complete an Hour, then open the Night Plan close-out. The Hour's own
   window is **pre-filled** from it (we do not ask about time with a deliverable behind it). A
   window with no evidence is presented as an **explicit question naming the span** — "2:00–4:00 is
   unaccounted" — and is never silently absorbed, defaulted, or rounded away.
2. Leave a window unanswered past its grace period. It becomes **unknown**, and unknown is
   **excluded from the coverage denominator** rather than scored as a miss. Coverage must not drop
   because you did not answer.
3. Nothing ever derives "wasted" from silence.
4. The 2-hour nudge is **off** by default. Turning it on produces one notification per window; ⛔ on
   Expo Go this may be blocked — see §11.
5. Signal share with the default signal set (all five domains) counts every allocated domain as
   signal and only unaccounted time as noise.
6. Narrow the signal set to Deen + Business: the same data now reports School/Fitness/Work as
   **other commitments**, reported separately from wasted. A heavy school week and a lost afternoon
   must never collapse into one "noise" number.
7. Change the setting on one account: **the other two users' numbers do not change** (D38/D39).

---

## 7. Learn 🔑 (needs `VOYAGE_API_KEY` for the full path — validate without it first)

**7a. With no embeddings key** (the D41 path — do this first):
1. Upload a **public-domain PDF** (not one of your books). Ingestion runs to completion: the job
   advances through its steps, no invocation hangs, and lessons appear.
2. `source_chunks.embedding` and `lessons.embedding` are null; the merge pass fell back to lexical
   similarity; the job records why. **Nothing errored.**

**7b. With the key set**:
3. Re-ingest, or backfill. Embeddings populate; near-duplicate lessons are merged more tightly than
   in 7a.

**7c. Quality — the brief's own bar**:
4. **Every lesson cites a verbatim passage that actually appears in the source.** Spot-check five by
   opening the quote's page. A lesson whose quote is not in the text is the failure this whole gate
   exists to prevent; report it rather than editing around it.
5. Rate the lesson set: at least 8/10 useful across three real books.
6. `ingest_jobs.cost_usd` lands in **$0.50–$1.50** for a 300-page book. Validate before optimising
   anything.
7. Ingestion of a 300-page book completes in **under 10 minutes**.

**7d. The daily session**:
8. Free recall comes **before** the reveal — typed or dictated. Recognition-only flipping must be
   impossible.
9. Warm-up is a due card; new lessons appear **only after** the due queue is cleared; the new-lesson
   limit is your own setting and 0 means 0.
10. Cards interleave across sources — no source appears three times in a row.
11. Grade a card Again: it returns sooner. Grade Good repeatedly: the interval grows.
12. **A card graded Good for the first time comes back within the same session** — FSRS learning
    steps are minutes, not days. This looks like a bug and is not.
13. Tomorrow's queue reflects today's ratings.
14. **The comeback moment**: skip two or more days, let a backlog build, then clear it. An explicit
    acknowledgement fires ("Four days away. Twelve cards were waiting; you cleared them. You're
    current."). Clearing a queue you never let build must **not** fire it.
15. **No streak anywhere.** No counter, no freezes (D29).
16. Memory strength shows per source; a source never reviewed shows **no bar**, not 0%.
17. Question Bank and Learn never mix: no course question appears in a Learn session and no lesson
    appears in a drill (the directive's scope rule).

---

## 8. Desired Self

1. **Empty by default** — no dimensions exist. The empty state explains what a dimension is for
   (D39/D40).
2. Create a dimension and write its definition. With fewer than three qualifying acts it shows
   **no number at all**, not 0 and not 50.
3. After enough acts, a standing appears — and **tapping it shows the acts behind it**. There must
   be no path in the UI to a bare score.
4. **There is no global total anywhere.** No overall Desired Self score, no ranking of dimensions by
   standing (D34). The only cross-dimension view is attention: act counts.
5. Neglect a dimension for two weeks: it **fades** and never reaches zero. Return to it: recovery is
   visibly faster than the decay was.
6. Routing: an Hour tagged Business reaches the dimension its rule names. An act matching two rules
   feeds both. An act matching no rule is **not counted anywhere** — nothing invents a destination.
7. Overshoot: with no ceiling set, nothing ever fires. Set a Focus ceiling and exceed it: the
   message uses the refusal-that-explains-itself voice and reads as *stop*, not as failure. A quiet
   week reads as room, not as a warning.
8. **The bridge**: a lesson's claim-to-task starts an experiment; running it feeds the dimension the
   source serves, same day.

---

## 9. Everything that must not have broken

Run each of these once; any change from pre-merge behaviour is a regression, not a finding.

- Hours, the Hour timer's background survival, the distraction counter and its six causes
- Night Plan: brain dump → star 3 → crown the MIT; the 9:30 PM reminder
- Habits and identity votes; the decaying score; kill-habits
- Cards rotation at End-of-Hour; worries; goals and the War Map
- Courses, deliverables, the Grade Ledger, ScenarioPlanner, DeadlineRadar
- Syllabus upload → staged → confirm; announcement paste → staged → apply
- Question Bank, the drill, calibration taps, exam curves, practice tests
- Canvas sync 🔑; lecture capture 🔑; voice capture
- Morning brief, nightly analysis, weekly synthesis, the Wall's paging
- Account export and delete; the LLM budget ceiling and its usage log

---

## 10. Security and isolation

1. With three real accounts, confirm each new table (migrations 48–64) is owner-only. An anon probe
   reads `200 []` and an insert is refused.
2. `lesson_reviews` accepts INSERT and SELECT and **rejects UPDATE and DELETE** — the absence of
   those policies is the enforcement, so prove it rather than assuming it.
3. No credential appears in any client bundle. Voyage and Anthropic keys are Edge Function secrets
   only.
4. ⛔ pgTAP for migrations 34–57 still needs a Docker machine. Until then the RLS record is live
   probes plus role-simulation, which is weaker.

---

## 11. Known blocked / expected failures

| Item | Why | Confirm rather than fix |
|---|---|---|
| ⛔ Local notifications on Expo Go | Expo has narrowed Expo Go's notification support release over release; the Hour-end and 9:30 PM anchors both depend on it | A 10-minute on-device probe. If blocked, both the check-in nudge and Learn's daily notification wait for the dev build. |
| ⛔ Push notifications | Dev build only since SDK 53 | — |
| ⛔ In-app lecture recording | Failed the Expo Go probe previously | Import still works. |
| ⛔ pgTAP | Needs Docker | §10.4 |
| ⛔ E2E (28 specs) + api integration (101) | Local-stack-only by design; have not run since the original handoff | First Docker session owes all of them. |

---

## 12. The vision chain (D48)

1. With no vision written, `/vision` explains what the layer is for and offers to start one. No
   fabricated countdown, no "0 days remaining".
2. Write a 10-Year Vision → 3-Year Beachhead → 1-Year Mission → 90-Day M.O.M. Each layer links to
   the one above, and the chain renders as one unbroken line.
3. **The nullable-FK ruling**: crown an MIT with no link to anything. It saves. It is not blocked,
   not warned about, not marked in red — the Night Plan stays usable on the ordinary night when
   something urgent is the honest answer.
4. Review shows unanchored MITs as **a count with its items nameable** — "3 of your last 10 MITs
   weren't connected to anything above them". Confirm the copy contains no verdict and no warning
   colour. Sometimes the chain is wrong, not the night.
5. When a M.O.M.'s 90 days elapse, the review ritual becomes available from Review. Score it —
   confirm **`changed` is offered as a first-class outcome** alongside hit/partial/missed, and reads
   as information rather than failure.
6. Set the next M.O.M. from inside the review; the chain updates without re-entering the layers
   above.

---

## 13. Goal Ecology (D49)

1. With two active goals, the pair appears **unmarked** — not "neutral". Confirm the wording and
   that the examined share reads 0 of 1 rather than implying it was considered.
2. Mark a pair competing with a note. It surfaces on the War Map and in the 90-day review.
3. **Nothing tells you to drop a goal.** Confirm there is no "eliminate" action, no ranking, and no
   suggestion — the app surfaces the tension and the trade-off stays yours.
4. Score a goal on the Priority Matrix. Confirm it is **optional** — an unscored goal shows no
   composite rather than a zero, and the list does not reorder itself by score.
5. A high opportunity-cost score lowers the composite; the other three raise it.

---

## 14. Drift confrontation (D50) — the most delicate surface in the app

Validate the **refusals first**; they are the feature.

1. With no drift statement written for a dimension, trigger every condition you can (a distracted
   Hour, an abandoned Hour). **Nothing fires.** The statement is the opt-in.
2. Write a drift statement. Trigger a condition. The confrontation appears and shows **your own
   words, verbatim** — confirm nothing has been rewritten, summarised, or wrapped in the app's
   language, and that no adjective about you appears anywhere on the screen.
3. It names the fact behind it — "that Hour ended with 9 distractions" — and the fact is **checkable
   against your own record**.
4. **Both doors are present**: start an Hour now, or crown it for tomorrow. Confirm there is no path
   that shows the confrontation without them.
5. Dismiss it. Confirm dismissal is neutral — no follow-up, no counter, no "you dismissed this 3
   times".
6. **The rate limit**: trigger another condition the next day. Nothing fires. Confirm the gap is at
   least three days.
7. Turn alerts off for that dimension. Trigger again. Nothing fires, permanently, in one tap.
8. **The refusals that protect beginners**: a dimension with a statement but *no acts ever* must not
   fire dormancy. A day with a **zero baseline** must not fire under-baseline — a rest day you
   defined is not drift.
9. Add an **Enemy** card. Confirm it appears in the End-of-Hour rotation alongside the other types.

---

## 15. Weekly screen time (D51)

1. Sunday review offers the upload step when the week is outstanding. It is an **invitation**, not a
   nag — confirm no badge, no counter, no escalation for weeks you skipped.
2. Upload a real Screen Time screenshot. It parses → stages → **you confirm**. Nothing reaches the
   series without that confirmation (D10).
3. **The no-guessing rule**: find or create a value the parse cannot read. It must appear as an
   **empty field for you to fill**, never as an invented number. Confirm you cannot confirm the
   upload while one is unresolved.
4. Confirmed numbers join a weekly series beside Hours and Signal:Noise.
5. **Skip a week deliberately.** The series shows a **hole** — not a zero, not a broken streak, no
   message about consistency. Then upload the following week: the delta compares the two most
   recent **reported** weeks, never across the gap.
6. The Focus drift input needs **four reported weeks** before it can fire, and fires only against
   your own baseline. A consistently high but stable number produces nothing — there is no external
   norm anywhere in this feature.

---

## 16. The ULM port (D45, D46, D47)

1. **Progressive availability**: upload a source and start a session **before ingestion finishes**.
   Confirm the source reads `partial`, "start learning" is real (there are actual cards behind it),
   and the copy does not claim a lesson count it does not yet have.
2. A lesson that loses the merge dedup is **archived, not deleted** — and if you had already
   reviewed one of its cards, that review still exists and the card is suspended rather than gone.
3. **The write-time gates**: confirm `ingest_jobs` records what each gate dropped. A run with no
   embeddings key must show `unknown` counts for the semantic gates rather than passes — "could not
   check" must never hide inside "passed".
4. **D45's refusal**: with `ANTHROPIC_API_KEY` unset, ingestion **fails with an actionable message**
   rather than producing a deck. Confirm the message names what to do.
5. **D46's falsifier**: watch a real 300-page PDF through `extracting_text`. If a 25-page slice
   exceeds the CPU budget, halve it; if ~5 pages still fails, the design needs a worker and D46 is
   wrong. **Record the actual timing** — this is the measurement the ruling was made without.
6. **D47's oracle**: run the test that folds stored `card_states` against a replay of the same log.
   A divergence here is the single most important failure in Learn, because it would serve wrong due
   dates silently for months.
7. Confirm `lesson_reviews` still rejects UPDATE and DELETE for both an ordinary caller and
   `service_role`, **independently** — they are two different mechanisms (missing RLS policies vs a
   trigger) and testing one proves nothing about the other.
