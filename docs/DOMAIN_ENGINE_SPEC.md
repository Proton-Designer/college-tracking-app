# Domain Engine Specification (`packages/core`)

> Authored by the Lead. This is the algorithmic contract for L2. Every function here is **pure**:
> no I/O, no dates read from the ambient clock (`now` is always an injected parameter), no
> randomness. That makes all of it exhaustively testable, and it is why none of this may live in
> a React component.
>
> **Claude never computes any of this.** Claude receives the outputs — including the explanation
> traces — and turns them into language.

---

## 0. Cross-cutting conventions

- All functions take an explicit `now: Date` (or `today: LocalDate`) parameter. Never call
  `new Date()` inside the engine.
- A **`LocalDate`** is a `YYYY-MM-DD` string in the *user's* timezone. Day boundaries are always
  local. Never derive a day from a UTC timestamp.
- All scores are `0..100` integers unless stated otherwise. All normalized factors are `0..1`.
- `clamp01(x) = min(1, max(0, x))`.
- Every scoring function returns `{ score, band, trace }`. The **trace is mandatory** — it lists
  each factor's raw input, normalized value, weight, and point contribution. The trace is what
  makes the UI explainable and what Claude quotes as evidence. A score without a trace is a bug.
- Insufficient data must degrade gracefully and report it: every output carries a
  `confidence: 'high' | 'moderate' | 'low' | 'insufficient'` with the sample size that drove it.
  **The engine never fabricates a number to avoid returning "insufficient".**

---

## 1. Academic Risk Engine

`computeCourseRisk(input, options): RiskResult` and `computeAssignmentRisk(...)`.

### Why not the brief's formula

The brief sketches:

```
risk = proximity × weight × difficulty × knowledge gap × unfinished × congestion × procrastination
```

Pure multiplication is rejected: any single zero factor annihilates the score (an exam worth 30%
becomes zero risk the moment the user rates difficulty at the floor), the product is
scale-unstable, and per-factor attribution — which we need for the "Why:" list — is not
well-defined. We use a **weighted additive model with a single urgency salience multiplier**.
This preserves the brief's intent (far-off work is not urgent) while staying attributable.

### Factors — each normalized to [0,1]

| Key | Meaning | Normalization |
|---|---|---|
| `proximity` | how soon it's due | `clamp01(1 - ln(1+max(daysUntil,0)) / ln(1+HORIZON))`, `HORIZON=21d`. 1.0 at due, 0 at ≥21d. Overdue clamps to 1.0. |
| `weight` | share of course grade | `clamp01(weightPct / 25)` — 25% of the course grade saturates. |
| `difficulty` | est. difficulty | `(rating - 1) / 4` from a 1–5 rating. |
| `knowledgeGap` | self-rated understanding | `(5 - confidence) / 4` from a 1–5 rating. |
| `unfinished` | work remaining | `1 - completedUnits / plannedUnits`; `1.0` if nothing planned yet. |
| `congestion` | schedule pressure before the due date | `clamp01(committedHours / max(availableHours, ε))` over the window from now to due. |
| `procrastination` | learned personal tendency | `clamp01(meanStartDelayDays / 2)` from this user's history. Falls back to the global mean when `n < 5`. |
| `gradeHeadroom` | distance from target grade | `clamp01((targetPct - projectedPct) / 5)`. At/above target → 0. |

### Weights (sum to 1.0)

```
proximity      0.22
weight         0.18
knowledgeGap   0.15
unfinished     0.14
gradeHeadroom  0.12
difficulty     0.08
congestion     0.06
procrastination 0.05
```

### Composition

```
base     = Σ wᵢ · fᵢ                       // 0..1
salience = 0.35 + 0.65 · proximity          // 0.35..1.0
score    = round(100 · base · salience)
```

`salience` is the concession to the brief's multiplicative intent: distant work is damped but
never zeroed, so a 30%-weight final exam still surfaces in week 2 at a low-but-visible score.

### Bands

`0–24 low · 25–49 moderate · 50–74 high · 75–100 critical`

### Missing factors — exclude and renormalize (amended)

> Supersedes the earlier "neutral default 0.5" note. Both naive defaults are wrong: substituting
> `0` biases the score **downward** by that factor's full weight (so before any grades are entered,
> every course would get a free 12-point discount on risk — exactly when the radar matters most),
> and substituting `0.5` **fabricates an observation** we never made.

When a factor's input is genuinely unavailable, **exclude the factor and renormalize the remaining
weights** over the available mass:

```
missingMass = Σ weights of unavailable factors
scale       = 1 / (1 − missingMass)
base        = Σ (wᵢ · scale · fᵢ)      // available factors only
```

Confidence derives from the missing mass:
`0 → high · ≤0.15 → moderate · ≤0.35 → low · >0.35 → insufficient`

