# Remaining Work

> **Superseded as the primary list.** `HANDOFF.md` §8 is now the authoritative inventory of what
> remains — it is ordered, current, and re-verified against HEAD on **2026-08-23**.
>
> This file was written at an earlier session close and described U1/U3/U5/U6/U7/U8 as unbuilt.
> **All of those shipped.** Leaving that list here would have repeated the exact failure this
> project keeps hitting: *a doc row is a claim about the past, and several of them turned out stale
> mid-session — one feature was nearly rebuilt from scratch.*

---

## Where to look now

| You need | Read |
|---|---|
| **Everything remaining, ordered** | **`HANDOFF.md` §8** |
| What was never verified, and why | `HANDOFF.md` §9 |
| Recurring problems and their patterns | `HANDOFF.md` §10 |
| Bringing this up on a new machine | `HANDOFF.md` §3 |
| Supabase schema / migrations / cloud move | `HANDOFF.md` §4, then `docs/SUPABASE_SETUP.md` |
| The full open-item register with reasoning | `docs/FOLLOWUPS.md` |
| The testing plan, grounded in bugs that actually shipped | `docs/L11_HARDENING.md` |

---

## The two things still blocked on credentials

Both are one-pass jobs with ordered runbooks already written.

| What | Where | Notes |
|---|---|---|
| **Supabase cloud provisioning** | `docs/SUPABASE_SETUP.md` | Complete ordered runbook. Read §5 and §7 before deploying — **four must-fix-before-launch security items** live there. |
| **Anthropic API key** | `SUPABASE_SETUP.md` §7 | 5-step activation checklist. **If a live response shape differs from a fixture, update the fixture from reality — never patch the test to pass.** |

The entire LLM layer is built and tested offline against golden fixtures. Nothing about it is
speculative; it simply hasn't met a live model.

---

## The testing that is still genuinely undone

Full plan in **`docs/L11_HARDENING.md`** — each section is grounded in a bug this build actually
shipped, so it explains *why* each check exists rather than just listing commands.

1. **The mutation-mid-flight failure test** (P2). The last untested failure mode, and the one that
   can cost real data. Needs a window when nobody else is using the local database.
2. **A real VoiceOver / TalkBack pass on a physical device.** Everything so far is structural, and
   `HANDOFF.md` §9.2 explains why the structural method is blind to state entirely.
3. **A real Android device.** `expo-blur` never blurs there (G1) — the glass effect does not exist
   on Android at all, and nothing in our harness would have told us.
4. **The confirmation-link / deep-link mechanism**, which remains unexercised on any platform.

## How to work in this repo

`CLAUDE.md` first, then `.brain/memory/decisions.md` (**D1–D22**) — durable decisions with their
reasoning, several of which a future session would otherwise reverse.

The four guards in `npm run verify` (`check:imports`, `check:core-mirror`, `check:barrel-exports`,
`check:demo-clean`) have **each caught a real defect** that typecheck, lint and review all missed.
Don't disable one to make a build pass.
