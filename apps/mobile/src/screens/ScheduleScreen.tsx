/**
 * Schedule (PRD §5.9): a calendar with day / week / month views (week is the
 * default), events merged with meets. Coaches create events (team / squad /
 * individuals, weekly recurrence).
 */
import {
  BRAND_COLORS,
  EVENT_TYPES,
  EVENT_TYPE_ICONS,
  EVENT_TYPE_LABELS,
  WEEKDAY_LABELS,
  addDays,
  addMonths,
  describeRecurrence,
  expandEventOccurrences,
  formatDateShort,
  formatTime,
  isoDow,
  localDateOf,
  mondayOf,
  monthGrid,
  monthTitle,
  sameMonth,
  todayISO,
  weekDates,
  type EventType,
} from '@bearboard/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership, RosterRow } from '../lib/team-types';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorText,
  GRAY,
  Input,
  Loading,
  LoadingScreen,
  Screen,
  SubScreen,
} from '../lib/ui';

interface EventRow {
  id: string;
  title: string;
  type: EventType;
  starts_at: string;
  location: string | null;
  notes: string | null;
  recurrence: string | null;
  recurrence_days: number[] | null;
  event_targets: Array<{ squad_id: string | null; team_member_id: string | null }>;
}
interface MeetLite {
  id: string;
  name: string;
  date: string;
  departure_at: string | null;
}
interface SquadOpt {
  id: string;
  name: string;
  member_ids?: string[];
}
type CalView = 'day' | 'week' | 'month';
type DayItem = { kind: 'event'; e: EventRow } | { kind: 'meet'; m: MeetLite };

