# E0 — First-run onboarding

> Authored by the Lead, 2026-08-22, after signing in as a genuinely empty account and looking at
> what a new user is actually shown. This is a **product-level gap**, not a missing screen.

---

## What a new user sees today (verified, web, empty account)

Sign up → land on `/today`, which shows:

- An empty Day Trace: *"Nothing scheduled yet today."* (honest, fine)
- The **morning check-in**, asking them to:
  - rate energy 1–10 and mood 1–10
  - pick a **"Top 3 for today"** — *"Nothing selected."*, beside an **"ACCEPT ALL"** link that would
    accept nothing
  - answer **"How much of today will you actually finish?"** — defaulted to **80%**
  - choose what is **"most likely to derail you"**
- `Start the day`

**The app asks a brand-new user to plan a day that has nothing in it, predict what percentage of
nothing they will finish, and name what will stop them from doing nothing.** Every nav
destination — Courses, Calendar, Review, Insights — is empty, and there is no control anywhere in
the product that lets them enter a course, an assignment, or a task (see E1–E5).

This is not "empty states need polish." The first-run experience is nonsensical, and there is no
path out of it.

## Why it was never caught

Cold-start *was* tested — but the question asked was **"do empty states degrade honestly?"** They
do; that work was real. The question never asked was **"can a new user get from zero to a working
semester?"** They cannot. Every other verification ran against the seeded demo account.

`A demo seed is a rendering fixture, not proof of a usable product.`

---

## Required: a first-run flow

**Rule: the daily ritual must not be the first thing a user meets.** A check-in is a loop step; it
presupposes a semester. Until one exists, `/today` must route to onboarding instead.

### Gate
`/today` (and the app shell generally) checks: does this user have **at least one course**? If not,
onboarding owns the screen. This is a real check against data, not a `has_onboarded` flag — a user
who deletes everything should get help again, not a dead app.

### Path A — Manual (primary; must work with no API key, no integrations)
1. **Add a course** — code, title, term. Then optionally: weight categories and grade boundaries.
2. **Add what's due** — at least one deliverable, with a due date and weight.
3. **Land on Today**, which now has something to reason about.

Steps 1 and 2 must be completable in well under a minute, and the flow must be **skippable and
resumable** — a user who bails is returned to a Courses screen that offers the same actions, not
stranded.

### Path B — Syllabus upload (offered, not required)
Upload → extract → **explicit confirmation** before anything persists as real (CLAUDE.md law #3).
While there is no `ANTHROPIC_API_KEY`, the extract step must state plainly that extraction is
unavailable and hand the user to Path A. **Never a spinner that never resolves, never a fabricated
result.**

### Path C — Brightspace import (offered, not required)
Connect feed → pending deadlines → same explicit confirmation (E4).

---

## Consequences for existing screens

- **The morning check-in must not ask unanswerable questions.** With no tasks, "Top 3" and
  "how much will you finish?" have no meaning. Either the check-in is not offered until there is
  something to check in about, or those fields are suppressed rather than defaulted. **An 80% default
  on an empty day is a fabricated value** — the same rule we hold everywhere else.
- **Every empty state that names an action must offer it.** `/courses` currently reads *"No courses
  yet. Add one, or upload a syllabus to get started"* with neither action present. An empty state
  that advertises buttons that don't exist is worse than a bare one.

---

## Acceptance

Not "the screens render." The test is: **create a brand-new account, and without touching psql or
the seed, reach a Today screen with a real course, a real deliverable, and a real task on it — on
both platforms.** Until that passes, the product is not usable by a human being.
