/**
 * Notification categories (PRD §6.4). Every category fires by default and is
 * INDIVIDUALLY toggleable by the athlete — there is deliberately no
 * all-or-nothing switch. `split_nudge` is the one exception: off by default
 * and only fires at all when the coach enables it per team.
 *
 * User preferences are stored in `users.notification_prefs` as a jsonb map of
 * category -> boolean. A missing key means "use the default".
 */

export const NOTIFICATION_CATEGORIES = [
  'detail_release',
  'skeleton_publish',
  'detail_update',
  'meet_entry',
  'race_reminder',
  'debrief_prompt',
  'message',
  'announcement',
  'event_reminder',
  'pending_review',
  'split_nudge',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPrefs = Partial<Record<NotificationCategory, boolean>>;

export interface NotificationCategoryMeta {
  category: NotificationCategory;
  label: string;
  description: string;
  /** Settings-screen grouping (PRD tier table). */
  tier: 'Training' | 'Racing' | 'Communication' | 'Logistics' | 'Optional nudges';
  defaultOn: boolean;
}

/**
 * Order matters: the settings screen lists these grouped by tier, with the
 * training tier first — it's framed as the reason to keep notifications on.
 */
export const NOTIFICATION_CATEGORY_META: NotificationCategoryMeta[] = [
  {
    category: 'detail_release',
    label: 'Workout details posted',
    description: 'The one you want — fires when a day’s workout detail is released.',
    tier: 'Training',
    defaultOn: true,
  },
  {
    category: 'skeleton_publish',
    label: 'Week plan published',
    description: 'Your coach published the shape of the week.',
    tier: 'Training',
    defaultOn: true,
  },
  {
    category: 'detail_update',
    label: 'Workout detail changed',
    description: 'A published workout was edited (coach opts in per edit).',
    tier: 'Training',
    defaultOn: true,
  },
  {
    category: 'meet_entry',
    label: 'Meet entries',
    description: 'You were entered in a meet.',
    tier: 'Racing',
    defaultOn: true,
  },
  {
    category: 'race_reminder',
    label: 'Race day tomorrow',
    description: 'A heads-up the day before you race.',
    tier: 'Racing',
    defaultOn: true,
  },
  {
    category: 'debrief_prompt',
    label: 'Race debrief prompt',
    description: 'One reminder the evening after a meet. Never nags.',
    tier: 'Racing',
    defaultOn: true,
  },
  {
    category: 'message',
    label: 'New messages',
    description: 'DMs, group chats, team chat. Also mutable per conversation.',
    tier: 'Communication',
    defaultOn: true,
  },
  {
    category: 'announcement',
    label: 'Announcements',
    description: 'Coach posts to the team or your squad.',
    tier: 'Communication',
    defaultOn: true,
  },
  {
    category: 'event_reminder',
    label: 'Event reminders',
    description: 'Practices, lifts, meetings, travel.',
    tier: 'Logistics',
    defaultOn: true,
  },
  {
    category: 'pending_review',
    label: 'Activities to review',
    description: 'A synced workout is waiting in your review tray.',
    tier: 'Logistics',
    defaultOn: true,
  },
  {
    category: 'split_nudge',
    label: 'Split reminder',
    description: 'Evening nudge to log splits from today’s workout (team setting).',
    tier: 'Optional nudges',
    defaultOn: false,
  },
];

export function notificationDefault(category: NotificationCategory): boolean {
  return NOTIFICATION_CATEGORY_META.find((m) => m.category === category)?.defaultOn ?? true;
}

export function notificationEnabled(
  prefs: NotificationPrefs | null | undefined,
  category: NotificationCategory,
): boolean {
  const v = prefs?.[category];
  return typeof v === 'boolean' ? v : notificationDefault(category);
}
