# Known issues

> Convention adopted from ULM's `.brain/`. The **"Deliberate constraints that look like bugs"**
> section is the highest-value part of this file: every entry there prevents a regression by
> stopping someone from "fixing" something load-bearing back into the problem it solves.

---

## Active

### Nothing in this build has been run against a database
`database.types.ts` is hand-written for 33 tables, and migrations 47–62 have never been applied.
`db:types:cloud` after `db push` is step 0.3 of `docs/CONNECTION_CHECKLIST.md` and is **required, not
advisory** — a regeneration that changes the file means a transcription error, and every later
result is suspect until it passes.

### Ingestion has never processed a real book
The pipeline is unit-tested end to end against fixtures and has never seen a 300-page PDF. D46's
falsifier is the specific thing to watch: if PDF extraction exceeds the CPU budget at 25 pages per
invocation, halve the slice; if it still fails at ~5, the design needs a worker.

### The Learn cost model is computed, not invoiced
`costEstimate.ts` derives ~$0.91–$1.28 per 300-page book from the published pricing tables. No real
ingestion has been billed. The most uncertain input is the triage pass rate (assumed 60%), which the
first real book measures directly as extraction calls ÷ chunk count.

---

## Deliberate constraints that look like bugs

**Do not "fix" any of these.** Each is load-bearing and each has a decision behind it.

### A Learn session does not move Day Won, Hours, Delta or Efficiency
D28. One session table, two metrics. A five-minute retention session that inflated Day Won would
silently redefine every baseline the user calibrated against deep work.

### Extraction and card generation refuse rather than degrading when there is no model key
D45. The keyless heuristic path measured 3/10 on a real book in ULM: selection where the product
requires transformation. Refusing beats shipping lessons nobody can stand behind. Triage, merge
clustering and cloze cards *do* keep a heuristic floor — the split is deliberate, not partial work.

`generating_cards` blocks for the same reason, and the tempting "fix" is specific enough to name:
cloze cards ARE deterministic, so a keyless run could write them and call the book done. Do not.
A deck of nothing but fill-in-the-blank cards is recognition practice, and it is indistinguishable
from a good deck to the person reviewing it — the failure is invisible at the moment it happens
and only legible months later.

### A card whose topicality could not be checked is counted as `unknown`, never as a pass
D41 + ULM ADR-011. With no `VOYAGE_API_KEY` the topicality gate cannot run, so the card is still
written (a second vendor's credential is not a hard dependency of the Learn pillar) but the job
records `topicalityChecked: false` and increments `topicalityUnknown`. Collapsing that into the
pass count would make a keyless book look exactly as verified as a keyed one in the only record
anybody reads.

### A lesson that produced no usable card stays `active` rather than being archived
It simply never enters a queue. Archiving it would be a quality judgement on the *lesson* made by a
failure of the *card writer*, and it would take a real, grounded, readable lesson out of the
library. A source where NO lesson produced a card fails outright instead — that is a failed
ingestion the user must see, not an empty library they will assume is a bug.

### A dimension with fewer than three acts shows no number at all
D40. Not a loading state. Reporting the decay model's neutral starting value as a measurement would
be a verdict on someone who has not been measured.

### An unanswered check-in window is `unknown`, and unknown is excluded from coverage
D33. Deriving "wasted" from silence would let the app invent the very number the user is supposed to
confess. Coverage counting unknown as a miss would punish someone for a question nobody asked.

### A null prayer window never derives `missed`
No location set, or a high-latitude date where the angle is unreachable. "We do not know" must never
render as "you failed".

### There is no streak anywhere — in Deen, in Learn, or in Desired Self
D23, D29, D30. Qada, the due queue, and the decaying score are the replacements, and each is finite,
visible and clearable in a way a streak is not.

### A future day in the Fitness week strip is blank, not zero
A zero on Thursday when it is Tuesday claims Thursday was a rest day.

### A dimension that has NEVER had an act cannot fire a drift confrontation
D50. Someone who wrote a drift statement yesterday is at the beginning, not adrift.

### A zero baseline never fires an under-baseline confrontation
D50. A rest day the user defined is not drift.

### `hardSplit` caps an unbroken "sentence" in the chunker
Removing it reintroduces 47k-token chunks from a run of text with no sentence terminators, silently
truncated by the embedding model downstream. Arrived at independently here; ULM found it by
adversarial input.

### `lesson_reviews` has no UPDATE or DELETE policy
The absence IS the enforcement. Adding one "just for admins" removes append-only with nothing else
standing behind it.

---

## Known-flaky

None identified.

### The M.O.M. close is two calls, not a transaction
`saveMomReview` deactivates the current M.O.M. and then creates the next one in two PostgREST
calls. The order is deliberate: deactivating first means a wrong sequence is rejected by the partial
unique index rather than producing two live M.O.M.s, and a failure between the two reports "Closed
the M.O.M., but couldn't set the next one" rather than a silent success. At three users this is
fine; if it ever matters more, it wants an RPC.

### Mobile route naming diverges from web for the vision review
Web nests `/vision/review`; mobile uses `/vision-review`. Expo Router builds routes from files and
`app/vision.tsx` already owns the `vision` segment, so a sibling `vision/` directory beside it is
the kind of ambiguity that resolves differently between Metro versions. **Do not "fix" this into
matching web.**

### `Constants` in `database.types.ts` is generated, complete, and imported by nothing
The generator emits a runtime `Constants` object with every enum's values as arrays. It is correct
as of the 2026-08-30 regeneration (30 enums, `card_type` including `enemy`) and **nothing in the
repo imports it** — it is not even re-exported from `packages/api`'s barrel.

**That is the right state; do not "fix" it by wiring it up.** The places that need an enum's values
at runtime — `LIFE_DOMAINS`, `PRAYER_NAMES`, `MUSCLE_GROUPS`, `GOAL_RELATIONSHIPS`, the evidence
kinds — all live in `packages/core`, which must not import the generated database types: core is
pure by rule, and coupling the domain engine to a generated schema file would invert the dependency
the whole layout law exists to protect. `packages/api` is the only layer allowed to know about
`database.types.ts`, and it needs the *types*, not the arrays.

The one thing that would change this: a surface in `packages/api` needing to enumerate an enum at
runtime. There is none today.
