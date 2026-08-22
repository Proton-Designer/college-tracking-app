import { assertEquals } from "jsr:@std/assert@1";
import { confirmIcsEvent } from "./confirm.ts";

// B6: an all-day ICS event promoted through confirmIcsEvent got is_busy hardcoded to
// true, with its end_at set to start_at + 24h (RFC 5545's own all-day convention, see
// confirm.ts's own comment). Every committed-hours consumer (risk.ts, recoveryMode.ts,
// backplan.ts, workload.ts, and the Deno mirror) filters on is_busy=true and sums
// end_at-start_at verbatim -- so a single institution-published all-day entry (a
// reading day, a break, a no-class day) contributed a full 24 hours of "committed time"
// wherever it landed, deflating capacity and inflating risk on exactly the days a
// student actually has MORE free time, not less. calendar_events has no is_all_day
// column of its own -- the flag only exists on the staging table
// (ics_event_extractions) and is otherwise lost at promotion, so the fix has to happen
// here, at the one place that flag is still known.

// A minimal fake Supabase client supporting exactly the query chains confirm.ts uses --
// same shape as syllabus/confirm.test.ts's fake client.
// deno-lint-ignore no-explicit-any
function createFakeClient(seed: Record<string, any[]>) {
  const state: Record<string, any[]> = {
    ics_event_extractions: [],
    calendar_events: [],
    ...structuredCloneSeed(seed),
  };
  let nextId = 1000;

  function from(table: string) {
    return {
      select(_cols: string) {
        return {
          eq(col: string, val: unknown) {
            return {
              eq(col2: string, val2: unknown) {
                return {
                  maybeSingle: () =>
                    Promise.resolve({
                      data: state[table]!.find((r) => r[col] === val && r[col2] === val2) ?? null,
                      error: null,
                    }),
                };
              },
            };
          },
        };
      },
      update(patch: Record<string, unknown>) {
        const apply = (predicate: (r: Record<string, unknown>) => boolean) => {
          const row = state[table]!.find(predicate);
          if (row) Object.assign(row, patch);
          return { data: null, error: null };
        };
        let predicate = (_r: Record<string, unknown>) => true;
        const builder = {
          eq(col: string, val: unknown) {
            const prevPredicate = predicate;
            predicate = (r) => prevPredicate(r) && r[col] === val;
            return builder;
          },
          then(resolve: (v: unknown) => void) {
            resolve(apply(predicate));
          },
        };
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        return {
          select(_cols: string) {
            return {
              single: () => {
                const row = { id: nextId++, ...payload };
                state[table]!.push(row);
                return Promise.resolve({ data: row, error: null });
              },
            };
          },
        };
      },
    };
  }

  return { client: { from }, state };
}

function structuredCloneSeed(seed: Record<string, unknown[]>): Record<string, unknown[]> {
  return Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...(r as object) }))]));
}

function pendingExtraction(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: "user-1",
    external_id: "fixture-event-1@brightspace",
    summary: "BME 301 Lecture",
    location: null,
    start_at: "2026-09-15T00:00:00Z",
    end_at: null,
    is_all_day: false,
    course_id: null,
    status: "pending",
    ...overrides,
  };
}

Deno.test("confirmIcsEvent: an all-day event is promoted with is_busy=false -- it must not contribute committed hours", async () => {
  const { client, state } = createFakeClient({
    ics_event_extractions: [pendingExtraction({ is_all_day: true, summary: "Fall Break" })],
  });

  const result = await confirmIcsEvent(client, { extractionId: 1, userId: "user-1", decision: "confirmed" });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.action, "promoted");

  const row = state.calendar_events![0];
  assertEquals(row.is_busy, false, "an all-day event is a label on a day, not an occupied interval");
  // Still spans the full day (RFC 5545's own all-day convention) -- only committed-hours
  // accounting is affected, not the event's own displayed duration.
  const spanMs = new Date(row.end_at).getTime() - new Date(row.start_at).getTime();
  assertEquals(spanMs, 24 * 60 * 60 * 1000);
});

Deno.test("confirmIcsEvent: a timed event still promotes with is_busy=true -- real committed time must not be discounted", async () => {
  const { client, state } = createFakeClient({
    ics_event_extractions: [pendingExtraction({ is_all_day: false, summary: "BME 301 Lecture", end_at: "2026-09-15T01:00:00Z" })],
  });

  const result = await confirmIcsEvent(client, { extractionId: 1, userId: "user-1", decision: "confirmed" });
  assertEquals(result.ok, true);
  if (!result.ok) return;

  const row = state.calendar_events![0];
  assertEquals(row.is_busy, true, "a real timed commitment must still count toward committed hours");
});
