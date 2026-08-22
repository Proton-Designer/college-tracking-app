# Tooling Gotchas — iOS Simulator / Expo Go interactive driving

Recorded by NOVA (Eng B) while manually verifying mobile Today on a real simulator via `idb`,
2026-08-19, after the `mobile-today-shots` sim-pilot agent produced no output and was abandoned
per the Lead's cutoff guidance. These are interaction-layer gotchas, not app bugs — record them
here so the next person driving a simulator by hand doesn't lose the same hour rediscovering them.

## Gotcha 1 — `idb ui text` silently corrupts input on a field that's already been touched

Typing into a **fresh, never-before-interacted-with** text field with `idb ui text "..."` is
reliable — what you type is what lands, verified by screenshot every time. But once a field has
already been focused/typed-into/cleared once (even if you then visually confirm the correct
content via screenshot, dot-count, etc.), a **second** `idb ui text` call into that same field
frequently produces a value that *looks* right on screen but isn't what the app's controlled
`TextInput` state actually holds — login then fails with valid credentials, with a password field
showing the exact right number of dots.

**How this was proven, not just suspected:** when a login kept failing despite a visually-correct
password, the credentials were verified directly against the same local Supabase instance via a
one-off `supabase.auth.signInWithPassword()` script — bypassing the UI entirely. That call
succeeded every time. Since the same exact string failed through the app's UI but succeeded via a
direct API call to the same backend, the bug had to be in the UI input layer, not the credentials
or the backend. That's the technique worth repeating: when a value "looks right" on screen but
behaves wrong, verify the value against a path that skips the suspect layer entirely before
assuming the data itself is bad.

**Working pattern:** fully relaunch the app (`xcrun simctl terminate <bundle-id>` +
`xcrun simctl openurl <udid> "exp://host:port"`), then type into each field **exactly once**, no
corrections, no re-taps, no select-all/retype. If a field needs correcting, relaunch fresh rather
than editing in place. `idb ui key <backspace-keycode>` (42) does work for clearing a field, but
only when spaced ~150ms apart in a loop — a tight loop with no delay drops keystrokes.

## Gotcha 2 — Expo Go deep links need the `/--/` separator to route *inside* the running app

`xcrun simctl openurl <udid> "exp://127.0.0.1:8081/today?asOf=..."` (a path appended directly
after the host:port) does **not** navigate the already-running app to `/today` — Expo Go
interprets everything after the host as a *new project manifest path* to fetch, and since there's
no manifest at that path, it throws `Failed to parse manifest JSON` and requires a full
terminate+relaunch to recover (retrying "Try again" in Expo Go's own error screen just re-fetches
the same broken URL — no help).

**The correct form is `exp://127.0.0.1:8081/--/today?asOf=...`** — the `/--/` segment is Expo's
own convention marking "everything after this is the in-app route," not part of the manifest path.
Use the bare `exp://host:port` (no path) to launch/relaunch the app itself; use the `/--/` form to
deep-link to a specific screen once it's already running.

## Discovery — a shared demo account accumulates cross-engineer test contamination

While reviewing a live "now" Day Trace screenshot, the rendered window came out as `3AM–12PM`
instead of the expected `6AM–10PM`-ish range. Root cause: 7 garbage `task_sessions` rows existed
for the demo user's "today" with `planned_duration_min` values in the tens of thousands (e.g.
29816, 39816 — hundreds of hours), `planned_start`/`actual_start` both equal to the exact instant
the row was created. These are almost certainly artifacts of someone else's (Atlas's) concurrent
L6 focus-session backend testing against the same shared `demo@collegeos.app` account — not a bug
in the Day Trace's axis computation, which was correctly including every real row it was given.

Two follow-ups from this, for whoever hits it next:
- **Before trusting an anomalous live-data screenshot, check whether the anomaly is explainable by
  a plausible garbage row** (absurd duration, timestamp equal to row-creation instant) before
  assuming the rendering logic is wrong. `psql` against the local instance directly is faster than
  guessing from the UI.
- Backend features that write live data as a side effect of manual/integration testing (focus
  session start/stop, etc.) should probably use a dedicated throwaway account rather than the
  shared demo user, the same way UI screenshot verification already does — otherwise the "real
  data" screenshots aren't as real as they look.

Separately, this did surface one genuine (if rare) bug worth fixing regardless of root cause: the
Day Trace's `formatHour` treated `min = 1440` (midnight, i.e. `dayEnd` clamped to exactly 24:00)
as `12PM` instead of `12AM`, since `Math.floor(1440/60) = 24` and the old formula only handled
`h === 0` for the "12" case, not `h === 24`. Fixed in both `apps/web` and
`apps/mobile`'s `DayTrace.tsx` by normalizing `h % 24` before the AM/PM decision.

