import type { Database } from '../database.types';

// Its own file, not defined inline in dayView.ts, specifically so risk.ts/workload.ts/
// mvd.ts/recoveryMode.ts can import the type without importing dayView.ts itself --
// dayView.ts imports all four of those, so a type living there would create a cycle.
export type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];
