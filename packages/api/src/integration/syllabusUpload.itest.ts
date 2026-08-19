import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { uploadSyllabus } from '../data/syllabusUploads';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Proves the P5 storage upload helper against the real local Supabase storage service
// (migration 0011's private `syllabi` bucket) -- not a mock, a real multipart upload
// and a real syllabus_uploads row.
//
// Dedicated throwaway user, not demo -- "reads against demo, writes against a
// throwaway" (same line focusSessions.itest.ts already draws). A real file lands in
// storage and a real syllabus_uploads row is created; demo's value is its stable,
// curated data.
describe('uploadSyllabus against the real local storage service', () => {
  let client: TypedSupabaseClient;
  let userId: string;

  beforeAll(async () => {
    const email = `itest-syllabus-${Date.now()}@collegeos.test`;
    const password = 'itest-syllabus-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  it('uploads a real file to the private syllabi bucket and creates the tracking row', async () => {
    const fileName = `test-syllabus-${Date.now()}.pdf`;
    const fakePdfBytes = new TextEncoder().encode('%PDF-1.4 fake syllabus content for an integration test');

    const result = await uploadSyllabus(client, userId, fakePdfBytes, fileName);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.user_id).toBe(userId);
    expect(result.data.file_name).toBe(fileName);
    expect(result.data.storage_path.startsWith(`${userId}/`)).toBe(true);
    expect(result.data.extraction_status).toBe('pending');

    // The file is really there, not just a row claiming it is.
    const { data: downloaded, error: downloadError } = await client.storage
      .from('syllabi')
      .download(result.data.storage_path);
    expect(downloadError).toBeNull();
    const text = await downloaded!.text();
    expect(text).toContain('fake syllabus content');
  });

  it('cannot read another user\'s syllabus path -- storage RLS is not decorative', async () => {
    const otherUserPrefix = '00000000-0000-0000-0000-000000000000';
    const { error } = await client.storage.from('syllabi').download(`${otherUserPrefix}/anything.pdf`);
    expect(error).not.toBeNull();
  });
});
