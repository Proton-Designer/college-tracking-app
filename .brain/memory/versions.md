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

## Non-landmine (confirmed safe)

React version alignment between Next.js and Expo — the thing most likely to drift in a shared
monorepo — is **not** a problem right now. Next 16.3.1 accepts React `^19.0.0`; Expo SDK 57 bundles
React 19.2 (unchanged from SDK 56). Both apps land on React 19.2.x with no manual reconciliation
needed.
