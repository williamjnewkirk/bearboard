import type { Role } from '@bearboard/shared';

export interface TeamInfo {
  id: string;
  name: string;
  school: string | null;
  timezone: string;
  feed_visible_to_athletes: boolean;
  split_nudge_enabled: boolean;
}

export interface Membership {
  id: string;
  role: Role;
  team: TeamInfo;
}

export interface RosterRow {
  id: string; // team_member id
  role: Role;
  user: {
    id: string;
    name: string;
    photo_url: string | null;
    class_year: string | null;
    /** Present only when the query selects them. */
    events?: string | null;
    title?: string | null;
  };
}

export interface SquadRow {
  id: string;
  name: string;
  member_ids: string[]; // team_member ids
}

export interface JoinCodeRow {
  role: Role;
  code: string;
}

/** supabase-js never throws; normalize its error into a display string. */
export function errText(error: { message?: string } | null, fallback: string): string | null {
  if (!error) return null;
  return error.message ?? fallback;
}
