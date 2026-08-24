# LifeOS Master Plan
### The complete blueprint: Work Form System + habit science + evidence-based learning, in one streamlined app

One app, one philosophy: a deep work engine at the center, a thin habit layer around it, and an academic planning brain upstream that feeds everything into the same three daily touchpoints. This document contains the full core plan and the full Academics module.

---

# PART I: WHAT THE SOURCE MATERIAL ACTUALLY GIVES YOU

## 1A. The productivity course (Work Form System)

A complete daily operating loop, not a list of tips:

- The atomic unit is the **Deep Work Hour**: 60-min timer, one specific deliverable, a distraction counter, and a "Work Form" submitted at the end of every hour.
- **4 hours/day is the success baseline**, compressed into ~5-6 hours after waking. Two headline metrics: **hours completed** and **time delta** (wake time to first completed hour).
- A ritual wraps every hour: sticky note proof, re-read goals/motivation/identity docs, submit form, small reward, 10-min break, repeat.
- Three routines bracket the day: Morning (treadmill, 1L water, 30g protein, motivation, plan 4 hours, stretch), Between-Hours (recover, small reward, 20-second self-improvement loop, efficiency ratio), Night (clean up, record efficiency, prep tomorrow, sleep prep).
- Supporting structures: Top 5 Goals, Motivation List, 2.0 Version of Yourself, Thought Habits, 10X Rule card, Worry List (Monday Hour 1 = Anti-Worry Hour), War Map (goals → monthly objectives → 3-5 daily tasks), Accountability Group + Leaderboard, Seinfeld calendar chain.
- Advanced: useful-output metric per hour, efficiency ratio, Rule of Three, 100-Hour Sprints, minimum viable version of the system for travel/sick days.

## 1B. The habit research doc

The behavioral science and the mechanics worth stealing:

- Highest-evidence keystone habits: exercise, sleep consistency, meditation/breathwork, gratitude + reflective journaling, daily social/kindness action, ~7,000 steps.
- Streaks drive engagement but cause guilt-churn. Fix: **Loop-style decaying habit score** (a miss dents, never zeroes), **streak freezes**, **no-penalty tone** (Finch).
- **Identity framing beats outcome framing** (Atoms): "I will [action] at [time] so I can become [identity]." Every check-in = a vote for that person.
- Pick ONE gamification philosophy. Mixing punishment mechanics with wellness goals backfires.
- Behavior tagging + correlation insights (Oura/Stoic model). Show raw data, not black-box scores.
- Retention rule of thumb: if week-1 usage collapses, onboarding/daily load is too heavy. Cut to fewer habits.
- Evidence "why-cards" on each habit increase buy-in.

## 1C. Your nightly planning spec

Slots in perfectly: tomorrow's to-do list → star the 3 highest-leverage tasks → crown 1 as the Most Important Thing (MIT). This IS the War Map daily layer + Eat the Frog. MIT defaults to Hour 1.

## 1D. The learning research (what it mandates)

The evidence hierarchy is brutally clear, and it should be hard-coded into what the app is even *allowed* to schedule:

- **High utility (the only two):** retrieval practice / self-testing (g ≈ 0.50-0.70, stronger with feedback) and spacing (expanding intervals beat cramming, d ≈ 0.54 in classrooms).
- **Moderate utility:** interleaving problem types (g ≈ 0.42, up to ~1.0 in math), self-explanation (g ≈ 0.55), elaborative interrogation, teaching others (g ≈ 0.56 for actual teaching).
- **Low utility, students' favorites:** rereading, highlighting, summarizing. ~84% of students reread; ~11% self-test. The core danger is fluency masquerading as knowledge (illusions of competence).
- **Physiology is a prerequisite, not an extra:** sleep quality/duration/consistency explained ~25% of grade variance in the MIT wearable study, and the night before the test didn't matter but the prior weeks did. Phone in another room. Caffeine cutoff ~8 hours before bed. No lyrical music during reading. Aerobic exercise primes encoding.
- **Calibration beats feeling:** practice-test results, not fluency, decide what gets restudied. Delayed self-judgment beats immediate.
- **Implementation intentions (d = 0.65):** "if [time/place], then [specific action]" converts plans into behavior. LifeOS already does this structurally; the school module just supplies the specific actions.

Design consequence: **the app never generates a "reread chapter" task.** Readings become recall + question generation. This is the single biggest thing the Academics module enforces.

---

# PART II: DESIGN PHILOSOPHY

The decisions that keep this simple:

1. **The Deep Work Hour is the spine of the app.** Everything else hangs off it. You are not building a habit tracker with 150 toggles; you are building a work engine with a thin habit layer around it.
2. **Three touchpoints per day, plus the timer.** Night Plan (2-3 min), Morning Start (1 min), End-of-Hour flow (30 sec, x4). That is the entire required surface. Anything that can't live in one of those moments gets cut or automated.
3. **Identity + Proof gamification, not punishment.** Atoms-style identity votes, a digital sticky-note wall, and a day chain. No HP loss, no hearts, no guilt copy. Forgiveness is built in: decaying habit scores and earned chain-repair tokens.
4. **Everything measurable is auto-derived.** Delta, efficiency ratio, hours by category, distraction patterns: all computed from timestamps you were going to create anyway. Zero manual math.
5. **Adaptive baseline.** The course assumes an entrepreneur's morning. You have classes. Baseline hours are set per weekday (e.g., 4 on MWF, 2 on Tue/Thu). "Day Won" means hitting that day's baseline. This keeps the chain honest and the standard sustainable, which the course itself insists on ("four hours is the baseline forever" only works if it fits your real schedule).
6. **Minimum Viable Mode always works.** Timer + counter + end-of-hour form function offline and anywhere. Travel and sick days don't break the system.
7. **For academics: LLM at the edges, deterministic scheduler in the middle, you approve every change.** Syllabi and announcements get parsed by AI into structured diffs you confirm; a boring, auditable scheduler plans everything from there.

