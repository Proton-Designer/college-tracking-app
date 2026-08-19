// Full, portable data export -- SCREEN_SPEC §9's other non-negotiable right, alongside
// deletion. Uses the CALLER'S OWN RLS-scoped client throughout, never a service-role
// client and never a user_id filter written by hand: RLS already restricts every table
// read to the caller's own rows, so there is no code path that could export the wrong
// user's data by mistake. The one thing this function needs a userId for at all is
// building Storage object paths (`<user_id>/<filename>`), not for scoping any query.
//
// Tables are enumerated dynamically via public.list_user_scoped_tables() (migration
// 0023) rather than a hardcoded list -- a future table is automatically included, the
// same reasoning 07_account_deletion.test.sql's assertion uses. This also means the
// export automatically includes the DERIVED material (insights, summaries, semester
// lessons, agent reports) alongside raw journal/task data -- they're just more
// user-scoped tables, not a special case.
//
// Vault secret VALUES are never in the export because they were never in these tables to
// begin with -- oauth_connections/brightspace_feeds hold only a vault_secret_id pointer.
// Storage files are included as short-lived signed URLs rather than embedded bytes, so a
// large syllabus PDF doesn't have to be base64-inflated into the JSON body.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const BUCKETS = ["syllabi", "proof", "avatars"] as const;
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour -- long enough to actually download, short-lived by design

export interface AccountExportFile {
  bucket: (typeof BUCKETS)[number];
  path: string;
  signedUrl: string | null;
  error: string | null;
}

export interface AccountExport {
  exportedAt: string;
  userId: string;
  // deno-lint-ignore no-explicit-any
  profile: Record<string, any> | null;
  // deno-lint-ignore no-explicit-any
  tables: Record<string, Record<string, any>[]>;
  files: AccountExportFile[];
}

export async function exportAccount(userClient: SupabaseClient, userId: string): Promise<AccountExport> {
  const { data: tableNames, error: tableListError } = await userClient.rpc("list_user_scoped_tables");
  if (tableListError) throw new Error(`Failed to enumerate user-scoped tables: ${tableListError.message}`);

  const tables: AccountExport["tables"] = {};
  for (const tableName of (tableNames ?? []) as string[]) {
    const { data, error } = await userClient.from(tableName).select("*");
    if (error) throw new Error(`Failed to export table "${tableName}": ${error.message}`);
    tables[tableName] = data ?? [];
  }

  const { data: profile, error: profileError } = await userClient.from("profiles").select("*").maybeSingle();
  if (profileError) throw new Error(`Failed to export profile: ${profileError.message}`);

  const files: AccountExportFile[] = [];
  for (const bucket of BUCKETS) {
    const { data: objects, error: listError } = await userClient.storage.from(bucket).list(userId);
    if (listError) throw new Error(`Failed to list "${bucket}": ${listError.message}`);

    for (const obj of objects ?? []) {
      const path = `${userId}/${obj.name}`;
      const { data: signed, error: signError } = await userClient.storage.from(bucket).createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
      files.push({ bucket, path, signedUrl: signed?.signedUrl ?? null, error: signError ? signError.message : null });
    }
  }

  return { exportedAt: new Date().toISOString(), userId, profile, tables, files };
}
