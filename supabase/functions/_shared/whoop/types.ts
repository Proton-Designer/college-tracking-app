// WHOOP OAuth2 provider contract. Mirrors the LLM gateway's LlmProvider pattern
// (_shared/llm/types.ts): a real implementation and a fixture implementation both
// satisfy this interface, so every call site is contract-tested offline and the only
// thing that changes when real WHOOP credentials exist is which implementation gets
// constructed.

export interface WhoopTokenResponse {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp. WHOOP returns `expires_in` seconds; the provider converts that to
   *  an absolute instant at the call site so nothing downstream needs to know "when". */
  expiresAt: string;
  scope: string;
}

/** Implemented by both the real WHOOP-backed provider and the fixture provider used in
 *  tests. `getAuthenticatedUserId` exists because WHOOP webhooks identify the affected
 *  user by WHOOP's own user id, not ours -- it must be captured once at connect time and
 *  stored (oauth_connections.external_account_id) so an incoming webhook can be mapped
 *  back to a profile. */
export interface WhoopOAuthProvider {
  exchangeAuthorizationCode(code: string, redirectUri: string): Promise<WhoopTokenResponse>;
  refreshAccessToken(refreshToken: string): Promise<WhoopTokenResponse>;
  getAuthenticatedUserId(accessToken: string): Promise<string>;
}