---

# PART III: THE CUSTOMER JOURNEY (your day, stress-tested)

### 9:30 PM: Night Plan (the anchor ritual, ~3 min)
Push notification opens straight into a 4-step card stack:

1. **Dump**: tomorrow's to-do list. Fast text entry, carries over unfinished items, can pull from War Map monthly milestones and the Worry List. School Today items (Part V) arrive pre-loaded here.
2. **Star 3**: pick the 3 highest-leverage tasks.
3. **Crown 1**: mark the MIT. It auto-assigns to Hour 1 (Mondays: Hour 1 is pre-locked as Anti-Worry Hour, MIT moves to Hour 2).
4. **Close the day**: auto-shows today's stats (hours, delta, efficiency, habit votes), one-tap sleep-prep checklist (phone out of room, clothes/water out, alarm set), done.

App writes `sleep_intent` timestamp. Screen goes to a "Tomorrow is planned" state showing the MIT.

### Wake: Morning Start (~1 min)
One big button: **"Start Day."** Tap = wake time logged, delta clock starts running visibly ("0:14 since wake"). Below it, the Morning Routine as a single checklist card (treadmill 20, 1L water, 30g protein, motivation video, stretch 5), each item one tap, all optional except the Start Day tap. Then **"Start Hour 1"** with the MIT already loaded.

The live delta clock is the race mechanic from the course, automated. No typing.

### During each Hour
Full-screen timer. One giant **+1 Distraction** button. Tapping it shows 6 cause chips (Phone / Got hard / Finished early / Notification / Reflex / Bored) and returns to timer in 2 taps. Deliverable shown at top. Screen can lock; timer survives backgrounding via persisted start timestamp + local notification at 60:00. When the Hour is a school session, a Mode card (Part V) shows exactly how to execute.

### Timer ends: End-of-Hour flow (~30 sec)
1. **Log**: deliverable confirmed (prefilled), category chip (School / MyHomeBase / Content / Systems / Admin ... editable list), distraction count auto-filled from taps (or manual entry if you used a physical clicker).
2. **Cards**: swipe through 3 rotating cards drawn from your library: one Goal card, one Motivation item, one Thought Habit or 2.0 trait. This is the course's read-your-wall ritual compressed into 10 seconds, with rotation as the variable-reward element.
3. **Submit**: hour posts to the wall, chain shows 2/4, break timer auto-starts (10:00), group notification fires if a group exists.

### Between Hours
Break timer counts down with one optional prompt: "Biggest constraint last hour?" (one line, skippable). At 10:00 a notification says "Hour 3 is waiting" with the next deliverable.

### After the final baseline hour: Day Won
Big moment. X lands on the chain calendar, efficiency ratio and total time revealed, a shareable day card generated (hours, delta, what shipped), larger reward prompt ("Go take it"). The day is officially a success; anything after is bonus and logs the same way.

### Evening habits
Folded into the Night Plan close-out: your keystone checks appear as identity votes ("Trained today → a vote for the athlete", "Diet on-protocol", "Reached out to someone", "3 gratitude lines" with inline entry). Max 7 habits visible, ever.

### Weekly
- **Monday Hour 1 = Anti-Worry Hour.** The Worry List is a capture inbox all week (add from anywhere in 2 taps); Monday it becomes the hour's checklist.
- **Sunday Review (10 min):** hours by category vs your Top 5 Goals, distraction-cause Pareto chart, efficiency trend, habit scores, set next week's milestone per active goal, optional Systems Block prompt (Rule of Three: what recurring task gets documented/delegated/deleted this week). Plus the school view: next week's load, overflow warnings, calibration gaps, one milestone per course confirmed.

### Failure modes, walked repeatedly
- **Class day**: baseline is 2, not 4. Day Won still fires. Chain unbroken.
- **Missed day**: no shame copy. Chain shows a gap with a "Repair" token if you've earned one (1 token per 7-day perfect streak, max 2 banked), otherwise the streak counter resets but the all-time wall and habit scores don't. Restart CTA is one tap.
- **No plan made last night**: "Start Hour" requires a one-line deliverable before the timer arms. Friction is 5 seconds, not a lecture.
- **Break sprawl**: break timer auto-starts on submit; you never have to remember to start it.
- **Phone is the enemy**: total in-app interaction during a work block is under 10 taps. Everything else is glanceable. (Later: home-screen widget with chain + MIT, and Live Activity timer; both need an Expo dev build, see Phasing.)
- **Traveling/sick**: Minimum Viable Mode = timer, counter, form. Habits can be set to "paused," which freezes their score instead of decaying it.
- **Motivation dip mid-week**: the Motivation List and Thought Habit cards surface exactly at the moment the course prescribes (end of every hour), and the wall/vote counts are the accumulated evidence. Nothing extra to do.

---

# PART IV: CORE FEATURE SPEC BY MODULE

