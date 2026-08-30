# Ihsan — Connection Checklist

> **Everything that has to be plugged in, in the order to do it.** The build ran to completion with
> no credentials, no connections and no personal content, because that was the directive. This is
> the list of what is missing and the sequence that makes each step possible.
>
> Ordering rule: each step's prerequisites are above it. Steps marked **[Ayman]** were deliberately
> left for him and are not blocked on Kareem.
>
> Nothing here is a bug. Every item is a first-run state the app renders honestly — an unset prayer
> location shows "Set your location in Settings", not 5:00 AM (D40).

---

## Stage 0 — Before anything else: get the schema onto the database

Nothing below works until this is done, and it needs a machine with the Supabase credentials.
**This machine has neither Docker nor Supabase credentials**, so no migration in this build has ever
touched a database.

> ## ✅ Stage 0 is DONE (2026-08-30)
>
> Migrations 48–65 are **applied** to `jcikqbxwjmdduwprixpy`, and the types are **regenerated**.
> The regeneration found two real transcription errors, which is what it was for — a phantom
> `sunnah_slot` on `task_sessions` and a missing `llm_usage_log.provider`. Both are fixed; all
> gates pass against the regenerated file; the live database reports **108 tables, 0 without RLS**.
>
> The remote was at **47**, not 46 — migration 47 had already been applied at some point, so the
> earlier "47 is pending" note in this file and in `PENDING_DB_CHANGES.md` was wrong.
>
> Kept below as the record of what was done and how to redo it on a fresh project.

| # | Do | Why / notes |
|---|---|---|
| 0.1 | `supabase migration list` | Confirm the last **remote** migration is `46`. Migration **47** (LLM budget upper clamp) was written before this build and is still unapplied — see `docs/PENDING_DB_CHANGES.md`. |
| 0.2 | `supabase db push` | Applies **47 through 65**: the budget clamp, session type + domain, profile life settings, pgvector, Deen, Fitness, Work + weekly goals, Learn, embeddings usage, Desired Self, allocation check-ins, global distractions, the sources bucket + ingest cron, progressive availability + `card_states`, the vision chain, drift confrontation, Goal Ecology, screen time, and the screen-time storage bucket. |
| 0.3 | **`npm run db:types:cloud`** | ⚠️ **Required, not optional.** `packages/api/src/database.types.ts` was **hand-extended** during this build because `db:types` needs a live database. Every field was cross-checked against its migration by hand, but a real regeneration is the only thing that proves it. Do this before trusting a type. |
| 0.4 | `npm run verify` | Must exit 0 against the regenerated types. A mismatch here is a hand-transcription error, and this is where it surfaces. |
| 0.5 | Verify pgvector | Migration 50 enables it. On hosted Supabase this may instead need Dashboard → Database → Extensions, exactly as migration 1 notes for pgtap. |
| 0.6 | **[Ayman]** First Docker session: `npm run db:reset && npm run db:test` | pgTAP over all 65 migrations. The RLS record for everything since migration 34 is live anon probes plus psql role-simulation — both passed, both weaker than pgTAP. This is the oldest debt in the repo. |

---

## Stage 1 — Make the app yours (Kareem, ~15 minutes in the UI)

No credentials needed. These are the settings that turn honest empty states into a working app, and
**each is per-user** (D39) — Ayman and Rayan each do their own.

