# Generated — do not edit by hand

Every file in this directory is a mechanical, extension-fixed copy of `packages/core/src`
(see `scripts/build-core-for-deno.mjs` for exactly what the transform does — it appends
`.ts` to same-package relative imports and changes nothing else). The Supabase Edge
Runtime cannot resolve `packages/core`'s extensionless imports directly (confirmed live —
see decision D16 in `.brain/memory/decisions.md`), and `packages/core`'s source must stay
extensionless for Node/bundler consumers, so this mirror exists to give Deno a resolvable
copy of the same domain engine without a second, hand-maintained implementation.

**If you need to change domain logic, edit `packages/core/src`, not a file here.** Then:

```bash
npm run build:core-for-deno
```

`npm run verify` (`check:core-mirror`) fails loudly if this directory is stale relative to
`packages/core/src` — it does not auto-regenerate, on purpose: a stale mirror silently
diverges the nightly/weekly report's numbers from what the rest of the product computes
and displays, and that failure mode should never be quiet.
