# Version Pins — L0 Foundation

Recorded by NOVA (Eng B) during app-shell scaffolding, 2026-08-18/19. Re-verify before bumping
any of these — see the "do not bump" notes below.

## Chosen versions

| Package | Version | Why |
|---|---|---|
| Next.js | 16.3.1 | npm latest at time of scaffold |
| React / React DOM | 19.2.8 | matches what Expo SDK 57 bundles — no cross-platform drift |
| Tailwind CSS | v4.3.3 | CSS-first config (`@import "tailwindcss"`), no `tailwind.config.ts` |
| TypeScript | **5.9.3** (not npm `latest`) | see landmine #1 |
| ESLint | **9.39.5** (not npm `latest` 10.8.1) | both `eslint-config-next` and `eslint-config-expo` declare support for 10.x, but it shipped only weeks ago — declining to be the first to hit its flat-config edge cases unattended overnight. Safe to bump later after checking changelogs. |
| Expo SDK | 57 (via `npx create-expo-app` / `npx expo install` only) | see landmine #2 |
| React Native | 0.86.2 (whatever Expo SDK 57 bundles — do not pin manually) | |
| react-native-reanimated | whatever Expo SDK 57 bundles (4.3–4.5 range) | |
| @supabase/supabase-js | 2.112.3 | |
| @supabase/ssr | 0.12.4 | |
| @playwright/test | 1.62.1 | npm latest |
| jest | **29.7.0** (not npm `latest` 30.4.2) | see landmine #3 |
| jest-expo | ~57.0.4 | matches SDK 57 |
| @testing-library/react-native | 14.0.1 | see landmine #4 for its breaking `render()` change |

## Landmine 1 — TypeScript 7.0 is npm `latest` but is NOT safe to use yet

TypeScript 7.0 (GA 2026-07-08) is a full Go-native compiler rewrite ("Project Corsa"). It ships
with **no stable programmatic/language-service API** — that lands in TS 7.1 (targeted autumn
2026). Consequence: `typescript-eslint` (peer requires `typescript >=4.8.4 <6.1.0`),
`eslint-config-next`, and `eslint-config-expo` all cannot run on TS7 yet. Installing "latest"
TypeScript would silently break lint across both apps — the worst kind of failure because it looks
like success (tsc still runs) while the lint layer quietly no-ops or errors out.

**Do not bump TypeScript past the 5.x line until TS 7.1 ships and `typescript-eslint` publishes a
release supporting it.** Check `npm view typescript-eslint peerDependencies` before ever touching
this pin — that range gates the ceiling, not "what's newest."

## Landmine 2 — npm's "latest" Expo/React Native packages don't match what Expo SDK 57 bundles

