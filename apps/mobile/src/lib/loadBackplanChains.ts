/**
 * DEPRECATED re-export. The implementation moved to
 * `packages/api/src/planning/calendarView.ts`.
 *
 * This file and its web twin were hand-maintained copies of the same function — the web
 * one's comment said it mirrored this one, and this one's said it mirrored that. Two
 * mirrors, no original. It now resolves to the single shared implementation.
 *
 * Import `loadBackplanChains` from `@collegeos/api` directly; delete this once nothing
 * imports it.
 */
export { loadBackplanChains, type BackplanChain } from "@collegeos/api";
