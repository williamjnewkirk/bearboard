/**
 * Display labels + accent colors for enum values, shared by both apps so the
 * two surfaces speak the same language. Day-type colors are muted so the
 * brand palette (maroon/crimson/forest/green) keeps carrying the brand weight.
 */
import type {
  ActivityType,
  BodyArea,
  DayType,
  EventType,
  InjuryStatus,
  MeetType,
  ShoeCategory,
} from './enums';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  run: 'Run',
  cycle: 'Ride',
  swim: 'Swim',
  hike: 'Hike',
  walk: 'Walk',
  lift: 'Lift',
  xt: 'Cross-training',
  other: 'Other',
};

export const ACTIVITY_TYPE_ICONS: Record<ActivityType, string> = {
  run: '🏃',
  cycle: '🚴',
  swim: '🏊',
  hike: '🥾',
  walk: '🚶',
  lift: '🏋️',
  xt: '⚡',
  other: '⭐',
};

export const INJURY_STATUS_LABELS: Record<InjuryStatus, string> = {
  healthy: 'Healthy',
  managing: 'Managing',
  modified: 'Modified',
  out: 'Out',
};

/** Badge colors for injury statuses (hex; used on web and mobile). */
export const INJURY_STATUS_COLORS: Record<InjuryStatus, string> = {
  healthy: '#215732', // brand green
  managing: '#B45309', // amber-700
  modified: '#971B2F', // brand maroon
  out: '#BA0C2F', // brand crimson
};

export const BODY_AREA_LABELS: Record<BodyArea, string> = {
  foot: 'Foot',
  ankle: 'Ankle',
  calf: 'Calf',
  shin: 'Shin',
  knee: 'Knee',
  hamstring: 'Hamstring',
  quad: 'Quad',
  hip: 'Hip',
  back: 'Back',
  other: 'Other',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  practice: 'Practice',
  lift: 'Lift',
  meeting: 'Meeting',
  meet: 'Meet',
  travel: 'Travel',
  other: 'Other',
};

export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  practice: '🏃',
  lift: '🏋️',
  meeting: '🗣️',
  meet: '🏁',
  travel: '🚌',
  other: '📌',
};

export const MEET_TYPE_LABELS: Record<MeetType, string> = {
  dual: 'Dual',
  invitational: 'Invitational',
  conference: 'Conference',
  regional: 'Regional',
  national: 'National',
  time_trial: 'Time trial',
};

export const SHOE_CATEGORY_LABELS: Record<ShoeCategory, string> = {
  trainer: 'Trainer',
  workout: 'Workout',
  spikes: 'Spikes',
  racing: 'Racing',
};

/**
 * Accent color per day type (grid chips, week cards). Race is distinct on
 * purpose (PRD §5.9a); workout/long carry the training emphasis.
 */
export const DAY_TYPE_COLORS: Record<DayType, string> = {
  easy: '#6B7280', // gray-500
  workout: '#971B2F', // brand maroon
  long_run: '#215732', // brand green
  race: '#BA0C2F', // brand crimson
  rest: '#9CA3AF', // gray-400
  xt: '#0E7490', // cyan-700
  double: '#7C3AED', // violet-600
  lift: '#B45309', // amber-700
  other: '#6B7280',
};