**Not applicable to** (these are real values, not missing data):
- `unfinished = 1.0` when nothing is planned — a genuine signal that all work remains.
- `procrastination` falling back to the global mean — that is an estimate, so it stays in the sum
  and only downgrades confidence.

The trace must return `missingFactors: string[]` so the UI can say *"risk may be understated — rate
this course's difficulty"*, turning a limitation into a prompt for the input that resolves it.

### Course-level roll-up

A course's risk is **not** the mean of its assignments (which dilutes: ten trivial items would
mask one critical exam). Use a softmax-weighted aggregate that is dominated by the worst item:

```
courseRisk = round( Σ (sᵢ · e^(sᵢ/T)) / Σ e^(sᵢ/T) ),  T = 18
```

This returns ≈ the max when one item dominates, and rises above the max when several items are
concurrently high. Cap at 100.

### Required tests
- Monotonicity: increasing any factor never decreases the score (holding others fixed).
- Overdue items score ≥ same item due today.
- All-factors-zero → 0. All-factors-one → 100.
- A 30%-weight exam 20 days out is `low`/`moderate`, never `critical`.
- Course roll-up of `[90, 10, 10, 10]` ≈ 90, not ≈ 30.
- Trace contributions sum (within rounding) to the score.
- Missing difficulty/confidence ratings → documented neutral default (0.5) + `confidence` downgrade.

---

## 2. Grade Projection & Scenario Planner

### Model

Real syllabi group items into weighted **categories**, and categories often drop lowest scores.
The engine must model this or its projections will be wrong.

```
GradeCategory { id, name, weightPct, dropLowestN, expectedItemCount }
GradeItem     { id, categoryId, name, pointsEarned | null, pointsPossible, isExcused }
```

### Category percentage

1. Take graded items in the category (`pointsEarned != null`, `!isExcused`).
2. Drop the `dropLowestN` lowest by *percentage* (not raw points).
3. `categoryPct = Σ earned / Σ possible` over survivors.
4. If no graded items survive, the category is **unresolved** — it contributes no earned weight
   and its full weight counts as remaining.

> Dropping lowest scores before the category is complete is *provisional*: the currently-lowest
> score may not be the final lowest. Mark such categories `provisional: true` so the UI can say so.

### Grades

- `currentGrade` = `Σ(categoryPct · weight) / Σ(resolved weight)` — performance *so far*. `null` if
  nothing is graded (do not report 0%).
- `projectedGrade` = `Σ(resolved categoryPct · weight) + Σ(assumption · remainingWeight)`, where
  `assumption` defaults to the user's current weighted average, and is overridable
  (`'current' | 'target' | number`). Always report which assumption was used.

### Required-score solver

To reach `target`:

```
remainingWeight = 100 - resolvedWeight
needed = (target - earnedWeightPoints) / remainingWeight     // as a percentage
```

Return per-remaining-item required percentages, plus a verdict:
- `needed > 100` → `impossible`, and report the max achievable grade.
- `needed <= 0` → `secured`, and report the minimum needed to hold the target.
- `remainingWeight == 0` → `final` (target either met or permanently missed).

### Scenario mode

Accept hypotheticals (`{ itemId | categoryId, assumedPct }`), treat them as resolved, and re-solve
for the rest. This produces exactly the brief's output:

```
If Exam 3 = 85 → final exam required for an A = 96
```

### Validation the engine must surface
- Category weights not summing to 100 → `weightSumWarning` with the actual sum. Do **not** silently
  normalize; a syllabus extraction error must be visible, and normalizing would hide it.
- `pointsPossible <= 0`, `pointsEarned > pointsPossible` (extra credit is legitimate — allow but
  flag), negative points.
- Letter grade from `grade_boundaries`, using inclusive lower bounds, highest match wins.

### Required tests
Empty course · all-graded course · drop-lowest with fewer items than `dropLowestN` · excused items ·
extra credit above 100% · weights summing to 95 or 105 · impossible target · already-secured target ·
zero remaining weight · a full realistic 4-category syllabus verified by hand.

---

## 3. Task Duration Calibration

Learn a per-category multiplier so the scheduler stops trusting optimistic estimates.

### Estimator (deliberately robust)

Ratios are multiplicative and right-skewed, so an arithmetic mean of `actual/estimated` is biased
upward. Work in log space.

1. Collect `(estimatedMin, actualMin, completedAt)` for the category; require both > 0.
2. `r = ln(actual / estimated)`.
3. Discard `|r| > ln(6)` as data-entry error (a 6× miss is noise, not signal), and record how many
   were discarded.
