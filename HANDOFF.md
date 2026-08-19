# CollegeOS — Handoff

> **Read this first.** Written at the close of the initial build session. It covers what exists,
> what was verified and how, what was *not* verified, and exactly what remains before this is
> production-ready.
>
> Then read, in order: `CLAUDE.md` → `.brain/memory/decisions.md` (D1–D21) → `docs/STATUS.md`.

---

## 1. What this is

A personal **closed-loop operating system** for a college student. Not a habit tracker.

```
Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn → Update next plan
```

Three laws that govern every decision in the codebase:

1. **Postgres is the system of record.** Not the LLM, not a third-party app.
2. **Deterministic code calculates; Claude only interprets.** Every score, grade, average, and
   streak is pure TypeScript in `packages/core`, unit-tested. The model is never asked to do
   arithmetic or to decide what matters.
3. **Every LLM response is schema-validated typed JSON.** Free-form prose never reaches the UI
   unvalidated, and extracted academic deadlines *always* require explicit user confirmation.

Full product intent: `docs/context/SOURCE_BRIEF.txt`. Architecture: `docs/MASTER_PLAN.md`.

---

## 2. Current state (measured, not estimated)

```
83 commits · 29 migrations · 46 tables · 0 without RLS · 11 edge functions
web: 16 routes · mobile: 15 routes · full platform parity
```

| Suite | Count | What it covers |
|---|---|---|
| `packages/core` unit | **332** | the entire deterministic engine |
| pgTAP | **356** | RLS isolation, constraints, triggers, Vault encryption |
| `packages/api` integration | **70+** | against a real local Postgres, run 2× consecutively |
| Deno edge | **50+** | LLM gateway, syllabus, integrations — offline, no API key |
| Web E2E (Playwright) | **17** | real stack, real auth, real Mailpit emails |

`npm run verify` → **exit 0**. Four guards run *before* typecheck; **each has caught a real defect**
that typecheck, lint, and review all missed. Do not disable one to make a build pass.

---

## 3. What is built

### Backend — complete
- **`packages/core`** — risk scoring with full explanation traces, grade projection + scenario
  solver, task-duration calibration, deadline backplanning, bounce-back, Recovery Mode, workload
  levels (Floor/Target/Stretch), planning-vs-execution quadrant, friction analytics, insight
  confidence gating, experiment outcome scoring, weekly planning with free-interval math.
  **Pure functions, no I/O, `now` always injected.**
- **`packages/api`** — typed data layer, enumeration-safe auth, day assembly, academic, focus
  sessions, kill loop, friction logging, proof-of-work, interventions, escalation.
- **11 edge functions** — syllabus extract/confirm, nightly analysis, weekly synthesis, Brightspace
  sync/confirm, WHOOP OAuth + webhook, RescueTime sync, account export, account delete.
- **LLM layer** — budget gate proven to block *before* the HTTP call, forced tool-use + Zod
  validation, retry→deterministic-fallback ladder, seven-lens schema. **Fully tested offline.**
- **Integrations** — Brightspace iCal (proven end-to-end), WHOOP, RescueTime. Provider-behind-
  interface, contract-tested against recorded fixtures.
- **Data export & deletion** — dynamically enumerates all 46 user-scoped tables; deletion also
  removes Vault secrets and Storage objects that a row cascade would miss.

### Both platforms (web + mobile)
Landing/welcome · auth (signup, login, reset, confirm) · **Today** (three engine-decided modes with
the Day Trace signature element) · morning check-in · night review · Courses · Semester Map ·
Calendar horizon · Review + `/review/[date]` nightly report · Insights · focus sessions · kill list ·
Settings · navigation shell.

---

## 4. What was tested, and how

**The standard held throughout: verify the write, not the success state.** Nearly every UI
verification confirmed the actual database row via psql rather than trusting a success toast. That
turned out to matter — see §6.

- **Domain engine** — TDD, red confirmed before every implementation. Hand-verified a full
  four-category syllabus by hand and matched it against the engine.
- **RLS** — the isolation test **dynamically enumerates** every user-scoped table from `pg_class`
  rather than a hand-list, so it cannot silently stop covering new tables.
- **Timezone** — DST spring-forward and fall-back, plus both date-line extremes, proven in pgTAP.
- **Security** — SSRF guard on the one user-supplied fetch target; Vault ciphertext proven to be
  ciphertext; cross-user decrypt refused; edge functions reject an anon key (a *public* value) as
  well as no auth; journal text proven absent from logs and the usage ledger.
- **Account deletion** — proven against a user with data in **every** table, including Vault
  secrets and Storage objects.
- **Auth** — real signup → real Mailpit email → confirm → session, and enumeration-safety proven by
  asserting byte-identical responses for a nonexistent account vs a wrong password.
- **Cold start** — a brand-new account walked across all six screens; every empty state degrades
  honestly rather than showing fabricated zeros.

---

## 5. What has NOT been tested — read this before trusting anything

### 5.1 Performance — never measured properly
The only numbers taken were **dev-mode with Turbopack** and are meaningless. No production build has
been profiled. **Nothing is known** about first-load JS, LCP, TTI, bundle composition, or query
efficiency under load. `getDayView` and the report assembly both grew organically and have never had
an N+1 audit.