### A. Work Engine (core)
- Hour timer (60 default, 90/120 for stacked hours later), persisted timestamps, background-safe.
- Distraction counter with cause chips; per-hour count + causes stored.
- End-of-Hour flow (log → cards → submit).
- Delta clock, per-day baseline, Day Won logic, break timer.
- Digital Sticky Wall: every submitted hour is a tile (date, hour #, deliverable, distraction count), grouped by project. This is the proof surface; make it beautiful and permanent.
- Chain calendar (Seinfeld) with repair tokens.

### B. Planning
- Night Plan flow (dump → star 3 → crown MIT → close day).
- War Map Lite: Top 5 Goals (each with number, deadline, reason) → one monthly milestone per goal → nightly plan pulls from milestones. Skip the full annual grid; it's a spreadsheet cosplaying as software. Goals → monthly focus → daily 3 is the whole value.
- Worry List: global quick-capture, Monday integration.

### C. Cards Library (the wall, digitized)
- Card types: Goal (5), Motivation item (short, private), Thought Habit ("When X, think Y"), 2.0 Trait (belief/character/skill), 10X card (static).
- Shown only in rotation during End-of-Hour and Morning Start. Editable in settings. This replaces printing and posting documents while keeping the autosuggestion-by-repetition mechanic.

### D. Habits (thin layer, capped at 7)
- Each habit = identity statement + schedule + optional why-card (one line of evidence from the research docs).
- Check-in = "a vote for [identity]," with an all-time vote count.
- Score = exponentially-decaying 0-100 (Loop model): a check-in pulls it up, a miss dents it a few points, never zeroes.
- Suggested starting set, matched to your existing protocol: Train (per your program), Diet on-protocol, Steps 7k (manual or HealthKit later), Sleep consistency (derived from Start Day + sleep_intent timestamps, zero input), Gratitude x3, Reach out to someone. That's 6; leave one slot open.
- Sleep consistency now carries the strongest why-card in the app: sleep ≈ 25% of grade variance.

### E. Insights
- Daily: delta, efficiency ratio (allowed time ÷ time awake, fully auto), distraction count.
- Weekly: hours by category, distraction Pareto, efficiency trend, habit scores.
- Later: correlations ("hours on days you trained vs not," "distractions vs sleep consistency," and once a semester of data exists, hours + sleep consistency vs. quiz scores, your own personal Okano study). Oura-style behavior tagging but with your own raw data.

### F. Accountability (multiplayer)
- Group of 1-5 people, shared feed of hour submissions, push ping on each submit.
- Leaderboard: total hours (day/week/month/all-time) + average delta. Nothing else; those are the course's two official metrics.
- Public share card for Day Won / sprint progress (opt-in per post).
- Obvious first member: Ayman. The Zapier + Google Forms setup from the course is exactly what Supabase realtime + Expo push replaces.

### G. Advanced (only after 4 weeks of consistent use)
- Useful-output metric: optional numeric field per hour with a per-project unit (words, commits, calls). Output/hour trend next to hours.
- 100-Hour Sprint mode: target, countdown, cumulative bar, daily required pace, share card.
- Stacked hours (90/120 blocks logged as multiple Hours).

---

# PART V: THE ACADEMICS MODULE
### From syllabus to "here is exactly what to do today, and how"

The Work Engine, Night Plan, and habit layer stay exactly as designed; this module is a new planning brain that feeds them. Nothing here adds a fourth daily touchpoint.

## 5.1 Architecture in one sentence

**LLM at the edges, deterministic scheduler in the middle, you approve every change.**

- **Ingest (LLM):** syllabus PDFs and pasted announcements get parsed into structured data by an Anthropic-API edge function. Output is always shown as a diff you confirm, never silently applied.
- **Plan (deterministic):** a scheduler works backward from every deadline using the evidence rules (spacing curves, practice-test placement, milestone decomposition, load balancing). Same inputs, same plan, auditable.
- **Prescribe (surfaces you already use):** a "School Today" list pre-populates the Night Plan dump; study sessions run as Deep Work Hours with a Mode card telling you exactly how to execute.
- **Adapt (LLM + rules):** announcements create plan diffs; practice-test and real scores trigger the benchmark rules from the research (see 5.6).

## 5.2 Ingestion: courses, syllabi, announcements

### Semester setup (once, ~15 min)
Upload each syllabus PDF. The parser extracts:

- Course code/name, meeting times, professor, policies (late work, attendance)
- **Weight table** (e.g., quizzes 30%, exams 40%, papers 20%, participation 10%)
- Every dated item: exams, quizzes, problem sets, papers, discussion posts, readings, projects
- Recurring patterns ("weekly discussion post due Sunday 11:59," "quiz every other Friday")

You review the parsed schedule side by side with the PDF, fix anything, confirm. Missing dates ("Exam 2: TBD") become placeholder items that nag you weekly until dated.

### Announcements (ongoing, ~20 sec each)
Share-sheet or paste any professor announcement (Canvas post, email, in-class note typed from your phone). The parser returns a **diff**: "Quiz 4 moved Oct 3 → Oct 10. New requirement: bring a printed formula sheet. Reschedule 3 dependent study sessions?" One tap applies it; the scheduler recomputes; tomorrow's School Today reflects it. Announcements with no schedulable content just get filed to the course.

This is the whole friction-removal thesis: professor noise in, updated plan out, zero mental bookkeeping.

## 5.3 The task taxonomy and Method Modes (the "how")

Every assessment gets a type, and every type maps to an evidence-based execution template. The Mode appears on the timer screen when the session starts, so the method is decided before you sit down.

| Type | How the scheduler plans it | Mode shown during the Hour |
|---|---|---|
| **Exam / quiz** | Backward-planned retrieval sessions on an expanding curve (e.g., D-21, D-14, D-7, D-3), timed practice test at ~D-7 and D-2, light review D-1. Never a cram block the night before; sleep is protected by design. | **Retrieval:** blank-page recall of the topic, check and fill gaps, then answer the due questions from the Bank. |
| **Problem set (MATH 1308, ECON 2306)** | Split across 2-3 days, mixed with prior topics. | **Interleave:** worked example first if the topic is new, then self-solve with problem types shuffled; explain the *why* of each solution step out loud (self-explanation). |
| **Paper / essay (ENGL 1301)** | Auto-decomposed into milestones (thesis → outline → draft → revise → polish), each assigned to a Deep Work Hour with its own mini-deadline days before the real one. | **Draft:** the milestone is the deliverable; no research allowed during drafting hours. |
| **Reading** | Scheduled before the relevant class; never appears as "read Ch. X" alone. | **Recite:** survey and read, then close the book, blank-page recall, then write 5-10 questions into the Bank (generation effect). |
| **Discussion post** | Recurring item with the rubric attached (your World Music pattern: paragraphs, example, personal connection, reply). | **Compose:** rubric checklist on screen, one Hour or less. |
| **Memorization-heavy** | Daily card queue via the spaced scheduler. | **Cards:** clear the due queue. |
| **Admin (UNIV 1131 tasks, forms, petitions)** | Batched into one weekly slot or the Anti-Worry Hour. | none |

Interleaving comes free: the daily question queue draws across courses and topics by due date, so review is mixed by default instead of blocked.

## 5.4 The Question Bank (the core study asset)

One bank per course. Questions come from three sources: you write them after readings (generation effect, highest value), the parser drafts them from uploaded notes/slides for you to edit, and missed practice-test items convert automatically.

Each question stores: prompt, answer, **source anchor** (textbook page / slide / lecture date), topic tag, and scheduler state (interval, ease, lapses). Source anchors matter for exactly the reason your quiz-checking workflow exists: answers get verified against the actual course material, not vibes or pattern-matching.

**Scheduler:** SM-2-lite in Supabase (an edge-function nightly cron assigns due dates). Correct → interval grows (1 → 3 → 7 → 21 days...). Miss → interval resets short. No proprietary black box; you can read the algorithm in one screen of code.

**Calibration loop:** before revealing the answer, one tap: Sure / Think so / Guessing. The app tracks confidence vs. correctness per course. When "Sure" answers are wrong more than ~15% of the time, it tells you plainly: you have an illusion-of-competence problem in this course, and it weights those topics up.

If you'd rather use Anki for raw card volume, the Bank can hold only the scheduling metadata and link out; but building the lite version in-app keeps the daily queue inside the Hour flow, which is worth it.

## 5.5 School Today (the "what and when")

Every evening the scheduler emits an ordered list for tomorrow:

> **School Today · Tue**
> 1. MATH 1308 · PSet 4 part 2 · ~40 min · Interleave · due Thu
> 2. ECON 2306 · 22 due questions + recall Ch. 5 · ~25 min · Retrieval · Exam 1 in 9 days
> 3. ENGL 1301 · Outline milestone · 1 Hour · Draft · paper due in 12 days
> 4. Reading: ECON Ch. 6 · Recite · before Wed class

These items **pre-populate the Night Plan dump.** You still star 3 and crown the MIT like always; on heavy school days the MIT will often be a school item, on light days it stays MyHomeBase. School work executes as ordinary Deep Work Hours (category: School, sub-tagged by course), so it hits the Wall, the Chain, and the leaderboard like everything else. One system, not two.

**Load forecasting:** the scheduler sums estimated minutes per day for the next 3 weeks against your per-weekday baselines. When a week overflows (two exams colliding), it warns *now* and pulls work earlier, instead of letting you discover the collision on Sunday night. This is the "manager" behavior: it sees around corners so you don't have to.

**Grade Ledger:** every returned score gets logged against the weight table. Each course shows a live projected grade plus a target calculator ("need ≥ 84 on the final for an A"). With a transfer GPA on the line for CAP, this turns "am I okay in this class?" from a background worry into a number.

## 5.6 Feedback rules (straight from the research benchmarks)

Encoded as plain if-then rules that fire after scores are logged:

- **Practice tests high, real exam lower** → retrieval is too easy or too close to study. Scheduler adds spacing, hardens question formats, moves practice tests earlier.
- **"I knew it but blanked"** (you tag this after an exam) → increase free-recall sessions, cut recognition-style questions.
- **Focus cratering in afternoons** → check sleep-consistency score and caffeine timing before adding study hours. (Caffeine cutoff is computed from your average sleep_intent: intent 11 PM → cutoff ~3 PM, shown on the day screen.)
- **Course calibration gap >15%** → weight that course's topics up in the queue.
- **A course's questions all >21-day intervals with no upcoming assessment** → queue shrinks automatically. The system respects that done is done.

Physiology stays where it already lives: sleep consistency, training, and steps are keystone habits with why-cards from the learning doc. The phone-in-another-room rule is already the deep work protocol.

## 5.7 Journey walkthrough, school edition

- **Late Aug:** upload 4 syllabi (ECON 2306, ENGL 1301, MATH 1308, UNIV 1131). 15 minutes of confirm/fix. The whole semester's skeleton exists; exam retrieval curves are already placed.
- **Random Tuesday:** professor posts "Quiz moved to Friday, covers 6.1-6.3 only." Share to LifeOS, approve the diff. Three sessions shift; tonight's Night Plan already reflects it.
- **Every night:** School Today items sit in the dump. Star, crown, sleep.
- **Every study Hour:** Mode card says exactly what to do; questions answered in-app feed the scheduler; the Hour lands on the Wall like any other.
- **After a quiz:** log the score. Ledger updates the projected grade; benchmark rules fire if the practice/real gap is wide.
- **Sunday:** weekly review shows school load next week, any overflow warnings, calibration gaps, and one milestone per course confirmed.
- **Finals season:** nothing special happens, which is the point. The expanding curves were laid down weeks ago; finals week is just executing pre-planned retrieval sessions at normal sleep.

School failure modes: parser gets a date wrong → you catch it at the confirm step, and every item deep-links to its syllabus source line. You skip a planned session → it reflows forward with the load forecaster, no guilt copy, but the exam-proximity warning sharpens. A professor runs the class off-syllabus → recurring rules are editable per item, and announcements progressively correct the model. You're sick during an exam week → sessions compress to the minimum retrieval set (due cards only) rather than vanishing.

---

# PART VI: DATA MODEL (Supabase, combined)

### Core
```
days            id, date, wake_at, sleep_intent_at, baseline_hours,
                delta_seconds (computed), hours_completed, efficiency,
                day_won, chain_repair_used
work_hours      id, day_id, index, started_at, ended_at, deliverable,
                category_id, distraction_count, constraint_note,
                output_value, output_unit, sprint_id (nullable)
distractions    id, work_hour_id, cause enum(phone, hard, finished_early,
                notification, reflex, bored), at
plans           id, date, items jsonb [{text, starred, mit, milestone_id,
                done}], created_at
goals           id, title, number, deadline, reason, position (1-5), active
milestones      id, goal_id, month, title, done
habits          id, name, identity, why_card, schedule jsonb, paused,
                score float, votes int
habit_logs      id, habit_id, date, done
worries         id, text, status enum(open, handling, done), created_at
cards           id, type enum(goal, motivation, thought_habit, trait, tenx),
                text, weight, active
groups          id, name; group_members: group_id, user_id
routines        id, day_id, type enum(morning, night), items jsonb
sprints         id, name, target_hours, start, end
```

### Academics
```
courses          id, code, name, term, meeting_times jsonb, professor,
                 weight_table jsonb, policies jsonb, color
course_files     id, course_id, kind enum(syllabus, slides, notes), storage_path
announcements    id, course_id, raw_text, parsed_diff jsonb, applied, created_at
assessments      id, course_id, type enum(exam, quiz, pset, paper, post,
                 reading, project, admin), title, due_at, weight, est_minutes,
                 status, score, max_score, recurring_rule jsonb
sessions         id, assessment_id, course_id, mode enum(retrieval, interleave,
                 draft, recite, compose, cards, practice_test),
                 planned_date, est_minutes, work_hour_id (nullable), done
questions        id, course_id, topic, prompt, answer, source_anchor,
                 interval_days, ease, due_date, lapses, origin enum(self, ai, missed)
attempts         id, question_id, at, confidence enum(sure, thinkso, guessing),
                 correct
practice_tests   id, course_id, assessment_id, date, score, timed, conditions
```

### Computed and functions
- Views: leaderboard (hours by period per user), weekly category totals, distraction pareto, grade projection.
- Habit score decay (edge-function nightly cron): `score = score * 0.96` on scheduled-but-missed days, `min(100, score + boost)` on check-in.
- Edge functions: `parse_syllabus` and `parse_announcement` (Anthropic API, return strict JSON against the schema + human-readable diff; anything the parser can't date or classify lands in a "needs review" tray rather than guessing), `nightly_scheduler` (due-date assignment, backward planning, load forecast), `grade_projector`.
- RLS on everything by user_id; group tables readable by members. The four known security items in the repo remain your call, but before the accountability group goes live with real people, fix at least the auth/RLS ones.

---

# PART VII: RETENTION MECHANICS (what actually pushes usage of YOUR app, for you)

1. **The timer forces opens.** The app is open during work by necessity. That's the wedge; everything else piggybacks on it.
2. **Exactly 3 notification types, ever:** Night Plan (9:30 PM), Morning nudge (if no Start Day by your usual wake + 30), Group pings. Silence is a feature; more notifications train ignoring.
3. **Anchor ritual is at night, not morning.** Willpower is lowest in the morning; the plan being already made is what gets Hour 1 started. This is the single highest-leverage retention choice in the whole design.
4. **Variable reward, subtle:** card rotation at end-of-hour, milestone moments (10th hour, 50th, 100th, first perfect week, first sub-60 delta). No slot machines.
5. **Loss aversion, softened:** the chain + repair tokens give streak pull without the guilt-quit failure mode the research warns about.
6. **Proof compounds:** the Sticky Wall and vote counts only ever grow. Opening the app should always feel like looking at evidence, never at debt.
7. **Instrument yourself:** log app-open events per surface for the first month. If Night Plan completion drops below ~5 days/week, the flow is too heavy; cut a step (the research doc's week-1 rule applied to n=1).

---

# PART VIII: NAMING / JARGON (keep the vocabulary tiny and consistent)

| In-app term | What it is |
|---|---|
| **Hour** | one deep work hour (the atomic unit) |
| **Delta** | wake → first Hour completed |
| **MIT** | the crowned task, defaults to Hour 1 |
| **Day Won** | baseline hours hit |
| **Chain** | consecutive Days Won; Repair token fixes one gap |
| **Wall** | the sticky-note grid of all Hours |
| **Cards** | goals / motivation / thought habits / 2.0 traits |
| **Vote** | one habit check-in ("a vote for the athlete") |
| **Score** | decaying 0-100 per habit |
| **Worry List** | capture inbox; Monday Hour 1 clears it |
| **War Map** | Top 5 Goals → monthly milestones → nightly 3 |
| **Sprint** | 100-Hour mode |
| **School Today** | tomorrow's ordered school list, feeds the Night Plan |
| **Mode** | the evidence-based execution template shown on the timer |
| **Bank** | per-course question bank (spaced retrieval) |
| **Session** | one planned study block tied to an assessment |
| **Diff** | a parsed syllabus/announcement change awaiting your approval |
| **Ledger** | live projected grade per course + target calculator |
| **Signal** | any external data point (Whoop sleep, geofence, Canvas grade) |
| **Rule** | a readable if-then that turns Signals into auto-logs or suggestions |

Do not surface "autosuggestion," "Pavlovian conditioning," "efficiency maxxing," "retrieval practice," or "SM-2" in UI. The mechanics carry the theory; the words would just be noise.

---

# PART IX: BUILD ORDER (combined)

**Phase 1 (this week, the 80/20):** Hour timer + counter + End-of-Hour flow, Night Plan (dump/star/crown), Start Day + delta, Chain + Day Won, Wall. This alone is a working Work Form System and your nightly planning spec.

**Phase 2:** Cards library + rotation, Morning Routine checklist, Worry List + Monday mode, Habits layer (6 keystones, identity votes, decaying score), Night close-out stats. **+ S1:** courses, assessments, manual entry, School Today → Night Plan feed, Grade Ledger, School category on Hours. S1 is fully useful with zero AI; ship it before fall midterms, it alone kills most of the daily decision load.

**Phase 3:** Insights (weekly review screen, Pareto, efficiency trend), War Map Lite, per-weekday baselines, repair tokens. **+ S2:** `parse_syllabus` + `parse_announcement` edge functions with the confirm-diff UI.

**Phase 3.5 (S3):** Question Bank, SM-2-lite scheduler, Modes on the timer screen, calibration taps. S2 and S3 are where "manager" happens.

**Phase 4 (needs an Expo dev build, not Expo Go):** push notifications for group pings, home-screen widget (Chain + MIT), Live Activity timer, HealthKit steps/sleep, share cards, Sprint mode, output metric. **+ S4:** backward-planned exam curves, load forecasting, practice-test benchmarks, sleep/score correlations.

Rule for every phase: ship, use it for 5-7 real days, run the Self-Improvement Loop on the app itself (what created friction, what got skipped), then build the next phase. The course's own history (22 additions over years, each solving the biggest remaining hole) is the correct roadmap philosophy: let your usage expose the next feature, don't pre-build it.

---

# PART X: DELIBERATELY NOT BUILDING

- A 150-habit library or 11-domain browser. The research catalogs the space; you need 6-7 habits and one work engine.
- Pets, leagues, hearts, XP economies. Wrong philosophy for a personal accountability tool; identity + proof is the pick.
- The full annual War Map grid, journeys/courses content, meditation audio, food logging (your diet protocol lives elsewhere; the app just takes the vote).
- Any second daily ritual. If a feature can't attach to Night Plan, Morning Start, or End-of-Hour, it doesn't ship.
- A full Canvas OAuth developer integration. Not needed: your own personal access token plus the per-user ICS feed gets read-only announcements, assignments, and grades with none of the institutional-app pain (see Part XI). Share-sheet paste remains the fallback for anything the poll misses.
- AI answering your coursework inside the app. The app manages *when and how* you study; the studying is you. (Question drafting is the one exception, and you edit every card.)
- Summarization, highlighting, or "review notes" task types. Low-utility by the evidence; deliberately unrepresentable in the schema.
- A second gamification layer for school. Hours are Hours.

---

# PART XI: API & AUTOMATION LAYER
### Signals in, decisions surfaced, you stay the operator

The point of every integration is to delete a manual input or a decision. If a connection doesn't remove at least one tap, one data entry, or one "should I...?" moment per day, it doesn't get built. All external data lands in one unified `signals` table, and a deterministic rules engine (same philosophy as the scheduler: readable, auditable, no black box) turns signals into either auto-logged records or surfaced suggestions. One governing principle carried over from the course: **data informs, it never excuses.** Low recovery can change what you train and when you sleep; it never lowers the day's Hour baseline.

## 11.1 Tier 1: the big three (build these)

### Canvas (announcements, assignments, grades: the manual-paste killer)
UTA runs on Canvas, and Canvas has two personal-scale doors that skip the whole institutional-OAuth mess:

- **Personal access token**: you generate it yourself in Canvas Account → Settings. A polling cron (every 30-60 min on school days) hits the REST API for announcements, assignment lists with due dates, and submission grades for your enrolled courses.
- **Per-user ICS calendar feed**: every dated Canvas item as a standard calendar subscription, zero auth complexity, good as a redundancy check against the parsed syllabus.

What this automates: announcements flow straight into `parse_announcement` without you pasting anything (you still approve the diff), new/changed due dates reconcile against `assessments` automatically, and **returned grades auto-fill the Grade Ledger** so projections update the day scores post. The share-sheet paste stays as the fallback for in-class verbal announcements. This single integration removes the largest remaining manual chore in the Academics module.

### Google Calendar (two-way: the scheduler gets eyes and hands)
- **Read**: class meeting times, work commitments, and free/busy feed the `nightly_scheduler`, which places Hours and study sessions into real open windows instead of assuming an open morning. An event added mid-day (a meeting, a group project session) triggers a re-flow of tomorrow's plan via incremental sync (syncToken) plus a push channel.
- **Write**: planned Hours and study sessions get pushed as calendar blocks ("Hour 1: MIT", "ECON Retrieval, 25 min"), which is the course's Time Blocking step automated, makes you visibly busy to anyone with calendar access, and puts the plan on every device you own for free.

What this automates: the "when" of every session, collision detection with real life, and the protected-morning block, with zero duplicate data entry between LifeOS and the calendar you already live in.

### Whoop (physiology: the habit layer goes hands-free)
Whoop's v2 developer API is free with a membership, OAuth 2.0, and has webhooks for sleep, recovery, and workout events, so LifeOS gets pushed data instead of polling. Recovery is a morning metric that only exists after the sleep cycle closes, which fits the flow perfectly:

- **sleep.updated webhook** → actual sleep and wake times land in `signals`. Sleep-consistency habit scores itself with zero taps, from measured data instead of intent. The caffeine cutoff recomputes from real average sleep time. The delta clock can arm from the true wake time, making Delta a measured number rather than a tapped one (Start Day stays as the manual override).
- **recovery.updated webhook** → recovery score plus the raw inputs (HRV rmssd, resting HR, SpO2, skin temp) stored and shown raw, exactly as the research doc demands: composites displayed, raw signals trusted. Rules fire on the raw numbers, not the score.
- **workout.updated webhook** → gym sessions auto-cast the Train vote with duration and strain attached. One more manual habit gone.

Rules examples: RHR trending 5+ bpm above baseline for 3 days → "back off training intensity, protect sleep" card. Recovery red on an exam-week day → suggest swapping the training slot for a walk and pulling sleep intent 45 min earlier; Hours untouched. Sleep consistency dips → the afternoon-focus benchmark rule (Part V, 5.6) now checks measured data instead of asking you.

Implementation notes: webhook receiver as a Supabase edge function with signature validation, plus a daily reconciliation poll since Whoop themselves say webhooks shouldn't be the sole source of truth. Refresh tokens on the offline scope, rotated hourly by cron.

## 11.2 Tier 2: context and friction killers

### Apple HealthKit (steps and backup sleep)
Read steps daily → the Steps 7k habit self-logs. Also a second opinion on sleep if the Whoop strap is off or dead. On-device, free, private; needs the Phase 4 dev build. If Whoop covers you fully, this is just the steps pipe.

### Geofencing (expo-location: the app learns where you are)
Define 4-5 fences: home, gym, campus/library, class buildings. Events land in `signals` and drive:

- **Arrive gym** → workout mode surfaces; leaving after 30+ min without a Whoop workout event asks one question: "Train today?" (one tap, vote cast).
- **Arrive library/campus study spot** → notification with the next planned session and its Mode: "Hour 2 is ECON Retrieval, 25 due questions. Start?" The decision of what to do on arrival is already made.
- **Class-building fences during class time** → passive attendance log, no UI, just a signal for later correlation (attendance vs quiz scores).
- **Leave home during a planned Hour block** → nothing punitive; the scheduler just reflows quietly.

Location data stays in your own Supabase, is never shared to the group feed, and each fence is individually deletable. Background location needs the dev build and "Always" permission; batterywise, region-monitoring (not continuous GPS) is the right primitive.

### Apple Shortcuts, App Intents, and NFC tags (the cheapest automation in the stack)
Expose deep links / App Intents for the core verbs: `lifeos://start-day`, `start-hour`, `plus-one` (distraction), `end-hour`, `sleep-intent`. Then:

- **NFC tag on your desk**: tap phone → Start Hour fires → an iOS Shortcuts automation simultaneously enables a "Deep Work" Focus mode (notifications off, distracting apps hidden). The course's Pavlovian cue made physical: the tap IS the bell.
- **NFC tag on the nightstand or by the door where the phone sleeps**: tap → sleep-intent logged, alarm confirmed, phone goes in its spot. The night routine's last step becomes one physical gesture.
- **Focus mode automation both directions**: starting an Hour turns Focus on; the Hour's end notification turns it off. This is the Desktop/Phone App Blocker layer from the course, implemented with zero custom blocking code.
- Lock-screen and Action-button shortcuts for +1 Distraction, so logging a distraction never requires unlocking into the app.

### Anthropic API expansions (already in the stack, two new jobs)
- **Morning brief**: a 3-line generated note on the Start Day screen stitching signals into English: "Slept 7:40, consistent. Recovery 62, RHR normal. MIT: ECON outline. Two due dates moved yesterday, plan already adjusted." Reading the state of your life takes five seconds.
- **Weekly review narrative**: turns the Sunday charts into three paragraphs of what actually changed and the single biggest constraint, feeding the course's Self-Improvement Loop with zero journaling overhead.

## 11.3 Tier 3: ambitious / gated

- **Brick (your physical blocker): no API, and that's fine.** Brick has no developer API or data export; blocking data is stored locally on the phone and Brick themselves can't access it, so there is nothing for LifeOS to pull. Time-bricked and session history do exist, but only inside Brick's own app (it ships a built-in focus timer and usage history). So: the Brick becomes the physical phone-blocking layer of the protocol (it is literally the device the course names for layer 1 of the phone setup), and its stats stay in its app. No integration, no workaround.
- **Apple Screen Time: there is no read API. Full stop.** iOS lets third-party apps *display* your real screen time only inside a sandboxed DeviceActivityReport extension that can render the data but cannot pass it out: App Groups, shared files, and every other channel are blocked by design, confirmed by Apple. So LifeOS can never store, chart, or run rules on your actual screen-time numbers. The one supported thing it CAN do: embed Apple's rendered screen-time panel as a display-only card on the weekly review (requires FamilyControls authorization and the dev build). Numbers on glass, nothing in the database. Anything beyond that is workaround territory, which we are not doing.
- **Automatic distraction counting during Hours**: the phone counting its own pickups stays gated behind the FamilyControls entitlement (approval required, no Expo Go). Parked as I4. The zero-entitlement interim remains the iOS Shortcuts personal automation ("when Instagram/TikTok opens, open lifeos://plus-one?cause=phone").
- **Aggregators (Terra, Open Wearables)**: only worth it if you ever want Oura/Garmin/etc. alongside Whoop under one schema. Direct Whoop is free and one integration; start there.
- **UTA MyMav**: no API, don't scrape. Registration and degree-audit stuff stays manual and rare.

## 11.4 What each integration deletes (the scorecard)

| Manual thing today | Automated by |
|---|---|
| Pasting professor announcements | Canvas token poll |
| Entering quiz/exam grades into the Ledger | Canvas submissions poll |
| Deciding when sessions happen around classes | Google Calendar read + scheduler |
| Blocking your own calendar for Hours | Google Calendar write |
| Sleep-consistency habit vote | Whoop sleep webhook |
| Train habit vote | Whoop workout webhook (geofence fallback) |
| Steps habit vote | HealthKit |
| Caffeine cutoff math | Whoop actual sleep average |
| "What do I do now that I'm at the library?" | Geofence + next-session notification |
| Starting Focus/DND for an Hour | Shortcuts automation on start-hour |
| Night routine phone-away + sleep log | Nightstand NFC tag |
| Distraction logging while phone-locked | Action button / lock-screen shortcut |

Roughly a dozen daily decisions and inputs deleted. What remains manual is exactly what should be: the nightly star-and-crown, the deliverable confirmations, diet and gratitude and reach-out votes, and the work itself.

## 11.5 Architecture

```
integration_accounts  id, provider enum(canvas, gcal, whoop, healthkit),
                      access_token (encrypted), refresh_token (encrypted),
                      expires_at, scopes, status, last_sync_at
signals               id, provider, type (sleep, recovery, workout, steps,
                      geofence_enter, geofence_exit, calendar_event,
                      announcement, grade, focus_on...), payload jsonb,
                      occurred_at, processed
geofences             id, name, lat, lng, radius_m, kind enum(home, gym,
                      study, class), active
rules                 id, name, trigger jsonb, condition jsonb,
                      action jsonb, enabled, last_fired_at
```

Edge functions: `whoop_webhook` (signature-validated receiver → signals), `canvas_poll` + `gcal_sync` + `whoop_reconcile` (crons), `rules_engine` (runs on signal insert: writes habit_logs, updates day fields, queues suggestion cards, or triggers `nightly_scheduler` re-flow). Tokens encrypted at rest (Supabase Vault), all provider tables under RLS, and every automated write is tagged `origin: auto` so you can always see and override what the machine did. Suggestion cards expire unanswered rather than nagging.

Failure posture: every webhook has a reconciliation poll behind it, every poll has manual entry behind it, and the app remains fully functional with zero integrations connected (Minimum Viable Mode extends to the data layer). An integration going down should feel like losing autofill, not losing the app.

## 11.6 Build order for integrations

- **I1 (with S2, since it shares the parsing pipeline):** Canvas token poll + ICS reconciliation, Google Calendar read + write.
- **I2 (with Phase 4, since it needs the dev build):** Whoop OAuth + webhooks + reconciliation, HealthKit steps, deep links / App Intents + the two NFC tags + Focus automation.
- **I3:** Geofencing, morning brief + weekly narrative, the Shortcuts distraction-counting hack.
- **I4 (only if earned):** FamilyControls entitlement application for true Screen Time integration.

---

# PART XII: DAY ONE

1. Enter your Top 5 Goals (number, deadline, reason) and 5-10 Motivation items and 3 Thought Habits into Cards.
2. Set per-weekday baselines around your class schedule.
3. Add the 6 keystone habits with identity statements.
4. When S1 ships: upload the 4 syllabi, confirm the parsed semester, set weight tables.
5. When I1/I2 ship: connect Canvas (token + ICS), Google Calendar, and Whoop; stick the two NFC tags on the desk and nightstand.
6. Tonight: run the first Night Plan.
7. Tomorrow: Start Day, race the Delta, win the day, and let the Wall start filling.

The app's job is to make the loop frictionless, the plan already made, and the proof impossible to ignore. Your job is the four hours.
