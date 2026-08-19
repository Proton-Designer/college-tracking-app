#!/usr/bin/env node
/**
 * Guards against working, tested code being unreachable from a package's public entry
 * points. Happened twice this session: getNightReviewDraft/getPredictionForDate (L7),
 * then agentReports/summaries/insights (also L7) -- both times real, verified code sat
 * in `packages/api/src/**` with no path from `@collegeos/api`, caught only when a
 * consumer tried to import it (once, that blocked Nova for hours).
 *
 * Walks packages/api/src/** and packages/core/src/** , finds every top-level exported
 * symbol, and fails if any isn't re-exported from that package's real entry points
 * (package.json's "exports" map -- not just index.ts, since packages/api also has
 * ./web and ./native subpath entry points).
 *
 * Opt-out: a `@barrel-internal` comment on the line directly above an export excludes
 * it -- for genuinely internal helpers (e.g. data/types.ts's dataOk/dataErr, used only
 * by sibling data/ modules, never meant as public API).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';

const PACKAGES = [
  {
    name: '@collegeos/api',
    root: 'packages/api',
    entryPoints: ['src/index.ts', 'src/platform/web.ts', 'src/platform/native.ts'],
    // Tests, not library modules -- nothing in here is meant to be imported by a consumer.
    excludeDirs: ['integration'],
  },
  {
    name: '@collegeos/core',
    root: 'packages/core',
    entryPoints: ['src/index.ts'],
    excludeDirs: [],
  },
];

const EXPORT_DECL = /^export\s+(?:async\s+)?(?:function|const|interface|type|class)\s+([A-Za-z_$][\w$]*)/;
const REEXPORT_GROUP = /export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gs;
const WILDCARD_REEXPORT = /export\s+\*\s+from\s*["']([^"']+)["']/g;

function extractTopLevelExportNames(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const names = [];
  for (const line of content.split('\n')) {
    const match = line.match(EXPORT_DECL);
    if (match) names.push(match[1]);
  }
  return names;
}

function resolveRelativeImport(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Follows both named (`export { a, b } from`) and wildcard (`export * from`)
 *  re-exports, recursively -- a barrel commonly chains through several files
 *  (index.ts -> module.ts -> submodule.ts), and packages/core's barrel is entirely
 *  wildcard re-exports, so treating only named-list exports as "reachable" would
 *  falsely flag its entire public surface. */
function collectReachableNames(entryFilePaths) {
  const names = new Set();
  const visited = new Set();

  function visit(filePath) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      return; // an entry point that doesn't exist yet isn't this script's problem to report
    }

    for (const match of content.matchAll(REEXPORT_GROUP)) {
      for (const rawName of match[1].split(',')) {
        const trimmed = rawName.trim();
        if (!trimmed) continue;
        // `export { foo as bar }` -- the LOCAL (pre-"as") name is what a source file
        // actually declares; that's what we're checking reachability of.
        const localName = trimmed.split(/\s+as\s+/i)[0].trim();
        if (localName) names.add(localName);
      }
    }

    for (const match of content.matchAll(WILDCARD_REEXPORT)) {
      const resolved = resolveRelativeImport(filePath, match[1]);
      if (!resolved) continue;
      // Every top-level export of the wildcard-re-exported module is reachable...
      for (const name of extractTopLevelExportNames(resolved)) names.add(name);
      // ...and if THAT module itself re-exports further (a deeper barrel chain), follow it too.
      visit(resolved);
    }
  }

  for (const entry of entryFilePaths) visit(entry);
  return names;
}

function walkSourceFiles(dir, excludeDirs, entryPointAbsPaths, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (excludeDirs.includes(entry)) continue;
      walkSourceFiles(full, excludeDirs, entryPointAbsPaths, out);
    } else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.itest.ts') &&
      entry !== 'database.types.ts' &&
      !entryPointAbsPaths.has(full)
    ) {
      out.push(full);
    }
  }
  return out;
}

/** True if the contiguous block of comment lines directly above `index` (walking
 *  upward through //-lines and /** ... *\/ blocks) contains the opt-out marker
 *  anywhere in it -- a marker doesn't have to be on the single immediately-preceding
 *  line, since real doc comments here commonly wrap to two or more lines. */
function hasBarrelInternalMarkerAbove(lines, index) {
  let i = index - 1;
  while (i >= 0) {
    const line = lines[i].trim();
    if (line.includes('@barrel-internal')) return true;
    if (line === '' || line.startsWith('//') || line.startsWith('*') || line.startsWith('/**') || line.endsWith('*/')) {
      i--;
      continue;
    }
    break; // hit a non-comment, non-blank line -- the comment block ends here
  }
  return false;
}

function findUnreachableExports(filePath, reachableNames) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const unreachable = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(EXPORT_DECL);
    if (!match) continue;
    const name = match[1];
    if (lines[i].includes('@barrel-internal') || hasBarrelInternalMarkerAbove(lines, i)) continue;
    if (!reachableNames.has(name)) unreachable.push(name);
  }
  return unreachable;
}

let hasFailure = false;

for (const pkg of PACKAGES) {
  const entryAbsPaths = pkg.entryPoints.map((p) => join(pkg.root, p));
  const reachableNames = collectReachableNames(entryAbsPaths);
  const sourceFiles = walkSourceFiles(join(pkg.root, 'src'), pkg.excludeDirs, new Set(entryAbsPaths));

  const findingsByFile = new Map();
  for (const filePath of sourceFiles) {
    const unreachable = findUnreachableExports(filePath, reachableNames);
    if (unreachable.length > 0) findingsByFile.set(filePath, unreachable);
  }

  if (findingsByFile.size > 0) {
    hasFailure = true;
    console.error(`✗ ${pkg.name}: exported symbols unreachable from its public entry point(s)\n`);
    for (const [filePath, names] of findingsByFile) {
      console.error(`  ${relative(process.cwd(), filePath)}`);
      for (const name of names) console.error(`    - ${name}`);
    }
    console.error(
      `\nRe-export these from ${pkg.entryPoints.join(' / ')}, or mark them ` +
        `@barrel-internal (on the line above the export) if they're genuinely only meant ` +
        `for sibling modules within the package.\n`,
    );
  }
}

if (hasFailure) process.exit(1);
console.log('✓ every public export is reachable from its package entry point');
