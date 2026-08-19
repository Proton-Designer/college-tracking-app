// A scriptable fake WhoopOAuthProvider for offline, no-key, no-cost tests. Never makes a
// network call. Mirrors _shared/llm/__fixtures__/fixtureProvider.ts's shape.

import type { WhoopOAuthProvider, WhoopTokenResponse } from "../types.ts";

export interface FixtureWhoopOptions {
  tokenResponse?: WhoopTokenResponse;
  externalUserId?: string;
  /** Throws on the next call instead of returning, to exercise error paths. */
  failNextWith?: string;
}

const DEFAULT_TOKEN: WhoopTokenResponse = {
  accessToken: "fixture-access-token",
  refreshToken: "fixture-refresh-token",
  expiresAt: "2026-08-19T13:00:00.000Z",
  scope: "read:sleep read:recovery read:workout read:profile offline",
};

export function createFixtureWhoopProvider(options: FixtureWhoopOptions = {}): WhoopOAuthProvider & {
  calls: { exchangeAuthorizationCode: number; refreshAccessToken: number; getAuthenticatedUserId: number };
} {
  const token = options.tokenResponse ?? DEFAULT_TOKEN;
  const externalUserId = options.externalUserId ?? "12345";
  const calls = { exchangeAuthorizationCode: 0, refreshAccessToken: 0, getAuthenticatedUserId: 0 };

  function maybeFail(): void {
    if (options.failNextWith) throw new Error(options.failNextWith);
  }

  return {
    calls,
    exchangeAuthorizationCode(): Promise<WhoopTokenResponse> {
      calls.exchangeAuthorizationCode++;
      maybeFail();
      return Promise.resolve(token);
    },
    refreshAccessToken(): Promise<WhoopTokenResponse> {
      calls.refreshAccessToken++;
      maybeFail();
      return Promise.resolve(token);
    },
    getAuthenticatedUserId(): Promise<string> {
      calls.getAuthenticatedUserId++;
      maybeFail();
      return Promise.resolve(externalUserId);
    },
  };
}
