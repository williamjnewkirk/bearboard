/**
 * Helpers for structured rep schemes: human-readable descriptions and the
 * expansion that powers the results form (each block's reps become individual
 * time inputs — PRD §5.5).
 */
import type { RepBlock, RepScheme, Split } from './json';
import { formatDuration } from './format';

/** "5 × 1000m @ T, 90s rest" / "20 min @ T". */
export function describeBlock(b: RepBlock): string {
  const reps = b.reps && b.reps > 1 ? `${b.reps} × ` : '';
  let core: string;
  if (b.distance_m != null) {
    core =
      b.distance_m >= 1609 && b.distance_m % 1609 < 10
        ? `${Math.round(b.distance_m / 1609)} mi`
        : `${b.distance_m}m`;
  } else if (b.duration_s != null) {
    core = b.duration_s % 60 === 0 ? `${b.duration_s / 60} min` : formatDuration(b.duration_s);
  } else {
    core = b.note ?? 'block';
  }
  const target = b.target ? ` @ ${b.target}` : '';
  const rest = b.rest ? `, ${b.rest} rest` : '';
  return `${reps}${core}${target}${rest}`;
}

export function describeScheme(scheme: RepScheme | null | undefined): string {
  if (!scheme || scheme.length === 0) return '';
  return scheme.map(describeBlock).join(' · ');
}

/** One input row in the results form. */
export interface ResultRow {
  /** 1-based global rep number across the whole scheme. */
  rep: number;
  blockIndex: number;
  /** Label like "1000m @ T · rep 2/5" or "20 min @ T". */
  label: string;
  /** Duration-based blocks capture duration+distance instead of a rep time. */
  durationBased: boolean;
}

/** Expand a scheme into individual result rows (5×1k -> 5 rows). */
export function expandScheme(scheme: RepScheme): ResultRow[] {
  const rows: ResultRow[] = [];
  let rep = 1;
  scheme.forEach((b, blockIndex) => {
    const count = Math.max(1, Math.min(b.reps ?? 1, 60));
    const durationBased = b.duration_s != null && b.distance_m == null;
    for (let i = 1; i <= count; i++) {
      const base = describeBlock({ ...b, reps: 1 });
      rows.push({
        rep,
        blockIndex,
        label: count > 1 ? `${base} · rep ${i}/${count}` : base,
        durationBased,
      });
      rep++;
    }
  });
  return rows;
}

/** Look up the submitted split for a global rep number. */
export function splitForRep(splits: Split[] | null | undefined, rep: number): Split | undefined {
  return splits?.find((s) => s.rep === rep);
}
