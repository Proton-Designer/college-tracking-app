# SDK 54 → 57 Migration Assessment + EAS/TestFlight Prep

> Written 2026-08-26 per the continuous-run queue item 4. **Assessment, not a migration**
> — the queue's own framing, kept. The "Ayman greenlight" happened outside any recorded
> session; nothing here assumes more than "assess and prep."

## 1. The one fact that decides everything (owner must check, ~1 minute)

**Which SDK does the physical iPhone's Expo Go run today?** Open Expo Go → Settings, or
just scan the current dev server QR: it names the SDK it ships. On 2026-08-24 it was
54.0.2, which is the entire reason commit `13b3c80` downgraded the app. Expo's changelog
shows SDK 57 released 2026-06-30 (SDK 56 on 2026-05-21), and Expo Go only ever runs the
SDK it ships with.

- **If the App Store Expo Go now ships 57** (and the phone updated): migrating restores
  unified 57.x versioning and keeps the Expo Go loop. Do it.
- **If it still ships 54**: migrating to 57 *ends the on-device Expo Go loop* — the
  exact cost the downgrade was performed to avoid — and is only worth it bundled with
  the Phase 4 dev-build fork (the standing ≥3-items rule). Don't spend it on nothing.

## 2. What the migration actually is (from `13b3c80`, run in reverse)

`npx expo install expo@^57.0.0` then `npx expo install --fix`, plus these known deltas —
each was a deliberate adaptation with a note saying what to restore:

| Site | 54 state | On 57 |
|---|---|---|
| `Island.tsx` | `BottomTabBarProps` from `@react-navigation/bottom-tabs` (declared dep) | The `expo-router/tabs` re-export returns in SDK 55+; either import works. Keep the explicit dep — it is correct either way. |
| `Button/Checkbox/Toggle` | `react-hooks/immutability` eslint-disables removed (rule doesn't exist in eslint-config-expo 10) | **Restore the directives** — the commit left the rationale in prose for exactly this moment. |
| `jest.config` | `react-native-worklets/jest/resolver.js` resolver removed (absent in worklets 0.5.1) | Worklets 0.10+ has it again; restore if jest-expo@57 wants it. |
| `metro.config.js` React dedup + jest `moduleNameMapper` react pin | Load-bearing (web 19.2.8 vs mobile 19.1.0) | 57 moves mobile to react 19.2.3 — **still ≠ web's 19.2.8**, so the dedup stays unless web is aligned in the same change. Removing it is only safe when both apps pin the same react; HANDOFF §3.2 and REVIEW §6.3 both carry this rule. |
| `package-lock.json` | Fully regenerated (the old lock resurrected RN 0.86.2) | Expect to regenerate again; do not patch. |

The shared packages (`core`, `api`, `design`) are pure TS with zero React/Expo imports —
untouched in both directions, proven last time.

Also from `.brain/memory/versions.md`, unchanged by this move: TS stays 5.9.3, Jest
stays 29.7.0 (`jest-expo@57` still pins the 29 line — verify at migration time), never
hand-pick RN/reanimated/gesture-handler versions (`npx expo install` only).

**Estimated effort when green-lit: half a day**, dominated by re-verifying the four
adaptation sites and a device walk. The downgrade took one commit; the upgrade retraces
it with the notes already written.

## 3. EAS / TestFlight prep (done this session, nothing submitted)

- **`apps/mobile/eas.json` added** — three standard profiles:
  `development` (dev client, internal), `preview` (internal distribution ad-hoc), and
  `production` (store). No secrets in it; safe in git.
- **`app.json`**: `ios.bundleIdentifier` is **deliberately NOT set.** It becomes
  permanent the moment the first TestFlight build is submitted under it, and picking it
  is the owner's call (suggestion: `com.kareembadawi.collegeos`). EAS will prompt for it
  on the first build; set it in `app.json` at that point.

### The steps only the owner can do (in order, when ready)
1. `npx eas login` (Expo account) — credentials.
2. Apple Developer Program membership ($99/yr) — credentials + payment.
3. Decide the bundle identifier (see above) and add it to `app.json`.
4. `npx eas build --platform ios --profile production` — first run walks through Apple
   auth and distribution-certificate creation interactively.
5. `npx eas submit --platform ios` → TestFlight. **This is the submission gate; nothing
   this session prepared will submit anything on its own.**

### Interaction with the security items (they gate a real TestFlight audience)
L1 (Universal Links — needs the real domain + AASA), L2 (`exp://` redirect removal), and
L3 (custom SMTP) are all listed as "before anyone else touches this" in HANDOFF §8.2. A
TestFlight build handed to even one other person crosses that line. Sequence the L-items
before the first external tester, not after.

## 4. Recommendation

Hold the migration until the §1 fact is checked. If Expo Go on the phone is now 57.x,
migrate (half-day, retraced path). If not, fold the migration into the Phase 4 dev-build
fork and take both when ≥3 dev-build items are wanted — the fork makes Expo Go
compatibility irrelevant, and the EAS scaffolding from §3 is already in place either way.
