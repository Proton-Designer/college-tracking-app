import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from './types';

// Mirrors the edge function's AccountExport shape (supabase/functions/_shared/account/
// exportAccount.ts) by hand -- a transport envelope of already-validated data returned
// by our own edge function, not a domain type. Same reasoning nightlyReportPayload.ts
// used to give for its own hand copy, before that one specifically needed
// single-sourcing because it was a rich, evolving domain artifact; this one is a thin,
// stable wrapper unlikely to grow that kind of complexity.
export interface AccountExportFile {
  bucket: string;
  path: string;
  signedUrl: string | null;
  error: string | null;
}

export interface AccountExport {
  exportedAt: string;
  userId: string;
  profile: Record<string, unknown> | null;
  tables: Record<string, Record<string, unknown>[]>;
  files: AccountExportFile[];
}

/** Every Edge Function in this codebase wraps its body in {ok, data} or {ok, error}
 *  (supabase/functions/_shared/http.ts's apiOk/apiErr) -- client.functions.invoke's own
 *  `data` is that whole envelope, not the payload directly. Unwrapped here once so every
 *  caller below doesn't have to remember the envelope shape. Found live: the first
 *  version of this file skipped this and read `data.exportedAt` directly, which was
 *  always undefined. */
function unwrapEnvelope<T>(body: unknown): { ok: true; data: T } | { ok: false; error: string } {
  if (body != null && typeof body === 'object' && 'ok' in body) {
    return body as { ok: true; data: T } | { ok: false; error: string };
  }
  return { ok: false, error: 'Malformed response from server.' };
}

/** Calls the account-export Edge Function with the caller's own session -- the function
 *  verifies the JWT itself and reads only via the caller's RLS-scoped client, so there is
 *  no user_id parameter here to get wrong. */
export async function exportOwnAccount(client: TypedSupabaseClient): Promise<DataResult<AccountExport>> {
  const { data, error } = await client.functions.invoke('account-export', { method: 'POST' });
  if (error) return dataErr({ code: 'network_error', message: error.message ?? 'Export failed. Please try again.' });
  const envelope = unwrapEnvelope<AccountExport>(data);
  if (!envelope.ok) return dataErr({ code: 'unknown', message: envelope.error });
  return dataOk(envelope.data);
}

export interface DeleteOwnAccountResult {
  vaultSecretsDeleted: number;
  storageObjectsDeleted: number;
  accountDeleted: true;
}

/** Calls the account-delete Edge Function. `confirmEmail` must exactly match the
 *  caller's own session email (case-insensitive) -- the server enforces this
 *  regardless of what the UI does; this parameter exists to make the caller's INTENT
 *  deliberate, not to authorize anything the server wouldn't otherwise refuse. */
export async function deleteOwnAccount(client: TypedSupabaseClient, confirmEmail: string): Promise<DataResult<DeleteOwnAccountResult>> {
  const { data, error } = await client.functions.invoke('account-delete', {
    method: 'POST',
    body: { confirmEmail },
  });
  if (error) return dataErr({ code: 'network_error', message: error.message ?? 'Deletion failed. Please try again.' });
  const envelope = unwrapEnvelope<DeleteOwnAccountResult>(data);
  if (!envelope.ok) return dataErr({ code: 'unknown', message: envelope.error });
  return dataOk(envelope.data);
}
