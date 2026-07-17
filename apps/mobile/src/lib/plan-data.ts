/**
 * Shared plan queries for Today / This Week (athlete + coach mobile).
 */
import {
  dayTypeName,
  type AssignmentOverrides,
  type DayType,
  type ReleaseState,
  type RepScheme,
} from '@bearboard/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DetailRow {
  id: string;
  description_rich: string | null;
  rep_scheme: RepScheme | null;
  release_state: ReleaseState;
  release_at: string | null;
  published_at: string | null;
  updated_at: string;
}

export interface AssignmentRow {
  id: string;
  team_member_id: string;
  overrides: AssignmentOverrides | null;
  note: string | null;
  skeleton_seen_at: string | null;
  detail_seen_at: string | null;
  confirmed_at: string | null;
}

export interface DayRow {
  id: string;
  date: string;
  day_type: DayType;
  skeleton_label: string | null;
  custom_type_label: string | null;
  detail: DetailRow | null;
  /** The current athlete's assignment (athlete queries) or null. */
  assignment: AssignmentRow | null;
  /** All assignments (coach queries only). */
  assignments: AssignmentRow[];
}

/** Load the week's days. Athletes get one assignment; coaches get all. */
export async function loadDays(
  sb: SupabaseClient,
  teamId: string,
  dates: string[],
  myMemberId: string,
): Promise<{ days: Record<string, DayRow>; error: string | null }> {
  const { data, error } = await sb
    .from('training_days')
    .select(
      'id, date, day_type, skeleton_label, custom_type_label, ' +
        'workout_details(id, description_rich, rep_scheme, release_state, release_at, published_at, updated_at), ' +
        'day_assignments(id, team_member_id, overrides, note, skeleton_seen_at, detail_seen_at, confirmed_at)',
    )
    .eq('team_id', teamId)
    .in('date', dates);
  if (error) return { days: {}, error: error.message };

  const days: Record<string, DayRow> = {};
  for (const d of (data ?? []) as unknown as Array<{
    id: string;
    date: string;
    day_type: DayType;
    skeleton_label: string | null;
    custom_type_label: string | null;
    workout_details: DetailRow[];
    day_assignments: AssignmentRow[];
  }>) {
    const assignments = d.day_assignments ?? [];
    days[d.date] = {
      id: d.id,
      date: d.date,
      day_type: d.day_type,
      skeleton_label: d.skeleton_label,
      custom_type_label: d.custom_type_label ?? null,
      detail: d.workout_details?.[0] ?? null,
      assignment: assignments.find((a) => a.team_member_id === myMemberId) ?? null,
      assignments,
    };
  }
  return { days, error: null };
}

/** The athlete's effective day type / label / prescription with overrides. */
export function effective(day: DayRow): {
  dayType: DayType;
  /** Display name (custom label when the team day is a named "other"). */
  typeName: string;
  label: string | null;
  description: string | null;
  scheme: RepScheme | null;
} {
  const o = day.assignment?.overrides ?? null;
  const published = day.detail?.release_state === 'published';
  const dayType = o?.day_type ?? day.day_type;
  return {
    dayType,
    typeName: o?.day_type
      ? dayTypeName(o.day_type)
      : dayTypeName(day.day_type, day.custom_type_label),
    label: o?.skeleton_label ?? day.skeleton_label,
    description: o?.description_rich ?? (published ? (day.detail?.description_rich ?? null) : null),
    scheme: o?.rep_scheme ?? (published ? (day.detail?.rep_scheme ?? null) : null),
  };
}
