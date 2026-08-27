#!/usr/bin/env node
/**
 * One-command setup for a fresh clone, in either of the two ways this project can be run.
 *
 *   npm run bootstrap -- --cloud    against a real Supabase project. No Docker required.
 *   npm run bootstrap               against the local Docker stack (the original build setup).
 *
 * WHY THIS EXISTS: four `.env.local` files (root, apps/web, apps/mobile, supabase/) are
 * gitignored and therefore absent from every clone, and the commit-msg hook lives in
 * `.git/hooks`, which git does not track either. A new machine could clone this repo, run
 * `npm install`, and still have nothing that works -- with no error explaining why, because a
 * missing `NEXT_PUBLIC_SUPABASE_URL` surfaces as a runtime auth failure, not a build failure.
 * That is the exact "structurally correct, practically unreachable" shape this project has been
 * bitten by before.
 *
 * Idempotent: never overwrites an existing file unless `--force`, and never prints a key value.
 *
 * Flags:
 *   --cloud      configure against a hosted Supabase project instead of the local stack
 *   --force      regenerate the env files
 *   --no-start   (local mode) don't run `supabase start` if the stack is down
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLOUD = process.argv.includes("--cloud");
const FORCE = process.argv.includes("--force");
const NO_START = process.argv.includes("--no-start");

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const skip = (m) => console.log(`  \x1b[90m·\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

console.log(
  `\n\x1b[1mCollegeOS bootstrap\x1b[0m — ${CLOUD ? "cloud project (no Docker)" : "local Docker stack"}`,
);

// ── 1. Preflight ────────────────────────────────────────────────────────────
// Report every problem before exiting rather than failing on the first one -- someone setting up
// a new machine should get the whole list in one pass, not discover it one install at a time.
step("1. Checking prerequisites");
let blocked = false;

const version = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return r.status === 0 ? (r.stdout + r.stderr).trim().split("\n")[0] : null;
};

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor > 20 || (nodeMajor === 20 && nodeMinor >= 11)) {
  ok(`node ${process.versions.node}`);
} else {
  bad(`node ${process.versions.node} -- package.json requires >= 20.11.0`);
  blocked = true;
}

const npmV = version("npm", ["--version"]);
npmV ? ok(`npm ${npmV}`) : ((blocked = true), bad("npm not found"));

// Cloud still needs the CLI: `supabase link`, `db push`, `gen types --linked`, `secrets set`
// and `functions deploy` all go through it. It just doesn't need Docker behind it.
const supabaseV = version("supabase", ["--version"]);
if (supabaseV) {
  ok(`supabase CLI ${supabaseV}`);
} else {
  bad("supabase CLI not found -- `brew install supabase/tap/supabase`");
  blocked = true;
}

if (CLOUD) {
  // Deliberately NOT checked in cloud mode. Docker is only needed for the local stack, and
  // requiring it here is exactly the kind of inherited assumption that makes a setup doc wrong.
  skip("docker not required in cloud mode");
} else {
  // `docker info` rather than `docker --version`: the binary existing tells you nothing about
  // whether the daemon is up, and the daemon being down is the actual failure mode here.
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0) {
    ok("docker daemon running");
  } else {
    bad("docker daemon not running -- `open -a Docker` (macOS), then re-run");
    bad("  ...or if you work against a real Supabase project: npm run bootstrap -- --cloud");
    blocked = true;
  }
}

const psqlV = version("psql", ["--version"]);
psqlV
  ? ok(`psql ${psqlV}`)
  : warn("psql not on PATH -- optional; only needed for direct SQL against the database");

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
  if (spawnSync("npm", ["install"], { cwd: ROOT, stdio: "inherit" }).status !== 0) {
    bad("npm install failed");
    process.exit(1);
  }
  ok("npm install");
}

// ── 3. Mobile typed routes ──────────────────────────────────────────────────
// apps/mobile/.expo/types/router.d.ts is gitignored (it's derived, and its paths are
// machine-specific) but `npm run verify`'s mobile typecheck imports from it -- a fresh clone
// fails with 11 "cannot find module" errors before that file has ever been generated once.
// There's no one-shot Expo/EAS CLI command that produces it (`expo export` and `expo
// customize` don't touch this code path); only the dev server does, as a side effect of
// booting. So: start it detached, wait for the file to actually change, kill it.
step("3. Mobile typed routes");
{
  const routerTypesPath = join(ROOT, "apps", "mobile", ".expo", "types", "router.d.ts");
  // Existence alone proves nothing on an established machine -- the file can already be
  // there and stale from a previous run -- so wait for its mtime to advance past this.
  const mtimeBefore = existsSync(routerTypesPath) ? statSync(routerTypesPath).mtimeMs : null;

  const expoProc = spawn("npx", ["expo", "start", "--offline"], {
    cwd: join(ROOT, "apps", "mobile"),
    detached: true,
    stdio: "ignore",
  });

  // macOS has no `timeout` binary, so poll by hand rather than shelling out to one.
  const deadlineMs = Date.now() + 60_000;
  let regenerated = false;
  while (Date.now() < deadlineMs) {
    if (existsSync(routerTypesPath)) {
      const mtime = statSync(routerTypesPath).mtimeMs;
      if (mtimeBefore == null || mtime > mtimeBefore) {
        regenerated = true;
        break;
      }
    }
    await sleep(1000);
  }

  // A negative PID targets the whole process group `detached: true` put expoProc.pid at the
  // head of, not just the `npx` process -- Metro's watcher is a child of that, and a plain
  // SIGTERM to expoProc.pid alone would leave it running.
  try {
    process.kill(-expoProc.pid, "SIGTERM");
  } catch {
    /* already exited */
  }

  if (regenerated) {
    ok("apps/mobile/.expo/types/router.d.ts generated");
  } else {
    warn("timed out waiting for router.d.ts -- run `cd apps/mobile && npx expo start` once by hand");
  }
}

