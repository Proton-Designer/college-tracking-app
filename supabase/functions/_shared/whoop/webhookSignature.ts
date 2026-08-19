// WHOOP webhook signature verification. HMAC-SHA256 over `timestamp + rawBody`, keyed by
// the app's WHOOP client secret, base64-encoded -- transcribed from WHOOP's publicly
// documented webhook reference (X-WHOOP-Signature / X-WHOOP-Signature-Timestamp headers),
// RECORDED not LIVE-VERIFIED: no real WHOOP webhook has ever hit this environment. If the
// real header names or signing scheme have drifted by the time WHOOP credentials exist,
// update this from the real request, never patch a test to force it to pass -- same
// honesty framing as whoopNormalize.ts and realProvider.ts.
//
// Uses the Web Crypto API directly (like _shared/llm/hash.ts) rather than packages/core:
// HMAC needs crypto.subtle, which is a Deno/Node runtime global, not something the
// core-mirror byte-diff guard should be asked to reason about.

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes, generous enough for real network jitter

export interface WhoopWebhookVerification {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  clientSecret: string;
  /** Injectable for tests; defaults to the real clock. */
  now?: () => number;
}

export interface WhoopWebhookVerificationResult {
  ok: boolean;
  reason: string | null;
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** Constant-time string comparison -- a signature check that short-circuits on the first
 *  mismatched byte leaks timing information an attacker can use to forge a valid
 *  signature one byte at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyWhoopWebhookSignature(input: WhoopWebhookVerification): Promise<WhoopWebhookVerificationResult> {
  if (!input.timestampHeader) return { ok: false, reason: "Missing X-WHOOP-Signature-Timestamp header." };
  if (!input.signatureHeader) return { ok: false, reason: "Missing X-WHOOP-Signature header." };

  const timestampMs = Number(input.timestampHeader);
  if (!Number.isFinite(timestampMs)) return { ok: false, reason: "Timestamp header is not a valid number." };

  const now = (input.now ?? Date.now)();
  if (Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "Timestamp is outside the allowed clock-skew window (possible replay)." };
  }

  const expectedSignature = await hmacSha256Base64(input.clientSecret, `${input.timestampHeader}${input.rawBody}`);
  if (!timingSafeEqual(expectedSignature, input.signatureHeader)) {
    return { ok: false, reason: "Signature does not match." };
  }

  return { ok: true, reason: null };
}
