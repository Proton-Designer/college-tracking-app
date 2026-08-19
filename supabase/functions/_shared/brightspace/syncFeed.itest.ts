// Real-DB proof for the Brightspace sync + confirm pipeline. syncBrightspaceFeed takes
// already-fetched ICS text (the one genuinely untestable-offline piece -- the real
// HTTP fetch -- is isolated to the edge function handler and proven separately via a
// live local HTTP server + curl, see docs/SUPABASE_SETUP.md's L10 section).

import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { syncBrightspaceFeed } from "./syncFeed.ts";
import { confirmIcsEvent } from "./confirm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-brightspace-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-brightspace-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

function ics(body: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Brightspace//Calendar//EN\r\n${body}\r\nEND:VCALENDAR\r\n`;
}

Deno.test("syncBrightspaceFeed: stages real events and matches a course by code from the summary", async () => {
  const { admin, userId } = await createThrowawayUser();
  const { data: course, error: courseError } = await admin
    .from("courses")
    .insert({ user_id: userId, code: "BME 301", name: "Biomedical Instrumentation", term: "Fall 2026" })
    .select("id")
    .single();
  assertEquals(courseError, null);
  const { data: feed, error: feedError } = await admin.rpc("store_brightspace_feed_url", { p_user_id: userId, p_ics_url: "https://example.test/feed.ics" });
  assertEquals(feedError, null);

  const feedText = ics(
    ['BEGIN:VEVENT', 'UID:lecture1@brightspace', 'SUMMARY:BME 301 Lecture', 'DTSTART:20260901T140000Z', 'DTEND:20260901T145000Z', 'END:VEVENT'].join('\r\n'),
  );

  const result = await syncBrightspaceFeed(admin, userId, feed as number, feedText);
  assertEquals(result.staged, 1);
  assertEquals(result.skippedAlreadyDecided, 0);

  const { data: staged } = await admin.from("ics_event_extractions").select("*").eq("feed_id", feed).single();
  assertEquals(staged!.summary, "BME 301 Lecture");
  assertEquals(staged!.status, "pending");
  assertEquals(staged!.course_id, course!.id); // matched by code substring

  const { data: feedRow } = await admin.from("brightspace_feeds").select("last_synced_at").eq("id", feed).single();
  assert(feedRow!.last_synced_at !== null);
});

Deno.test("syncBrightspaceFeed: re-syncing never reverts an already-confirmed or rejected staged event", async () => {
  const { admin, userId } = await createThrowawayUser();
  const { data: feed } = await admin.rpc("store_brightspace_feed_url", { p_user_id: userId, p_ics_url: "https://example.test/feed2.ics" });

  const feedText = ics(['BEGIN:VEVENT', 'UID:exam1@brightspace', 'SUMMARY:Exam 2', 'DTSTART:20260910T140000Z', 'END:VEVENT'].join('\r\n'));
  await syncBrightspaceFeed(admin, userId, feed as number, feedText);

  const { data: staged } = await admin.from("ics_event_extractions").select("id").eq("feed_id", feed).single();
  const confirmed = await confirmIcsEvent(admin, { extractionId: staged!.id, userId, decision: "confirmed" });
  assertEquals(confirmed.ok, true);

  // Re-sync the identical feed (e.g. a periodic poll) -- must not touch the now-confirmed row.
  const second = await syncBrightspaceFeed(admin, userId, feed as number, feedText);
  assertEquals(second.staged, 0);
  assertEquals(second.skippedAlreadyDecided, 1);

  const { data: stillConfirmed } = await admin.from("ics_event_extractions").select("status").eq("id", staged!.id).single();
  assertEquals(stillConfirmed!.status, "confirmed");
});

