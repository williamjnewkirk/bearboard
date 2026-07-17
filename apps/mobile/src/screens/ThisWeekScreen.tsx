/**
 * Athlete "This Week" (PRD §5.2.5): all seven days — skeleton always, the full
 * personalized prescription once each day's detail is released. Seen receipts
 * fire at both layers; "Got it 👍" confirms.
 */
import {
  BRAND_COLORS,
  DAY_TYPE_COLORS,
  DAY_TYPE_LABELS,
  WEEKDAY_LABELS,
  addDays,
  describeScheme,
  formatDateTime,
  mondayOf,
  todayISO,
  weekDates,
  type Split,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership } from '../lib/team-types';
import { effective, loadDays, type DayRow } from '../lib/plan-data';
import { Button, Card, Chip, EmptyState, ErrorText, GRAY, Loading, LoadingScreen, Screen } from '../lib/ui';
import { ResultsForm } from './ResultsForm';

export function ThisWeekScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [days, setDays] = useState<Record<string, DayRow>>({});
  const [goal, setGoal] = useState<{
    low: number | null;
    high: number | null;
    qualifier: string | null;
  } | null>(null);
  const [results, setResults] = useState<
    Record<string, { splits: Split[] | null; rpe: number | null; comment: string | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [logFor, setLogFor] = useState<DayRow | null>(null);

  const dates = weekDates(weekStart);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    void sb.rpc('release_due_details');

    // Make sure I have assignment rows for this published week (covers joining
    // after the coach published) so seen/confirm receipts have a home.
    await sb.rpc('ensure_my_assignments', {
      p_team_id: membership.team.id,
      p_week_start: weekStart,
    });

    const { days: dayMap, error: dErr } = await loadDays(
      sb,
      membership.team.id,
      dates,
      membership.id,
    );
    if (dErr) {
      setError(dErr);
      setLoading(false);
      return;
    }
    setDays(dayMap);

    // Seen receipts (fire-and-forget): skeleton for every visible day, detail
    // for days whose released prescription is on screen.
    for (const d of Object.values(dayMap)) {
      if (d.assignment) {
        void sb.rpc('mark_skeleton_seen', { p_assignment_id: d.assignment.id });
        if (d.detail?.release_state === 'published') {
          void sb.rpc('mark_detail_seen', { p_assignment_id: d.assignment.id });
        }
      }
    }

    // Mileage goal for the week.
    const { data: weekRow } = await sb
      .from('weeks')
      .select('id')
      .eq('team_id', membership.team.id)
      .eq('start_date', weekStart)
      .maybeSingle();
    if ((weekRow as { id?: string } | null)?.id) {
      const { data: g } = await sb
        .from('mileage_goals')
        .select('goal_low, goal_high, qualifier')
        .eq('week_id', (weekRow as { id: string }).id)
        .eq('team_member_id', membership.id)
        .maybeSingle();
      setGoal(
        g
          ? {
              low: (g as { goal_low: number | null }).goal_low,
              high: (g as { goal_high: number | null }).goal_high,
              qualifier: (g as { qualifier: string | null }).qualifier,
            }
          : null,
      );
    } else {
      setGoal(null);
    }

    // My submitted results for these assignments.
    const asgIds = Object.values(dayMap)
      .map((d) => d.assignment?.id)
      .filter((x): x is string => Boolean(x));
    if (asgIds.length) {
      const { data: res } = await sb
        .from('workout_results')
        .select('assignment_id, splits, rpe, comment')
        .in('assignment_id', asgIds);
      const rMap: typeof results = {};
      for (const r of (res ?? []) as unknown as Array<{
        assignment_id: string;
        splits: Split[] | null;
        rpe: number | null;
        comment: string | null;
      }>) {
        rMap[r.assignment_id] = r;
      }
      setResults(rMap);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSupabase, membership.team.id, membership.id, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(assignmentId: string) {
    // Optimistic: flip the card to "Got it" instantly, reconcile on error.
    const nowIso = new Date().toISOString();
    setDays((prev) => {
      const next: Record<string, DayRow> = {};
      for (const [date, d] of Object.entries(prev)) {
        next[date] =
          d.assignment?.id === assignmentId
            ? {
                ...d,
                assignment: { ...d.assignment, confirmed_at: nowIso, detail_seen_at: nowIso },
              }
            : d;
      }
      return next;
    });
    const sb = await getSupabase();
    const { error } = await sb.rpc('confirm_assignment', { p_assignment_id: assignmentId });
    if (error) await load();
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) return <LoadingScreen title="This Week" variant="days" />;

  const anyVisible = dates.some((d) => days[d]?.assignment);

  return (
    <Screen
      title="This Week"
      subtitle={`Week of ${weekStart}${goal ? ` · goal ${goal.low ?? ''}–${goal.high ?? ''} mi${goal.qualifier ? ` (${goal.qualifier})` : ''}` : ''}`}
      right={
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Button
            small
            variant="ghost"
            label="‹"
            onPress={() => setWeekStart(addDays(weekStart, -7))}
          />
          <Button
            small
            variant="ghost"
            label="›"
            onPress={() => setWeekStart(addDays(weekStart, 7))}
          />
        </View>
      }
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ErrorText>{error}</ErrorText>

      {!anyVisible ? (
        <EmptyState
          icon="calendar-outline"
          title="This week isn’t published yet"
          hint="You’ll get a push the moment your coach posts the week. Pull to refresh."
        />
      ) : null}

      {dates.map((date, i) => {
        const d = days[date];
        const isToday = date === todayISO();
        if (!d || !d.assignment) {
          return (
            <Card key={date} style={isToday ? st.todayCard : undefined}>
              <View style={st.cardHeader}>
                <Text style={st.weekday}>
                  {WEEKDAY_LABELS[i]} · {date.slice(5)}
                </Text>
                <Text style={st.mutedSmall}>{d ? 'Not published' : '—'}</Text>
              </View>
            </Card>
          );
        }
        const eff = effective(d);
        const published = d.detail?.release_state === 'published';
        const scheduled = d.detail?.release_state === 'scheduled';
        const edited =
          published &&
          d.detail?.updated_at &&
          d.detail?.published_at &&
          d.detail.updated_at > d.detail.published_at;
        const result = results[d.assignment.id];
        return (
          <Card
            key={date}
            style={isToday ? st.todayCard : undefined}
            accent={DAY_TYPE_COLORS[eff.dayType]}
          >
            <View style={st.cardHeader}>
              <Text style={[st.weekday, isToday && { color: BRAND_COLORS.maroon }]}>
                {isToday ? 'TODAY' : WEEKDAY_LABELS[i]} · {date.slice(5)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {d.assignment.overrides?.day_type ? (
                  <Chip color={BRAND_COLORS.maroon} label="custom" />
                ) : null}
                {edited ? <Chip color="#B45309" label="updated" /> : null}
                <Text style={[st.dayType, { color: DAY_TYPE_COLORS[eff.dayType] }]}>
                  {eff.typeName}
                </Text>
              </View>
            </View>
            {eff.label ? <Text style={st.label}>{eff.label}</Text> : null}

            {eff.description ? (
              <Text style={st.detail}>{eff.description}</Text>
            ) : published ? null : (
              <Text style={st.muted}>
                Details coming
                {scheduled && d.detail?.release_at
                  ? ` · expected ${formatDateTime(d.detail.release_at)}`
                  : ''}
              </Text>
            )}
            {eff.scheme?.length ? (
              <Text style={st.scheme}>{describeScheme(eff.scheme)}</Text>
            ) : null}
            {d.assignment.note ? <Text style={st.note}>Coach: {d.assignment.note}</Text> : null}

            {published ? (
              <View style={st.actions}>
                {d.assignment.confirmed_at ? (
                  <Text style={st.confirmed}>✓ Got it</Text>
                ) : (
                  <Button
                    small
                    variant="secondary"
                    label="Got it 👍"
                    onPress={() => void confirm(d.assignment!.id)}
                  />
                )}
                <Pressable onPress={() => setLogFor(d)}>
                  <Text style={st.logLink}>{result ? 'Edit splits ✓' : 'Log splits'}</Text>
                </Pressable>
              </View>
            ) : null}
          </Card>
        );
      })}

      {logFor?.assignment ? (
        <ResultsForm
          visible={Boolean(logFor)}
          assignmentId={logFor.assignment.id}
          scheme={effective(logFor).scheme ?? []}
          existing={results[logFor.assignment.id] ?? null}
          workoutLabel={effective(logFor).label ?? effective(logFor).typeName}
          onClose={() => setLogFor(null)}
          onSubmitted={() => {
            setLogFor(null);
            void load();
          }}
        />
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  todayCard: { borderColor: BRAND_COLORS.maroon, borderWidth: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekday: { fontSize: 12, color: GRAY[500], fontWeight: '800', letterSpacing: 0.4 },
  dayType: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 14, color: GRAY[700], marginTop: 3 },
  detail: { fontSize: 14, color: GRAY[900], marginTop: 8, lineHeight: 20 },
  scheme: { fontSize: 13, color: BRAND_COLORS.green, marginTop: 6, fontWeight: '600' },
  note: { fontSize: 13, color: BRAND_COLORS.maroon, marginTop: 6 },
  muted: { fontSize: 13, color: GRAY[400], fontStyle: 'italic', marginTop: 6 },
  mutedSmall: { fontSize: 12, color: GRAY[400], fontStyle: 'italic' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  confirmed: { color: BRAND_COLORS.green, fontWeight: '700', fontSize: 13 },
  logLink: {
    color: BRAND_COLORS.maroon,
    fontWeight: '600',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
