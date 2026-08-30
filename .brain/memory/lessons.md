# Lessons — what we learned the hard way

> Convention adopted from ULM's `.brain/` (Ayman's repo). Successes get written into the code and
> are visible forever; **dead ends leave no trace at all unless someone writes them down.** This
> file is for the second kind.
>
> `decisions.md` holds rulings. This holds the things that were tried, or that bit us, or that
> looked green and were not.

---

## Standing rules, earned

### ⭐ Tests passing for the wrong reason is the dominant failure mode
Inherited from ULM (six-plus instances there) and confirmed here within a day of adopting it.
**Before trusting a green, name what else could produce it.** Two live examples from this repo:

- The write-time invariant gates were ported and six pipeline tests immediately went red. The gates
  were right: the fixtures echoed a slice of the chunk back as the `core_claim`, which is exactly
  the selection-not-transformation failure `passesClaimNotQuote` exists to catch. **The fixture was
  lying about what a model returns**, and every prior green on those tests had been measuring
  nothing.
- A first attempt at the anti-leak test measured 0.23 overlap — under the ceiling — because the
  "leaky" prompt merely mentioned the topic. The test would have passed for the wrong reason in the
  other direction, certifying a gate that was never exercised.

### An invariant that can pass for a degenerate reason is not an invariant
ULM's ADR-011, and the reason its gates are worth more than their thresholds. "24/24 provenance
passed" was true both when the claim was a verbatim copy of the quote (nothing generated, so nothing
to check) and when a real quote was bolted onto an unrelated claim (string matching, not grounding).
**Ask of every gate: what is the cheapest way for output to satisfy this while still being wrong?**

Our version: a semantic gate that returns `true` when it has no embeddings to work with is reporting
a guarantee it did not check. That is why they return `pass | fail | unknown` here rather than a
boolean, and why the counters carry an `unknown` bucket per gate.

### Put the invariant in the structure, not in the discipline
Repeatedly, in both repos. `deleted_at` inside the RLS policy rather than in every query. The lease
check inside `processIngestionJob` rather than in a comment telling callers to claim first.
`provenance_quote NOT NULL` so no future write path can bypass the gate. The two doors carried as
DATA on a `ConfrontationOffer` so a surface cannot render the confrontation without them. **A
guarantee that depends on someone remembering is not a guarantee.**

### Two individually-correct decisions can combine into harm
ULM's clearest example, and it applied to us unchanged: a provider call with no timeout is fine, and
a heartbeat on a fixed timer is fine, and together they are an **immortal job** — it heartbeats
forever, holds its lease forever, and never reaches the retry-then-flag path that exists for exactly
this. Neither decision is wrong alone. Look for the pair.

### Match the value's shape, never the concept's name
ULM, five instances. A secret scan that greps for `service_role` hits vendor documentation; one that
greps for the actual secret's shape does not. Applies to any check written against a name rather
than a thing.

### On a two-platform product, audit by MECHANISM, not by screen
ULM's framing after four mobile-behind-web parity bugs traced to one root cause: **web gets whole
classes of behaviour free from a single global mechanism, and mobile needs the equivalent hand-wired
into every component.** One `prefers-reduced-motion` media query silences every CSS transition; RN
has no equivalent, so each animated component needs its own opt-in. List the global mechanisms one
platform gets for free and verify the other has an equivalent for each — a screen-by-screen sweep
finds gaps one at a time and never asks whether a whole CATEGORY is missing.

### When a normal branch and a terminal branch both exist, the terminal one rots
ULM found this in a session's last card: the normal path reset state that the finish path did not,
and the bug only appeared on the NEXT session — structurally outside what testing the current cycle
can observe. **When you add a reset to one branch of an advance/finish, retry/give-up or
page/last-page pair, grep for the sibling.**

---

## Specific incidents in this repo

### A `*/` inside a path written in a block comment terminates the comment
`apps/*/design` in a doc comment produced 21 parser errors all pointing at the wrong lines.
Typecheck caught it; nothing else would have.

### The obvious anchor for appending to `database.types.ts` matches the wrong schema
The file has a `graphql_public` block before the `public` one, and both close with `};\n Views: {`.
Anchoring on that text inserted 28 public tables into a mapped type that permits no properties, with
one error reported at line 12, nowhere near the damage. **Anchor on the `public` block by position.**

### Two engineers writing the same generated file collide silently
Duplicate table definitions in `database.types.ts`; only typecheck caught them. D22's
commit-by-pathspec is what kept the two workstreams separable while it was resolved.

### FSRS puts a first-time card into `learning` with a minutes-long step
"Reviewed yesterday" is still due today. Two test premises were wrong about this and the code was
right. It looks like a bug the first time it is seen, which is why the corrected tests document it.

### FSRS fuzz must be off when state is replayed rather than stored
Fuzz spreads due dates randomly, which is right for a large Anki deck and fatal for a derive-on-read
design: replaying one log would produce a different answer on every render.

### Porting a gate onto a shape it was not written for
`passesCardTextSanity` requires terminal punctuation, which is correct for a card prompt and wrong
for a lesson TITLE — an imperative headline correctly has none. Every fixture caught it immediately.
The same over-correction the anti-leak/topicality band exists to prevent, arriving from a different
direction.

---

## Patterns that do not work here

- **A `BEFORE INSERT` trigger that sets `user_id := auth.uid()` is not RLS protection.** It makes
  the table's own `WITH CHECK (user_id = auth.uid())` trivially true by construction and provides
  *zero* real protection. The boundary has to be a check that the REFERENCED row belongs to the same
  caller. (ULM, caught before it reached a negative test.)
- **Seeding user-scoped tables with the service-role client fails closed, not silently** — but only
  if you check `.error`. In ULM this cost real time: three inserts appeared to seed a history, and
  the bug surfaced two steps downstream as a chart rendering "0% flat", sending debugging down the
  wrong path first.
- **String-matching a database exception's message to classify a failure.** ULM's `submit_review`
  and its offline queue carry mirror-image comments admitting this coupling is fragile. Use SQLSTATE.