// ── 4. commit-msg hook ──────────────────────────────────────────────────────
// `.git/hooks` is not tracked by git, so this does not survive a clone and has to be reinstalled.
step("4. Git hook");
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

/**
 * Supabase has two key formats in circulation: legacy JWTs whose payload carries a `role`
 * claim, and the newer `sb_publishable_` / `sb_secret_` prefixed keys. Both are classified
 * here for one reason: pasting the secret key into `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships an
 * RLS-bypassing credential to every browser that loads the app. It would work perfectly in
 * testing -- that is what makes it dangerous. Refusing here is cheap; discovering it later is
 * a credential rotation and an audit.
 */
function classifyKey(key) {
  if (!key) return "missing";
  if (key.startsWith("sb_publishable_")) return "anon";
  if (key.startsWith("sb_secret_")) return "service_role";
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (payload.role === "anon") return "anon";
      if (payload.role === "service_role") return "service_role";
    } catch {
      /* not a JWT we understand -- fall through to "unknown" */
    }
  }
  return "unknown";
}

const ask = async (prompt) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
};

let vars;
let header;
let footer = "";

if (CLOUD) {
  // ── 4 (cloud). Project credentials ───────────────────────────────────────
  step("5. Supabase project credentials");
  console.log("     Supabase dashboard → Project Settings → API Keys, and → Database");

  // Sources in order: already-exported env, a .env file filled in from .env.example, then an
  // interactive prompt. Non-interactive callers (CI, an agent with no TTY) get instructions
  // rather than a hang.
  const fromFile = {};
  const dotenv = join(ROOT, ".env");
  if (existsSync(dotenv)) {
    for (const raw of readFileSync(dotenv, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(raw);
      if (m && m[2]) fromFile[m[1]] = m[2];
    }
    if (Object.keys(fromFile).length) skip(`read ${Object.keys(fromFile).length} values from .env`);
  }

  const resolveVar = async (name, { required, hint }) => {
    const found = process.env[name] || fromFile[name];
    if (found) {
      ok(`${name} (from ${process.env[name] ? "environment" : ".env"})`);
      return found;
    }
    if (!process.stdin.isTTY) {
      // Optional values are not errors when nobody is there to be asked -- only required ones.
      (required ? bad : skip)(`${name} not set. ${hint}`);
      return null;
    }
    return (await ask(`     ${name}${required ? "" : " (optional, Enter to skip)"}: `)) || null;
  };

  const url = await resolveVar("SUPABASE_URL", {
    required: true,
    hint: "Set it in the environment or in a .env file (copy .env.example).",
  });
  const anon = await resolveVar("SUPABASE_ANON_KEY", {
    required: true,
    hint: "The anon / publishable key. Set it in the environment or in .env.",
  });
  const serviceRole = await resolveVar("SUPABASE_SERVICE_ROLE_KEY", {
    required: false,
    hint: "Only needed to run the integration/E2E suites. Skip for app development.",
  });
  const dbUrl = await resolveVar("SUPABASE_DB_URL", {
    required: false,
    hint: "Only needed for direct psql. Skip otherwise.",
  });

  if (!url || !anon) {
    console.log(
      "\n\x1b[31mSUPABASE_URL and SUPABASE_ANON_KEY are both required.\x1b[0m\n" +
        "Provide them one of three ways:\n" +
        "  export SUPABASE_URL=... SUPABASE_ANON_KEY=...   then re-run\n" +
        "  cp .env.example .env && edit it                 then re-run\n" +
        "  run this in a terminal (not a script) and it will prompt\n",
    );
    process.exit(1);
  }

  // Validate before writing. A bad value written into four files is worse than a refusal.
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    bad(`SUPABASE_URL is not a valid URL: "${url}"`);
    process.exit(1);
  }
  if (["localhost", "127.0.0.1"].includes(host)) {
    bad(`SUPABASE_URL points at ${host} -- that is the local stack. Drop --cloud, or fix the URL.`);
    process.exit(1);
  }
  if (!url.startsWith("https://")) {
    bad(`SUPABASE_URL must be https for a hosted project. Got: ${url}`);
    process.exit(1);
  }
  ok(`project host ${host}`);

  const anonKind = classifyKey(anon);
  if (anonKind === "service_role") {
    bad("REFUSING: SUPABASE_ANON_KEY is a service_role / secret key.");
    console.log(
      "\n     That key bypasses Row Level Security. This script would write it into\n" +
        "     NEXT_PUBLIC_/EXPO_PUBLIC_ vars, which are inlined into the browser bundle and the\n" +
        "     app binary -- handing every user full read/write access to every account. It would\n" +
        "     work perfectly in testing. Use the anon / publishable key instead.\n",
    );
    process.exit(1);
  }
  if (anonKind === "anon") {
    ok("anon key looks like an anon/publishable key");
  } else {
    warn("could not classify the anon key -- confirm it is NOT the service_role/secret key");
  }

  if (serviceRole) {
    if (serviceRole === anon) {
      bad("SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are the same value.");
      process.exit(1);
    }
    if (classifyKey(serviceRole) === "anon") {
      bad("SUPABASE_SERVICE_ROLE_KEY looks like the anon key. The test suites would fail on RLS.");
      process.exit(1);
    }
    ok("service_role key recorded (root .env.local only -- never given to either app)");
  } else {
    skip("no service_role key -- integration and E2E suites won't run; app development is fine");
  }

  vars = {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anon,
    ...(serviceRole ? { SUPABASE_SERVICE_ROLE_KEY: serviceRole } : {}),
    ...(dbUrl ? { SUPABASE_DB_URL: dbUrl } : {}),
  };
  header = `# CLOUD PROJECT (${host}). Real credentials -- this file is gitignored, keep it that way.
# Generated by scripts/bootstrap.mjs. Regenerate: npm run bootstrap -- --cloud --force`;
  footer = `\n# Dashboard: https://supabase.com/dashboard/project/${host.split(".")[0]}`;
} else {
  // ── 4/5 (local). The Docker stack ────────────────────────────────────────
  step("5. supabase/.env.local");
  const cronPath = join(ROOT, "supabase", ".env.local");
  if (existsSync(cronPath) && !FORCE) {
    skip("already present (--force to regenerate)");
  } else {
    // Any value works locally; it only has to match between the cron job and the edge function.
    writeFileSync(cronPath, `CRON_SHARED_SECRET=${randomBytes(16).toString("hex")}\n`);
    ok("written with a fresh CRON_SHARED_SECRET");
  }

  step("6. Local Supabase stack");
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
    if (spawnSync("supabase", ["start"], { cwd: ROOT, stdio: "inherit" }).status !== 0) {
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

  // Parse only well-formed KEY="value" lines: this command's stdout also carries CLI update
  // notices and "Stopped services:" lines, and a naive split would write those as vars.
  const env = {};
  for (const raw of status.stdout.split("\n")) {
    const m = /^([A-Z0-9_]+)="(.*)"$/.exec(raw.trim());
    if (m) env[m[1]] = m[2];
  }
  const missing = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "DB_URL"].filter((k) => !env[k]);
  if (missing.length) {
    bad(`\`supabase status -o env\` did not report: ${missing.join(", ")}`);
    process.exit(1);
  }

  vars = {
    SUPABASE_URL: env.API_URL,
    SUPABASE_ANON_KEY: env.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: env.DB_URL,
  };
  header = `# LOCAL DEVELOPMENT ONLY — Supabase CLI default demo keys. Not secret, not for cloud.
# Generated by scripts/bootstrap.mjs. Regenerate: npm run bootstrap -- --force`;
  footer = `\n# Local dev mail UI (Mailpit): http://127.0.0.1:54324
# Local Studio: http://127.0.0.1:54323`;
}

