import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type SyllabusUpload = Database['public']['Tables']['syllabus_uploads']['Row'];

const SYLLABI_BUCKET = 'syllabi';

/**
 * Uploads a syllabus file to the private `syllabi` bucket (migration 0011) at a path
 * prefixed by the caller's own user id -- the bucket's RLS policy requires this prefix,
 * so a user id mismatch here would fail at the storage layer, not silently write
 * somewhere else. Also creates the syllabus_uploads row extraction hangs off of.
 *
 * File type/size are enforced by the bucket itself (10MB, pdf/png/jpeg -- migration
 * 0011), not duplicated here: trust the one place those limits are actually enforced
 * rather than maintaining a second copy that can drift from it.
 */
export async function uploadSyllabus(
  client: TypedSupabaseClient,
  userId: string,
  file: Blob | ArrayBuffer | Uint8Array,
  fileName: string,
  courseId?: number,
  // The bucket's allowed_mime_types check (migration 0011) reads the upload's declared
  // content type, not the file extension or bytes -- a raw ArrayBuffer/Uint8Array
  // otherwise defaults to text/plain and is rejected outright. Default to the common
  // case; callers uploading a Blob with its own .type (e.g. from a native picker) can
  // pass that through instead.
  contentType: string = 'application/pdf',
): Promise<DataResult<SyllabusUpload>> {
  const storagePath = `${userId}/${Date.now()}-${fileName}`;

  const { error: uploadError } = await client.storage.from(SYLLABI_BUCKET).upload(storagePath, file, { contentType });
  if (uploadError) return dataErr({ code: 'unknown', message: uploadError.message });

  const { data, error } = await client
    .from('syllabus_uploads')
    .insert({
      user_id: userId,
      ...(courseId != null ? { course_id: courseId } : {}),
      file_name: fileName,
      storage_path: storagePath,
    })
    .select('*')
    .single();
  if (error) {
    // The row is the thing extraction actually needs -- if it fails, don't leave an
    // orphaned file with nothing pointing at it.
    await client.storage.from(SYLLABI_BUCKET).remove([storagePath]);
    return dataErr(mapDataError(error));
  }
  return dataOk(data);
}
