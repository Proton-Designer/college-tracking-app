# Ihsan — Addendum: the ULM port, and the vision chain

> Supersedes **Phase 4** of `docs/IHSAN_RECONCILIATION.md` (which planned Learn as a build) and
> adds four features from the *Charting the Eschaton* module. Read
> `docs/IHSAN_BUILD_REPORT.md` first for what already shipped.
>
> Two inputs arrived after the merge build finished: **ULM already exists** at
> `github.com/Proton-Designer/ULM`, built through L6 — 24 migrations, a working ingestion
> worker, ts-fsrs, provenance enforced in three places, web + mobile, and a `.brain/` knowledge
> base with 11 ADRs. And a course module supplying a strategy layer Ihsan has no equivalent of.

---

## Part 1 — The ULM port

### 1.1 What Ayman actually built

Verified by reading the repo, not the summary: `apps/{web,mobile,worker}` + `packages/{core,design}`
on Supabase, 24 migrations, 205 tests green, Lighthouse 98/100/100/100, and a documented gap list
that names what was *not* tested. It is further along than our Phase 4, and in three places it is
better than what we built.

**His three ideas we did not have, and are taking:**

1. **Progressive availability (ADR-010).** Lessons are written `provisional` per chunk; the merge
   pass promotes survivors to `active` and marks losers **`archived`, never deleted** — so a review
   of a card whose lesson later loses a dedup contest stays referentially intact. `books.status`
   gains `partial`: usable at ~10 carded lessons. This dissolves the wait instead of optimising it,
   and it is the single best idea in his repo. Our pipeline is all-or-nothing today.

2. **Quality as write-time invariants (ADR-011).** Ten machine-checked gates, thresholds calibrated
   against measured distributions on real books — not just provenance, but claim≠quote (substring
   *and* lexical overlap), claim↔provenance relevance, card anti-leak, cloze term quality, language
   sanity. With the standing lesson attached: *an invariant that can pass for a degenerate reason
   is not an invariant.* "24/24 provenance passed" was true both when the claim was a verbatim copy
   of the quote and when a real quote was bolted to an unrelated claim.

3. **`card_states` computed transactionally at the write** (ADR-005) rather than replayed on read.
   See D47.

**What we have that he does not:** the budget-ceilinged LLM gateway with usage logging, the
domain/session model, and the four surrounding pillars. His Learn is a whole app; ours has to be
one tab inside a larger one.

### 1.2 The two architectural questions, ruled

#### D45 — Anthropic through our gateway; the heuristic path survives only where it is honest

His precedence is **Ollama → Anthropic → Heuristic**, correct for a machine with no API key. Ours
inverts it, and drops one rung.

**Ollama is dropped from the shipped path.** It is why his ingestion takes ~58 minutes for 300
pages, and — decisively — it means ingestion only works while a worker runs on somebody's laptop.
Three people use this app. The `LlmProvider` interface stays, so a local provider is a config
change rather than a rewrite; that is exactly what ADR-004 built it for.

**Anthropic calls go through `callLlm`.** Worth stating precisely, because the repo does not contain
what its own docs imply: `AnthropicProvider` is **documented but never written** — grep finds it only
in comments. The dormant slot is the *interface*, not an implementation. So we write the adapter
ourselves, against his `LlmProvider` signature, and route it through our gateway. D9 is not
negotiable: no call site talks to a provider, because that is what makes the budget gate and schema
validation unbypassable.

**The heuristic provider: kept, but scoped — and this is the part worth arguing.** Our
deterministic-first pattern says every AI feature has a no-API fallback that is *the floor, not an
apology*. His ADR-009 says extraction must **never** silently degrade to the heuristic, because it
measured 3/10 on a real book: it did *selection* where the product requires *transformation*,
`core_claim` came out byte-identical to the provenance quote, and card prompts contained their own
answers — fatal, since retrieval practice is the entire thesis.

Both rules are right, and they collide because "deterministic-first" was never really about having
*an* output. It is about having an output we can stand behind. So:

