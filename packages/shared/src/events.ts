/**
 * Event recurrence expansion (PRD §5.9). Events store a single anchor
 * `starts_at` plus an optional weekly recurrence on a set of ISO weekdays
 * (1=Mon .. 7=Sun). Occurrences are expanded client-side within whatever date
 * range is on screen, so a repeating event shows on every matching day without
 * storing fan-out rows.
 */
import { addDays } from './plan';

/** Local calendar date (YYYY-MM-DD) of a timestamp. */
export function localDateOf(ts: string): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** ISO weekday of a YYYY-MM-DD date: 1=Mon .. 7=Sun. */
export function isoDow(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dow = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}

export interface RecurringEventLike {
  starts_at: string;
  recurrence: string | null;
  recurrence_days?: number[] | null;
}

/** Does this event have an occurrence on the given YYYY-MM-DD date? */
export function eventOccursOn(e: RecurringEventLike, iso: string): boolean {
  const anchor = localDateOf(e.starts_at);
  if (iso < anchor) return false; // never before the first occurrence
  if (!e.recurrence) return iso === anchor;
  const days = e.recurrence_days && e.recurrence_days.length ? e.recurrence_days : [isoDow(anchor)];
  return days.includes(isoDow(iso));
}

/**
 * All occurrence dates (YYYY-MM-DD) of an event within [fromISO, toISO]
 * inclusive. One-time events yield at most their anchor date.
 */
export function expandEventOccurrences(
  e: RecurringEventLike,
  fromISO: string,
  toISO: string,
): string[] {
  const anchor = localDateOf(e.starts_at);
  if (!e.recurrence) return anchor >= fromISO && anchor <= toISO ? [anchor] : [];
  const start = fromISO > anchor ? fromISO : anchor;
  const out: string[] = [];
  let cur = start;
  // Guard against pathological ranges (max ~1 year of daily iteration).
  for (let i = 0; cur <= toISO && i < 400; i++) {
    if (eventOccursOn(e, cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Short human summary of a recurrence, e.g. "Mon, Wed, Fri" or "Weekly". */
export function describeRecurrence(recurrence: string | null, days?: number[] | null): string {
  if (!recurrence) return '';
  if (!days || days.length === 0) return 'Weekly';
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => labels[d - 1])
    .join(', ');
}
