# Canvas Conversion — Audit

> Written 2026-08-26 per the owner's directive: audit first, findings in docs, build up to
> the point of needing the token. This file is the audit; the build follows it in
> commits. BLUEPRINT Part XI is the source spec (personal access token + per-user ICS
> feed — deliberately NOT institutional OAuth), FOLLOWUPS F3 the credential ruling,
> REVIEW_2026-08-25 §4 the blocked-on-credentials framing.

## 1. What exists to build on (verified against HEAD, not docs)

| Piece | State | Relevance |
|---|---|---|
| `brightspace-sync` → `ics_event_extractions` → `brightspace-confirm` | Built, verified end-to-end (L10) | **The ICS half of Canvas needs no new pipeline — see §3.** The parser (`packages/core/src/integrations/icsParser.ts`), SSRF guard, Vault URL storage, staged-confirm flow are all generic ICS; nothing in the pipeline is Brightspace-specific except the names. |
| `parse-announcement` → `announcements.parsed_diff` → `announcement-confirm` | Built Tier 4, live-verified with the key | **The announcements half plugs in here.** The poll's only job is to get raw announcement text into `announcements` rows; parse + confirm already exist and already require explicit confirmation before any `deliverables` write. |
| `oauth_connections` + `private.store_oauth_token`/`get_oauth_token` (Vault) | Built (migration 10), pgTAP-proven, real caller since L10 | **The token store.** Metadata selectable, plaintext only via `private.*` SECURITY DEFINER functions — exactly F3's bearer-credential pattern. |
| Disconnect flows (migrations 28–29, settings UI) | Built | Canvas disconnect reuses the `oauth_connections` teardown. |
| `_shared/http.ts` `getVerifiedCaller`, budget/logging gateway | Built | canvas-sync follows the same skeleton as brightspace-sync. |
| Cron registration pattern (migration 14: Vault-gated `cron.schedule` + `pg_net` → edge function with `CRON_SHARED_SECRET`) | Built, running for nightly/weekly/morning-brief | The 30–60 min school-day poll registers the same way. |

## 2. Constraint findings (the two checks the owner asked for)

- **`oauth_connections.provider` CHECK** — confirmed: `('whoop', 'google_calendar', 'microsoft', 'rescuetime')` (migration 10 line 18). **Needs `'canvas'` added.** Migration 43 does this by dropping and re-adding the CHECK (text + CHECK per the migration-24 enum policy; no enum type to alter).
- **`calendar_events.source` CHECK** — confirmed: `('ics', 'google', 'manual')` (migration 8 line 120). **No change needed** — Canvas dated items arrive through the ICS pipeline and are correctly `source='ics'`; the REST poll deliberately never writes `calendar_events` (announcements go to `announcements`, grades to the Ledger). Adding a `'canvas'` source would create a second event-write path, which is exactly what the one-table/one-path rulings exist to prevent.
- **`announcements` has no external id** — the paste flow never needed one, but a poll re-fetching a window MUST dedupe or every poll re-stages the same announcements. Migration 43 adds nullable `external_id text` + `source text check (source in ('paste','canvas')) default 'paste'` + a partial unique on `(user_id, external_id) where external_id is not null`.

## 3. Ruling: the ICS half reuses the Brightspace pipeline as-is

The per-user Canvas ICS URL is a magic bearer URL, same category as Brightspace's (F3).
`assertSafeFeedUrl`, the parser, staging, and confirm are host-agnostic. The user is
*converting* from Brightspace to Canvas — one feed per user (the `brightspace_feeds`
unique constraint) is still the right cardinality; the feed is simply a Canvas URL now.

**Connecting the Canvas ICS URL through the existing `brightspace-sync` works today with
zero code changes.** The `brightspace_*` names are historical, not functional. Renaming
tables/functions to `ics_*` would churn a verified pipeline for cosmetics; not done. The
naming debt is recorded here instead: if a second feed source ever genuinely coexists,
generalize then.

## 4. Design — the REST poll (the genuinely new work)

### 4.1 Credentials & connection (built this session)
- **PAT** → `oauth_connections` with `provider='canvas'` via the existing
  `store_oauth_token` (Vault; `expires_at` null — PATs don't expire, revocation is
  user-side in Canvas settings). Not literally OAuth; the table is the project's
  bearer-credential store and F3 says that's the category that matters.
- **Base URL** (e.g. `https://uta.instructure.com`) — not a credential; plain column on
  a new `canvas_connections` table (user-unique), https-validated + SSRF-guarded before
  first use, alongside `last_polled_at` (poll watermark) and RLS matching every other
  user-scoped table.
- **Course mapping** — Canvas announcements/grades arrive per Canvas course id;
  `announcements.course_id` is NOT NULL by design (parse needs the course's deliverables
  as context). New `canvas_course_links` table: `(user_id, course_id)` unique,
  `(user_id, canvas_course_id)` unique, `canvas_course_name` for display. Populated by
  the user from a fetched Canvas course list at connect time — a human confirms the
  mapping once; nothing is fuzzy-matched silently.

### 4.2 Announcements poll (built this session, live-blocked on the token)
`canvas-sync` edge function, brightspace-sync's skeleton:
- `{baseUrl, token}` → connect (store both, fetch `/api/v1/courses?enrollment_state=active` to return the mapping candidates).
- `{links: [...]}` → save course links.
- `{}` → poll: `GET /api/v1/announcements?context_codes[]=course_<id>` for all linked
  courses since `last_polled_at`; each new item (deduped on `external_id`) is inserted as
  an `announcements` row (`source='canvas'`, html stripped to text) and run through the
  existing parse. Parsed diffs surface in the existing confirmation UI — **the poll
  replaces the paste gesture, never the confirmation.** Announcements with no schedulable
  content file to the course exactly as pasted ones do.
- Poll cadence: cron every 30 min on school days (blueprint), Vault-gated registration
  like migration 14, plus a manual "Sync now" so the feature works before the cron secret
  is re-provisioned.

### 4.3 Grades poll (designed here; build follows announcements)
`GET /api/v1/courses/:id/students/submissions` (own enrollment) yields scored
submissions. These are ground truth from the LMS, not model inference — but matching a
Canvas assignment to a local `grade_items` row is a heuristic, and a wrong match writes a
wrong grade into the Ledger silently. So: **staged, fourth instance of one-path-to-done.**
A `canvas_grade_extractions` staging table (canvas assignment name/points/score,
best-effort matched `grade_item_id` suggestion, status vocabulary from the other three
staging tables); confirm writes `points_earned`. Deferred within this session until the
announcements path is committed; the schema cost is one migration when built.

### 4.4 What stays out
- No institutional OAuth developer key (blueprint Part XI's explicit rejection).
- No auto-write of anything academic without confirmation (D9/D10 discipline extends to
  REST data wherever a matching heuristic sits between the API and the row).
- No `calendar_events` writes from REST (§2).

## 5. Credential gate — the ask, when it comes

1. **Canvas personal access token** — Canvas → Account → Settings → New access token.
2. **Canvas base URL** — the institution host, e.g. `https://<school>.instructure.com`.
3. **Per-user ICS URL** — Canvas Calendar → Calendar Feed. Connect it through the
   existing Brightspace ICS connect UI (§3 — it is the same pipeline).

Everything in §4.1–4.2 is buildable and offline-testable (documented Canvas REST shapes
as fixtures) without any of these. Live verification of the poll is the only thing the
token gates — same shape as the Anthropic key before SUPABASE_SETUP §7 ran.