| Stage | With a key | Without a key |
|---|---|---|
| Chunk triage | Anthropic (Haiku) | **Heuristic** — cue-phrase salience is genuinely good here |
| Lesson extraction | Anthropic (Sonnet) | **Refuse.** Job fails with an actionable message |
| Merge / rank | Anthropic (Sonnet) | **Heuristic clustering** — already built for the no-embeddings case (D41) |
| Cloze cards | Heuristic either way | Heuristic |
| Free-recall / application cards | Anthropic | **Refuse** |

Refusing beats shipping lessons nobody can stand behind — the same logic as the provenance firewall,
and the same logic our budget-block already follows when it degrades only where degrading is
meaningful.

#### D46 — Edge Functions stay; the worker is a documented escape hatch with a named trigger

ADR-002 rejected Edge Functions on an empirical finding, and empirical findings outrank arguments.
But **the finding is about local models, and it dissolves when the models are remote.**

Supabase's limit is on **CPU time**, not wall-clock. His pipeline is CPU-bound because it runs
`transformers.js` embeddings in-process and a local 7B model — both burn real CPU inside the
function. Ours does neither: embeddings are a Voyage HTTP call and extraction is an Anthropic HTTP
call, and awaiting a socket is not CPU time. What remains CPU-heavy is **PDF text extraction**, and
our pipeline already slices that at 25 pages per invocation with a checkpointed cursor.

Keeping Edge Functions also keeps D2 — one backend for two clients, one place for the key. A Node
worker means a second deployment target, a second secret store, a second thing that can be down,
and somebody remembering to keep it running.

**The falsifier, stated so this ruling can be disproven rather than defended:** if extracting a real
300-page PDF exceeds the CPU budget at 25 pages per invocation, halve the slice. If it still fails
at ~5 pages per invocation, the design needs a worker and this ruling is wrong.

**Where a worker would run if that happens:** Fly.io or Railway — a single always-on container with
the service-role key and `ANTHROPIC_API_KEY`, polling `ingest_jobs` with the same lease-and-
heartbeat protocol already in the schema. Ayman's `apps/worker` ports there nearly unchanged, which
is the real reason to keep his job-lease shape even while running on Edge.

#### D47 — Store `card_states`, and keep replay as the oracle that proves it

