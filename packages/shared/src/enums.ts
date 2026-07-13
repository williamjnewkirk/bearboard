/**
 * Enumerated values used across the schema. Each is exposed both as a
 * readonly tuple (for runtime iteration / validation) and as a string-literal
 * union type (for compile-time safety). Keep these in lockstep with the
 * Postgres enum types defined in supabase/migrations.
 */

export const ROLES = ['coach', 'athlete'] as const;
export type Role = (typeof ROLES)[number];

export const MEMBER_STATUSES = ['active', 'removed'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const DAY_TYPES = [
  'easy',
  'workout',
  'long_run',
  'race',
  'rest',
  'xt',
  'double',
  'lift',
  'other',
] as const;
export type DayType = (typeof DAY_TYPES)[number];

export const RELEASE_STATES = ['draft', 'scheduled', 'published'] as const;
export type ReleaseState = (typeof RELEASE_STATES)[number];

export const ACTIVITY_TYPES = [
  'run',
  'cycle',
  'swim',
  'hike',
  'walk',
  'lift',
  'xt',
  'other',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_SOURCES = ['healthkit', 'health_connect', 'manual'] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export const ACTIVITY_STATUSES = ['pending', 'published', 'discarded'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Per-athlete setting for how detected workouts enter the team feed. */
export const UPLOAD_MODES = ['auto', 'review'] as const;
export type UploadMode = (typeof UPLOAD_MODES)[number];

export const SHOE_CATEGORIES = ['trainer', 'workout', 'spikes', 'racing'] as const;
export type ShoeCategory = (typeof SHOE_CATEGORIES)[number];

export const INJURY_STATUSES = ['healthy', 'managing', 'modified', 'out'] as const;
export type InjuryStatus = (typeof INJURY_STATUSES)[number];

export const BODY_AREAS = [
  'foot',
  'ankle',
  'calf',
  'shin',
  'knee',
  'hamstring',
  'quad',
  'hip',
  'back',
  'other',
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export const MEET_TYPES = [
  'dual',
  'invitational',
  'conference',
  'regional',
  'national',
  'time_trial',
] as const;
export type MeetType = (typeof MEET_TYPES)[number];

export const EVENT_TYPES = ['practice', 'lift', 'meeting', 'meet', 'travel', 'other'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const CONVERSATION_KINDS = ['dm', 'group', 'team'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const PUSH_PLATFORMS = ['ios', 'android'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** Athlete-adjustable event reminder lead time. */
export const REMINDER_LEAD = ['off', '1h', 'morning_of'] as const;
export type ReminderLead = (typeof REMINDER_LEAD)[number];
