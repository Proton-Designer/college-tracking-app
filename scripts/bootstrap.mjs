#!/usr/bin/env node
/**
 * One-command setup for a fresh clone.
 *
 * WHY THIS EXISTS: four `.env.local` files (root, apps/web, apps/mobile, supabase/) are
 * gitignored and therefore absent from every clone, and the commit-msg hook lives in
 * `.git/hooks`, which git does not track either. A new machine could clone this repo, run
 * `npm install`, and still have nothing that works -- with no error explaining why, because a
 * missing `NEXT_PUBLIC_SUPABASE_URL` surfaces as a runtime auth failure, not a build failure.
 * That is the exact "structurally correct, practically unreachable" shape this project has been
 * bitten by before.
 *
 * This script is idempotent: it never overwrites an existing file unless `--force` is passed,
 * and it never prints a key value.
 *
 *   node scripts/bootstrap.mjs            # set up whatever is missing
 *   node scripts/bootstrap.mjs --force    # regenerate the env files from the running stack
 *   node scripts/bootstrap.mjs --no-start # don't run `supabase start` if the stack is down
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCE = process.argv.includes("--force");
const NO_START = process.argv.includes("--no-start");

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const skip = (m) => console.log(`  \x1b[90m·\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

let blocked = false;

// ── 1. Preflight ────────────────────────────────────────────────────────────
// Report every problem before exiting rather than failing on the first one -- someone setting up
// a new machine should get the whole list in one pass, not discover it one install at a time.
step("1. Checking prerequisites");

const version = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return r.status === 0 ? (r.stdout + r.stderr).trim().split("\n")[0] : null;
};

const nodeMajor = Number(process.versions.node.split(".")[0]);
const nodeMinor = Number(process.versions.node.split(".")[1]);
if (nodeMajor > 20 || (nodeMajor === 20 && nodeMinor >= 11)) {
  ok(`node ${process.versions.node}`);
} else {
  bad(`node ${process.versions.node} -- package.json requires >= 20.11.0`);
  blocked = true;
}

const npmV = version("npm", ["--version"]);
npmV ? ok(`npm ${npmV}`) : (bad("npm not found"), (blocked = true));

const supabaseV = version("supabase", ["--version"]);
if (supabaseV) {
  ok(`supabase CLI ${supabaseV}`);
} else {
  bad("supabase CLI not found -- `brew install supabase/tap/supabase`");
  blocked = true;
}

// `docker info` rather than `docker --version`: the binary existing tells you nothing about
// whether the daemon is up, and the daemon being down is the actual failure mode here.
const dockerUp = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
if (dockerUp) {
  ok("docker daemon running");
} else {
  bad("docker daemon not running -- `open -a Docker` (macOS), then re-run");
  blocked = true;
}

// Not blocking: only needed for direct psql, and `docker exec supabase_db_... psql` is the
// documented fallback that always works.
version("psql", ["--version"])
  ? ok(`psql ${version("psql", ["--version"])}`)
  : warn(
      "psql not on PATH -- optional; use `docker exec supabase_db_college-app psql -U postgres -d postgres`",
    );

if (blocked) {
  console.log("\n\x1b[31mFix the items marked ✗ above, then re-run.\x1b[0m\n");
  process.exit(1);
}

// ── 2. Dependencies ─────────────────────────────────────────────────────────
step("2. Dependencies");
if (existsSync(join(ROOT, "node_modules"))) {
  skip("node_modules present -- run `npm install` yourself if package.json changed");
} else {
  console.log("     installing (npm workspaces -- not pnpm, not yarn)...");
  const r = spawnSync("npm", ["install"], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    bad("npm install failed");
    process.exit(1);
  }
  ok("npm install");
}

// ── 3. commit-msg hook ──────────────────────────────────────────────────────
// `.git/hooks` is not tracked by git, so this does not survive a clone and has to be reinstalled.
step("3. Git hook");
const HOOK = `#!/bin/sh
# Repo-owner policy: commits are attributed to the repository owner only.
# Strips assistant attribution trailers regardless of which local agent authors the commit,
# so attribution stays uniform across a shared working tree.
# Installed by scripts/bootstrap.mjs -- .git/hooks is untracked, so it does not survive a clone.
perl -ni -e 'print unless /^Co-Authored-By: Claude/ || m{^Claude-Session: https://claude\\.ai/code/}' "$1"
perl -0pi -e 's/\\n{2,}\\z/\\n/' "$1"
exit 0
`;
const hookDir = join(ROOT, ".git", "hooks");
if (!existsSync(join(ROOT, ".git"))) {
  skip("not a git working tree -- skipping hook");
} else if (existsSync(join(hookDir, "commit-msg")) && !FORCE) {
  skip("commit-msg hook already installed (--force to rewrite)");
} else {
  mkdirSync(hookDir, { recursive: true });
  writeFileSync(join(hookDir, "commit-msg"), HOOK);
  chmodSync(join(hookDir, "commit-msg"), 0o755);
  ok("commit-msg hook installed");
}

// ── 4. supabase/.env.local ──────────────────────────────────────────────────
step("4. supabase/.env.local");
const cronPath = join(ROOT, "supabase", ".env.local");
if (existsSync(cronPath) && !FORCE) {
  skip("already present (--force to regenerate)");
} else {
  // Any value works locally; it only has to match between the cron job and the edge function.
  writeFileSync(cronPath, `CRON_SHARED_SECRET=${randomBytes(16).toString("hex")}\n`);
  ok("written with a fresh CRON_SHARED_SECRET");
}

// ── 5. The local stack ──────────────────────────────────────────────────────
step("5. Local Supabase stack");
const statusEnv = () =>
  spawnSync("supabase", ["status", "-o", "env"], { cwd: ROOT, encoding: "utf8" });

let status = statusEnv();
if (status.status !== 0) {
  if (NO_START) {
    warn("stack is down and --no-start was passed -- run `npm run db:start`, then re-run this");
    process.exit(0);
  }
  console.log(
    "     stack is down; starting it (first run pulls images -- this can take minutes)...",
  );
  const started = spawnSync("supabase", ["start"], { cwd: ROOT, stdio: "inherit" });
  if (started.status !== 0) {
    bad("`supabase start` failed -- see the output above");
    process.exit(1);
  }
  status = statusEnv();
  if (status.status !== 0) {
    bad("stack started but `supabase status` still fails");
    process.exit(1);
  }
}
ok("stack is up");

// ── 6. The three app .env.local files ───────────────────────────────────────
// Parse only well-formed KEY="value" lines: this command's stdout also carries CLI update
// notices and "Stopped services:" lines, and a naive split would happily write those as vars.
step("6. Environment files");
const env = {};
for (const line of status.stdout.split("\n")) {
  const m = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const required = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "DB_URL"];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  bad(`\`supabase status -o env\` did not report: ${missing.join(", ")}`);
  process.exit(1);
}

const ENV_BODY = `# LOCAL DEVELOPMENT ONLY — Supabase CLI default demo keys. Not secret, not for cloud.
# Generated by scripts/bootstrap.mjs. Regenerate: npm run bootstrap -- --force
SUPABASE_URL=${env.API_URL}
SUPABASE_ANON_KEY=${env.ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${env.SERVICE_ROLE_KEY}
SUPABASE_DB_URL=${env.DB_URL}

NEXT_PUBLIC_SUPABASE_URL=${env.API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${env.ANON_KEY}

EXPO_PUBLIC_SUPABASE_URL=${env.API_URL}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${env.ANON_KEY}

# Local dev mail UI (Mailpit): http://127.0.0.1:54324
# Local Studio: http://127.0.0.1:54323
`;

// Three copies, not one: Next.js and Expo each load .env.local relative to their own app
// directory, and the root copy is what the scripts/ tools read.
for (const rel of [".env.local", "apps/web/.env.local", "apps/mobile/.env.local"]) {
  const p = join(ROOT, rel);
  if (existsSync(p) && !FORCE) {
    skip(`${rel} already present (--force to regenerate)`);
  } else {
    writeFileSync(p, ENV_BODY);
    ok(rel);
  }
}

// ── 7. Schema ───────────────────────────────────────────────────────────────
step("7. Schema and seed");
const migrations = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) =>
  f.endsWith(".sql"),
).length;
skip(`${migrations} migrations on disk`);
console.log("     run `npm run db:reset` to apply them + seed.sql (this DROPS local data)");

// ── Done ────────────────────────────────────────────────────────────────────
console.log(`
\x1b[1mSetup complete.\x1b[0m Next:

  npm run db:reset     apply ${migrations} migrations + seed.sql, refresh Kong
  npm run db:types     regenerate packages/api/src/database.types.ts
  npm run verify       4 guards → typecheck → lint → tests. Must exit 0.
  npm run db:test      pgTAP (RLS + constraints)

Then, in separate terminals:

  supabase functions serve --env-file ./.env.local     edge runtime -- NOT part of db:start
  npm run dev --workspace=@collegeos/web               http://localhost:3000
  cd apps/mobile && npx expo start                     simulator / device

Demo account: demo@collegeos.app / CollegeOS-Demo-2026  (read from it; write against
\`npm run make:test-user\`).

Note: EXPO_PUBLIC_SUPABASE_URL points at 127.0.0.1, which a simulator can reach but a
physical phone cannot. For a real device, swap it for your machine's LAN IP.

Read HANDOFF.md next -- §3 is this setup, §8 is what remains, §10 is what keeps going wrong.
`);