Deno.test("confirmIcsEvent: promotes a confirmed event into calendar_events, refuses double-confirm, and defaults an all-day event's missing end to a single day", async () => {
  const { admin, userId } = await createThrowawayUser();
  const { data: feed } = await admin.rpc("store_brightspace_feed_url", { p_user_id: userId, p_ics_url: "https://example.test/feed3.ics" });

  const feedText = ics(
    ['BEGIN:VEVENT', 'UID:break1@brightspace', 'SUMMARY:Fall Break', 'DTSTART;VALUE=DATE:20261126', 'END:VEVENT'].join('\r\n'), // no DTEND
  );
  await syncBrightspaceFeed(admin, userId, feed as number, feedText);
  const { data: staged } = await admin.from("ics_event_extractions").select("id").eq("feed_id", feed).single();

  const confirmed = await confirmIcsEvent(admin, { extractionId: staged!.id, userId, decision: "confirmed" });
  assertEquals(confirmed.ok, true);
  if (!confirmed.ok || confirmed.action !== "promoted") throw new Error("expected a promotion");

  const { data: event } = await admin.from("calendar_events").select("*").eq("id", confirmed.calendarEventId).single();
  assertEquals(event!.title, "Fall Break");
  assertEquals(event!.source, "ics");
  assertEquals(event!.external_id, "break1@brightspace");
  // No DTEND was present -- must default to exactly one day, not null and not a crash.
  const spanHours = (new Date(event!.end_at).getTime() - new Date(event!.start_at).getTime()) / 3_600_000;
  assertEquals(spanHours, 24);

  const doubleConfirm = await confirmIcsEvent(admin, { extractionId: staged!.id, userId, decision: "confirmed" });
  assertEquals(doubleConfirm.ok, false);
  // Scoped to this run's own throwaway user -- a bare external_id filter would also
  // match every other test run's row reusing the same literal UID (admin is
  // service-role, bypassing the RLS scoping a real caller would always have).
  const { data: eventsAfter } = await admin.from("calendar_events").select("id").eq("external_id", "break1@brightspace").eq("user_id", userId);
  assertEquals(eventsAfter!.length, 1); // the refused double-confirm did not create a second row
});

Deno.test("confirmIcsEvent: a timed event with no DTEND still satisfies calendar_events' strict end_at > start_at constraint", async () => {
  const { admin, userId } = await createThrowawayUser();
  const { data: feed } = await admin.rpc("store_brightspace_feed_url", { p_user_id: userId, p_ics_url: "https://example.test/feed-noend.ics" });
  const feedText = ics(['BEGIN:VEVENT', 'UID:pointevent1@brightspace', 'SUMMARY:Exam 2', 'DTSTART:20260910T140000Z', 'END:VEVENT'].join('\r\n'));
  await syncBrightspaceFeed(admin, userId, feed as number, feedText);
  const { data: staged } = await admin.from("ics_event_extractions").select("id").eq("feed_id", feed).single();

  const confirmed = await confirmIcsEvent(admin, { extractionId: staged!.id, userId, decision: "confirmed" });
  assertEquals(confirmed.ok, true);
  if (!confirmed.ok || confirmed.action !== "promoted") throw new Error("expected a promotion");

  const { data: event } = await admin.from("calendar_events").select("start_at, end_at").eq("id", confirmed.calendarEventId).single();
  assert(new Date(event!.end_at).getTime() > new Date(event!.start_at).getTime());
  const spanMinutes = (new Date(event!.end_at).getTime() - new Date(event!.start_at).getTime()) / 60_000;
  assertEquals(spanMinutes, 60); // the 1-hour default for a DTEND-less timed event
});

Deno.test("confirmIcsEvent: rejecting a staged event never writes to calendar_events", async () => {
  const { admin, userId } = await createThrowawayUser();
  const { data: feed } = await admin.rpc("store_brightspace_feed_url", { p_user_id: userId, p_ics_url: "https://example.test/feed4.ics" });
  const feedText = ics(['BEGIN:VEVENT', 'UID:wrong1@brightspace', 'SUMMARY:Misparsed Junk Event', 'DTSTART:20260901T140000Z', 'END:VEVENT'].join('\r\n'));
  await syncBrightspaceFeed(admin, userId, feed as number, feedText);
  const { data: staged } = await admin.from("ics_event_extractions").select("id").eq("feed_id", feed).single();

  const rejected = await confirmIcsEvent(admin, { extractionId: staged!.id, userId, decision: "rejected" });
  assertEquals(rejected.ok, true);
  if (rejected.ok) assertEquals(rejected.action, "rejected");

  const { data: events } = await admin.from("calendar_events").select("id").eq("external_id", "wrong1@brightspace").eq("user_id", userId);
  assertEquals(events!.length, 0);
});

Deno.test("cross-user isolation: a second user cannot confirm the first user's staged event", async () => {
  const { admin, userId } = await createThrowawayUser();
  const { userId: otherUserId } = await createThrowawayUser();
  const { data: feed } = await admin.rpc("store_brightspace_feed_url", { p_user_id: userId, p_ics_url: "https://example.test/feed5.ics" });
  const feedText = ics(['BEGIN:VEVENT', 'UID:private1@brightspace', 'SUMMARY:Private Event', 'DTSTART:20260901T140000Z', 'END:VEVENT'].join('\r\n'));
  await syncBrightspaceFeed(admin, userId, feed as number, feedText);
  const { data: staged } = await admin.from("ics_event_extractions").select("id").eq("feed_id", feed).single();

  const result = await confirmIcsEvent(admin, { extractionId: staged!.id, userId: otherUserId, decision: "confirmed" });
  assertEquals(result.ok, false);
});
