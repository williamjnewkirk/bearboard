/**
 * Activity sync architecture (PRD §5.3 + CLAUDE.md platform strategy):
 * a platform-agnostic SyncProvider interface so HealthKit ships first and
 * Health Connect lands later as an additive change, never a rearchitecture.
 *
 * IMPORTANT: real HealthKit/Health Connect access requires a DEV-CLIENT build
 * (EAS), never Expo Go. Until that build exists, `getSyncProvider()` returns
 * an unavailable provider and the UI shows the setup path + manual entry.
 *
 * To wire HealthKit (dev-client build):
 *   1. `npx expo install react-native-health` + add its config plugin to
 *      app.json (flags NSHealthShareUsageDescription — pre-build action item).
 *   2. Implement `healthKitProvider` below with anchored workout queries
 *      (running/cycling/swimming/hiking/walking/other) + background delivery.
 *   3. Return it from getSyncProvider() on iOS when the module is present.
 * Health Connect mirrors this with react-native-health-connect on Android.
 */
import type { ActivitySource, ActivityType } from '@bearboard/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DetectedWorkout {
  externalId: string;
  type: ActivityType;
  title: string | null;
  startedAt: string; // ISO
  distanceM: number | null;
  durationS: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationM: number | null;
  source: ActivitySource;
}

export interface SyncProvider {
  name: string;
  /** Native module present + platform supported (needs a dev-client build). */
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  fetchRecentWorkouts(sinceDays: number): Promise<DetectedWorkout[]>;
}

/** Placeholder until the HealthKit dev-client build lands. */
const unavailableProvider: SyncProvider = {
  name: 'none',
  isAvailable: async () => false,
  requestPermissions: async () => false,
  fetchRecentWorkouts: async () => [],
};

export function getSyncProvider(): SyncProvider {
  // Dev-client builds swap this for healthKitProvider / healthConnectProvider.
  return unavailableProvider;
}

/**
 * Import detected workouts through the dedup RPC. Server-side dedup (vendor id
 * + ±3 min window) makes this safe to call repeatedly; the athlete's upload
 * mode decides pending-tray vs auto-publish.
 */
export async function importDetectedWorkouts(
  sb: SupabaseClient,
  teamMemberId: string,
  workouts: DetectedWorkout[],
): Promise<{ imported: number; errors: string[] }> {
  let imported = 0;
  const errors: string[] = [];
  for (const w of workouts) {
    const { error } = await sb.rpc('import_activity', {
      p_team_member_id: teamMemberId,
      p_type: w.type,
      p_title: w.title,
      p_started_at: w.startedAt,
      p_distance_m: w.distanceM,
      p_duration_s: w.durationS,
      p_avg_hr: w.avgHr,
      p_max_hr: w.maxHr,
      p_elevation_m: w.elevationM,
      p_source: w.source,
      p_external_id: w.externalId,
    });
    if (error) errors.push(error.message);
    else imported++;
  }
  return { imported, errors };
}

/** Per-vendor watch → Apple Health setup instructions (onboarding, §5.3). */
export const VENDOR_SETUP: Array<{ vendor: string; steps: string[] }> = [
  {
    vendor: 'Garmin',
    steps: [
      'Open the Garmin Connect app',
      'Profile & Settings → Health & Fitness data → Apple Health',
      'Enable "Send workouts to Apple Health"',
      'Your runs then flow: watch → Garmin Connect → Apple Health → BearBoard',
    ],
  },
  {
    vendor: 'COROS',
    steps: [
      'Open the COROS app',
      'Profile → Settings → 3rd Party Apps → Apple Health',
      'Allow COROS to write workouts to Apple Health',
    ],
  },
  {
    vendor: 'Apple Watch',
    steps: ['Nothing to set up — watch workouts land in Apple Health automatically'],
  },
];
