# Universal Links / App Links — the L1 partial build

> L1 (HANDOFF §8.2, SUPABASE_SETUP §5): `collegeos://` is a custom scheme any app can
> claim; on a confirmation or password-reset link that means intercepting a live
> session. The fix is domain-verified links. Everything below is prepared; the three
> blanks need the owner's domain and Apple credentials.
>
> **L2 status note (2026-08-26):** removing `exp://127.0.0.1:8081/**` from the CLOUD
> project's redirect list is a 30-second dashboard action (Authentication → URL
> Configuration) that this session could not perform: the Management-API route needs the
> CLI token out of the macOS keychain (declined by the runtime's safety layer), and
> `supabase config push` would overwrite cloud auth settings with local-dev values
> (site_url 127.0.0.1) — wrong tool. Time it deliberately: while development against the
> cloud project uses Expo Go, that entry is what lets auth emails return into the dev
> app. Removing it and moving to Universal Links is one motion, not two.

## The three blanks

| Placeholder | Where it comes from |
|---|---|
| `<TEAMID>` | Apple Developer account → Membership |
| `<BUNDLE_ID>` | Chosen at first EAS build (docs/SDK57_ASSESSMENT.md §3 — suggestion `com.kareembadawi.collegeos`) |
| `<DOMAIN>` | The production web domain (also SUPABASE_SETUP §5's Site URL) |

## Deployment steps (owner, ~30 min once the domain exists)

1. Fill the placeholders in the two files beside this README.
2. Serve them from the production web app:
   - `https://<DOMAIN>/.well-known/apple-app-site-association` — content-type
     `application/json`, NO redirect, NO `.json` extension. In apps/web: put the file at
     `apps/web/public/.well-known/apple-app-site-association` and add a `headers()`
     entry in `next.config` forcing the content type.
   - `https://<DOMAIN>/.well-known/assetlinks.json` — same public directory.
3. App side (dev build only — entitlements do not exist in Expo Go):
   `app.json` → `ios.associatedDomains: ["applinks:<DOMAIN>"]`, and for Android
   `android.intentFilters` with `autoVerify: true` for `https://<DOMAIN>/auth/callback`.
4. Supabase dashboard → Authentication → URL Configuration:
   - Redirect URLs: add `https://<DOMAIN>/auth/callback`; **remove
     `exp://127.0.0.1:8081/**` (L2) and, once the app build carrying associated domains
     ships, remove `collegeos://**`** (L1 complete only at that point).
   - Site URL: `https://<DOMAIN>` .
5. Verify: `curl -i https://<DOMAIN>/.well-known/apple-app-site-association` (200,
   application/json, no redirect), then a real password-reset email on a device with the
   dev build — the link must open the app, not Safari.

## Sequencing reality

Associated domains require a custom dev client, so **L1 completes at the Phase 4
dev-build fork, not before.** Until then the prepared files simply wait; what can happen
earlier is the domain purchase and serving the files (steps 1–2), which makes the fork's
L1 step a config flip.
