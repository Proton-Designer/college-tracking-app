// Real Supabase-backed implementations of the gateway's `getMonthlySpendUsd` and
// `logUsage` dependencies, kept separate from gateway.ts so the gateway itself never
// imports a Supabase client and stays trivially testable in isolation.

import type { UsageLogEntry } from "./types.ts";

// Deno Edge Functions resolve the Supabase JS client via npm: specifier per Supabase's
// own convention; kept untyped here (SupabaseClient<any>) to avoid this shared module
// depending on the generated database.types.ts, which is TS-project-specific.
// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

/** Sum of this user's llm_usage_log.cost_usd since the start of the current calendar month. */
export async function getMonthlySpendUsd(
  client: AnySupabaseClient,
  userId: string,
  now: Date,
): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await client
    .from("llm_usage_log")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("created_at", monthStart);
  if (error) throw error;
  return (data ?? []).reduce((sum: number, row: { cost_usd: number }) => sum + Number(row.cost_usd), 0);
}

export async function logUsage(client: AnySupabaseClient, entry: UsageLogEntry): Promise<void> {
  const { error } = await client.from("llm_usage_log").insert({
    user_id: entry.userId,
    call_type: entry.callType,
    model: entry.model,
    input_tokens: entry.usage.inputTokens,
    output_tokens: entry.usage.outputTokens,
    cache_read_tokens: entry.usage.cacheReadTokens,
    cache_write_tokens: entry.usage.cacheWriteTokens,
    cost_usd: entry.costUsd,
    latency_ms: entry.latencyMs,
    success: entry.success,
    content_hash: entry.contentHash,
  });
  if (error) throw error;
}