`expo@latest` (57.0.14 on npm) declares all its native peer deps (`react-native`,
`react-native-web`, etc.) as wildcard `*`. A plain `npm install` would happily resolve
`react-native@0.87.0` (npm's independent "latest"), but Expo SDK 57 is built and tested against
React Native **0.86.2**. That mismatch is a classic native-module ABI landmine — it produces
confusing native crashes/build failures, not a clean dependency error.

**Never hand-pick `react-native`, `react-native-reanimated`, or `react-native-gesture-handler`
versions.** Always scaffold via `npx create-expo-app` and add native deps via `npx expo install
<pkg>`, which resolves against the SDK's own compatibility table. Verify with `npx expo-doctor`
after any dependency change.

## Landmine 3 — `jest-expo` needs Jest 29, not npm's "latest" Jest 30

`jest-expo@57.0.4` depends directly on `jest-snapshot@^29.2.1`, `babel-jest@^29.2.1`,
`@jest/globals@^29.2.1` — it's built for **Jest 29**. npm's `jest@latest` is 30.4.2. Same shape as
landmines 1 and 2: installing "latest" would silently misalign the test runner from the preset that
wires up React Native's transform pipeline.

**Pinned `jest@29.7.0` in `apps/mobile`.** Check `npm view jest-expo dependencies` before bumping
either `jest` or `jest-expo` — they must stay in the same major line.

## Landmine 4 — `@testing-library/react-native@14`'s `render()` is now `async`

Breaking API change from earlier majors: `render()` used to be synchronous. In v14 it's `async
function render(...)`. Calling `render(<X />)` without `await` doesn't throw — it just means
`screen.getByTestId(...)` on the very next line hits RNTL's "detached" placeholder (error:
`` `render` function has not been called ``) because `setRenderResult` hasn't run yet. Always
`await render(...)`; for a component expected to throw during render, use
`await expect(render(<X />)).rejects.toThrow(...)`, not a synchronous `expect(() => render(...))`.

## Landmine 5 — Expo Router bundles *any* file under the app root, including tests

`expo-router`'s `require.context` (`node_modules/expo-router/_ctx.ios.js`) only excludes
`+api`/`+html`/`+middleware` suffixed files — it has **no built-in exclusion for `.test.tsx`,
`.spec.tsx`, or `__tests__` directories**, unlike most router/framework conventions. A test file
placed inside `src/app/` (this app's `EXPO_ROUTER_APP_ROOT`) gets pulled into the production Metro
bundle as if it were a route. Concretely: `src/app/index.test.tsx` imported
`@testing-library/react-native`, which imports Node's `console` module — Metro can't resolve a
Node core module for the app target, and the simulator showed "Unable to resolve module console."

**Every test file for `apps/mobile` must live outside `src/app/`** — this repo uses
`apps/mobile/__tests__/` (Jest's default `testMatch` finds it there regardless of location; nothing
about Jest requires tests to be colocated with the router root). If a future screen genuinely needs
a colocated test, verify with `expo start` + a fresh bundle that Metro doesn't choke on it, not just
`npm test`.

## Discovery — local Supabase has `enable_confirmations = false` by default

`supabase/config.toml`'s `[auth.email]` section ships with `enable_confirmations = false`, so a
plain `supabase.auth.signUp()` **auto-confirms and sends no email** on the local stack — Mailpit
stays empty. This isn't a bug, but it means the e2e harness's Mailpit fixture had to prove itself
against `resetPasswordForEmail` instead (which always sends locally). **Whoever builds L3's real
signup-confirmation flow will need `enable_confirmations = true`** for that flow to be
end-to-end testable via Mailpit the way the brief describes ("Sunday weekly planning" email
confirmation, etc.) — flag this to whoever owns that migration/config change.

## Non-landmine (confirmed safe)

React version alignment between Next.js and Expo — the thing most likely to drift in a shared
monorepo — is **not** a problem right now. Next 16.3.1 accepts React `^19.0.0`; Expo SDK 57 bundles
React 19.2 (unchanged from SDK 56). Both apps land on React 19.2.x with no manual reconciliation
needed.

## Landmine 6 — Tailwind v4's built-in `max-w-prose` (65ch) silently wins over a same-named custom token

`packages/design/src/tailwind.css` originally defined `--container-prose: 720px` inside `@theme`,
expecting it to generate a `max-w-prose` utility at 720px per DESIGN_SYSTEM §4. It doesn't —
Tailwind v4 ships `max-w-prose` as a built-in typography utility (`65ch`), and a custom
`--container-prose` does **not** override it; the built-in wins. The landing page's "report
speaks" section rendered at ~430px instead of 720px as a result — found by the Lead reviewing a
screenshot, not by any tooling (typecheck/lint/tests all pass regardless of which value wins).

**Renamed the token to `--container-report` → `max-w-report`.** Any future custom container/spacing
token should be checked against Tailwind's own built-in utility names before assuming a same-named
`@theme` entry will override it — some utility families are known/reserved (this one is a
typography-plugin holdover) and don't follow the plain override rule that `app`/`sm`/`lg`-style
custom names do.

## Landmine 7 — Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts`

`middleware.ts` still works but prints a deprecation warning and is on its way out; the
`export function middleware` convention became `export function proxy` in a file named
`proxy.ts`. Functionally identical (same `NextRequest`/`NextResponse` API, same `config.matcher`),
this project uses `apps/web/src/proxy.ts`. If you're referencing Next.js docs/blog posts/Stack
Overflow answers written before ~16.1, they'll say `middleware.ts` — that's now the deprecated
form, not the current one.

## Discovery — E2E specs sharing one `storageState` snapshot can race Supabase's refresh-token rotation

`supabase/config.toml` has `enable_refresh_token_rotation = true`. Two Playwright tests that both
restore the same on-disk `storageState` file into independent browser contexts, and both trigger a
session refresh (e.g. via `proxy.ts`'s `auth.getUser()` on every navigation) at close to the same
time, can race — Supabase only tolerates concurrent reuse of an already-rotated refresh token
within `refresh_token_reuse_interval` (10s locally), and outside that window one context's session
silently breaks (looks like a session that "sometimes" doesn't survive reload — flaky, not
deterministic). Fix: `test.describe.serial(...)` for spec files that share the "authenticated"
project's storageState, so they never refresh concurrently. See
`apps/web/e2e/authenticated/session.spec.ts`.
