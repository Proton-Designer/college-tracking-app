// The testable orchestrator behind account-delete/index.ts -- the single most
// destructive operation in this product, so every step is deliberate:
//
// 1. Confirmation-email check FIRST, before anything is touched. The JWT already proves
//    WHO is calling; it proves nothing about whether they MEANT it -- a UI bug, a
//    double-submit, or a stray retry could otherwise destroy an account with no undo.
//    This is intent verification, not authorization, and it belongs server-side for the
//    same reason the syllabus confirmation gate does: a check the client owns is a check
//    a client bug can bypass.
// 2. Vault secrets, deleted via the delete_user_vault_secrets wrapper (migration 0022).
//    Must happen before the account itself is deleted -- oauth_connections/
//    brightspace_feeds (and their vault_secret_id pointers) cascade away with the
//    account, and once that pointer is gone there is no way left to find the secret.
// 3. Storage objects, deleted by LISTING each bucket under the user's path prefix and
//    removing exactly what's actually there -- never by deriving expected paths from
//    table rows. A row whose insert failed after its file upload succeeded (which
//    uploadSyllabus's own orphan-cleanup path implies can happen) would be invisible to
//    a row-derived list and leave a private file behind after a "complete" deletion.
// 4. auth.admin.deleteUser(userId) LAST. This is the irreversible step -- everything
//    before it is safely re-runnable (an empty vault-secret cleanup or an empty bucket
//    list is a clean no-op, not a failure), but once this fires there is no more account
//    to retry anything against.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// EVERY private bucket in the project must be listed here. Two were missing and both were found
// the same way -- by asking what a new bucket's path shape had to be, not by anything failing:
// `sources` (Learn PDFs, migration 59) and `screen-time` (migration 65). An unlisted bucket means
// those files SURVIVE an account deletion, which is the quietest possible failure of the one
// promise a delete makes.
//
// A bucket added anywhere in this repo must be added here in the same commit. There is no
// mechanical guard for this; adding one would mean enumerating buckets at runtime, which trades a
// silent omission for a silent extra round-trip on every delete.
const BUCKETS = ["syllabi", "proof", "avatars", "sources", "screen-time"] as const;
type Bucket = (typeof BUCKETS)[number];

export interface DeleteAccountReport {
  vaultSecretsDeleted: number;
  storageObjectsDeleted: Record<Bucket, number>;
  accountDeleted: true;
}

export type DeleteAccountResult =
  | { ok: true; report: DeleteAccountReport }
  | { ok: false; reason: "email_mismatch" | "vault_cleanup_failed" | "storage_cleanup_failed" | "account_delete_failed"; message: string };

export async function deleteAccount(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  userId: string,
  callerEmail: string | null,
  confirmEmail: string,
): Promise<DeleteAccountResult> {
  if (!callerEmail || callerEmail.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
    return { ok: false, reason: "email_mismatch", message: "The confirmation email does not match your account's email address." };
  }

  const { data: vaultSecretsDeleted, error: vaultError } = await userClient.rpc("delete_user_vault_secrets", { p_user_id: userId });
  if (vaultError) return { ok: false, reason: "vault_cleanup_failed", message: `Failed to remove stored credentials: ${vaultError.message}` };

  const storageObjectsDeleted = {} as Record<Bucket, number>;
  for (const bucket of BUCKETS) {
    const { data: objects, error: listError } = await adminClient.storage.from(bucket).list(userId);
    if (listError) return { ok: false, reason: "storage_cleanup_failed", message: `Failed to list "${bucket}": ${listError.message}` };

    const paths = (objects ?? []).map((obj: { name: string }) => `${userId}/${obj.name}`);
    if (paths.length > 0) {
      const { error: removeError } = await adminClient.storage.from(bucket).remove(paths);
      if (removeError) return { ok: false, reason: "storage_cleanup_failed", message: `Failed to remove files from "${bucket}": ${removeError.message}` };
    }
    storageObjectsDeleted[bucket] = paths.length;
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) return { ok: false, reason: "account_delete_failed", message: `Vault and storage were cleaned up, but the account itself failed to delete: ${deleteError.message}. Safe to retry.` };

  return {
    ok: true,
    report: { vaultSecretsDeleted: vaultSecretsDeleted ?? 0, storageObjectsDeleted, accountDeleted: true },
  };
}
