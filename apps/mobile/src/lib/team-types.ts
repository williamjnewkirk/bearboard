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
    class_year: string | null;
  };
}

export interface JoinCodeRow {
  role: Role;
  code: string;
}
