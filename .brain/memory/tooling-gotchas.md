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
