// Content hashing for llm_usage_log.content_hash -- NEVER log the prompt or response
// body itself (docs/LLM_LAYER_SPEC.md §7). SHA-256 via the Web Crypto API, available
// natively in the Deno Edge Function runtime -- no extra dependency.

export async function hashContent(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
