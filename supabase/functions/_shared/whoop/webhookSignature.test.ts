import { assertEquals } from "jsr:@std/assert@1";
import { verifyWhoopWebhookSignature } from "./webhookSignature.ts";

const SECRET = "test-client-secret";
const RAW_BODY = JSON.stringify({ user_id: 12345, id: "abc", type: "workout.updated" });
const FIXED_NOW = 1_755_000_000_000; // arbitrary fixed instant

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

Deno.test("verifyWhoopWebhookSignature: accepts a correctly signed request within the clock-skew window", async () => {
  const timestampHeader = String(FIXED_NOW);
  const signatureHeader = await sign(SECRET, `${timestampHeader}${RAW_BODY}`);

  const result = await verifyWhoopWebhookSignature({
    rawBody: RAW_BODY,
    timestampHeader,
    signatureHeader,
    clientSecret: SECRET,
    now: () => FIXED_NOW,
  });

  assertEquals(result, { ok: true, reason: null });
});

Deno.test("verifyWhoopWebhookSignature: rejects a tampered body even with a validly-formatted signature for the original body", async () => {
  const timestampHeader = String(FIXED_NOW);
  const signatureHeader = await sign(SECRET, `${timestampHeader}${RAW_BODY}`);

  const result = await verifyWhoopWebhookSignature({
    rawBody: JSON.stringify({ user_id: 12345, id: "abc", type: "workout.deleted" }), // tampered
    timestampHeader,
    signatureHeader,
    clientSecret: SECRET,
    now: () => FIXED_NOW,
  });

  assertEquals(result.ok, false);
});

Deno.test("verifyWhoopWebhookSignature: rejects a signature signed with the wrong secret", async () => {
  const timestampHeader = String(FIXED_NOW);
  const signatureHeader = await sign("wrong-secret", `${timestampHeader}${RAW_BODY}`);

  const result = await verifyWhoopWebhookSignature({
    rawBody: RAW_BODY,
    timestampHeader,
    signatureHeader,
    clientSecret: SECRET,
    now: () => FIXED_NOW,
  });

  assertEquals(result.ok, false);
});

Deno.test("verifyWhoopWebhookSignature: rejects a timestamp far outside the clock-skew window (replay defense)", async () => {
  const staleTimestamp = String(FIXED_NOW - 60 * 60 * 1000); // 1 hour old
  const signatureHeader = await sign(SECRET, `${staleTimestamp}${RAW_BODY}`);

  const result = await verifyWhoopWebhookSignature({
    rawBody: RAW_BODY,
    timestampHeader: staleTimestamp,
    signatureHeader,
    clientSecret: SECRET,
    now: () => FIXED_NOW,
  });

  assertEquals(result.ok, false);
  assertEquals(result.reason?.includes("replay") ?? false, true);
});

Deno.test("verifyWhoopWebhookSignature: rejects when the signature header is missing entirely", async () => {
  const result = await verifyWhoopWebhookSignature({
    rawBody: RAW_BODY,
    timestampHeader: String(FIXED_NOW),
    signatureHeader: null,
    clientSecret: SECRET,
    now: () => FIXED_NOW,
  });

  assertEquals(result.ok, false);
});

Deno.test("verifyWhoopWebhookSignature: rejects when the timestamp header is missing entirely", async () => {
  const signatureHeader = await sign(SECRET, `${FIXED_NOW}${RAW_BODY}`);
  const result = await verifyWhoopWebhookSignature({
    rawBody: RAW_BODY,
    timestampHeader: null,
    signatureHeader,
    clientSecret: SECRET,
    now: () => FIXED_NOW,
  });

  assertEquals(result.ok, false);
});

Deno.test("verifyWhoopWebhookSignature: rejects a non-numeric timestamp header rather than throwing", async () => {
  const result = await verifyWhoopWebhookSignature({
    rawBody: RAW_BODY,
    timestampHeader: "not-a-number",
    signatureHeader: "irrelevant",
    clientSecret: SECRET,
    now: () => FIXED_NOW,
  });

  assertEquals(result.ok, false);
});