## Gotcha 3 — `storage.objects` cannot be deleted with a direct SQL `DELETE`

Cleaning up contaminating test files uploaded during integration-test debugging (Atlas, L7/L8
test-hygiene passes): `docker exec ... psql -c "delete from storage.objects where ..."` fails with
`ERROR: Direct deletion from storage tables is not allowed. Use the Storage API instead.` — a
`storage.protect_delete()` trigger blocks it outright, by design (prevents orphaning the underlying
object in the storage backend, which a raw metadata-row delete would do). Use the Storage REST API
instead:

```bash
curl -X DELETE http://127.0.0.1:54321/storage/v1/object/<bucket> \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" -H "content-type: application/json" \
  -d '{"prefixes":["<path/to/object1>","<path/to/object2>"]}'
```
`public.syllabus_uploads`/`public.proof`-referencing rows should still be cleaned up separately
afterward (the DB row and the storage object are two different things; deleting one doesn't delete
the other).

## Kong holds stale upstreams after `supabase db reset`
**Symptom:** every request through the gateway 502s with *"An invalid response was received from
the upstream server"* — including `/auth/v1/*`, so all sign-ins fail — while `docker ps` shows every
container healthy and the auth container's own logs look like a clean startup.

**Cause:** `db reset` restarts auth/db/storage/realtime but **not** Kong. Kong keeps routing to the
container IPs it resolved at its own startup, which are now dead. The tell is a container-uptime
mismatch: Kong "Up 2 hours" while auth is "Up About a minute".

**Fix:** `docker restart supabase_kong_college-app` — non-destructive, ~2s, no data loss.

Found twice independently within a minute (a failing admin `createUser`, and a container-uptime
check). Worth checking uptimes before assuming an application bug: healthy containers plus a
gateway 502 is an infrastructure symptom, not a code one.

## Gotcha 4 — iOS Simulator's QuickType keyboard learns and re-injects typed strings, corrupting
`idb ui text` input in a way that compounds and is *not* fixed by clearing Keychain

Symptom: `idb ui text` into a plain `TextField` (verified via `idb ui describe-all`'s `AXValue`, not
just a screenshot) lands a value that's spliced with fragments of a *previous, unrelated* string
typed earlier in the same simulator session — e.g. typing a test account's email produced
`verify-u2-mobile-...@demo@collegeos.appcollegeos.test` after `demo@collegeos.app` had been typed
many times earlier while fighting this same issue. It gets *worse* with more typing, not better:
after navigating Settings and typing "Keyboard" into its search field trying to fix this, the next
app-field type picked up a `Reset Keyboard` fragment too.

**This is iOS's predictive-text (QuickType) word learning, not a saved password/Keychain issue.**
Two things that do **not** fix it, confirmed by testing in this exact session:
- `xcrun simctl keychain <udid> reset` — clears saved passwords/certs, not QuickType's learned
  vocabulary. Ran it; contamination continued identically afterward.
- Settings → General → AutoFill & Passwords → toggling "AutoFill Passwords and Passkeys" off —
  governs password-manager suggestions specifically, not general keyboard word prediction. Verified
  the toggle actually flipped (rechecked the screen after) and the very next email-field type still
  spliced in `demo@collegeos.app`.

Also worth knowing: a **second `idb ui text` call to append/complete a truncated field is itself a
new contamination window** — appending onto an already-typed field was consistently where the
splice happened, more often than the first fresh-field type. If a field truncates, prefer clearing
it fully and retyping the whole string in one `idb ui text` call over appending the missing suffix.

**Not yet found:** a reliable in-session fix. The two most likely real fixes — neither attempted
successfully in this session — are (a) Settings → General → Keyboard → toggle off "Predictive"
(navigating there via `idb ui tap` on the Settings app proved unreliable: taps repeatedly landed on
the wrong row, and `App-Prefs:General&path=Keyboard` deep links did not open the Keyboard subpage
in this iOS/simulator version), or (b) `xcrun simctl erase <udid>` for a fully clean device — not
attempted here since it wipes the whole simulator (all apps/data) and needs explicit authorization
before use, especially on a simulator that might be shared with other engineers' work.

**Practical workaround for the next person:** minimize total keystrokes typed into the simulator
before you need clean input — every string typed (including into Settings, search bars, anywhere)
adds to what QuickType can later re-suggest. If you must fight this live, expect it to compound, not
self-resolve; don't try to "type your way out of it" by retrying the same field repeatedly.

---

## "Signed in, then instantly signed out" after restarting the Supabase stack

**Symptom:** sign in successfully, load one or two protected pages, then get bounced to
`/login?next=...` on the next navigation. Dev server log shows
`AuthApiError: Invalid Refresh Token: Refresh Token Not Found` / `code: 'refresh_token_not_found'`.