| # | Where | What | What it unlocks |
|---|---|---|---|
| 1.1 | Settings → Prayer | **Location** (label + latitude/longitude), **calculation method**, **Asr madhab** | Everything in Deen. Until this is set, prayer times are not computable, every prayer resolves to `pending`, and nothing is ever derived as missed — by design. |
| 1.2 | Settings → Prayer | Existing **qada owed** (the pre-app debt you hand-tracked) | Seeds the backlog total. Kept separate from what the app derives, because the app cannot verify it. |
| 1.3 | Settings | **Timezone**, if not already correct | Every local-day boundary in the schema depends on it. |
| 1.4 | Settings → Baselines | Per-weekday **Hour baselines** | Day Won means nothing until the baseline fits your real schedule. |
| 1.5 | Settings → Signal | **Signal domains** (default: all five) | Narrow it to Deen + Business if you want LifeOS's original priority lens. This is D38 — it is your setting, not a law. |
| 1.6 | Settings → Learn | **Daily new-lesson limit** (default 3), **desired retention** (default 0.90), notification time | Notification time is null by default: the app does not notify before being asked to. |
| 1.7 | Fitness | Create a **plan** and its sessions; log a first **body metric** | The three LifeOS starter plans deliberately did not port — they encode one person's targets (D39). |
| 1.8 | Self | Create your **dimensions** and write each one's definition | Not seeded. The suggested five (Physique · Deen · Work/Craft · Focus · Traits) are offered as one-tap adds; nothing is inserted for you. |
| 1.9 | Self → Routing | Confirm the **routing map** — which acts feed which dimension | Until a route exists, an act is simply unrouted; nothing invents a destination for it. |
| 1.10 | Self | Optionally set a **ceiling** on Focus and Physique | Overshoot cannot fire without one (D35). Leave the rest unset. |
| 1.11 | Self → each dimension | Optionally write the **drift statement** — who you become in ten years if this keeps being neglected, first person, present tense | D50. Nothing fires for a dimension without one: **the statement itself is the opt-in.** The app never writes, rewrites or summarises this text; a confrontation quotes it verbatim and adds nothing. Rate-limited to once every three days, always followed by a door, and switchable off per dimension in one tap. |
| 1.12 | Vision | Write the **10-Year Vision**, then the 3-Year Beachhead, 1-Year Mission and 90-Day M.O.M. | D48. Each links upward by a nullable FK — an MIT that traces to nothing is reported as unanchored, never as a failure. Write the vision first; the layers below only mean something under one. |
| 1.13 | Goals | Mark the **relationships** between your active goal pairs — competing / neutral / synergistic | D49. An unmarked pair stays unmarked rather than defaulting to neutral, so the "examined" share tells you the truth about how much you have actually considered. |
| 1.14 | Cards | Add an **Enemy** card or two | The End-of-Hour rotation can now show what you are running from beside what you are running toward. |

---

## Stage 2 — Canvas (Kareem, ~10 minutes) — still owed from the last handover

This was the top item on the previous handover and has never been done. Your token verified good
(200 against uta.instructure.com) but the connection needs your own session.

| # | Do | Notes |
|---|---|---|
| 2.1 | Create the three real course rows; archive the test course (local course id 1 looks like fixture data) | `docs/VALIDATION_PLAN.md` §3 has the detail. |
| 2.2 | Settings → Canvas → connect with the personal access token | Token goes to Vault, never to a table. |
| 2.3 | Map each Canvas course → app course (human-confirmed) | Deliberately not automatic. |
| 2.4 | Run a first sync | Lights up the hourly announcements poll and staged grades. |

---

## Stage 3 — The embeddings key (the one new credential this build added)

⚠️ **Anthropic ships no embeddings API.** The Learn pillar's pgvector plan needs a second vendor,
and the directive did not list one because nobody had noticed.

| # | Do | Notes |
|---|---|---|
| 3.1 | Create a **Voyage AI** account and key (`voyage-3.5-lite`, 1024 dims) | Recommended over OpenAI: Anthropic-recommended, and pennies per book. |
| 3.2 | Set `VOYAGE_API_KEY` as an Edge Function secret | Server-side only, like every other key here. |
| 3.3 | Run the embedding backfill for any source already ingested | Only needed if you ingest before setting the key. |
| 3.4 | Note the privacy consequence | Source text now flows to a second processor. Same server-side-only rules apply; worth a conscious yes rather than a default. |

**Until this is set, nothing breaks.** Ingestion completes, chunks and lessons store with a null
embedding, and near-duplicate detection in the merge pass falls back to lexical similarity. That is
D41: the absent-key path is a real, tested state rather than an error, so no code path gets
exercised for the first time on the day the key arrives.

---

## Stage 4 — Raise the LLM budget, then validate the cost

| # | Do | Notes |
|---|---|---|
| 4.1 | **Raise the monthly ceiling from $5 to $25** (Settings → LLM budget) | Built to $25 expectations; the ceiling was deliberately left at $5 so nothing could spend against an assumption. The DB clamp allows up to $200. |
| 4.2 | Ingest **three real books** and read `ingest_jobs.cost_usd` on each | The brief's M1 exit test. Target $0.50–$1.50 per 300-page book. **Validate before optimising anything.** |
| 4.2b | ⚠️ **Watch the per-book cost against the brief's ceiling** | Card generation added one Sonnet call per surviving lesson, taking a 300-page book from ~$1.27 to **~$1.49** at post-2026-09-01 rates — inside the brief's $0.50–$1.50 band with **under 2¢ of headroom**. If a real book confirms it, the lever is Haiku for card writing (~⅓ the cost). Deliberately not taken unilaterally: the card is what the whole retention thesis rests on. |
| 4.3 | Re-set the ceiling against the real numbers | $25 covers three validation books, then ~8–10 ingestions a month plus grading assists (<$1/mo) and the existing crons, with honest headroom. If a book comes in at $3, the tiering needs work before the ceiling does. |
| 4.4 | Rate a lesson set | The brief's real bar: at least 8/10 useful, every lesson traceable to its passage. |

