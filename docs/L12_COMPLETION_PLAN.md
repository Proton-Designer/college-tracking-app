# L12–L14 — Completion Plan

> Authored by the Lead at session restart, 2026-08-22. The instruction: *finish this entire thing
> end to end, with a complete unique, intuitive, optimized, beautiful, modern, polished and sleek
> frontend and the full backend features working exactly as intended.*
>
> This supersedes the "wrap up" framing of `HANDOFF.md`. That document remains accurate about what
> **was** true at the previous session's close; this one says where we're going.

---

## The finding that reordered everything

A reachability audit (every exported `packages/api` function checked for a caller in the real
request path) found that **the product has no data-entry path.** No course creation, no task
creation, no syllabus upload, no deadline confirmation. See `FOLLOWUPS.md` **E1–E5**.

Every previous verification passed because it ran against the **seeded demo account**. "All screens
render correctly" was proven. "A user can actually use this" was never tested — and is false.

This is D20 at product scale: not a component without a caller, but an entire *verb* — **input** —
missing across the whole application.

---

## L12A — Data entry & onboarding  ·  ATLAS
The product becomes usable by a real person for the first time.

1. **Course CRUD** (E1) — create/edit/archive, weight categories, grade boundaries.
2. **Assignment + task CRUD** (E2) — due date, weight, category, estimated minutes.
3. **Syllabus upload → extract → confirm** (E3) — the brief's primary onboarding flow, and the
   surface where CLAUDE.md's third law is enforced. **Nothing persists as real until confirmed.**
4. **Pending-deadline confirmation** (E4) — Brightspace ICS, same confirmation discipline.
5. **Backplan generation trigger** (E5).

**Design constraint:** builds on Nova's elevated primitives. No bespoke form chrome.
**Open risk:** if `syllabus-extract` requires a live `ANTHROPIC_API_KEY`, the manual path (1 + 2)
must stand entirely on its own. Confirmed before build, not discovered during it.

## L12B — Close the remaining U-items
- **U6** weekly planning UI — complete backend, three tables, zero UI. Lives inside `/calendar`.
- **U1** interventions surface — "Intervene" is a step of the core loop with no surface; the loop is
  literally open without it.
- **U3** proof-of-work · **U7** decision journal · **U5** office hours · **U8** semester lessons
- **S5** stale-task surface · **S9** WHOOP notification→fetch→ingest wiring

## L13 — Design elevation  ·  NOVA (leads), both platforms
Direction ratified by the Lead — deepen the "Instrument" language, don't replace it:
1. **Depth without shadow-soup** — layered hairlines, sunken/raised surface pairs; soft ambient
   shadow only on genuinely floating elements.
2. **Motion is information** — every user-caused state change acknowledged within 100ms. The Day
   Trace draw-in is the signature; nothing competes with it. Reduced-motion respected everywhere.
3. **Typographic hierarchy is the main tool** — if a screen reads flat, fix hierarchy and spacing
   before reaching for color.
4. **Five states on every interactive element** — rest, hover (web), press, focus-visible, disabled,
   plus loading where it can be slow.
5. **≥44px touch targets on mobile.**

Sequenced primitives-first so every screen built afterwards inherits the elevation rather than
needing a second pass.

## L14 — Hardening
Executes `docs/L11_HARDENING.md`: performance against a **production** build, keyboard + VoiceOver
accessibility, sparse/failed/offline states, security re-verification, full regression, and a
complete manual journey on both platforms.

---

## Standing rules for this stretch

- **Verify the write, not the success state.** Confirm the row via psql.
- **Never fabricate a value.** `—` or omit, never a placeholder number.
- **Green once is not green** — new integration tests run twice (D14), every assertion scoped by
  `user_id` (D18/S8).
- **Prove the red first** on any bug fix.
- **A doc row is a claim, not evidence.** U2 was recorded as unbuilt and had shipped two commits
  earlier; it was nearly rebuilt. Re-verify against HEAD before acting.
- **Commit as you go.** Uncommitted work is invisible to the other engineer and to the Lead (D21).
- **Don't widen scope.** Report unrelated breakage; don't fix it silently.
