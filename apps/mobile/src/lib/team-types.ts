import type { Role } from '@bearboard/shared';

export interface TeamInfo {
  id: string;
  name: string;
  school: string | null;
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
