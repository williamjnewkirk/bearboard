/**
 * Shapes for the `jsonb` columns in the schema. These are the contracts the
 * app and any edge functions must agree on; Postgres stores them opaquely.
 */

/**
 * One block in a structured rep scheme. A block is either distance-based
 * (`distance_m`) or duration-based (`duration_s`). `reps` defaults to 1 for a
 * single continuous block (e.g. "20 min @ T").
 *
 * Examples:
 *   { reps: 5, distance_m: 1000, target: 'T', rest: '90s' }   // 5 x 1000m @ T
 *   { reps: 4, distance_m: 150, target: 'hill', rest: 'walk down' }
 *   { duration_s: 1200, target: 'T' }                          // 20 min @ T
 */
export interface RepBlock {
  reps?: number;
  distance_m?: number;
  duration_s?: number;
  /** Free-text target: pace label ("T", "5k"), HR zone, or effort ("hill"). */
  target?: string;
  /** Free-text recovery, e.g. "90s", "walk down", "full". */
  rest?: string;
  /** Optional per-block note. */
  note?: string;
}

export type RepScheme = RepBlock[];

/**
 * Per-athlete override payload on a `day_assignments` row. Any field left
 * undefined inherits the team/squad value. `day_type` here replaces the whole
 * day (e.g. an athlete does "xt" instead of the workout).
 */
export interface AssignmentOverrides {
  day_type?: import('./enums').DayType;
  skeleton_label?: string;
  /** Overridden rep parameters, e.g. "20 min T" -> "25-28 min T". */
  rep_scheme?: RepScheme;
  description_rich?: string;
}

/** One submitted rep in a workout result. */
export interface Split {
  rep: number;
  time_s?: number;
  /** For duration-based blocks: actual distance covered. */
  distance_m?: number;
  /** For duration-based blocks: actual duration. */
  duration_s?: number;
  note?: string | null;
  /** Athlete skipped this rep or logged it as felt-based rather than timed. */
  felt_based?: boolean;
}

export type Splits = Split[];

/** Per-lap or per-mile splits entered on a race result / debrief. */
export interface RaceSplit {
  /** Lap number or mile marker. */
  marker: number;
  time_s: number;
  label?: string;
}

export type RaceSplits = RaceSplit[];