4. Recency-weight: `w = 0.5^(ageDays / HALF_LIFE)`, `HALF_LIFE = 30d`.
5. `r̄ = Σ(wᵢrᵢ) / Σwᵢ`; `multiplier = exp(r̄)`, clamped to `[0.5, 3.0]`.
6. Confidence from effective sample size `nEff = (Σw)² / Σw²`:
   `nEff ≥ 12 → high · ≥ 6 → moderate · ≥ 3 → low · else insufficient`.
7. When `insufficient`, fall back to the user's global multiplier; if that is also insufficient,
   return `1.0` and say so. **Never invent a multiplier.**

Also return the weighted geometric standard deviation so the UI can express a range
("75 min → 98 min, likely 85–115").

### Required tests
Perfect estimator → 1.0 · consistent 1.5× → 1.5 within tolerance · one wild outlier does not move
the result · recency weighting demonstrably favors recent data · `n=0,1,2` return `insufficient` ·
clamping at both ends · zero/negative inputs rejected.

---

## 4. Deadline Radar (backward planning)

`buildBackplan(deliverable, capacity, options): Backplan`

Turn one due date into a milestone chain, as the brief requires.

### Phase templates (fractions of total effort)

| Type | Phases |
|---|---|
| `paper` / `report` | understand .10 · sources .20 · outline .10 · draft .30 · revise .20 · final .10 |
| `problem_set` | understand .15 · attempt .50 · stuck-review .20 · check .15 |
| `exam` | inventory .10 · concept pass .25 · retrieval practice .40 · weak-spot pass .20 · light review .05 |
| `project` | scope .10 · build .45 · integrate .20 · test .15 · finalize .10 |
| `reading` | survey .15 · read .60 · notes .25 |

Exam plans are deliberately weighted toward **retrieval practice** over re-reading notes — the
brief calls this out explicitly as the recommendation the system should make.

### Required (non-droppable) phases — amended

The **terminal phase that produces or submits the artifact** is flagged `required: true` and may
never be dropped by a crash plan: `paper/report → final`, `problem_set → check`,
`project → finalize`, `reading → notes`. `exam` has no artifact and therefore no required phase.

Without this, a naive "keep the largest phases" crash plan drops `final (.10)` while keeping
`draft (.30)` — **producing a paper that is never submitted**, which is a worse outcome than the
schedule pressure it was trying to solve.

Allocation order: reserve every `required` phase first, then greedily allocate the remaining
capacity to the largest-fraction optional phases.

If capacity cannot cover even the required phases, return `infeasible: true` with the shortfall.
*"This cannot be done in the time available"* is a legitimate and necessary output; a plan that
silently omits submitting the work is not.

### Algorithm

1. `totalEffort = calibrated(estimatedMinutes)` using §3 for the deliverable's category.
2. Target completion = `dueDate - bufferDays` (default 1).
3. Walk **backward** from the target, consuming each day's available capacity (from calendar free
   time minus existing commitments), assigning phase minutes in reverse order.
4. Never place a milestone before `today`, and never in a zero-capacity day.
5. Preserve phase ordering: a phase may span days but may not overtake its successor.
6. If total capacity in the window < `totalEffort`:
   - set `compressed: true`, report `shortfallMinutes`
   - produce a **crash plan** that keeps only the highest-fraction phases and drops the rest,
     listing what was dropped
   - this shortfall is a primary input to Recovery Mode (§6) and a strong nightly-report signal
7. If `dueDate` is in the past → `overdue` plan: single "submit now / assess damage" milestone.

### Required tests
Ample capacity spreads correctly · exactly-enough capacity · insufficient capacity sets
`compressed` with correct shortfall · due tomorrow · due today · already overdue · zero-capacity
weekend is skipped · phases never reorder · minutes sum to `totalEffort` (± rounding).

---

## 5. Bounce-Back Score (explicitly instead of streaks)

The brief is emphatic: measure **time-to-recovery after failure**, not streak length.

### Definitions
- A **lapse episode** is a maximal run of consecutive days with a failed outcome.
- `recoveryDays` = the length of that run (days elapsed until the next success).
- An episode still running on the last observed day is **open** and is excluded from the score,
  but is reported as `ongoingLapseDays`.

### Score

Over the most recent `K = 5` closed episodes, recency-weighted (half-life 3 episodes):

```
meanRecovery  = weighted mean of recoveryDays
bounceBack    = round(100 · exp(-(meanRecovery - 1) / 2))
```

So: 1 day → 100 · 2 days → 61 · 3 days → 37 · 5 days → 14.

- No closed episodes and no lapses ever → `score 100`, `confidence 'insufficient'`. The engine must
  distinguish "perfect" from "unproven" — reporting a confident 100 for a habit with no history is
  exactly the kind of flattering nonsense this product exists to avoid.
- Trend: compare the mean of the newest half of episodes against the oldest half →
  `improving | stable | worsening`, with the delta.

