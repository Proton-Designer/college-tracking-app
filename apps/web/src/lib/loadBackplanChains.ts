/**
 * DEPRECATED re-export. The real implementation moved to
 * `packages/api/src/planning/calendarView.ts` so mobile can call it too — it was only ever
 * here because nothing outside web had needed it yet, which is how two shells start
 * computing the same thing differently.
 *
 * Import `loadBackplanChains` from `@collegeos/api` directly. This file exists so the
 * move didn't have to land in the same commit as every call site, and should be deleted
 * once the last import of it is gone.
 */
export { loadBackplanChains, type BackplanChain } from "@collegeos/api";
