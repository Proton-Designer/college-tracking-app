# Remaining Work — Handoff

> Written at session close. Everything below is **known, scoped, and deliberately not done** — not
> discovered-and-forgotten. Ordered by what I'd pick up first.
>
> Current state, all verified: **332 core tests · 356 pgTAP assertions · 70+ integration ·
> 50+ Deno · 17 E2E · 0 tables without RLS · `npm run verify` green.**

---

## 1. Blocked on credentials (do these first when they arrive)

Both are one-pass jobs with ordered runbooks already written.

| What | Where | Notes |
|---|---|---|
| **Supabase cloud provisioning** | `docs/SUPABASE_SETUP.md` | Complete ordered runbook. Includes **four must-fix-before-launch security items** — read §5 and §7 before deploying. |
| **Anthropic API key** | `SUPABASE_SETUP.md` §7 | 5-step activation checklist. **If a live response shape differs from a fixture, update the fixture from reality — never patch the test to pass.** |

The entire LLM layer is built and tested offline against golden fixtures. Nothing about it is
speculative; it simply hasn't met a live model.

---

## 2. UI gaps — backend complete, nothing renders it

Found by auditing backend capability against UI references (see `FOLLOWUPS.md` U1–U8). Every one is
working, tested code with no caller — the same pattern as **D20**.

| # | Feature | Why it matters |
|---|---|---|
| **U6** | **Weekly planning** | The brief's Sunday session. Backend is *complete* — pure engine with free-interval math, three tables, orchestration, cold-start fix, unplaced-work disclosure. **Nothing renders any of it.** Ruled to live inside `/calendar` as a "This week" view rather than a 7th nav item. **Highest-value remaining feature.** |
| **U3** | Proof-of-work UI | Server-side completion gate exists; no way to require or submit evidence. A whole brief feature unreachable. |
| **U7** | Decision journal | Built in L8. Belongs on `/insights` beside experiments — same observe-then-score shape. |
| **U1** | Interventions surface | *In progress at session close.* "Intervene" is a step of the core loop and currently has no surface. |
| **U5** | Office hours | Surface contextually on course detail when a topic is repeatedly flagged confusing. |
| **U8** | Semester lessons | Lower priority — these *do* have a real consumer (they feed every nightly call), they're just not user-visible. |

---

## 3. Testing not yet done

Full plan in **`docs/L11_HARDENING.md`** — each section is grounded in a bug this build actually
shipped, so it explains *why* each check exists rather than just listing commands.

**Highest value first:**

1. **Performance against a production build.** Nothing has been measured properly — the only numbers
   taken were dev-mode with Turbopack and are meaningless. Needs: per-route first-load JS, LCP/TTI,
   a bundle audit (the `react-native`-in-web-bundle class of bug), and an N+1 audit on `getDayView`
   and report assembly.
2. **Accessibility.** Keyboard-only pass on web, VoiceOver pass on mobile. Both have already caught
   real bugs this build (the poisoned focus-ring variable; the `"(tabs)"` accessible-name leak), so
   neither can be assumed.
3. **Sparse/broken/offline states.** Screens are verified against a rich seeded semester and a
   brand-new account, but not against three-days-of-history, a failed load, or offline.
4. **Mobile visual verification.** See the tooling caveat below — this is the least-covered area.
5. **Full regression + a complete manual journey on both platforms.**

### Known verification gaps (be honest about these)
- **Mobile visual rendering is under-verified.** iOS simulator text injection (`idb ui text`) is
  unreliable in this environment — silent character drops, cursor jumps, fields reverting to stale
  values. It blocks sign-in, which blocks everything downstream.
  **The fix is designed but not built:** generate a real magic link via Supabase admin
  `generateLink`, deep-link it into the app's existing handler, and skip typing entirely. Reuses
  real auth code, so it stays a genuine verification.
- **What remains trustworthy:** every verification that confirmed a **database write via psql** is
  valid regardless of the input tooling — the DB is ground truth, and corrupted input would have
  produced wrong stored values rather than right ones. That's the *"verify the write, not the
  success state"* standard paying off against a flaw we didn't know about.
- **The model path is untestable here.** The seven-lens rendering and evidence-gating against real
  `analysis` are wired and typecheck clean, with the gating logic proven against a synthetic
  fixture — but no live model has ever run. Re-verify first when a key exists.

---

## 4. Smaller items
See `docs/FOLLOWUPS.md` for the full list with reasons. Highlights:
- **Native time picker on mobile** — currently validated free-text `HH:MM`. Fine functionally, worse
  ergonomically, and the check-in is a daily ritual where friction compounds.
- **L2–L4 escalation has no real enforcement** — decision logic is correct and clamped to the opt-in
  ceiling, but the levels currently produce differently-worded in-app messages. Labelled honestly in
  the UI. `kill_habits` has no contact field, so L3 cannot notify anyone even in principle; L2 needs
  native Screen Time APIs, which the brief scoped out.
- **Test-user accumulation** — solved by `npm run clean:test-users`, but worth running periodically.

---

## 5. How to work in this repo
Read `CLAUDE.md` first, then `.brain/memory/decisions.md` (**D1–D21**) — those are durable decisions
with their reasoning, several of which a future session would otherwise reverse.

The four guards in `npm run verify` (`check:imports`, `check:core-mirror`, `check:barrel-exports`,
`check:demo-clean`) have **each caught a real defect** that typecheck, lint, and review all missed.
Don't disable one to make a build pass.
