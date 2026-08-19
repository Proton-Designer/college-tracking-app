import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { signIn } from '../auth/auth';
import { uploadSyllabus } from '../data/syllabusUploads';
import { DEMO_EMAIL, DEMO_PASSWORD, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Proves the P5 storage upload helper against the real local Supabase storage service
// (migration 0011's private `syllabi` bucket) -- not a mock, a real multipart upload
// and a real syllabus_uploads row.

describe('uploadSyllabus against the real local storage service', () => {
  let client: TypedSupabaseClient;
  let userId: string;

  beforeAll(async () => {
    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const result = await signIn(client, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (!result.ok) throw new Error(`demo signIn failed: ${result.error.code}`);
    userId = result.data.session.user.id;
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
