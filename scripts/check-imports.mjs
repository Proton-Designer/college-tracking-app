#!/usr/bin/env node
/**
 * Guards D4 (all internal packages are source-resolved).
 *
 * With no dist step, a relative import written as './types.js' typechecks fine —
 * TS `moduleResolution: "bundler"` remaps .js -> .ts for type purposes only — but the
 * real bundlers (Turbopack, Metro) look for a literal .js file, don't find one, and fail.
 * That gap let an unbuildable web app pass `npm run verify` once. It cannot again.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['packages'];
const OFFENDER = /(?:from|import)\s*\(?\s*['"](\.[^'"]*\.js)['"]/g;
const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (!/\.(ts|tsx|mts)$/.test(entry)) continue;
    const src = readFileSync(full, 'utf8');
    for (const m of src.matchAll(OFFENDER)) {
      const line = src.slice(0, m.index).split('\n').length;
      violations.push(`${full}:${line}  ${m[1]}`);
    }
  }
}

for (const root of ROOTS) { try { walk(root); } catch {} }

if (violations.length) {
  console.error(`\n✗ ${violations.length} relative import(s) with a .js extension in source-resolved packages:\n`);
  for (const v of violations) console.error('  ' + v);
  console.error(`\nInternal packages are source-resolved (see .brain/memory/decisions.md D4).`);
  console.error(`Use extensionless relative imports: './types', not './types.js'.`);
  console.error(`These typecheck but break Turbopack and Metro at build time.\n`);
  process.exit(1);
}
console.log('✓ import extensions ok');