His ADR-005 persists FSRS state in a single transactional RPC with the review insert, so log and
state can never disagree. We derive state by replaying the log (migration 42's rule, D32).

**His wins on the read path.** Our `countDue` replays every card's full history on every call, with
a 2,000-review limit that would *silently truncate* rather than fail — a real defect at any scale
past a few months. His `get_session_queue` is O(due cards).

**Ours wins on integrity**, and we keep that: `scheduleFromLog` stays in `packages/core` as an
**oracle**, and a test proves stored `card_states` match a replay of the same log. That is his own
independently-written-oracle technique — the one that verified 61 days of streak logic against SQL
sharing no code with it — applied to scheduling.

**Consequence for D32:** the Question Bank's eventual FSRS migration is no longer "neither side
stores state". It becomes: replay the Question Bank's `attempts` log through the same wrapper and
write the resulting `card_states`. Still lossless, one step longer.

### 1.3 Everything else, reconciled

| Area | Ruling |
|---|---|
| **Schema** | His `books`→our `sources`, his `cards`→our `lesson_cards` (M14: `cards` already means the End-of-Hour rotation). We adopt `provisional`/`active`/`archived` lesson status, `partial` book status, `ingestion_jobs` lease/heartbeat, and his `self_explanations` table. Our `lesson_reviews` already matches his `reviews`. **Migration, not replacement** — our 54 is applied nowhere, so it is edited in place rather than superseded. |
| **Design tokens** | **Ours wins, no contest.** His is "The Reading Room" — warm paper `#FBF9F5`, light-only, deliberately banning dark mode. The merge directive already ruled LifeOS's dark system is the base. His *contrast test that fails the build* is the thing to take, and it ports directly onto our tokens. |
| **Navigation** | His Today/Library/Settings folds into our Learn tab: his Today → our `/learn` session, his Library → `/learn/library`, his Settings → the Learn section of our Settings. No new tabs. |
| **Auth / user model** | Ours. Both are `profiles` 1:1 with `auth.users`; his `user_settings` (daily_new_limit, notification_time, desired_retention, session_length_target, ai_grading_enabled) **merges into our `profiles`** — we already added the first three there. `session_length_target` and `ai_grading_enabled` come across. |
| **Streaks** | His `complete_session` carries 271 lines of PL/pgSQL implementing streaks, freezes and six priority-ordered "effortful win" probes. **The streak half does not port** (D23/D29). The *effortful-win* idea does, and lands on our comeback moment: a recovered card, a comeback after a gap, a book crossing a retention threshold. Write-once columns so a crossed threshold fires once rather than every session thereafter — his fix for "you crossed 80%!" repeating forever. |
| **`.brain` vs our docs** | We already have `.brain/memory/decisions.md`. Adopt his three *additional* files — `lessons.md`, `known-issues.md`, `active-work.md` — because our repo has no home for "what failed" or "deliberate constraints that look like bugs", and that second heading is worth the whole convention. His ADRs are carried into `docs/ULM_ADRS.md` verbatim, credited, with our overriding rulings noted inline. |

### 1.4 His bugs, checked against our code immediately

Reading his gap list found a live defect in ours:

- **NUL bytes in extracted PDF text** — Postgres rejects `U+0000` in a `text` column outright, and
  the resulting plain `Error` is *retryable*, so it is a poison pill that fails forever. **Our
  pipeline does not strip them.** Fixed in this phase.
- **Unbounded "sentence" producing 47k-token chunks** — our `hardSplit` already caps this,
  independently. No change needed; recorded so nobody removes it.
- **A provider call with no timeout, plus a progress-independent heartbeat, is an immortal job** —
  two individually-correct decisions combining into harm. Our re-driver looks at `heartbeat_at`;
  we add the timeout.
- **Trusting a `BEFORE INSERT` trigger that sets `user_id := auth.uid()` as RLS protection** — it
  makes the table's own `WITH CHECK` trivially true and provides *zero* real protection. Ours pass
  `user_id` explicitly and check it; recorded so nobody "simplifies" to the trigger form.

---

## Part 2 — The vision chain and three more additions

The module's structure is taken; its voice is not. That document's engine is shame — "most men
wander like ghosts", "loser-think", "pathetic mediocrity". **Ihsan never shames.** Every feature
below keeps the skeleton and rewrites the tone, and one of them (D50) exists specifically to make
the borrowed idea safe.

### D48 — The vision chain: one unbroken line, and drift is named rather than punished

Ihsan has nothing above the War Map. Adding, top down:

```
10-Year Vision  →  3-Year Beachhead  →  1-Year Mission  →  90-Day M.O.M.
                     →  monthly milestones (exists)  →  Night Plan MIT (exists)
```

Each layer links to the one above by nullable FK. **Nullable is the ruling**, not laziness: forcing
every MIT to justify itself upward would make the Night Plan unusable on the ordinary night when
something urgent is the honest answer, and would train people to attach a lie.

**Drift is a fact, not a verdict.** An MIT tracing to nothing is *unanchored*, shown as a count with
its items nameable — "3 of your last 10 MITs weren't connected to anything above them" — and never
as a failure. Sometimes the honest answer is that the chain is wrong, not the night.

A **90-day review ritual** sits above the weekly review: score the M.O.M., write what happened, set
the next one. The M.O.M. is scored on its own terms (hit / partial / missed / changed) — *changed*
is a first-class outcome, because a beachhead that turned out to be the wrong beachhead is
information, not failure.

### D49 — Goal Ecology: the pairs, not a score

For each pair of active goals the user marks **competing / neutral / synergistic**. Competing pairs
surface on the War Map and in the 90-day review, because they are what quietly kills systems and
nothing in Ihsan notices them today.

The **Priority Matrix** (vision alignment · leverage · compound benefit · opportunity cost) is built
as an **optional** gate on what enters the War Map — four 1–5 taps and a total. Optional because a
required scoring ritual on every goal is friction that gets skipped, and a skipped ritual teaches
people to ignore the app.

Unmarked pairs stay **unmarked**, never "neutral". Neutral is a judgement the user made; unmarked is
a question not yet asked, and collapsing them would inflate how examined someone's goals are.

### D50 — Per-dimension Hell: trigger-based confrontation, never a score

Each Desired Self dimension gains a second written field: **who I become in ten years if this keeps
being neglected** — first person, present tense, the user's own words.

**What this is not.** No heaven/hell slider. No global scale. That would be the grand total D34
refuses, wearing a darker coat, and it would be a guilt mechanic besides.

**What it is.** Defined drift triggers, all from data we already have, surface *the user's own text*
for that dimension:

| Trigger | Data behind it |
|---|---|
| An Hour with distractions past a threshold | `distractions` count on `task_sessions` |
| An abandoned Hour with no deliverable | `task_sessions.status = 'abandoned'` |
| A dimension with no acts in N days | the routing map + evidence stream |
| An MIT crowned three nights running and never done | `tasks.mit_rank` history |
| A day closed under baseline | `days` + the weekday baselines |

Four rules make it safe, and each is load-bearing:

1. **The app never judges — it only quotes the user back to themselves.** No generated language, no
   adjectives, no "you said you wanted X but". The screen shows what they wrote and nothing else.
2. **Rate-limited hard** — at most once a day, and the default is rarer. Rarity is what gives it
   teeth; a daily confrontation is a notification people learn to dismiss.
3. **Every confrontation is immediately followed by a door** — start an Hour now, or crown it for
   tomorrow. Confrontation then path back, never confrontation alone.
4. **It can be turned off**, per dimension, permanently, in one tap. A mechanic this sharp that
   cannot be declined is not a tool.

**Enemy** joins `card_type` in the existing Cards library, so the End-of-Hour rotation occasionally
shows what you are running from alongside what you are running toward.

### D51 — Weekly screen time by screenshot: self-report as the feature

iOS does not expose Screen Time to third-party apps. So this is deliberate self-report, and better
for it: **uploading forces you to look.**

The Sunday review gains a step — upload the weekly Screen Time screenshot → the **same AI-parse →
staged → confirm pipeline** as syllabus and announcements. The no-guessing rule applies in full:
an unclear value becomes a field the user fills, never an invented number. Confirmed numbers become
a weekly series alongside Hours and Signal:Noise, and a Focus-dimension drift input.

**A missed week is a gap, not a broken streak** — the series simply has a hole, and every chart
renders it as one.

**Accountability-group note, flagged not built:** three people use this app, and screen time is the
one number people actually feel shame about. Sharing it is a real product idea and a real hazard.
C9's single-owner RLS holds; nothing here is designed toward sharing, and if it is ever built it
needs its own ruling and its own opt-in — not a flag on this table.

---

## Phases

| Phase | Contents |
|---|---|
| **P6** — the ULM port | Provider adapter onto our gateway (D45); progressive availability; the ten write-time invariants; `card_states` + transactional RPC + the replay oracle (D47); his four bugs; ADRs carried into `docs/ULM_ADRS.md`; `.brain/memory/{lessons,known-issues}.md` adopted |
| **P7** — the vision chain | Schema, the chain surfaces, MIT anchoring, unanchored-drift reporting, the 90-day review ritual (D48) |
| **P8** — Goal Ecology | Pair relationships, competing-pair surfacing, the optional Priority Matrix (D49) |
| **P9** — Hell + confrontation | The second dimension field, the trigger engine, the rate limiter, the door, `Enemy` cards (D50) |
| **P10** — screen time | Screenshot upload, parse → stage → confirm, the weekly series, the Focus drift input (D51) |

Left for Ayman, unchanged: L1–L3 security, SMTP, AASA and the Ihsan domain, WHOOP, pgTAP on
Docker, App Store Connect, the TestFlight submission.
