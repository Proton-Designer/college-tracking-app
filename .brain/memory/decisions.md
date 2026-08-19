# Durable Architecture Decisions

Append-only. These survive context compaction. Do not silently reverse one — supersede it with a
new dated entry explaining why.

## D1 — Monorepo with two UI shells, one shared brain
`apps/web` (Next.js) + `apps/mobile` (Expo) over `packages/core` + `packages/api` + `packages/design`.
**Why:** the product needs a real desktop landing page *and* a native mobile welcome screen —
different surfaces with different craft requirements that `react-native-web` would compromise.
**Divergence control:** UI shells own layout and interaction ONLY. If a component computes a domain
value, that computation belongs in `packages/core`. This rule is the entire defense.

## D2 — Supabase Edge Functions are the only backend
Not Next.js route handlers. **Why:** mobile needs the same backend as web; one backend, one place
for the Anthropic key. Route handlers would force a second backend for mobile.

## D3 — Build against local Supabase; cloud is a swap, not a rewrite
Full local stack (Postgres 17.6, GoTrue, PostgREST, Storage, Edge). Every schema change is an
ordered migration that applies identically to cloud. `docs/SUPABASE_SETUP.md` accumulates every
cloud-only step. **Payoff:** real auth, real RLS, real email flows testable tonight.

## D4 — All internal packages are source-resolved (no dist)
`main`/`types`/`exports` → `./src/index.ts`. **Why:** consumers are Turbopack, Metro, Vitest, and
Deno — all handle TS source. A dist step buys nothing and costs a stale-dist trap plus
build-ordering for typecheck. "I rebuilt but it didn't update" is a bug class an unattended build
cannot afford. *(Adopted from Nova's `packages/api` setup, extended to all packages.)*

## D5 — Version pins that must not be casually bumped
- `typescript@5.9.3` — TS 7.x is a Go-native rewrite with **no stable language-service API until
  7.1**; `typescript-eslint` peer-requires `<6.1.0`. Bumping silently breaks lint across both apps,
  which *looks like success*. Revisit at 7.1 GA.
- Mobile deps installed **only** via `npx expo install`, never hand-picked. Expo's npm `latest` has
  wildcard peers that would pull RN 0.87 against an SDK tested on 0.86.2 → native ABI mismatch.
- `eslint@9.39.5` — 10.x is weeks old; not worth discovering its flat-config edges unattended.
Full detail in `.brain/memory/versions.md`.

## D6 — Risk engine: weighted-additive, not the brief's pure product
The brief's `risk = a × b × c × ...` is rejected: one zero factor annihilates the score, and
per-factor attribution isn't well-defined — which would break the "Why:" explanation the product
depends on. Replaced with a weighted sum × a single urgency salience multiplier. Preserves the
intent (distant work is damped, never zeroed) and stays attributable.

## D7 — Missing factors are excluded and renormalized, never defaulted
Defaulting a missing factor to `0` biases risk **downward** by its full weight (every course gets a
free discount before grades are entered — exactly when the radar matters most). Defaulting to `0.5`
**fabricates an observation**. Instead: exclude, renormalize remaining weights, and derive
`confidence` from the missing mass. Trace returns `missingFactors[]` so the UI can prompt for the
input that would fix it.

## D8 — Crash plans may never drop the submission
A naive "keep the largest phases" crash plan drops `final (.10)` while keeping `draft (.30)`,
producing a paper that is **never submitted**. Terminal artifact-producing phases are
`required: true`, reserved before greedy allocation. If capacity can't cover them, return
`infeasible` — "this cannot be done in the time available" is a legitimate output; silently
omitting submission is not.

## D9 — The LLM never calculates and never chooses what matters
Deterministic code computes every number and ranks every candidate (by risk reduction per
calibrated minute); Claude phrases the rationale from the provided trace. Insight confidence is
stored as `min(model_claimed, code_permitted)`. Without these, the product becomes an LLM with
opinions about someone's life instead of an engine with evidence.

## D10 — Extraction never auto-writes academic data
Syllabus extraction lands in staging with the verbatim source snippet per item; nothing reaches
`assignments`/`exams`/`grade_categories` without explicit user confirmation. A silently-moved exam
date is the most damaging failure this product could produce.

## D11 — `@collegeos/api` uses platform subpath exports
`.` (universal: env, auth logic, data layer, types) · `./web` (browser + server clients,
`@supabase/ssr`) · `./native` (AsyncStorage client, `react-native`).

**Why:** a flat barrel that re-exported the native client made `apps/web` transitively bundle
`react-native`, and the production build died on Flow syntax inside `node_modules/react-native`.
Typecheck was clean throughout — only a real `next build` surfaced it. Neither platform-specific
entry is reachable from the main barrel.

**Rule:** anything importing a platform-only dependency goes behind a subpath. Never re-export it
from `src/index.ts`.

## D12 — `npm run verify` must mean something
`verify` = `check:imports → typecheck → lint → test`. `scripts/check-imports.mjs` guards D4:
`.js`-suffixed relative imports typecheck fine under `moduleResolution: "bundler"` but break
Turbopack and Metro at runtime. It caught **109 latent violations**, 70 of them in `packages/core`,
which would all have detonated at once on L4's first domain import and looked like an L4 bug.

**Rule:** typecheck alone is not acceptable evidence in this repo. Any report claiming a layer works
must include a real `npm run build` for web and, where relevant, a Metro bundle.

## D13 — Local GoTrue reads `config.toml` at container start
Editing `enable_confirmations` and running `supabase db reset` is **not** enough — the auth
container keeps its old `GOTRUE_MAILER_AUTOCONFIRM`. Requires `supabase stop && supabase start`.
Verify with `docker exec supabase_auth_college-app printenv | grep AUTOCONFIRM`.
