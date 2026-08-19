// The real WHOOP-backed WhoopOAuthProvider. Cannot be exercised against the live API in
// this environment -- no WHOOP developer credentials exist yet. Endpoint paths, request
// shapes, and response fields below are transcribed from WHOOP's publicly documented API
// v2 OAuth2 reference, RECORDED not LIVE-VERIFIED, same honesty framing as
// anthropicProvider.ts and whoopNormalize.ts: contract-tested against a fixture response
// in realProvider.test.ts, and the actual network behavior must get a live smoke test
// the first time a real WHOOP client id/secret exist (see docs/SUPABASE_SETUP.md's WHOOP
// section for the exact checklist).

import type { WhoopOAuthProvider, WhoopTokenResponse } from "./types.ts";

const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_PROFILE_URL = "https://api.prod.whoop.com/developer/v1/user/profile/basic";

interface WhoopTokenApiResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface WhoopProfileApiResponse {
  user_id: number;
}

async function requestToken(body: URLSearchParams): Promise<WhoopTokenResponse> {
  const response = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WHOOP token request failed with status ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = (await response.json()) as WhoopTokenApiResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope,
  };
}

export function createWhoopOAuthProvider(clientId: string, clientSecret: string): WhoopOAuthProvider {
  return {
    exchangeAuthorizationCode(code: string, redirectUri: string): Promise<WhoopTokenResponse> {
      return requestToken(
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      );
    },

    refreshAccessToken(refreshToken: string): Promise<WhoopTokenResponse> {
      return requestToken(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      );
    },

    async getAuthenticatedUserId(accessToken: string): Promise<string> {
      const response = await fetch(WHOOP_PROFILE_URL, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`WHOOP profile request failed with status ${response.status}: ${text.slice(0, 500)}`);
      }
      const data = (await response.json()) as WhoopProfileApiResponse;
      return String(data.user_id);
    },
  };
}
