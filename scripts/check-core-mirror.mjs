#!/usr/bin/env node
/**
 * Guards D16 (supabase/functions/_shared/core is a generated mirror of packages/core,
 * not a second source of truth).
 *
 * A stale mirror means the nightly/weekly edge functions compute risk scores and grade
 * projections with DIFFERENT domain logic than the apps display -- two implementations
 * of the risk engine, diverging silently, surfacing as "why does my report disagree with
 * my Today screen?" months later. That is worse than the .js-import bug and the
 * silently-skipping test suite this project already hit tonight, both caught by exactly
 * this kind of guard.
 *
 * Snapshots the mirror's current file contents, regenerates it, and diffs the two
 * snapshots directly -- not via `git status`, which would false-positive on a mirror
 * that's correct but simply hasn't been committed yet (exactly this repo's state
 * tonight). Fails loudly on any difference; never auto-regenerates and moves on, since
 * that would hide drift and could silently pull an unreviewed packages/core change into
 * the deployed edge path.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MIRROR_ROOT = 'supabase/functions/_shared/core';

function snapshot(dir) {
  const files = new Map();
  function walk(current) {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      files.set(full, readFileSync(full, 'utf8'));
    }
  }
  walk(dir);
  return files;
}

const before = snapshot(MIRROR_ROOT);

try {
  execFileSync(process.execPath, ['scripts/build-core-for-deno.mjs'], { stdio: 'pipe' });
} catch (err) {
  console.error('Failed to regenerate the core mirror for comparison:\n', err.message);
  process.exit(1);
}

const after = snapshot(MIRROR_ROOT);

const allPaths = new Set([...before.keys(), ...after.keys()]);
const differences = [];
for (const path of allPaths) {
  if (before.get(path) !== after.get(path)) differences.push(path);
}

if (differences.length > 0) {
  console.error(
    `✗ ${MIRROR_ROOT} is stale relative to packages/core/src -- ${differences.length} file(s) differ:\n` +
      differences.map((p) => `  ${p}`).join('\n') +
      '\n\n' +
      'This mirror is generated, not hand-maintained -- see its README.md or ' +
      'scripts/build-core-for-deno.mjs. A stale mirror means the nightly/weekly edge ' +
      'functions compute risk scores and grade projections with DIFFERENT domain logic ' +
      "than the rest of the product, diverging silently.\n\n" +
      'This check just regenerated the mirror in place to compare -- that regeneration IS ' +
      'the fix. Review the change (`git diff -- ' +
      MIRROR_ROOT +
      '` if this repo has a prior commit to diff against) and commit it alongside whatever ' +
      'packages/core change caused it.\n',
  );
  process.exit(1);
}

console.log(`✓ ${MIRROR_ROOT} matches packages/core/src`);
