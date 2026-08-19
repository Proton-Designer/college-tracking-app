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

/** Calls the account-export Edge Function with the caller's own session -- the function
 *  verifies the JWT itself and reads only via the caller's RLS-scoped client, so there is
 *  no user_id parameter here to get wrong. */
export async function exportOwnAccount(client: TypedSupabaseClient): Promise<DataResult<AccountExport>> {
  const { data, error } = await client.functions.invoke<AccountExport>('account-export', { method: 'POST' });
  if (error) return dataErr({ code: 'network_error', message: error.message ?? 'Export failed. Please try again.' });
  if (!data) return dataErr({ code: 'unknown', message: 'Export returned no data.' });
  return dataOk(data);
}

export interface DeleteOwnAccountResult {
  deleted: true;
}

/** Calls the account-delete Edge Function. `confirmEmail` must exactly match the
 *  caller's own session email (case-insensitive) -- the server enforces this
 *  regardless of what the UI does; this parameter exists to make the caller's INTENT
 *  deliberate, not to authorize anything the server wouldn't otherwise refuse. */
export async function deleteOwnAccount(client: TypedSupabaseClient, confirmEmail: string): Promise<DataResult<DeleteOwnAccountResult>> {
  const { data, error } = await client.functions.invoke<DeleteOwnAccountResult>('account-delete', {
    method: 'POST',
    body: { confirmEmail },
  });
  if (error) return dataErr({ code: 'network_error', message: error.message ?? 'Deletion failed. Please try again.' });
  if (!data) return dataErr({ code: 'unknown', message: 'Deletion returned no confirmation.' });
  return dataOk(data);
}
