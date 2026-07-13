/**
 * Row types for the core tables (PRD Â§6.2). Field names and nullability mirror
 * the Postgres schema in supabase/migrations/0001_init.sql. Timestamps are
 * ISO-8601 strings as returned by Supabase (`timestamptz`); dates are
 * `YYYY-MM-DD` strings (`date`).
 */

import type {
  ActivitySource,
  ActivityStatus,
  ActivityType,
  BodyArea,
  ConversationKind,
  DayType,
  EventType,
  InjuryStatus,
  MeetType,
  ReleaseState,
  Role,
  MemberStatus,
  PushPlatform,
  ShoeCategory,
} from './enums';
import type { AssignmentOverrides, RaceSplits, RepScheme, Splits } from './json';

export type UUID = string;
/** A Clerk user id (text, e.g. `user_2ab...`) â used directly as the user PK. */
export type ClerkUserId = string;
/** ISO-8601 timestamp with timezone. */
export type Timestamp = string;
/** Calendar date, `YYYY-MM-DD`. */
export type DateString = string;

// --- Identity, teams, membership ---

export interface User {
  /** The Clerk user id; there is no separate uuid or clerk_id column. */
  id: ClerkUserId;
  name: string;
  photo_url: string | null;
  class_year: string | null;
  events: string | null;
  created_at: Timestamp;
}

export interface Team {
  id: UUID;
  name: string;
  school: string | null;
  timezone: string;
  feed_visible_to_athletes: boolean;
  created_at: Timestamp;
}

export interface TeamMember {
  id: UUID;
  team_id: UUID;
  user_id: ClerkUserId;
  role: Role;
  status: MemberStatus;
  joined_at: Timestamp;
}

export interface JoinCode {
  id: UUID;
  team_id: UUID;
  role: Role;
  code: string;
  active: boolean;
}

export interface Squad {
  id: UUID;
  team_id: UUID;
  name: string;
}

export interface SquadMember {
  squad_id: UUID;
  team_member_id: UUID;
}

// --- Planning ---

export interface Week {
  id: UUID;
  team_id: UUID;
  start_date: DateString;
  skeleton_published_at: Timestamp | null;
}

export interface TrainingDay {
  id: UUID;
  team_id: UUID;
  week_id: UUID;
  date: DateString;
  day_type: DayType;
  skeleton_label: string | null;
  created_by: UUID;
}

export interface WorkoutDetail {
  id: UUID;
  training_day_id: UUID;
  description_rich: string | null;
  rep_scheme: RepScheme | null;
  release_state: ReleaseState;
  release_at: Timestamp | null;
  published_at: Timestamp | null;
  updated_at: Timestamp;
  created_by: UUID;
}

export interface WorkoutTemplate {
  id: UUID;
  team_id: UUID;
  name: string;
  description_rich: string | null;
  rep_scheme: RepScheme | null;
  created_by: UUID;
}

export interface DayAssignment {
  id: UUID;
  training_day_id: UUID;
  team_member_id: UUID;
  overrides: AssignmentOverrides | null;
  note: string | null;
  skeleton_seen_at: Timestamp | null;
  detail_seen_at: Timestamp | null;
  confirmed_at: Timestamp | null;
}

export interface MileageGoal {
  id: UUID;
  team_member_id: UUID;
  week_id: UUID;
  goal_low: number | null;
  goal_high: number | null;
  qualifier: string | null;
}

// --- Racing ---

export interface Meet {
  id: UUID;
  team_id: UUID;
  name: string;
  date: DateString;
  location: string | null;
  course: string | null;
  meet_type: MeetType | null;
  departure_at: Timestamp | null;
  notes: string | null;
  is_goal_race: boolean;
}

export interface MeetEntry {
  id: UUID;
  meet_id: UUID;
  team_member_id: UUID;
  event: string | null;
  entered: boolean;
}

export interface MeetResult {
  id: UUID;
  meet_entry_id: UUID;
  mark: string | null;
  place: number | null;
  splits: RaceSplits | null;
  entered_by: UUID;
}

/**
 * Coach-only reflective debrief. RLS restricts reads to the authoring athlete
 * plus team coaches â never teammates, under any feed setting (PRD Â§5.9a).
 */
export interface RaceDebrief {
  id: UUID;
  meet_entry_id: UUID;
  team_member_id: UUID;
  went_well: string | null;
  didnt_go_well: string | null;
  prep_done_well: string | null;
  prep_would_change: string | null;
  academic_stress: number | null;
  academic_stress_note: string | null;
  fatigue: number | null;
  fatigue_note: string | null;
  sleep_fueling_note: string | null;
  note_to_coach: string | null;
  submitted_at: Timestamp | null;
  updated_at: Timestamp;
}

// --- Activities & results ---

export interface Activity {
  id: UUID;
  team_member_id: UUID;
  type: ActivityType;
  title: string | null;
  started_at: Timestamp;
  distance_m: number | null;
  duration_s: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_m: number | null;
  description: string | null;
  /** Always coach-only, never exposed to teammates. */
  private_note: string | null;
  shoe_id: UUID | null;
  source: ActivitySource;
  /** Vendor/source id used for dedup. */
  external_id: string | null;
  status: ActivityStatus;
}

export interface ActivityLike {
  activity_id: UUID;
  team_member_id: UUID;
}

export interface WorkoutResult {
  id: UUID;
  assignment_id: UUID;
  activity_id: UUID | null;
  splits: Splits | null;
  rpe: number | null;
  comment: string | null;
  submitted_at: Timestamp;
}

export interface Shoe {
  id: UUID;
  team_member_id: UUID;
  brand_model: string;
  nickname: string | null;
  category: ShoeCategory | null;
  start_miles: number;
  retired: boolean;
  threshold_miles: number | null;
}

// --- Status ---

/** Append-only history; latest row per member is the current status. */
export interface InjuryStatusRow {
  id: UUID;
  team_member_id: UUID;
  status: InjuryStatus;
  body_area: BodyArea | null;
  note: string | null;
  /** Athlete or coach who set it (attributed in history). */
  set_by: UUID;
  created_at: Timestamp;
}

export interface FatigueCheckin {
  id: UUID;
  team_member_id: UUID;
  score: number;
  created_at: Timestamp;
}

// --- Messaging ---

export interface Conversation {
  id: UUID;
  team_id: UUID;
  kind: ConversationKind;
  name: string | null;
}

export interface ConversationMember {
  conversation_id: UUID;
  team_member_id: UUID;
  muted: boolean;
  last_read_at: Timestamp | null;
}

export interface Message {
  id: UUID;
  conversation_id: UUID;
  sender_id: UUID;
  body: string | null;
  image_url: string | null;
  created_at: Timestamp;
  deleted: boolean;
}

// --- Announcements, schedule, push ---

export interface Announcement {
  id: UUID;
  team_id: UUID;
  author_id: UUID;
  body_rich: string;
  image_url: string | null;
  pinned: boolean;
  squad_id: UUID | null;
  created_at: Timestamp;
}

export interface TeamEvent {
  id: UUID;
  team_id: UUID;
  title: string;
  type: EventType;
  starts_at: Timestamp;
  location: string | null;
  notes: string | null;
  recurrence: string | null;
  created_by: UUID;
}

export interface EventTarget {
  event_id: UUID;
  squad_id: UUID | null;
  team_member_id: UUID | null;
}

export interface PushToken {
  user_id: ClerkUserId;
  expo_token: string;
  platform: PushPlatform;
}