export function ScheduleScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;

  const [view, setView] = useState<CalView>('week');
  const [anchor, setAnchor] = useState(() => todayISO());
  const [selectedDay, setSelectedDay] = useState<string>(() => todayISO());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [meets, setMeets] = useState<MeetLite[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [squads, setSquads] = useState<SquadOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<EventRow | 'new' | null>(null);

  const range = useMemo(() => {
    if (view === 'day') return { from: anchor, to: anchor };
    if (view === 'week') {
      const start = mondayOf(new Date(anchor + 'T00:00:00'));
      return { from: start, to: addDays(start, 6) };
    }
    const grid = monthGrid(anchor);
    return { from: grid[0]!, to: grid[41]! };
  }, [view, anchor]);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    const fromISO = new Date(range.from + 'T00:00:00').toISOString();
    const toISO = new Date(range.to + 'T23:59:59').toISOString();
    // Recurring events (any past anchor) may repeat into this range; one-time
    // events must start within it.
    const { data, error } = await sb
      .from('events')
      .select(
        'id, title, type, starts_at, location, notes, recurrence, recurrence_days, event_targets(squad_id, team_member_id)',
      )
      .eq('team_id', teamId)
      .lte('starts_at', toISO)
      .or(`recurrence.not.is.null,starts_at.gte.${fromISO}`)
      .order('starts_at')
      .limit(400);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setEvents((data ?? []) as unknown as EventRow[]);

    const { data: meetRows } = await sb
      .from('meets')
      .select('id, name, date, departure_at')
      .eq('team_id', teamId)
      .gte('date', range.from)
      .lte('date', range.to)
      .order('date');
    setMeets((meetRows ?? []) as unknown as MeetLite[]);

    if (isCoach) {
      const { data: rosterData } = await sb
        .from('team_members')
        .select('id, role, user:users(id, name, class_year)')
        .eq('team_id', teamId)
        .eq('status', 'active');
      setRoster((rosterData ?? []) as unknown as RosterRow[]);
      const { data: squadData } = await sb.from('squads').select('id, name').eq('team_id', teamId);
      setSquads((squadData ?? []) as SquadOpt[]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSupabase, teamId, isCoach, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    for (const e of events) {
      for (const day of expandEventOccurrences(e, range.from, range.to)) {
        (map.get(day) ?? map.set(day, []).get(day)!).push({ kind: 'event', e });
      }
    }
    for (const m of meets) {
      (map.get(m.date) ?? map.set(m.date, []).get(m.date)!).push({ kind: 'meet', m });
    }
    return map;
  }, [events, meets, range.from, range.to]);

  function shift(delta: number) {
    if (view === 'day') setAnchor(addDays(anchor, delta));
    else if (view === 'week') setAnchor(addDays(anchor, delta * 7));
    else setAnchor(addMonths(anchor, delta));
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function renderDayItems(items: DayItem[]) {
    if (!items.length) return <Text style={st.emptyDay}>Nothing scheduled.</Text>;
    return items
      .slice()
      .sort((a, b) =>
        (a.kind === 'event' ? a.e.starts_at : a.m.date).localeCompare(
          b.kind === 'event' ? b.e.starts_at : b.m.date,
        ),
      )
      .map((item, i) =>
        item.kind === 'meet' ? (
          <Card key={`m-${item.m.id}-${i}`} accent={BRAND_COLORS.crimson}>
            <View style={st.row}>
              <Text style={{ fontSize: 20 }}>🏁</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.title}>{item.m.name}</Text>
                <Text style={st.meta}>
                  Race day
                  {item.m.departure_at ? ` · depart ${formatTime(item.m.departure_at)}` : ''}
                </Text>
              </View>
            </View>
          </Card>
        ) : (
          <Pressable
            key={item.e.id}
            onPress={() => isCoach && setEditing(item.e)}
            disabled={!isCoach}
          >
            <Card>
              <View style={st.row}>
                <Text style={{ fontSize: 20 }}>{EVENT_TYPE_ICONS[item.e.type]}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.title}>{item.e.title}</Text>
                  <Text style={st.meta}>
                    {formatTime(item.e.starts_at)}
                    {item.e.location ? ` · ${item.e.location}` : ''}
                    {item.e.recurrence
                      ? ` · ${describeRecurrence(item.e.recurrence, item.e.recurrence_days)}`
                      : ''}
                  </Text>
                  {item.e.notes ? <Text style={st.notes}>{item.e.notes}</Text> : null}
                </View>
                {item.e.event_targets.length ? <Chip color="#0E7490" label="targeted" /> : null}
              </View>
            </Card>
          </Pressable>
        ),
      );
  }

  const rangeTitle =
    view === 'month'
      ? monthTitle(anchor)
      : view === 'week'
        ? `Week of ${range.from.slice(5)}`
        : formatDateShort(anchor);

  if (loading) return <LoadingScreen title="Schedule" variant="cards" />;

  return (
    <Screen
      title="Schedule"
      subtitle={rangeTitle}
      right={
        isCoach ? <Button small label="+ Event" onPress={() => setEditing('new')} /> : undefined
      }
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ErrorText>{error}</ErrorText>

      {/* View switcher */}
      <View style={st.segment}>
        {(['day', 'week', 'month'] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setView(v)}
            style={[st.segmentBtn, view === v && st.segmentBtnActive]}
          >
            <Text style={[st.segmentText, view === v && { color: BRAND_COLORS.white }]}>
              {v[0]!.toUpperCase() + v.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={st.navRow}>
        <Button small variant="outline" label="‹" onPress={() => shift(-1)} />
        <Button small variant="ghost" label="Today" onPress={() => setAnchor(todayISO())} />
        <Button small variant="outline" label="›" onPress={() => shift(1)} />
      </View>

      {view === 'month' ? (
        <>
          <View style={st.monthHeader}>
            {WEEKDAY_LABELS.map((d) => (
              <Text key={d} style={st.monthHeaderCell}>
                {d[0]}
              </Text>
            ))}
          </View>
          <View style={st.monthGrid}>
            {monthGrid(anchor).map((d) => {
              const items = byDay.get(d) ?? [];
              const inMonth = sameMonth(d, anchor);
              const isToday = d === todayISO();
              const isSelected = d === selectedDay;
              return (
                <Pressable
                  key={d}
                  onPress={() => setSelectedDay(d)}
                  style={[st.monthCell, isSelected && st.monthCellSelected]}
                >
                  <View
                    style={[
                      st.monthDayNum,
                      isToday && { backgroundColor: BRAND_COLORS.maroon, borderRadius: 12 },
                    ]}
                  >
                    <Text
                      style={[
                        st.monthDayText,
                        !inMonth && { color: GRAY[300] },
                        isToday && { color: BRAND_COLORS.white },
                      ]}
                    >
                      {Number(d.slice(8))}
                    </Text>
                  </View>
                  <View style={st.dots}>
                    {items.slice(0, 3).map((it, idx) => (
                      <View
                        key={idx}
                        style={[
                          st.dot,
                          {
                            backgroundColor:
                              it.kind === 'meet' ? BRAND_COLORS.crimson : BRAND_COLORS.maroon,
                          },
                        ]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={st.dayHeader}>{formatDateShort(selectedDay)}</Text>
          {renderDayItems(byDay.get(selectedDay) ?? [])}
        </>
      ) : view === 'week' ? (
        weekDates(range.from).map((d, i) => (
          <View key={d}>
            <Text style={[st.dayHeader, d === todayISO() && { color: BRAND_COLORS.maroon }]}>
              {WEEKDAY_LABELS[i]} · {formatDateShort(d)}
            </Text>
            {renderDayItems(byDay.get(d) ?? [])}
          </View>
        ))
      ) : (
        renderDayItems(byDay.get(anchor) ?? [])
      )}

      {editing ? (
        <EventForm
          visible={Boolean(editing)}
          teamId={teamId}
          myMemberId={membership.id}
          event={editing === 'new' ? null : editing}
          roster={roster}
          squads={squads}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function EventForm({
  visible,
  teamId,
  myMemberId,
  event,
  roster,
  squads,
  onClose,
  onSaved,
}: {
  visible: boolean;
  teamId: string;
  myMemberId: string;
  event: EventRow | null;
  roster: RosterRow[];
  squads: SquadOpt[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [title, setTitle] = useState(event?.title ?? '');
  const [type, setType] = useState<EventType>(event?.type ?? 'practice');
  const [date, setDate] = useState(event ? event.starts_at.slice(0, 10) : todayISO());
  const [time, setTime] = useState(() => {
    if (!event) return '16:00';
    const d = new Date(event.starts_at);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [repeats, setRepeats] = useState(event?.recurrence === 'weekly');
  const [repeatDays, setRepeatDays] = useState<number[]>(
    event?.recurrence_days && event.recurrence_days.length
      ? event.recurrence_days
      : event
        ? [isoDow(localDateOf(event.starts_at))]
        : [],
  );
  const [targetSquads, setTargetSquads] = useState<string[]>(
    event?.event_targets.filter((t) => t.squad_id).map((t) => t.squad_id!) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
    const [hh, mm] = time.split(':').map(Number) as [number, number];
    if (!y || !mo || !d || Number.isNaN(hh))
      return setError('Check date (YYYY-MM-DD) and time (HH:MM).');
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const startsAt = new Date(y, mo - 1, d, hh, mm || 0).toISOString();
    const days = repeats
      ? repeatDays.length
        ? [...repeatDays].sort((a, b) => a - b)
        : [isoDow(localDateOf(startsAt))]
      : null;
    const payload = {
      team_id: teamId,
      title: title.trim(),
      type,
      starts_at: startsAt,
      location: location.trim() || null,
      notes: notes.trim() || null,
      recurrence: repeats ? 'weekly' : null,
      recurrence_days: days,
      created_by: myMemberId,
    };
    let eventId = event?.id ?? null;
    if (eventId) {
      const { error } = await sb.from('events').update(payload).eq('id', eventId);
      if (error) {
        setBusy(false);
        return setError(error.message);
      }
      await sb.from('event_targets').delete().eq('event_id', eventId);
    } else {
      const { data, error } = await sb.from('events').insert(payload).select('id').single();
      if (error) {
        setBusy(false);
        return setError(error.message);
      }
      eventId = (data as { id: string }).id;
    }
    if (targetSquads.length) {
      await sb
        .from('event_targets')
        .insert(
          targetSquads.map((sid) => ({ event_id: eventId, squad_id: sid, team_member_id: null })),
        );
    }
    setBusy(false);
    await onSaved();
  }

  async function remove() {
    if (!event) return;
    const sb = await getSupabase();
    await sb.from('events').delete().eq('id', event.id);
    await onSaved();
  }

  return (
    <SubScreen
      visible={visible}
      title={event ? 'Edit event' : 'Add event'}
      onClose={onClose}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label="Save event"
            onPress={() => void save()}
            busy={busy}
            disabled={!title.trim()}
          />
          {event ? (
            <Button label="Delete event" variant="danger" onPress={() => void remove()} />
          ) : null}
        </View>
      }
    >
      <ErrorText>{error}</ErrorText>
      <Input label="Title" placeholder="Morning practice" value={title} onChangeText={setTitle} />
      <Text style={st.formLabel}>Type</Text>
      <View style={st.chipRow}>
        {EVENT_TYPES.map((t) => (
          <Pressable
            key={t}
            onPress={() => setType(t)}
            style={[st.chip, type === t && st.chipActive]}
          >
            <Text style={[st.chipText, type === t && { color: BRAND_COLORS.white }]}>
              {EVENT_TYPE_ICONS[t]} {EVENT_TYPE_LABELS[t]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input
            label="Date"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
            placeholder="2026-08-18"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Time"
            value={time}
            onChangeText={setTime}
            autoCapitalize="none"
            placeholder="16:00"
          />
        </View>
      </View>
      <Input
        label="Location"
        placeholder="Track / Francis Field"
        value={location}
        onChangeText={setLocation}
      />
      <Input label="Notes" value={notes} onChangeText={setNotes} />
      <Pressable
        onPress={() => {
          const next = !repeats;
          setRepeats(next);
          if (next && repeatDays.length === 0) {
            const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
            if (y && mo && d) setRepeatDays([isoDow(date)]);
          }
        }}
        style={st.checkRow}
      >
        <Text style={{ fontSize: 16 }}>{repeats ? '☑️' : '⬜️'}</Text>
        <Text style={st.checkText}>Repeat weekly on selected days</Text>
      </Pressable>
      {repeats ? (
        <View style={st.dowRow}>
          {WEEKDAY_LABELS.map((label, i) => {
            const dow = i + 1; // 1=Mon..7=Sun
            const on = repeatDays.includes(dow);
            return (
              <Pressable
                key={dow}
                onPress={() =>
                  setRepeatDays((prev) =>
                    prev.includes(dow) ? prev.filter((x) => x !== dow) : [...prev, dow],
                  )
                }
                style={[st.dowChip, on && st.dowChipActive]}
              >
                <Text style={[st.dowText, on && { color: BRAND_COLORS.white }]}>{label[0]}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text style={st.formLabel}>Audience (none selected = whole team)</Text>
      <View style={st.chipRow}>
        {squads.map((s) => (
          <Pressable
            key={s.id}
            onPress={() =>
              setTargetSquads((p) =>
                p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id],
              )
            }
            style={[st.chip, targetSquads.includes(s.id) && st.chipActive]}
          >
            <Text
              style={[st.chipText, targetSquads.includes(s.id) && { color: BRAND_COLORS.white }]}
            >
              {s.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: GRAY[400] }}>
        Individual targeting (private meetings) is available on the web console.
      </Text>
    </SubScreen>
  );
}

const st = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: GRAY[100],
    borderRadius: 10,
    padding: 3,
    marginTop: 4,
    marginBottom: 8,
  },
  segmentBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: BRAND_COLORS.maroon },
  segmentText: { fontSize: 13, fontWeight: '700', color: GRAY[600] },
  navRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 8 },
  monthHeader: { flexDirection: 'row', marginBottom: 2 },
  monthHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: GRAY[400],
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    paddingTop: 4,
    borderRadius: 8,
  },
  monthCellSelected: { backgroundColor: `${BRAND_COLORS.maroon}12` },
  monthDayNum: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  monthDayText: { fontSize: 13, fontWeight: '600', color: GRAY[700] },
  dots: { flexDirection: 'row', gap: 2, marginTop: 2, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  emptyDay: { fontSize: 13, color: GRAY[400], fontStyle: 'italic', marginBottom: 8 },
  dayHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND_COLORS.forest,
    marginTop: 12,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, fontWeight: '700', color: GRAY[900] },
  meta: { fontSize: 13, color: GRAY[500], marginTop: 1 },
  notes: { fontSize: 12, color: GRAY[400], marginTop: 2 },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GRAY[300],
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: BRAND_COLORS.white,
  },
  chipActive: { backgroundColor: BRAND_COLORS.maroon, borderColor: BRAND_COLORS.maroon },
  chipText: { fontSize: 13, fontWeight: '600', color: GRAY[600] },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dowRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  dowChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GRAY[300],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLORS.white,
  },
  dowChipActive: { backgroundColor: BRAND_COLORS.maroon, borderColor: BRAND_COLORS.maroon },
  dowText: { fontSize: 13, fontWeight: '700', color: GRAY[600] },
  checkText: { fontSize: 14, color: GRAY[700] },
});