**Cause:** a stale auth cookie in the browser profile from a *previous* session, pointing at a
refresh token that no longer exists because the local Supabase containers were restarted (or
`db:reset` ran) in between. GoTrue correctly refuses a token it has no row for.

**This is correct behavior, not a product defect.** Verified 2026-08-22: after one fresh sign-in,
8/8 protected routes returned 200 with a single stable `sb-127-auth-token` cookie, and zero auth
errors followed. `jwt_expiry` is 3600s, so a minute-old session never needed a refresh at all —
which is what ruled out an expiry/rotation bug.

**Fix:** clear cookies for `localhost:3000` (or just sign in again) after restarting the stack.
**Do not** "fix" `proxy.ts` or the cookie adapter in response to this — both are correct, and the
Server-Component `setAll` swallow is intentional and documented in `client/serverClient.ts`.

## Reanimated's built-in `useReducedMotion` is static — do not use it

`react-native-reanimated`'s own `useReducedMotion` reads the OS setting **once at module load**
(`IS_REDUCED_MOTION_ENABLED_IN_SYSTEM`, computed at import time). Its own doc comment states:
*"Changing the reduced motion system setting doesn't cause your components to rerender."*

A user who enables Reduce Motion mid-session gets no effect until the app is restarted — which
fails the accessibility requirement it looks like it satisfies. Use
`apps/mobile/src/lib/useReducedMotion.ts` instead: it subscribes to `AccessibilityInfo`'s
`reduceMotionChanged` event and updates live. Verified by reading the library source, not assumed.

**Do not "simplify" this back to the built-in hook.**

---

## Mobile visual verification: use Expo Web, not only the simulator

**The simulator is not the only way to see the mobile app, and it is the least reliable one here.**
`HANDOFF.md` §5.2 records mobile visual rendering as our least-verified area because `idb ui text`
corrupts input and blocks sign-in. Two separate attempts have now failed — including a dispatched
sim-pilot run that went **fully dark for 45 minutes** and produced no screenshot, no partial finding
and no reply to a direct status check.

**Expo Web works and takes about a minute:**

```bash
cd apps/mobile && npx expo start --web --port 8082
```

`react-native-web` is already a dependency and `app.json` already declares web output, so no setup is
needed. Sign-in works **instantly** through normal browser text entry — the entire class of
simulator text-injection corruption simply does not exist. Drive it with Playwright at a phone
viewport (414×896) and screenshot freely.

Verified 2026-08-22: welcome screen, sign-in, Today (Recovery Mode), and Insights all rendered, and
it confirmed **T1 reproduces identically on mobile** ("Class / commitment" ×3) plus that Nova's new
tab-bar active indicator renders correctly.

**What it does NOT prove — state this whenever you cite it as evidence:**
- Native pickers (`@react-native-community/datetimepicker` renders differently or not at all)
- Real iOS/Android font rasterisation, shadows, and blur
- How a spring animation actually *feels* on device
- Safe-area insets, notch/home-indicator clearance, and true tab-bar height
- Keyboard behaviour, including the dictation key that is mobile's half of V1
- VoiceOver / TalkBack

**So it is not a substitute for an on-device pass before launch.** It is a fast, reliable way to
verify layout, states, copy, data flow, and component behaviour — which is most of what a UI change
needs — instead of verifying nothing at all because the simulator is wedged.

---

## Edge functions return 503 locally because no runtime container is running

**Symptom:** every `http://127.0.0.1:54321/functions/v1/*` call returns **503**, so anything routed
through an edge function fails. It reads like a code or Kong problem. It isn't.

**Cause:** `npm run db:start` (`supabase start`) does **not** bring up an edge-runtime container.
`docker ps` shows db, auth, kong, rest, storage, realtime, studio, analytics, vector, inbucket — and
no `supabase_edge_runtime_*`. Kong has nothing to route to, hence 503.

**Fix:**

```bash
supabase functions serve --env-file ./.env.local
```

That creates `supabase_edge_runtime_<project>`, reloads Kong, and serves all 11 functions. It is a
**foreground process** — if it dies, restart it. It is not part of `db:start`, which is why nobody
had it running and why "the edge functions are unreachable" was true for the whole build.

`--env-file` warns `Env name cannot start with SUPABASE_, skipping: ...` for four variables. That is
expected and harmless: the runtime injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` itself, and refuses to let a file override them.

**What this does not fix:** there is still no `ANTHROPIC_API_KEY`, so `syllabus-extract` and the
model half of `nightly-analysis` will still fail. That is correct and expected — but with the runtime
up you can now prove it is the *model call* failing rather than the function being unreachable, which
is a materially different claim to be able to make.
