import type { LocalDate } from '@collegeos/core';
import {
  PRAYER_NAMES,
  addDays,
  bucketQadaBacklog,
  buildConsistencyGrid,
  buildQadaBacklog,
  computePrayerWindows,
  dateRange,
  nextPrayer,
  resolvePrayerStatuses,
  startOfWeek,
  summariseConsistency,
  totalQadaOwed,
  trackingFloor,
  type AsrMadhab,
  type CalcMethod,
  type ConsistencyGrid,
  type ConsistencySummary,
  type PrayerName,
  type PrayerWindow,
  type QadaBuckets,
  type QadaItem,
  type ResolvedDayStatuses,
  type StoredPrayerStatus,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { getUserLocalToday } from '../day/today';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

/**
 * The Deen domain's data layer. Fetch-and-write only, in the shape `questionBank.ts` and
 * `habits.ts` already established: **nothing in this file decides what a prayer's status is.**
 * Status, the qada backlog, the consistency grid and the summary numbers are all
 * `packages/core/src/deen/prayerStatus.ts`, called from `loadDeenOverview` below and never
 * re-derived here or in a UI (Law 2 / the `check:core-mirror` reasoning applied to a read).
 *
 * Two properties of the schema shape every write in here:
 *
 * 1. **`prayers` is one row per (user, date, prayer).** Re-tapping a prayer edits that row
 *    rather than appending a second opinion about the same obligation, so `setPrayerStatus`
 *    is an upsert on that unique constraint, never an insert.
 *
 * 2. **Presence means done for sunnah and adhkar.** Those tables have no boolean column
 *    precisely because a `false` would be indistinguishable from never having been asked
 *    (migration 51's comment), so undoing one is a DELETE and the toggles below say so.
 *
 * D40 lives at the read boundary: with no location on the profile, `resolvePrayerStatuses`
 * returns `pending` for everything and `summariseConsistency().onTimeRate` is `null`. This
 * module passes both through untouched. It must never substitute a coordinate, and a caller
 * must never render a `0` where it handed back a `null`.
 */

export type PrayerLogRow = Database['public']['Tables']['prayers']['Row'];
export type SunnahLogRow = Database['public']['Tables']['sunnah_logs']['Row'];
export type AdhkarLogRow = Database['public']['Tables']['adhkar_logs']['Row'];
export type QuranSessionRow = Database['public']['Tables']['quran_sessions']['Row'];
export type ReflectionEntryRow = Database['public']['Tables']['reflection_entries']['Row'];

export type SunnahSlot = Database['public']['Enums']['sunnah_slot'];
export type AdhkarPeriod = Database['public']['Enums']['adhkar_period'];
export type ReflectionIntensity = Database['public']['Enums']['reflection_intensity'];

/** How far back the qada backlog reaches. Bucketing (last 7 / earlier this month / older)
 *  needs a window wider than the heatmap's or the `older` bucket could never be non-empty.
 *  Cheap despite the width: `resolvePrayerStatuses`'s `definitelyClosed` shortcut collapses
 *  everything at or before T-2 to a map lookup, so this costs ~2 astronomical solves, not 90. */
export const QADA_WINDOW_DAYS = 90;

/** The consistency heatmap is 30 days x 5 prayers -- D30's replacement for the streak, and the
 *  window the headline numbers are quoted over. */
export const CONSISTENCY_WINDOW_DAYS = 30;

const CALC_METHODS: readonly string[] = ['mwl', 'isna', 'karachi', 'egyptian'];
const ASR_MADHABS: readonly string[] = ['standard', 'hanafi'];

/** `profiles.prayer_calc_method` is text-with-a-CHECK rather than an enum (migration 49's
 *  reasoning: the list grows as conventions are implemented), so it arrives typed as `string`.
 *  An unrecognised value falls back to the column's own default rather than throwing -- a
 *  method this build does not know about must not take the whole page down. */
function toCalcMethod(raw: string): CalcMethod {
  return CALC_METHODS.includes(raw) ? (raw as CalcMethod) : 'mwl';
}

function toAsrMadhab(raw: string): AsrMadhab {
  return ASR_MADHABS.includes(raw) ? (raw as AsrMadhab) : 'standard';
}

// ---------------------------------------------------------------------------
// Reads -- plain range fetches, scoped to the user
// ---------------------------------------------------------------------------

export async function listPrayersInRange(
  client: TypedSupabaseClient,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<DataResult<PrayerLogRow[]>> {
  const { data, error } = await client
    .from('prayers')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export async function listSunnahLogsInRange(
  client: TypedSupabaseClient,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<DataResult<SunnahLogRow[]>> {
  const { data, error } = await client
    .from('sunnah_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export async function listAdhkarLogsInRange(
  client: TypedSupabaseClient,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<DataResult<AdhkarLogRow[]>> {
  const { data, error } = await client
    .from('adhkar_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export async function listQuranSessionsInRange(
  client: TypedSupabaseClient,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<DataResult<QuranSessionRow[]>> {
  const { data, error } = await client
    .from('quran_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export async function listReflectionEntriesInRange(
  client: TypedSupabaseClient,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<DataResult<ReflectionEntryRow[]>> {
  const { data, error } = await client
    .from('reflection_entries')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Log or change one prayer. Upserts on `prayers_one_per_day (user_id, local_date,
 * prayer_name)` so a correction is an edit, not a second record of the same obligation --
 * which is also what makes one-tap logging safe to repeat on a flaky connection.
 *
 * `logged_at` is refreshed on every write: it records when the person told us, and a
 * correction is a new telling.
 */
export async function setPrayerStatus(
  client: TypedSupabaseClient,
  userId: string,
  input: { localDate: LocalDate; prayerName: PrayerName; status: StoredPrayerStatus },
): Promise<DataResult<PrayerLogRow>> {
  const { data, error } = await client
    .from('prayers')
    .upsert(
      {
        user_id: userId,
        local_date: input.localDate,
        prayer_name: input.prayerName,
        status: input.status,
        logged_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,local_date,prayer_name' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Removes a prayer record entirely, returning that prayer to whatever the windows derive.
 *
 * This is the undo for a mistaken tap and NOT a way to erase a miss: with the window closed
 * the derivation immediately reads `missed` again. Deliberately so -- the record is the
 * user's own statement, and withdrawing a statement is not the same as changing the day.
 */
export async function clearPrayerStatus(
  client: TypedSupabaseClient,
  userId: string,
  input: { localDate: LocalDate; prayerName: PrayerName },
): Promise<DataResult<null>> {
  const { error } = await client
    .from('prayers')
    .delete()
    .eq('user_id', userId)
    .eq('local_date', input.localDate)
    .eq('prayer_name', input.prayerName);
  if (error) return dataErr(mapDataError(error));
  return dataOk(null);
}

/**
 * Sunnah is presence-means-done, so the toggle inserts to mark it and DELETEs to undo. There
 * is no `false` to write -- see migration 51: a stored false would be indistinguishable from
 * never having been asked.
 *
 * Returns whether the slot is logged after the call, so a caller can report the new state
 * without a re-read.
 */
export async function toggleSunnahSlot(
  client: TypedSupabaseClient,
  userId: string,
  input: { localDate: LocalDate; prayerName: PrayerName; slot: SunnahSlot },
): Promise<DataResult<{ logged: boolean }>> {
  const { data: existing, error: readError } = await client
    .from('sunnah_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('local_date', input.localDate)
    .eq('prayer_name', input.prayerName)
    .eq('slot', input.slot)
    .maybeSingle();
  if (readError) return dataErr(mapDataError(readError));

  if (existing) {
    const { error } = await client.from('sunnah_logs').delete().eq('id', existing.id).eq('user_id', userId);
    if (error) return dataErr(mapDataError(error));
    return dataOk({ logged: false });
  }

  const { error } = await client.from('sunnah_logs').insert({
    user_id: userId,
    local_date: input.localDate,
    prayer_name: input.prayerName,
    slot: input.slot,
  });
  if (error) return dataErr(mapDataError(error));
  return dataOk({ logged: true });
}

/** Morning/evening adhkar. Same presence-means-done shape as `toggleSunnahSlot`. */
export async function toggleAdhkarPeriod(
  client: TypedSupabaseClient,
  userId: string,
  input: { localDate: LocalDate; period: AdhkarPeriod },
): Promise<DataResult<{ logged: boolean }>> {
  const { data: existing, error: readError } = await client
    .from('adhkar_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('local_date', input.localDate)
    .eq('period', input.period)
    .maybeSingle();
  if (readError) return dataErr(mapDataError(readError));

  if (existing) {
    const { error } = await client.from('adhkar_logs').delete().eq('id', existing.id).eq('user_id', userId);
    if (error) return dataErr(mapDataError(error));
    return dataOk({ logged: false });
  }

  const { error } = await client.from('adhkar_logs').insert({
    user_id: userId,
    local_date: input.localDate,
    period: input.period,
  });
  if (error) return dataErr(mapDataError(error));
  return dataOk({ logged: true });
}

export interface LogQuranSessionInput {
  localDate: LocalDate;
  pagesRead?: number | null;
  surah?: string | null;
  juz?: number | null;
  notes?: string | null;
}

/**
 * One Qur'an reading session. Multiple per day are allowed on purpose (migration 51: reading
 * twice is two acts), so this always inserts.
 *
 * The "records something" check mirrors the DB CHECK constraint with a friendlier message,
 * the same division of labour `createQuestion` uses: the constraint is the guarantee, this is
 * the explanation.
 */
export async function logQuranSession(
  client: TypedSupabaseClient,
  userId: string,
  input: LogQuranSessionInput,
): Promise<DataResult<QuranSessionRow>> {
  const pages = input.pagesRead ?? null;
  const surah = input.surah?.trim() ?? '';
  const juz = input.juz ?? null;

  if (pages != null && (!Number.isFinite(pages) || pages <= 0)) {
    return dataErr({ code: 'validation', message: 'Pages read has to be a number greater than zero.' });
  }
  if (juz != null && (!Number.isInteger(juz) || juz < 1 || juz > 30)) {
    return dataErr({ code: 'validation', message: 'Juz has to be a whole number between 1 and 30.' });
  }
  if (pages == null && surah.length === 0 && juz == null) {
    return dataErr({
      code: 'validation',
      message: 'Add pages, a surah, or a juz — a session with nothing in it is not a session.',
    });
  }

  const { data, error } = await client
    .from('quran_sessions')
    .insert({
      user_id: userId,
      local_date: input.localDate,
      pages_read: pages,
      surah: surah.length > 0 ? surah : null,
      juz,
      notes: input.notes?.trim() != null && input.notes.trim().length > 0 ? input.notes.trim() : null,
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Today's reflection intensity -- an intensity, never a rating (migration 51).
 *
 * `reflection_entries` carries no unique-per-day constraint (it is an append-capable log), so
 * "how much reflection happened today" is expressed as an UPDATE of the day's existing row
 * where one exists and an INSERT otherwise. Changing your mind about today edits today; it
 * never deletes history, and it never leaves two contradictory answers to the same question.
 */
export async function setReflectionIntensity(
  client: TypedSupabaseClient,
  userId: string,
  input: { localDate: LocalDate; intensity: ReflectionIntensity },
): Promise<DataResult<ReflectionEntryRow>> {
  const { data: existing, error: readError } = await client
    .from('reflection_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('local_date', input.localDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) return dataErr(mapDataError(readError));

  if (existing) {
    const { data, error } = await client
      .from('reflection_entries')
      .update({ intensity: input.intensity })
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) return dataErr(mapDataError(error));
    return dataOk(data);
  }

  const { data, error } = await client
    .from('reflection_entries')
    .insert({ user_id: userId, local_date: input.localDate, intensity: input.intensity })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

// ---------------------------------------------------------------------------
// Prayer settings (D39 -- per-user, never a constant)
// ---------------------------------------------------------------------------

export interface PrayerSettingsInput {
  /** A human name for the place. Never geocoded — nothing here contacts a location service. */
  locationLabel: string | null;
  lat: number | null;
  lng: number | null;
  calcMethod: CalcMethod;
  asrMadhab: AsrMadhab;
}

/**
 * Writes the four prayer-calculation preferences onto the profile, from one place so web and
 * mobile validate identically.
 *
 * The both-or-neither coordinate rule mirrors `profiles_location_pair`: a half-set location
 * would otherwise surface as a *wrong* prayer time rather than a missing one, which is the
 * single worst thing this module could do.
 */
export async function updatePrayerSettings(
  client: TypedSupabaseClient,
  userId: string,
  input: PrayerSettingsInput,
): Promise<DataResult<Database['public']['Tables']['profiles']['Row']>> {
  const { lat, lng } = input;
  if ((lat == null) !== (lng == null)) {
    return dataErr({
      code: 'validation',
      message: 'Latitude and longitude go together — set both, or leave both blank.',
    });
  }
  if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    return dataErr({ code: 'validation', message: 'Latitude has to be between -90 and 90.' });
  }
  if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    return dataErr({ code: 'validation', message: 'Longitude has to be between -180 and 180.' });
  }
  if (!CALC_METHODS.includes(input.calcMethod)) {
    return dataErr({ code: 'validation', message: 'Unknown calculation method.' });
  }
  if (!ASR_MADHABS.includes(input.asrMadhab)) {
    return dataErr({ code: 'validation', message: 'Unknown Asr madhab.' });
  }

  const label = input.locationLabel?.trim() ?? '';
  const { data, error } = await client
    .from('profiles')
    .update({
      location_label: label.length > 0 ? label : null,
      location_lat: lat,
      location_lng: lng,
      prayer_calc_method: input.calcMethod,
      asr_madhab: input.asrMadhab,
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

// ---------------------------------------------------------------------------
// The assembled read
// ---------------------------------------------------------------------------

export interface DeenLocation {
  label: string | null;
  lat: number;
  lng: number;
}

export interface DeenQadaState {
  items: QadaItem[];
  buckets: QadaBuckets;
  /** What this app derived from closed windows since the tracking floor. */
  derivedCount: number;
  /** `profiles.qada_owed` -- the hand-tracked PRE-APP debt. Never merged into the derived
   *  count: the app cannot verify it and must not absorb it into a number it computed. */
  legacyOwed: number;
  totalOwed: number;
}

export interface DeenQuranWeek {
  weekStart: LocalDate;
  weekEnd: LocalDate;
  sessions: QuranSessionRow[];
  /** Pages read this week, or `null` when no session recorded a page count. Null, never 0:
   *  "nobody wrote down pages" and "read zero pages" are different facts (D40). */
  pages: number | null;
}

export interface DeenOverview {
  today: LocalDate;
  timezone: string;
  /** Null when no location is set — which is the DEFAULT state for every user right now.
   *  A surface must render that as a prompt, never as a fabricated time (D40). */
  location: DeenLocation | null;
  calcMethod: CalcMethod;
  asrMadhab: AsrMadhab;
  /** Today's `[start, end)` windows, or null when there is no location at all. Individual
   *  entries are null where the defining sun angle is unreachable at this latitude/date. */
  todayWindows: Record<PrayerName, PrayerWindow | null> | null;
  todayStatuses: ResolvedDayStatuses;
  /** The prayer that is open now, or the next to open. Null with no computable windows. */
  next: { name: PrayerName; window: PrayerWindow; isCurrent: boolean } | null;
  qada: DeenQadaState;
  grid: ConsistencyGrid;
  /** Over the heatmap's 30-day window. `onTimeRate` is null — not 0 — when nothing has
   *  settled; the same null is the signal that `clearedDays` has nothing to say either. */
  summary: ConsistencySummary;
  /** Today's sunnah slots that are logged. Presence means done. */
  sunnahToday: { prayerName: PrayerName; slot: SunnahSlot }[];
  adhkarToday: AdhkarPeriod[];
  quranWeek: DeenQuranWeek;
  reflectionToday: ReflectionIntensity | null;
  /** The floor before which nothing is derived as missed. */
  floor: LocalDate;
}

/**
 * Everything the Deen page renders, in one call.
 *
 * Five narrow range reads plus the profile, then `packages/core` does all of the deciding:
 * `resolvePrayerStatuses` for every status, `buildQadaBacklog` + `bucketQadaBacklog` for the
 * backlog, `buildConsistencyGrid` for the heatmap and `summariseConsistency` for the headline
 * numbers. Web and mobile both call this, which is what stops the two platforms from
 * answering "was Asr missed" differently.
 *
 * `now` is a parameter rather than an ambient clock read so a caller (and a test) fixes the
 * instant that every window comparison is made against; the whole page then describes one
 * moment instead of drifting across the calls.
 */
export async function loadDeenOverview(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<DeenOverview>> {
  const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('id', userId).single();
  if (profileError) return dataErr(mapDataError(profileError));

  const timezone = profile.timezone;
  const today = getUserLocalToday(timezone, now);
  const calcMethod = toCalcMethod(profile.prayer_calc_method);
  const asrMadhab = toAsrMadhab(profile.asr_madhab);
  const lat = profile.location_lat;
  const lng = profile.location_lng;
  const hasLocation = lat != null && lng != null;

  const qadaFrom = addDays(today, -(QADA_WINDOW_DAYS - 1));
  const gridFrom = addDays(today, -(CONSISTENCY_WINDOW_DAYS - 1));
  const weekStart = startOfWeek(today);

  const [prayers, sunnah, adhkar, quran, reflections] = await Promise.all([
    listPrayersInRange(client, userId, qadaFrom, today),
    listSunnahLogsInRange(client, userId, today, today),
    listAdhkarLogsInRange(client, userId, today, today),
    listQuranSessionsInRange(client, userId, weekStart, today),
    listReflectionEntriesInRange(client, userId, today, today),
  ]);
  if (!prayers.ok) return prayers;
  if (!sunnah.ok) return sunnah;
  if (!adhkar.ok) return adhkar;
  if (!quran.ok) return quran;
  if (!reflections.ok) return reflections;

  const floor = trackingFloor(
    { trackingStartedOn: profile.tracking_started_on, createdAt: profile.created_at },
    timezone,
    now,
  );

  const qadaDates = dateRange(qadaFrom, today);
  const resolved = resolvePrayerStatuses({
    rows: prayers.data.map((row) => ({
      date: row.local_date,
      prayerName: row.prayer_name,
      status: row.status,
    })),
    dates: qadaDates,
    lat,
    lng,
    timeZone: timezone,
    calcMethod,
    asrMadhab,
    now,
    floor,
  });

  // The heatmap and the headline numbers quote the last 30 days; the backlog reaches further
  // back so its `older` bucket can be non-empty. One resolve serves both -- the grid window is
  // a slice of the same map, so the two surfaces cannot disagree about a shared day.
  const gridDates = dateRange(gridFrom, today);
  const gridResolved: Record<LocalDate, ResolvedDayStatuses> = {};
  for (const date of gridDates) {
    const day = resolved[date];
    if (day) gridResolved[date] = day;
  }

  const backlog = buildQadaBacklog(resolved);
  // Computed once and shared by `todayWindows` and `next`: two solves of the same day would be
  // two chances to disagree about when Maghrib is.
  const todayWindows = hasLocation
    ? computePrayerWindows({ date: today, lat, lng, timeZone: timezone, calcMethod, asrMadhab })
    : null;
  const pageTotals = quran.data.reduce<{ pages: number; recorded: number }>(
    (acc, row) => (row.pages_read == null ? acc : { pages: acc.pages + row.pages_read, recorded: acc.recorded + 1 }),
    { pages: 0, recorded: 0 },
  );

  return dataOk({
    today,
    timezone,
    location: hasLocation ? { label: profile.location_label, lat, lng } : null,
    calcMethod,
    asrMadhab,
    todayWindows,
    todayStatuses:
      resolved[today] ??
      (Object.fromEntries(PRAYER_NAMES.map((name) => [name, 'pending' as const])) as ResolvedDayStatuses),
    next: todayWindows ? nextPrayer(todayWindows, now) : null,
    qada: {
      items: backlog.items,
      buckets: bucketQadaBacklog(backlog.items, today),
      derivedCount: backlog.derivedCount,
      legacyOwed: profile.qada_owed,
      totalOwed: totalQadaOwed(profile.qada_owed, backlog.derivedCount),
    },
    grid: buildConsistencyGrid(gridResolved, gridDates),
    summary: summariseConsistency(gridResolved),
    sunnahToday: sunnah.data.map((row) => ({ prayerName: row.prayer_name, slot: row.slot })),
    adhkarToday: adhkar.data.map((row) => row.period),
    quranWeek: {
      weekStart,
      weekEnd: today,
      sessions: quran.data,
      pages: pageTotals.recorded === 0 ? null : pageTotals.pages,
    },
    reflectionToday: reflections.data.at(-1)?.intensity ?? null,
    floor,
  });
}
