# L11 — Hardening Pass

> Authored by the Lead. The final layer. Everything below is verification and repair, not new
> features. Nothing here ships on assertion — every item needs evidence.

---

## 0. The standard

By this point the product works. L11 asks a different question: **does it hold up when things go
wrong, when the data is thin, when the network is bad, and when the person using it isn't the
person who built it?**

Three rules for this pass:
1. **Measure, don't estimate.** Dev-mode numbers are not performance data. Production build or it
   didn't happen.
2. **Test the empty and the broken case**, not the happy one. Every screen has been verified with
   rich seeded data; almost none have been verified on day three of real use.
3. **A finding is not a fix.** Log what you find, fix what's real, and say plainly what you left.

---

## 1. Performance (production build only)

- `npm run build` for web, then measure against the **production** server, not `next dev`.
- Per-route: first load JS, largest contentful paint, time to interactive.
- **Bundle audit** — what's actually being shipped? Look specifically for: `packages/core` pulled
  wholesale into a route that needs one function, `date-fns`/`zod` duplication, and anything from
  `packages/api` dragging platform-specific code into the wrong bundle (the `react-native`-in-web
  bug from L3 was this class).
- Mobile: cold start to interactive on the simulator, and the Day Trace's draw-in at 60fps.
- **N+1 query audit** on `getDayView` and the report assembly — these are the two heaviest reads,
  and both grew organically.

Record real numbers in this file. A number without a build type is meaningless.

---

### MEASURED — 2026-08-22, Lead. Production build (`next build` + `next start`), not dev.

**Bundle.** `npm run build -w apps/web` succeeds; 18 routes.

| | |
|---|---|
| Total client JS, all routes | **1,260 KB raw · 348 KB gzipped** |
| Largest chunk | 252 KB raw / 66 KB gz |
| Second | 224 KB raw / 70 KB gz |

348 KB gzipped across the whole app is lean for eighteen routes. **No action needed.**

**Bundle audit — the three things §1 asks for, all clean:**
- **`react-native` in the web bundle (the D11 bug class): NOT present.** One chunk matches the
  string, and it is a false positive — `@supabase/supabase-js`'s own runtime detection
  (`navigator.product === "ReactNative"` → `runtime=react-native` telemetry label). Verified by
  reading the match context rather than trusting the grep.
- **No `SUPABASE_SERVICE_ROLE_KEY` or `service_role` in any client chunk.** The barrel guard covers
  the mechanism; this confirms the outcome.
- **No `date-fns`/`zod` duplication** — neither reaches a client bundle at all.

**Server timings.** Production server, warm, 3-run average, real authenticated session, local Postgres:

| Route | Time | HTML |
|---|---|---|
| `/today` | **106 ms** | 34 KB |
| `/calendar` | 67 ms | 24 KB |
| `/insights` | 65 ms | 45 KB |
| `/courses` | 63 ms | 27 KB |
| `/settings` | 52 ms | 35 KB |
| `/review` | 50 ms | 18 KB |

**N+1 audit — the real finding.** Query counts via `pg_stat_statements`, one render each. There is
**no classic N+1** (no domain query repeats more than twice). What there is instead is a
**request-level fan-out**: each `supabase-js` call is one HTTP round trip to PostgREST, each of which
emits its own `set_config`, so counting those counts round trips.

| Route | PostgREST round trips |
|---|---|
| **`/today`** | **45** |
| `/insights` | 17 |
| `/calendar` | 14 |
| `/courses` | 10 |
| `/settings` | 9 |
| `/review/[date]` | 2 |

**`/today` is a 3× outlier on the most-visited screen in the product.** At ~1 ms per local round trip
this is invisible (106 ms total). **Against cloud Supabase it will not be** — at a 30–50 ms RTT,
serial round trips cost 30–50 ms *each*.

The riskiest part is mine: **`runInterventionSweep` runs its four evaluators sequentially**, which was
a deliberate correctness choice (they read-then-write the same table, so racing them defeats their own
dedupe) — but it means those round trips are serial rather than parallel. Each evaluator also
re-queries `tasks` separately when one shared read would serve all four, and each does a per-task
dedupe lookup that could be a single batched query.

**Attempted, and it did not work — recorded because the wrong conclusion is worth more than a
silent revert.** I batched the sweep's per-task dedupe lookups and its per-task session lookup into
single queries per evaluator, kept the sequential ordering, rebuilt, and re-measured. **`/today` was
still 45 round trips.** The change is a genuine improvement — it removes a real per-task N+1 that
would bite an account where many tasks fire at once — but on this data few tasks fire, so those
queries were barely executing and were never the cost. **My diagnosis was wrong.**

