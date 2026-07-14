import {
  BRAND_COLORS,
  DAY_TYPE_LABELS,
  WEEKDAY_LABELS,
  mondayOf,
  weekDates,
  type DayType,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership } from '../lib/team-types';

interface DayRow {
  id: string;
  date: string;
  day_type: DayType;
  skeleton_label: string | null;
  detail: { description_rich: string | null; release_state: string } | null;
  assignment: {
    id: string;
    overrides: { day_type?: DayType } | null;
    note: string | null;
    confirmed_at: string | null;
  } | null;
}

/** Athlete "This Week": the 7-day skeleton + released detail, with overrides. */
export function ThisWeekScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const weekStart = mondayOf(new Date());
  const dates = weekDates(weekStart);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('training_days')
      .select(
        'id, date, day_type, skeleton_label, ' +
          'workout_details(description_rich, release_state), ' +
          'day_assignments(id, overrides, note, confirmed_at)',
      )
      .eq('team_id', membership.team.id)
      .in('date', dates);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const byDate: Record<string, DayRow> = {};
    for (const d of (data ?? []) as unknown as Array<{
      id: string;
      date: string;
      day_type: DayType;
      skeleton_label: string | null;
      workout_details: Array<{ description_rich: string | null; release_state: string }>;
      day_assignments: Array<DayRow['assignment']>;
    }>) {
      byDate[d.date] = {
        id: d.id,
        date: d.date,
        day_type: d.day_type,
        skeleton_label: d.skeleton_label,
        detail: d.workout_details?.[0] ?? null,
        assignment: d.day_assignments?.[0] ?? null,
      };
    }
    setRows(dates.map((date, i) => byDate[date] ?? emptyDay(date, i)));

    // Mark skeletons seen (fire-and-forget).
    for (const d of Object.values(byDate)) {
      if (d.assignment) void sb.rpc('mark_skeleton_seen', { p_assignment_id: d.assignment.id });
    }
    setLoading(false);
  }, [getSupabase, membership.team.id, dates]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership.team.id]);

  async function confirm(assignmentId: string) {
    const sb = await getSupabase();
    await sb.rpc('confirm_assignment', { p_assignment_id: assignmentId });
    await load();
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BRAND_COLORS.maroon} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <Text style={styles.h1}>This Week</Text>
      <Text style={styles.sub}>Week of {weekStart}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {rows.map((d, i) => {
        const type = d.assignment?.overrides?.day_type ?? d.day_type;
        const published = d.detail?.release_state === 'published';
        const isToday = d.date === todayISO();
        return (
          <View key={d.date} style={[styles.card, isToday && styles.cardToday]}>
            <View style={styles.cardHeader}>
              <Text style={styles.weekday}>
                {WEEKDAY_LABELS[i]} · {d.date.slice(5)}
              </Text>
              <Text style={styles.dayType}>{DAY_TYPE_LABELS[type]}</Text>
            </View>
            {d.skeleton_label ? <Text style={styles.label}>{d.skeleton_label}</Text> : null}

            {!d.assignment ? (
              <Text style={styles.muted}>Not published yet.</Text>
            ) : published && d.detail?.description_rich ? (
              <>
                <Text style={styles.detail}>{d.detail.description_rich}</Text>
                {d.assignment.note ? (
                  <Text style={styles.note}>Note: {d.assignment.note}</Text>
                ) : null}
                {d.assignment.confirmed_at ? (
                  <Text style={styles.confirmed}>✓ Got it</Text>
                ) : (
                  <Pressable style={styles.gotIt} onPress={() => void confirm(d.assignment!.id)}>
                    <Text style={styles.gotItText}>Got it 👍</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <Text style={styles.muted}>
                Details coming{d.assignment.note ? ` · ${d.assignment.note}` : ''}
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function emptyDay(date: string, _i: number): DayRow {
  return {
    id: `empty-${date}`,
    date,
    day_type: 'rest',
    skeleton_label: null,
    detail: null,
    assignment: null,
  };
}

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND_COLORS.white, paddingHorizontal: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLORS.white,
  },
  h1: { fontSize: 24, fontWeight: '700', color: BRAND_COLORS.maroon, marginTop: 8 },
  sub: { fontSize: 13, color: '#666', marginBottom: 8 },
  error: { color: BRAND_COLORS.crimson, marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: '#e4e4e4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardToday: { borderColor: BRAND_COLORS.maroon, borderWidth: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekday: { fontSize: 13, color: '#888', fontWeight: '600' },
  dayType: { fontSize: 16, fontWeight: '700', color: BRAND_COLORS.forest },
  label: { fontSize: 14, color: '#444', marginTop: 2 },
  detail: { fontSize: 14, color: '#111', marginTop: 8, lineHeight: 20 },
  note: { fontSize: 13, color: BRAND_COLORS.maroon, marginTop: 6 },
  muted: { fontSize: 13, color: '#999', marginTop: 8, fontStyle: 'italic' },
  gotIt: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: BRAND_COLORS.green,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  gotItText: { color: BRAND_COLORS.white, fontWeight: '600' },
  confirmed: { marginTop: 10, color: BRAND_COLORS.green, fontWeight: '600' },
});