Also return `lapseRate` (lapses per 30 days) so the UI can pair frequency with recovery — improving
recovery while frequency climbs is not progress, and the report must be able to say so.

### Required tests
No data · never lapsed · always lapsed · single 1-day lapse → 100 · alternating pattern · currently
mid-lapse · improving trend detected · worsening trend detected · gaps in the day series (untracked
days must not be silently counted as successes).

---

## 6. Minimum Viable Day / Recovery Mode

### Trigger scoring

| Signal | Points | Class |
|---|---|---|
| Sleep < personal baseline − 1.5h | 2 | physiological |
| WHOOP recovery < 34% | 1 | physiological |
| Overdue tasks ≥ 3 | 2 | execution |
| ≥ 2 hard deadlines within 48h | 2 | academic |
| Missed yesterday's morning check-in | 1 | execution |
| Yesterday's MIT completion = 0 | 2 | execution |
| Committed calendar hours > 8 | 1 | schedule |
| Any active backplan `compressed` | 2 | academic |

**Threshold: total ≥ 5 → Recovery Mode.**

### The anti-excuse invariant (hard requirement)

> The brief: *"Never let WHOOP become an excuse generator."*

Recovery Mode requires `total ≥ 5` **AND at least one non-physiological signal**. Physiology alone
can never trigger it — the maximum physiological-only total is 3, below threshold by construction,
and the invariant is additionally asserted in code and in a test. Physiology may reshape *how and
when* work happens; it may never cancel the day.

### MVD composition

Keep only:
1. Hard deadlines within 48h (non-negotiable submissions)
2. Attendance obligations (class, lab, exams)
3. Exactly one highest-value study block, chosen by §1 risk

Roll everything else forward. Add protections: a sleep-by time, and a phone/app block covering the
study block. Return the explicit list of what was deferred, so nothing silently disappears.

### Required tests
Physiology-only maxes out below threshold (the invariant, asserted directly) · threshold boundary at
4 vs 5 · MVD always retains hard deadlines · deferred list is complete and lossless · exam day is
never rolled forward.

---

## 7. Workload Levels — Floor / Target / Stretch

Replaces the all-or-nothing task list.

```
capacityMin = historicalDeepWorkP50 · recoveryAdjustment · (freeCalendarMinutes / typicalFreeMinutes)
recoveryAdjustment ∈ [0.75, 1.10]   // poor recovery → 0.75, per the brief's 75% target day
```

- **Floor** — computed, never chosen: hard deadlines within 48h + attendance. If Floor > capacity,
  say so plainly rather than pretending the day fits.
- **Target** — Floor + highest-risk-reduction items until calibrated capacity is consumed.
- **Stretch** — the next items beyond Target, explicitly optional.

Items are selected by *risk reduction per calibrated minute* (a greedy knapsack on marginal value),
not by raw risk — this is what makes the allocation "academic return on time" rather than anxiety.

---

## 8. Planning vs Execution Gap

Two **separate** scores, because the brief's insight is that the failure may be chronic
overplanning rather than weak motivation, and one blended number would hide that.

```
executionQuality = clamp01(actualDeepWorkMin / plannedDeepWorkMin) · 100
planningQuality  = 100 · (1 - clamp01(|plannedMin - historicalCapacityP50| / historicalCapacityP50))
```

Also report `startDelayMin` (planned vs actual first-block start), `mitPlanned`/`mitCompleted`, and a
classification:

| executionQuality | planningQuality | Diagnosis |
|---|---|---|
| low | low | Overplanning — the plan was never achievable |
| low | high | Execution problem — the plan was realistic |
| high | low | Underplanning — capacity is being wasted |
| high | high | Calibrated |

This four-quadrant diagnosis is a deterministic output. Claude explains it; it does not decide it.

---

## 9. Friction & failure analytics

Aggregate `friction_logs` into ranked cause distributions over a window, with counts and
percentages (the brief's *"a database of why the user fails"*). Pure counting — no inference. Also
compute per-cause trend across consecutive windows so the nightly report can say "distraction is
down, duration underestimation is up."

---

## 10. Insight confidence gating

Insights carry `high | medium | testing`. The gate is deterministic and must be enforced in code so
the LLM cannot promote its own conclusions:

- `high` — n ≥ 20 observations, effect holds in both halves of the window, and the effect size
  exceeds the noise floor.
- `medium` — n ≥ 10, consistent direction.
- `testing` — anything weaker. Presented as a question, never as a finding.

**No insight may be stored above the confidence its sample size permits**, regardless of what the
model returns. Correlational insights are always labeled hypotheses and are the intended input to
the experiment engine (§ brief: "N-of-1 experimentation platform rather than a correlation
hallucination machine").
