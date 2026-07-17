/**
 * Today — the app home (PRD §5.9): today's workout + events + pending items
 * (splits to log, debriefs due, activities to review) + goal-race countdown +
 * pinned announcement, plus a get-set-up checklist for new users.
 */
import {
  BRAND_COLORS,
  DAY_TYPE_COLORS,
  DAY_TYPE_LABELS,
  daysUntil,
  describeScheme,
  eventOccursOn,
  formatDateShort,
  formatTime,
  mondayOf,
  todayISO,
  EVENT_TYPE_ICONS,
  type EventType,
  type RepScheme,
  type Split,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership } from '../lib/team-types';
import { effective, loadDays, type DayRow } from '../lib/plan-data';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorText,
  GRAY,
  Loading,
  LoadingScreen,
  Screen,
  SectionTitle,
} from '../lib/ui';
import { ResultsForm } from './ResultsForm';
import type { Tab } from './MemberTabs';
import type { MoreSub } from './MoreScreen';

interface EventRow {
  id: string;
  title: string;
  type: EventType;
  starts_at: string;
  location: string | null;
  recurrence: string | null;
  recurrence_days: number[] | null;
}
interface PendingDebrief {
  entryId: string;
  meetName: string;
  meetDate: string;
}

export function TodayScreen({
  membership,
  onNavigate,
}: {
  membership: Membership;
  onNavigate: (tab: Tab, moreSub?: MoreSub) => void;
}) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;
  const today = todayISO();

  const [day, setDay] = useState<DayRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [goalRace, setGoalRace] = useState<{ name: string; date: string } | null>(null);
  const [pendingActivities, setPendingActivities] = useState(0);
  const [pendingDebriefs, setPendingDebriefs] = useState<PendingDebrief[]>([]);
  const [hasResult, setHasResult] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const [shoeCount, setShoeCount] = useState<number | null>(null);
  const [injuredCount, setInjuredCount] = useState(0);
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [existingResult, setExistingResult] = useState<{
    splits: Split[] | null;
    rpe: number | null;
    comment: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();

    // Opportunistic scheduled-release publish (idempotent, safe).
    void sb.rpc('release_due_details');

    // Ensure I have an assignment for today's published week (covers joining
    // after publish) so the "Got it" / seen receipts have a row to write.
    if (!isCoach) {
      await sb.rpc('ensure_my_assignments', {
        p_team_id: teamId,
        p_week_start: mondayOf(new Date()),
      });
    }

    const { days, error: dayErr } = await loadDays(sb, teamId, [today], membership.id);
    if (dayErr) setError(dayErr);
    const d = days[today] ?? null;
    setDay(d);

    // Mark seen receipts for today (fire-and-forget).
    if (d?.assignment) {
      void sb.rpc('mark_skeleton_seen', { p_assignment_id: d.assignment.id });
      if (d.detail?.release_state === 'published') {
        void sb.rpc('mark_detail_seen', { p_assignment_id: d.assignment.id });
      }
      const { data: res } = await sb
        .from('workout_results')
        .select('splits, rpe, comment')
        .eq('assignment_id', d.assignment.id)
        .maybeSingle();
      setHasResult(Boolean(res));
      setExistingResult((res as typeof existingResult) ?? null);
    }

    // Today's events = one-time events dated today + any recurring event that
    // repeats onto today's weekday (anchored on/before today).
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);
    const { data: ev } = await sb
      .from('events')
      .select('id, title, type, starts_at, location, recurrence, recurrence_days')
      .eq('team_id', teamId)
      .lte('starts_at', dayEnd.toISOString())
      .or(
        `recurrence.not.is.null,starts_at.gte.${new Date(new Date().setHours(0, 0, 0, 0)).toISOString()}`,
      )
      .order('starts_at');
    setEvents(((ev ?? []) as unknown as EventRow[]).filter((e) => eventOccursOn(e, today)));

    const { data: gr } = await sb
      .from('meets')
      .select('name, date')
      .eq('team_id', teamId)
      .eq('is_goal_race', true)
      .gte('date', today)
      .order('date')
      .limit(1)
      .maybeSingle();
    setGoalRace((gr as { name: string; date: string } | null) ?? null);

    const { data: pin } = await sb
      .from('announcements')
      .select('body_rich')
      .eq('team_id', teamId)
      .eq('pinned', true)
      .limit(1)
      .maybeSingle();
    setPinned((pin as { body_rich: string } | null)?.body_rich ?? null);

    if (!isCoach) {
      const { count } = await sb
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('team_member_id', membership.id)
        .eq('status', 'pending');
      setPendingActivities(count ?? 0);

      const { data: entries } = await sb
        .from('meet_entries')
        .select('id, meet:meets(name, date)')
        .eq('team_member_id', membership.id)
        .eq('entered', true);
      const list = (entries ?? []) as unknown as Array<{
        id: string;
        meet: { name: string; date: string } | null;
      }>;
      const pastEntries = list.filter((e) => e.meet && e.meet.date <= today);
      if (pastEntries.length) {
        const { data: debs } = await sb
          .from('race_debriefs')
          .select('meet_entry_id, submitted_at')
          .in(
            'meet_entry_id',
            pastEntries.map((e) => e.id),
          );
        const done = new Set(
          ((debs ?? []) as Array<{ meet_entry_id: string; submitted_at: string | null }>)
            .filter((x) => x.submitted_at)
            .map((x) => x.meet_entry_id),
        );
        setPendingDebriefs(
          pastEntries
            .filter((e) => !done.has(e.id))
            .slice(0, 3)
            .map((e) => ({ entryId: e.id, meetName: e.meet!.name, meetDate: e.meet!.date })),
        );
      } else {
        setPendingDebriefs([]);
      }

      const { count: shoes } = await sb
        .from('shoes')
        .select('id', { count: 'exact', head: true })
        .eq('team_member_id', membership.id)
        .eq('retired', false);
      setShoeCount(shoes ?? 0);
    } else {
      const { data: inj } = await sb.from('current_injury').select('team_member_id, status');
      setInjuredCount(
        ((inj ?? []) as Array<{ status: string }>).filter((x) => x.status !== 'healthy').length,
      );
    }

    setLoading(false);
  }, [getSupabase, teamId, membership.id, isCoach, today]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function confirm() {
    if (!day?.assignment) return;
    const assignmentId = day.assignment.id;
    // Optimistic: show "Got it" immediately, reconcile on error.
    const nowIso = new Date().toISOString();
    setDay((prev) =>
      prev && prev.assignment
        ? {
            ...prev,
            assignment: { ...prev.assignment, confirmed_at: nowIso, detail_seen_at: nowIso },
          }
        : prev,
    );
    const sb = await getSupabase();
    const { error } = await sb.rpc('confirm_assignment', { p_assignment_id: assignmentId });
    if (error) await load();
  }

  if (loading) return <LoadingScreen title="Today" variant="today" />;

  const eff = day ? effective(day) : null;
  const detailPublished = day?.detail?.release_state === 'published';
  const scheme: RepScheme = eff?.scheme ?? [];
  const canLogSplits = !isCoach && day?.assignment && detailPublished;
  const weekPublishedForMe = Boolean(day?.assignment);

  const checklist: Array<{ label: string; done: boolean; go: () => void }> = isCoach
    ? [
        { label: 'Share your athlete join code', done: false, go: () => onNavigate('more') },
        { label: 'Plan and publish this week', done: Boolean(day), go: () => onNavigate('week') },
        { label: 'Post a first announcement', done: Boolean(pinned), go: () => onNavigate('more') },
      ]
    : [
        { label: 'Connect your watch (sync setup)', done: false, go: () => onNavigate('more') },
        { label: 'Add your shoes', done: (shoeCount ?? 0) > 0, go: () => onNavigate('more') },
      ];
  const showChecklist =
    !checklistDismissed && checklist.some((c) => !c.done) && (isCoach || shoeCount !== null);

  return (
    <Screen
      title="Today"
      subtitle={formatDateShort(today)}
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ErrorText>{error}</ErrorText>

      {goalRace ? (
        <View style={{ marginBottom: 10 }}>
          <Chip
            color={BRAND_COLORS.crimson}
            label={`🏁 ${daysUntil(goalRace.date)} days to ${goalRace.name}`}
          />
        </View>
      ) : null}

      {showChecklist ? (
        <Card accent={BRAND_COLORS.green}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={st.checklistTitle}>Get set up 🏁</Text>
            <Pressable onPress={() => setChecklistDismissed(true)} hitSlop={8}>
              <Text style={{ color: GRAY[400] }}>later</Text>
            </Pressable>
          </View>
          {checklist.map((c) => (
            <Pressable key={c.label} onPress={c.go} style={st.checkRow}>
              <Text style={{ fontSize: 15 }}>{c.done ? '✅' : '⬜️'}</Text>
              <Text
                style={[
                  st.checkLabel,
                  c.done && { color: GRAY[400], textDecorationLine: 'line-through' },
                ]}
              >
                {c.label}
              </Text>
              {!c.done ? <Text style={{ color: BRAND_COLORS.maroon }}>›</Text> : null}
            </Pressable>
          ))}
        </Card>
      ) : null}

      {/* Today's training */}
      <SectionTitle>Training</SectionTitle>
      {day && eff && (isCoach || weekPublishedForMe) ? (
        <Card accent={DAY_TYPE_COLORS[eff.dayType]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[st.dayType, { color: DAY_TYPE_COLORS[eff.dayType] }]}>
              {eff.typeName}
            </Text>
            {day.assignment?.overrides?.day_type ? (
              <Chip color={BRAND_COLORS.maroon} label="custom for you" />
            ) : null}
          </View>
          {eff.label ? <Text style={st.label}>{eff.label}</Text> : null}

          {eff.description ? (
            <Text style={st.detail}>{eff.description}</Text>
          ) : detailPublished ? null : (
            <Text style={st.muted}>
              Details coming
              {day.detail?.release_state === 'scheduled' && day.detail.release_at
                ? ` · expected ${formatTime(day.detail.release_at)}`
                : ''}
            </Text>
          )}
          {scheme.length ? <Text style={st.scheme}>{describeScheme(scheme)}</Text> : null}
          {day.assignment?.note ? <Text style={st.note}>Coach: {day.assignment.note}</Text> : null}

          {!isCoach && day.assignment && detailPublished ? (
            <View style={st.actions}>
              {day.assignment.confirmed_at ? (
                <Text style={st.confirmed}>✓ Got it</Text>
              ) : (
                <Button
                  small
                  label="Got it 👍"
                  variant="secondary"
                  onPress={() => void confirm()}
                />
              )}
              {canLogSplits ? (
                <Button
                  small
                  label={hasResult ? 'Edit splits' : 'Log splits'}
                  variant={hasResult ? 'outline' : 'primary'}
                  onPress={() => setShowResults(true)}
                />
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : (
        <EmptyState
          icon="calendar-outline"
          title={isCoach ? 'Nothing planned for today' : 'No plan for today yet'}
          hint={
            isCoach
              ? 'Set today in the Week tab.'
              : 'Your coach hasn’t published today — check back soon.'
          }
        />
      )}

      {/* Pending items */}
      {!isCoach && (pendingActivities > 0 || pendingDebriefs.length > 0) ? (
        <>
          <SectionTitle>Needs you</SectionTitle>
          {pendingActivities > 0 ? (
            <Card accent="#B45309">
              <Pressable onPress={() => onNavigate('feed')} style={st.pendingRow}>
                <Text style={{ fontSize: 18 }}>📥</Text>
                <Text style={st.pendingText}>
                  {pendingActivities} synced {pendingActivities === 1 ? 'activity' : 'activities'}{' '}
                  to review
                </Text>
                <Text style={{ color: BRAND_COLORS.maroon }}>›</Text>
              </Pressable>
            </Card>
          ) : null}
          {pendingDebriefs.map((d) => (
            <Card key={d.entryId} accent={BRAND_COLORS.crimson}>
              <Pressable onPress={() => onNavigate('more')} style={st.pendingRow}>
                <Text style={{ fontSize: 18 }}>📝</Text>
                <Text style={st.pendingText}>Race debrief: {d.meetName}</Text>
                <Text style={{ color: BRAND_COLORS.maroon }}>›</Text>
              </Pressable>
            </Card>
          ))}
        </>
      ) : null}

      {isCoach && injuredCount > 0 ? (
        <>
          <SectionTitle>Team status</SectionTitle>
          <Card accent="#B45309">
            <Text style={st.pendingText}>
              🩹 {injuredCount} athlete{injuredCount === 1 ? '' : 's'} not Healthy — see the injury
              board (More → Injury, or the web console).
            </Text>
          </Card>
        </>
      ) : null}

      {/* Events */}
      <SectionTitle
        right={
          <Pressable onPress={() => onNavigate('more', 'schedule')}>
            <Text style={st.fullScheduleLink}>Full schedule ›</Text>
          </Pressable>
        }
      >
        Schedule
      </SectionTitle>
      {events.length === 0 ? (
        <Text style={st.muted}>No events today. Tap “Full schedule” for the week and month.</Text>
      ) : (
        events.map((e) => (
          <Card key={e.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 20 }}>{EVENT_TYPE_ICONS[e.type]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.eventTitle}>{e.title}</Text>
                <Text style={st.eventMeta}>
                  {formatTime(e.starts_at)}
                  {e.location ? ` · ${e.location}` : ''}
                </Text>
              </View>
            </View>
          </Card>
        ))
      )}

      {/* Pinned announcement */}
      {pinned ? (
        <>
          <SectionTitle>📌 From your coach</SectionTitle>
          <Card accent={BRAND_COLORS.maroon}>
            <Text style={st.pinned}>{pinned}</Text>
          </Card>
        </>
      ) : null}

      {day?.assignment && showResults ? (
        <ResultsForm
          visible={showResults}
          assignmentId={day.assignment.id}
          scheme={scheme}
          existing={existingResult}
          workoutLabel={eff?.label ?? eff?.typeName ?? 'Workout'}
          onClose={() => setShowResults(false)}
          onSubmitted={() => {
            setShowResults(false);
            void load();
          }}
        />
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  checklistTitle: { fontWeight: '800', fontSize: 15, color: BRAND_COLORS.forest, marginBottom: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  checkLabel: { flex: 1, fontSize: 14, color: GRAY[700], fontWeight: '500' },
  dayType: { fontSize: 19, fontWeight: '800' },
  label: { fontSize: 15, color: GRAY[700], marginTop: 2 },
  detail: { fontSize: 15, color: GRAY[900], marginTop: 8, lineHeight: 21 },
  scheme: { fontSize: 13, color: BRAND_COLORS.green, marginTop: 6, fontWeight: '600' },
  note: { fontSize: 13, color: BRAND_COLORS.maroon, marginTop: 6 },
  muted: { fontSize: 13, color: GRAY[400], fontStyle: 'italic', marginTop: 4, marginBottom: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  confirmed: { color: BRAND_COLORS.green, fontWeight: '700' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendingText: { flex: 1, fontSize: 14, fontWeight: '600', color: GRAY[700] },
  eventTitle: { fontSize: 15, fontWeight: '700', color: GRAY[900] },
  eventMeta: { fontSize: 13, color: GRAY[500], marginTop: 1 },
  fullScheduleLink: { fontSize: 13, fontWeight: '700', color: BRAND_COLORS.maroon },
  pinned: { fontSize: 14, color: GRAY[700], lineHeight: 20 },
});
