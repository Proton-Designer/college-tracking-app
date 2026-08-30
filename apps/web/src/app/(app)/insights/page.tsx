import { permanentRedirect } from "next/navigation";

/**
 * M7 (docs/IHSAN_RECONCILIATION.md §4): Insights merged into Review — one destination for
 * "how am I doing" instead of two. The screen's contents now live in
 * `apps/web/src/app/(app)/review/page.tsx`; this route survives only as a redirect so that
 * bookmarks, the e2e route sweep, and any link still pointing here keep resolving.
 *
 * Done in the page rather than as a `redirects()` entry in `next.config.ts` for two reasons:
 * the rule belongs next to the thing it is about (a config entry would be the only trace of a
 * moved screen, three directories away from the screen), and `next.config.ts` is outside this
 * change's ownership. `permanentRedirect` and not `redirect` because this is a 308, not a 307
 * — the move is permanent and should be cached as such.
 *
 * `data.ts` and `actions.ts` stay in this directory: they are the production callers' import
 * path (`@/app/(app)/insights/{data,actions}`) for `@/components/insights/*`, and moving them
 * would edit component files this change does not own. `loadInsightsData` is now called by
 * `review/page.tsx`; the server actions are still called by ActiveExperiments, DecisionJournal
 * and InsightsList, and now revalidate `/review`.
 */
export default function InsightsPage(): never {
  permanentRedirect("/review");
}