### 5.2 Mobile visual rendering — under-verified
iOS simulator text injection (`idb ui text`) is **unreliable in this environment** — silent character
drops, cursor jumps, fields reverting to stale values. It blocks sign-in, which blocks everything
downstream.

**The fix is designed but unbuilt:** generate a real magic link via Supabase admin `generateLink`,
deep-link it into the app's existing handler, skip typing entirely. Reuses real auth code, so it
remains a genuine verification.

**What remains trustworthy:** every verification that confirmed a **database write via psql** is
valid regardless of input tooling — the DB is ground truth, and corrupted input would have produced
*wrong* stored values, not right ones.

### 5.3 The model path has never met a live model
There is no `ANTHROPIC_API_KEY`. The seven-lens rendering and evidence-gating against real `analysis`
are wired and typecheck clean, with the gating logic proven against a synthetic fixture — but no
live inference has ever run. **Re-verify this first when a key exists.**

### 5.4 Accessibility — partial
Specific bugs were found and fixed (a poisoned focus-ring variable that meant *zero* visible keyboard
focus product-wide; a `"(tabs)"` route-group name leaking as an accessible label). But no systematic
keyboard-only pass on web and no VoiceOver pass on mobile has been completed.

### 5.5 Sparse, failed, and offline states
Screens are verified against a rich seeded semester **and** a brand-new account, but **not** against
three-days-of-history, a mid-request database failure, or offline.

---

## 6. Before this is production-ready

### Must fix — security and correctness
1. **Custom URL scheme (`collegeos://`) is hijackable.** Another app registering the same scheme can
   intercept an auth callback — on a confirmation or reset link, that means intercepting a session.
   Fix: Universal Links (iOS) / App Links (Android), domain-verified. Needs a real domain + AASA file.
2. **Remove `exp://127.0.0.1:8081/**` from the redirect allow-list.** Development only.
3. **Configure custom SMTP.** The built-in mailer is rate-limited; confirmation emails will silently
   throttle in production.
4. **Redirect allow-list must use exact hosts, no wildcards.** A permissive entry turns every
   password-reset email into a credential-phishing vector.

### Must verify
5. **Cloud deploy** per `docs/SUPABASE_SETUP.md` — ordered runbook; confirm `supabase db diff` is
   clean, pgTAP passes against cloud, and **every** table shows RLS enabled.
6. **Anthropic activation** per §7 — including: *if a live response shape differs from a fixture,
   update the fixture from reality, never patch the test to pass.*
7. **The full hardening pass** in `docs/L11_HARDENING.md` — performance, accessibility, sparse and
   broken states, a full regression, and a complete manual journey on both platforms.

### Should complete — features with a finished backend and no UI
Detailed in `docs/FOLLOWUPS.md` (U1–U8). These are **working, tested code that nothing calls**:
- **Weekly planning (U6)** — highest value. Complete engine, three tables, zero UI. Ruled to live
  inside `/calendar` as a "This week" view.
- **Proof-of-work (U3)** · **Decision journal (U7)** · **Interventions surface (U1)** ·
  **Office hours (U5)** · **Semester lessons (U8)**

---

## 7. Things a future session would otherwise get wrong

Read `.brain/memory/decisions.md` in full — 21 durable decisions with their reasoning. The ones most
likely to be reversed by someone who doesn't know why:

- **D4** — all internal packages are source-resolved (no `dist`). A build step reintroduces a
  stale-dist trap.
- **D16** — `packages/core` is mirrored into the Deno function directory because the Edge Runtime
  can't resolve extensionless imports. **The staleness guard is load-bearing**: a stale mirror means
  edge functions compute risk scores with *different domain logic* than the apps display.
- **D19** — `private.*` functions need an explicit `public` wrapper to be callable at all. Do not
  "simplify" this by exposing the private schema.
- **D20** — a component isn't done until something in the **real request path** calls it. This
  happened **five times** in one session with correct, fully-tested code.
- **D21** — a green `npm run verify` says nothing about what is *committed*. In a shared working
  directory it can mean two people's uncommitted state happens to typecheck.

Also read `.brain/memory/tooling-gotchas.md` — environment traps that already cost hours (Kong
holding stale upstreams after a `db reset`; Expo Go deep-link separators; `idb` text corruption).

---

## 8. How to work here

```bash
npm run db:start          # local Supabase (Docker must be running)
npm run db:reset          # re-apply migrations + seed, and refresh Kong
npm run verify            # 4 guards → typecheck → lint → test
npm run test:e2e          # Playwright, real stack
npm run make:test-user    # throwaway account for verification
npm run clean:test-users  # remove them
supabase test db          # pgTAP
```

**Demo account:** `demo@collegeos.app` / `CollegeOS-Demo-2026` — a realistic seeded 10-week semester.
**Read from it; write against a throwaway.** Its value is that it's stable and screenshot-worthy;
every test write degrades that.

**Working agreements that earned their keep:**
- Verify before claiming. Paste real output. Typecheck is not evidence.
- **Green once is not green** — run new integration tests twice against the same database.
- Never fabricate a value. `—` or omit, never a placeholder number.
- Behaviour and information may never diverge across platforms; layout and idiom may.