(A first re-measurement showed a spectacular "45 → 0 round trips, 106 ms → 22 ms". That was a **307
redirect to /login** — the minted session had expired — i.e. measuring nothing at all. Always check
the status code before believing an improvement.)

**Where the 45 actually come from,** by table, one render:

```
calendar_events   ×5      deliverables      ×3      interventions    ×3
courses           ×2      grade_categories  ×2      grade_items      ×2
daily_checkins    ×2      daily_reviews     ×3      kill_events      ×2
… plus ~20 more tables at ×1
```

It is not one function looping. It is **many domain functions each independently re-reading the same
tables**: `computeRiskAssessment`, `computeTodayRecoveryMode`, `buildTodayWorkloadItems`,
`composeMvdPlanForToday` and `computeCapacityHorizon` all fetch their own `calendar_events`, their own
`deliverables`, their own `courses`. Each is individually correct and independently testable — which
is exactly why it was never noticed — and together they cost five round trips for one table.

**The real fix is structural, not local:** a per-request read cache, or threading shared reads into the
domain functions rather than letting each fetch its own. That is a real refactor with real risk to a
well-tested layer, and it should not be done casually at this stage. **Filed, not attempted.**

Priority judgement: this is invisible locally (131 ms) and only bites against cloud Supabase. It
should be measured again **after the first cloud deploy**, against real RTT, before deciding how much
it is worth.

---



---

## 2. Accessibility

- **Keyboard-only pass on web**: every interactive element reachable, visible focus ring, no traps.
  The focus-ring bug from L0 (Tailwind's shared `--tw-outline-style` poisoned by `outline-none`)
  proves this cannot be assumed — it was invisible to every automated check.
- **VoiceOver pass on mobile**: every control has a meaningful accessible name. The `"(tabs)"`
  back-button leak proves a visually-correct fix can still be broken for a screen reader.
- Contrast: re-verify the ratios in `DESIGN_SYSTEM.md` §2 against what actually renders, including
  the risk-band pills on their washes.
- **Dynamic Type / large text** on mobile — the tab-bar clearance fix assumed a measured height;
  confirm it holds at accessibility text sizes.
- `prefers-reduced-motion`: the Day Trace must render instantly at full extent, not animate.
- Hit targets ≥44px on mobile.

---

## 3. Empty, sparse, and broken states

Every screen has been verified against the seeded demo semester. Verify each against:
- **A brand-new account** (zero of everything). The cold-start capacity bug shipped for six layers
  because nothing tested this.
- **A sparse account** — three days of history, one course, no integrations connected.
- **A failed load** — kill the DB mid-request and confirm the error state says what failed and what
  to do, rather than a spinner forever or a blank panel.
- **Offline** — last-known data with an explicit staleness timestamp, never silently stale.

---

## 4. Security review

- Re-run the full `pgTAP` suite and confirm **0 tables without RLS**.
- Confirm no `SERVICE_ROLE` reference is reachable from any app bundle (the barrel-export guard
  covers the mechanism; verify the outcome).
- Confirm journal text appears in no log, no error report, and no `llm_usage_log` row.
- Re-run the SSRF guard tests; confirm the DNS-rebinding limitation is still documented honestly
  rather than quietly assumed fixed.
- Verify every edge function rejects an anon key and an unauthenticated call.
- **Re-read `docs/SUPABASE_SETUP.md`'s four must-fix-before-launch items** and confirm each is still
  accurate and still flagged.

---

## 5. Full regression

- `npm run verify` — all four guards, typecheck, lint, unit tests
- `supabase test db` — full pgTAP
- `npm run test:integration` — twice consecutively (D14)
- Deno suites, offline and live-DB
- Playwright E2E, desktop and mobile viewports
- A complete manual user journey on **both platforms**: sign up → confirm → morning check-in →
  start a focus session → complete it → night review → read the report → view insights.

---

## 6. Cleanup

- Purge accumulated throwaway test users from the local DB (S2).
- Confirm `.playwright-mcp/`, `ios/`, and scratch files are absent and gitignored.
- `docs/FOLLOWUPS.md`: close what's done, and make sure everything deferred is honestly recorded
  with its reason.
- Final `docs/STATUS.md` reflecting real state.

---

## 7. What this pass must NOT do

- No new features. Anything discovered that isn't a defect goes to `FOLLOWUPS.md`.
- No "while I'm in here" refactors.
- No silent scope reduction — if something can't be verified, say so explicitly rather than
  quietly dropping it from the report.