Note: Sonnet's price step on 2026-09-01 is already encoded in `_shared/llm/costs.ts`.

---

## Stage 5 — Content you supply

| # | What | Notes |
|---|---|---|
| 5.1 | Your **own books** for Learn | The pipeline was tested against a public-domain PDF, deliberately — none of your library was used. |
| 5.2 | Cards, goals, habits, worries | Nothing was seeded. Every empty state explains what it is for. |
| 5.3 | A first **lecture import** | Deepgram key is already set; the first live transcription has still never run (`VALIDATION_PLAN` §11). |
| 5.4 | Your **weekly Screen Time screenshot**, each Sunday | D51. Settings → Screen Time on iOS, screenshot the week, upload it in the Sunday review. It parses → stages → **you confirm**; anything unreadable becomes a field you fill, never an invented number. A missed week is a gap in the series, not a broken streak. |

---

## Stage 6 — **[Ayman]** Deliberately left, with clean seams

None of these were built toward. Each is listed with exactly what it needs.

| # | Item | What it needs | Where the seam is |
|---|---|---|---|
| 6.1 | **L1 — Universal Links** | The Ihsan **domain**, then AASA + assetlinks served from it | `docs/universal-links/` has the three blanks. **Register the domain early** — it is the only rename artifact with lead time, and both L1 and SMTP queue behind it (D43). |
| 6.2 | **L2 — redirect cleanup** | Dashboard: add `https://<domain>/auth/callback`, then remove `exp://127.0.0.1:8081/**` and later `collegeos://**` | A **cutover step, not a hotfix** — removing L2 earlier breaks the Expo Go dev loop's auth returns. |
| 6.3 | **L3 — SMTP** | A provider (Resend/Postmark/SES) + DNS | Before any real user depends on a confirmation email. |
| 6.4 | **App Store Connect + TestFlight** | Kareem's Apple ID, an Apple Developer Program membership | ⚠️ **The bundle id is permanent at first submission and is still deliberately unset.** It must be born as an Ihsan identifier. The Expo `slug` binds on first `eas build`. Same for the deep-link scheme. All of it is one commit (D43). |
| 6.5 | **WHOOP** | Register a developer app → client id/secret + webhook secret | Code is built and offline-proven; no new code expected. Feeds Physique's overshoot signal when present. |
| 6.6 | **pgTAP** | Any machine with Docker | See 0.6. |
| 6.7 | **Google OAuth** | A client id/secret | Schema already anticipates it (`oauth_connections.provider` includes `google_calendar`). No sync function exists. |

---

## Stage 7 — Run the validation pass

`docs/VALIDATION_PLAN.md` — on-device, organised by feature. It has **never been run**, and now
covers the merged app rather than only the pre-merge one. Do this after Stage 1 and Stage 2, so the
surfaces have real data to be wrong about.

---

## Appendix — credentials that already exist

Set in the cloud project; no values live in this repo.

| Credential | State |
|---|---|
| `ANTHROPIC_API_KEY` | Set, live-verified end to end. Do not re-set. **Now load-bearing for Learn**: D45 rules that lesson extraction refuses rather than degrading without it, because the keyless path measured 3/10 on a real book. Triage, merge clustering and cloze cards keep a deterministic floor. |
| `DEEPGRAM_API_KEY` | Set. First live transcription still pending. |
| `CRON_SHARED_SECRET` | Set; edge secret and Vault value match. |
| Vault: `edge_functions_base_url`, `edge_functions_anon_key` | Set. The three cron jobs are registered and active. |
| `VOYAGE_API_KEY` | **Missing — Stage 3.** |
| WHOOP / RescueTime token slots | Empty. |

In Kareem's vault, supplied on request: Canvas personal access token (verified good), the per-user
Canvas ICS URL, the database password, and the Anthropic/Deepgram originals.