// ── Env files ───────────────────────────────────────────────────────────────
// Three copies, not one: Next.js and Expo each load .env.local relative to their own app
// directory, and the root copy is what the scripts/ and test tooling read.
//
// The service_role key goes in the ROOT file only. Neither app runtime uses it -- the only
// consumers are packages/api/src/integration/testSupport.ts and
// apps/web/e2e/fixtures/supabase-admin.ts. Against a real project there is no reason for an
// RLS-bypassing key to sit in an app directory at all, so it doesn't.
step(`${CLOUD ? "6" : "7"}. Environment files`);

const kv = (k, v) => `${k}=${v}`;
const bodies = {
  ".env.local": [
    header,
    ...Object.entries(vars).map(([k, v]) => kv(k, v)),
    "",
    kv("NEXT_PUBLIC_SUPABASE_URL", vars.SUPABASE_URL),
    kv("NEXT_PUBLIC_SUPABASE_ANON_KEY", vars.SUPABASE_ANON_KEY),
    "",
    kv("EXPO_PUBLIC_SUPABASE_URL", vars.SUPABASE_URL),
    kv("EXPO_PUBLIC_SUPABASE_ANON_KEY", vars.SUPABASE_ANON_KEY),
    footer,
  ].join("\n"),
  "apps/web/.env.local": [
    header,
    kv("SUPABASE_URL", vars.SUPABASE_URL),
    kv("SUPABASE_ANON_KEY", vars.SUPABASE_ANON_KEY),
    "",
    kv("NEXT_PUBLIC_SUPABASE_URL", vars.SUPABASE_URL),
    kv("NEXT_PUBLIC_SUPABASE_ANON_KEY", vars.SUPABASE_ANON_KEY),
    footer,
  ].join("\n"),
  "apps/mobile/.env.local": [
    header,
    kv("EXPO_PUBLIC_SUPABASE_URL", vars.SUPABASE_URL),
    kv("EXPO_PUBLIC_SUPABASE_ANON_KEY", vars.SUPABASE_ANON_KEY),
    footer,
  ].join("\n"),
};

