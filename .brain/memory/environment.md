# Verified Environment Facts

Verified by the Lead on the build machine. Re-verify if the machine changes.

## Toolchain
- Node v24.9.0 · npm 11.6.0 · bun 1.3.14 (no pnpm/yarn — use **npm workspaces**)
- Docker 29.7.2 — daemon must be running (`open -a Docker`)
- Supabase CLI 2.98.2
- psql 17 at `/opt/homebrew/opt/postgresql@17/bin/psql` (add to PATH)
- Playwright 1.62.1 available via npx
- iOS Simulators available: iPhone 17 Pro, iPhone 16 Pro, iPhone SE (3rd gen)

## Local Supabase stack (running, healthy)
| Service | URL |
|---|---|
| API | http://127.0.0.1:54321 |
| DB | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio | http://127.0.0.1:54323 |
| **Mailpit (test inbox)** | http://127.0.0.1:54324 |
| Functions | http://127.0.0.1:54321/functions/v1 |

Container name for direct psql: `supabase_db_college-app`
```bash
docker exec supabase_db_college-app psql -U postgres -d postgres -c "<sql>"
```

Keys are in `.env.local` (CLI demo keys — local only, not secret).

## Postgres 17.6 — extension availability (checked)
| Extension | Available | Installed |
|---|---|---|
| `pgtap` 1.3.3 | yes | no → **real RLS tests are possible locally** |
| `pg_net` 0.20.0 | yes | **yes** |
| `supabase_vault` 0.3.1 | yes | **yes** → encrypted OAuth token storage works locally |
| `pgcrypto` 1.3 | yes | **yes** |
| `pg_cron` 1.6.4 | yes | no → may need `shared_preload_libraries`; verify before relying on it |
| `pgsodium` 3.1.8 | yes | no |

**Consequence:** the RLS test suite and Vault-encrypted token storage can both be built and proven
locally rather than deferred to cloud. Mailpit means the real signup/confirmation email flow is
end-to-end testable without a cloud project.

## Corrections (found during L0 scaffolding)
- **iPhone 17 Pro simulator is DEAD** — `AC967333-3598-49DB-9E2D-0F8AB6AF73AA` fails with
  "Unable to boot deleted device" (stale/corrupt CoreSimulator record). **Use iPhone 16 Pro**
  (`3E76E929-3780-400D-AF3E-A058FC3A80C6`). Recreate the 17 Pro record with `xcrun simctl delete`
  when convenient — not blocking.
- `npx create-next-app` / `create-expo-app` hit a false-positive "path not writable" under the
  default sandbox. Run scaffolders with the sandbox disabled.
- **Never run native prebuild** (`expo run:ios`, `expo run:android`, `expo prebuild`). We stay in
  the managed workflow. Use `expo start --ios`. A prebuild killed mid-write once already and
  zeroed `apps/mobile/package.json`.
- Next 16 auto-generates `AGENTS.md`/`CLAUDE.md` into `apps/web` unless `agentRules: false` is set
  in `next.config` — it is set. Don't remove it; it duplicates the root CLAUDE.md.

## Dev servers (when running)
- web: http://localhost:3300 · Metro: http://localhost:8081
