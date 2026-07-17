/**
 * Unit + time formatting shared by both apps. Storage is metric (meters,
 * seconds); display is imperial (miles, mm:ss) because that's how the team
 * talks about training.
 */

export const METERS_PER_MILE = 1609.344;

export function metersToMiles(m: number): number {
  return m / METERS_PER_MILE;
}

export function milesToMeters(mi: number): number {
  return mi * METERS_PER_MILE;
}

/** "7.03 mi" (trailing zeros trimmed, e.g. "5 mi", "5.5 mi"). */
export function formatMiles(distanceM: number | null | undefined, digits = 2): string {
  if (distanceM == null || !isFinite(distanceM)) return '—';
  const mi = metersToMiles(distanceM);
  const s = mi.toFixed(digits).replace(/\.?0+$/, '');
  return `${s} mi`;
}

/** Seconds -> "h:mm:ss" or "m:ss". */
export function formatDuration(totalS: number | null | undefined): string {
  if (totalS == null || !isFinite(totalS) || totalS < 0) return '—';
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Seconds -> "m:ss.t" for rep splits (tenths kept when present). */
export function formatSplit(timeS: number | null | undefined): string {
  if (timeS == null || !isFinite(timeS) || timeS < 0) return '—';
  const m = Math.floor(timeS / 60);
  const rest = timeS - m * 60;
  const hasTenths = Math.round(timeS * 10) % 10 !== 0;
  const secStr = hasTenths
    ? rest.toFixed(1).padStart(4, '0')
    : String(Math.round(rest)).padStart(2, '0');
  return `${m}:${secStr}`;
}

/** Average pace per mile: "7:12 /mi". */
export function formatPace(
  distanceM: number | null | undefined,
  durationS: number | null | undefined,
): string {
  if (!distanceM || !durationS || distanceM <= 0) return '—';
  const secPerMile = durationS / metersToMiles(distanceM);
  if (!isFinite(secPerMile) || secPerMile <= 0) return '—';
  return `${formatDuration(secPerMile)} /mi`;
}

/**
 * Parse athlete-typed time ("mm:ss", "mm:ss.t", "h:mm:ss", bare seconds like
 * "92" or "92.4") into seconds. Returns null on garbage.
 */
export function parseTimeToSeconds(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
  if (parts.length === 1) return Number(parts[0]);
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return null;
}

/** "Sat, Sep 12" from a YYYY-MM-DD date string (local, no TZ surprises). */
export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "6:30 PM" from an ISO timestamp. */
export function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Sep 12, 6:30 PM" from an ISO timestamp. */
export function formatDateTime(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Whole days from today (local) until a YYYY-MM-DD date. Negative = past. */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Today as a local YYYY-MM-DD string. */
export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function isoOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Shift a YYYY-MM-DD by whole months (clamped to end of month). */
export function addMonths(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const target = new Date(y, m - 1 + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return isoOf(target);
}

/**
 * 42 date strings (6 weeks, Monday-first) covering the month that contains
 * `iso` — including the leading/trailing days from adjacent months. Powers a
 * month calendar grid.
 */
export function monthGrid(iso: string): string[] {
  const [y, m] = iso.split('-').map(Number) as [number, number, number];
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(y, m - 1, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return isoOf(d);
  });
}

/** Is `iso` in the same calendar month as `anchor`? */
export function sameMonth(iso: string, anchor: string): boolean {
  return iso.slice(0, 7) === anchor.slice(0, 7);
}

/** "September 2026" for the month containing `iso`. */
export function monthTitle(iso: string): string {
  const [y, m] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Relative label for feed timestamps: "2h ago", "Tue", "Sep 12". */
export function formatRelative(ts: string): string {
  const then = new Date(ts).getTime();
  const diffMin = Math.floor((Date.now() - then) / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const d = new Date(ts);
  if (diffH < 24 * 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
