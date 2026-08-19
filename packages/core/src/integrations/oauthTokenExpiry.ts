/** Whether an OAuth access token is expired or close enough to expiring that it should
 *  be refreshed before use, rather than attempted and left to fail mid-request. Pure
 *  date math -- deterministic code calculates, per this repo's second law -- so the
 *  refresh decision itself is unit-testable without a real WHOOP token or clock mocking
 *  tricks inside an Edge Function. */
export function isTokenExpiringSoon(expiresAt: string | null, now: string, thresholdMinutes = 5): boolean {
  if (expiresAt === null) return false; // a token with no known expiry is never force-refreshed
  const expiresAtMs = new Date(expiresAt).getTime();
  const nowMs = new Date(now).getTime();
  return expiresAtMs - nowMs <= thresholdMinutes * 60 * 1000;
}
