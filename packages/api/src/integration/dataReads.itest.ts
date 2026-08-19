import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { signIn } from '../auth/auth';
import { listGradeCategories, listGradeItems, listGradeBoundaries } from '../data/gradeStructure';
import { listDeliverables } from '../data/deliverables';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Proves the raw-row read layer (P1: grade structure + deliverables) against the seeded
// demo user's real BME 301 data -- these are rendering reads, not computation, so the
// assertions are about shape and real values, not about packages/core's engine.

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEMO_EMAIL = 'demo@collegeos.app';
const DEMO_PASSWORD = 'CollegeOS-Demo-2026';

describe('grade structure and deliverable reads against the seeded demo user', () => {
  let client: TypedSupabaseClient;
  let bmeId: number;

  beforeAll(async () => {
    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const result = await signIn(client, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (!result.ok) throw new Error(`demo signIn failed: ${result.error.code}`);

    const { data: courses } = await client.from('courses').select('id, code');
    const bme = courses!.find((c) => c.code === 'BME 301');
    if (!bme) throw new Error('BME 301 not found in seeded courses');
    bmeId = bme.id;
  });

  it('lists BME 301\'s real grade categories with their actual weights', async () => {
    const result = await listGradeCategories(client, bmeId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.length).toBeGreaterThan(0);
    const final = result.data.find((c) => c.name === 'Final');
    expect(final).toBeDefined();
    expect(Number(final!.weight_pct)).toBe(40);
  });

  it('lists BME 301\'s real grade items, each pointing at a real category', async () => {
    const categories = await listGradeCategories(client, bmeId);
    expect(categories.ok).toBe(true);
    if (!categories.ok) return;
    const categoryIds = new Set(categories.data.map((c) => c.id));

    const result = await listGradeItems(client, bmeId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.length).toBeGreaterThan(0);
    for (const item of result.data) {
      expect(categoryIds.has(item.category_id)).toBe(true);
      expect(item.points_possible).toBeGreaterThan(0);
    }
  });

  it('lists grade boundaries in descending min_pct order', async () => {
    const result = await listGradeBoundaries(client, bmeId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.length).toBeGreaterThan(0);
    for (let i = 1; i < result.data.length; i++) {
      expect(Number(result.data[i - 1]!.min_pct)).toBeGreaterThanOrEqual(Number(result.data[i]!.min_pct));
    }
  });

  it('lists deliverables for a course with the columns a real assignments table needs', async () => {
    const result = await listDeliverables(client, bmeId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.length).toBeGreaterThan(0);
    for (const d of result.data) {
      expect(d.course_id).toBe(bmeId);
      expect(d.due_at).toBeTruthy();
      expect(d.local_due_date).toBeTruthy();
      expect(['paper', 'report', 'problem_set', 'exam', 'project', 'reading']).toContain(d.type);
      expect(['not_started', 'in_progress', 'completed']).toContain(d.status);
    }
    // Ordered soonest-due-first.
    for (let i = 1; i < result.data.length; i++) {
      expect(result.data[i - 1]!.due_at <= result.data[i]!.due_at).toBe(true);
    }
  });
});