for (const [rel, body] of Object.entries(bodies)) {
  const p = join(ROOT, rel);
  if (existsSync(p) && !FORCE) {
    skip(`${rel} already present (--force to regenerate)`);
  } else {
    writeFileSync(p, `${body}\n`);
    ok(rel);
  }
}

const migrations = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) =>
  f.endsWith(".sql"),
).length;

// ── Done ────────────────────────────────────────────────────────────────────
if (CLOUD) {
  console.log(`
\x1b[1mSetup complete.\x1b[0m Next, in order:

  1. Link the CLI to the project
     supabase login
     supabase link --project-ref <PROJECT_REF>     # Project Settings → General

  2. Apply the schema -- ${migrations} migrations, the same ones proven locally
     supabase db push --dry-run                    # review before touching the database
     supabase db push
     supabase db diff --linked                     # expect: no differences

  3. Regenerate the typed client against the real project
     npm run db:types:cloud
     git diff --stat packages/api/src/database.types.ts    # expect: no change

  4. Confirm the code still builds and passes
     npm run verify                                # 383 tests; needs no database at all
                                                   # (check:demo-clean skips without a local stack)

  5. Edge Function secrets, then deploy
     supabase secrets set CRON_SHARED_SECRET=$(openssl rand -hex 16)
     supabase secrets set ANTHROPIC_API_KEY=...    # optional; without it the nightly report
                                                   # uses the deterministic fallback and says so
     supabase functions deploy

  6. Run the app against it
     npm run dev --workspace=@collegeos/web        # http://localhost:3000
     cd apps/mobile && npx expo start

\x1b[1;33mBefore anyone else uses this project, read docs/SUPABASE_SETUP.md §5.\x1b[0m
Four security items must be fixed, and none of them are optional:
  · Universal Links / App Links -- the \`collegeos://\` scheme is hijackable, and on a
    confirmation or reset link that means an attacker intercepting a session
  · Remove \`exp://127.0.0.1:8081/**\` from the redirect allow-list (development only)
  · Configure custom SMTP -- the built-in mailer is rate-limited and throttles silently
  · Redirect allow-list must use exact hosts, no wildcard origins

\x1b[1mLocal-only commands. These will NOT work against a cloud project:\x1b[0m
  npm run db:reset · db:start · db:test (pgTAP) · test:e2e · test:integration · make:test-user
Each needs the Docker stack and the seeded demo account. \`npm run verify\` does not.
There is no demo account in the cloud -- create a real one through the signup screen.

Read HANDOFF.md next -- §4 is Supabase, §8 is what remains, §10 is what keeps going wrong.
`);
} else {
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
}
