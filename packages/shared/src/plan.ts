/**
 * View-model shapes for the planning UI (assembled client-side from joined
 * queries). These are convenience types for the apps, not raw table rows â see
 * rows.ts for the table shapes.
 */
import type { DayType, ReleaseState } from './enums';
import type { AssignmentOverrides, RepScheme } from './json';

/** The 7 day_types laid out for the week header, in menu order. */
export const DAY_TYPE_LABELS: Record<DayType, string> = {
  easy: 'Easy',
  workout: 'Workout',
  long_run: 'Long Run',
  race: 'Race',
  rest: 'Rest',
  xt: 'XT',
  double: 'Double',
  lift: 'Lift',
  other: 'Other',
};

/**
 * Display name for a day: the coach's custom label when the type is "other"
 * and a name was given, otherwise the standard enum label. Use everywhere a
 * day type is shown so custom day types read as first-class.
 */
export function dayTypeName(dayType: DayType, customTypeLabel?: string | null): string {
  if (dayType === 'other' && customTypeLabel && customTypeLabel.trim()) {
    return customTypeLabel.trim();
  }
  return DAY_TYPE_LABELS[dayType];
}

/** A day's detail as the coach sees it (any release state). */
export interface DetailView {
  id: string;
  description_rich: string | null;
  rep_scheme: RepScheme | null;
  release_state: ReleaseState;
  published_at: string | null;
}

/** One training day within a week (skeleton + optional detail). */
export interface PlanDay {
  id: string; // training_day id
  date: string; // YYYY-MM-DD
  day_type: DayType;
  skeleton_label: string | null;
  /** Coach's custom name when day_type is 'other' (else null). */
  custom_type_label?: string | null;
  detail: DetailView | null;
}

/** A per-athlete assignment for a given training day. */
export interface AssignmentView {
  id: string;
  training_day_id: string;
  team_member_id: string;
  overrides: AssignmentOverrides | null;
  note: string | null;
  skeleton_seen_at: string | null;
  detail_seen_at: string | null;
  confirmed_at: string | null;
}

/** ISO Monday for the week containing `d` (local date math, no TZ shift). */
export function mondayOf(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (copy.getDay() + 6) % 7; // 0 = Monday
  copy.setDate(copy.getDate() - dow);
  return toISODate(copy);
}

/** The 7 ISO dates (Mon..Sun) of the week starting at `weekStart` (YYYY-MM-DD). */
export function weekDates(weekStart: string): string[] {
  const [y, m, d] = weekStart.split('-').map(Number) as [number, number, number];
  const base = new Date(y, m - 1, d);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    return toISODate(day);
  });
}

export function addDays(weekStart: string, delta: number): string {
  const [y, m, d] = weekStart.split('-').map(Number) as [number, number, number];
  const day = new Date(y, m - 1, d + delta);
  return toISODate(day);
}

function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
