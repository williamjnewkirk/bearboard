/**
 * Meets (PRD §5.9a): season race schedule, my entry + event, result entry,
 * and the race debrief — athlete-authored, coach-only, stated plainly on the
 * form. Coaches manage entries here too (full mobile parity; the roll-up
 * review lives on the web console).
 */
import {
  BRAND_COLORS,
  MEET_TYPE_LABELS,
  daysUntil,
  formatDateShort,
  formatDateTime,
  todayISO,
  type MeetType,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
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

interface MeetRow {
  id: string;
  name: string;
  date: string;
  location: string | null;
  course: string | null;
  meet_type: MeetType | null;
  departure_at: string | null;
  notes: string | null;
  is_goal_race: boolean;
}
interface EntryRow {
  id: string;
  meet_id: string;
  team_member_id: string;
  event: string | null;
  entered: boolean;
}
interface DebriefState {
  went_well: string;
  didnt_go_well: string;
  prep_done_well: string;
  prep_would_change: string;
  academic_stress: number | null;
  academic_stress_note: string;
  fatigue: number | null;
  fatigue_note: string;
  sleep_fueling_note: string;
  note_to_coach: string;
  submitted_at: string | null;
}

export function MeetsScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;

  const [meets, setMeets] = useState<MeetRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [debriefDone, setDebriefDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [openMeet, setOpenMeet] = useState<MeetRow | null>(null);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('meets')
      .select('id, name, date, location, course, meet_type, departure_at, notes, is_goal_race')
      .eq('team_id', teamId)
      .order('date');
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as MeetRow[];
    setMeets(list);
    if (list.length) {
      const { data: e } = await sb
        .from('meet_entries')
        .select('id, meet_id, team_member_id, event, entered')
        .in(
          'meet_id',
          list.map((m) => m.id),
        );
      const entryList = (e ?? []) as unknown as EntryRow[];
      setEntries(entryList);

      const myEntries = entryList.filter((x) => x.team_member_id === membership.id);
      if (myEntries.length) {
        const { data: debs } = await sb
          .from('race_debriefs')
          .select('meet_entry_id, submitted_at')
          .in(
            'meet_entry_id',
            myEntries.map((x) => x.id),
          );
        setDebriefDone(
          new Set(
            ((debs ?? []) as Array<{ meet_entry_id: string; submitted_at: string | null }>)
              .filter((d) => d.submitted_at)
              .map((d) => d.meet_entry_id),
          ),
        );
      }
    }
    setLoading(false);
  }, [getSupabase, teamId, membership.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) return <LoadingScreen title="Meets" variant="cards" />;

  const today = todayISO();
  const upcoming = meets.filter((m) => m.date >= today);
  const past = meets.filter((m) => m.date < today).reverse();

  const renderMeet = (m: MeetRow) => {
    const myEntry = entries.find((e) => e.meet_id === m.id && e.team_member_id === membership.id);
    const enteredCount = entries.filter((e) => e.meet_id === m.id && e.entered).length;
    const days = daysUntil(m.date);
    const needsDebrief =
      !isCoach && myEntry?.entered && m.date <= today && !debriefDone.has(myEntry.id);
    return (
      <Pressable key={m.id} onPress={() => setOpenMeet(m)}>
        <Card accent={m.is_goal_race ? BRAND_COLORS.crimson : undefined}>
          <View style={st.rowBetween}>
            <Text style={st.meetName} numberOfLines={1}>
              {m.is_goal_race ? '🎯 ' : ''}
              {m.name}
            </Text>
            {m.meet_type ? <Chip color={GRAY[500]} label={MEET_TYPE_LABELS[m.meet_type]} /> : null}
          </View>
          <Text style={st.meetMeta}>
            {formatDateShort(m.date)}
            {days > 0 ? ` · in ${days}d` : days === 0 ? ' · today!' : ''}
            {m.location ? ` · ${m.location}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {isCoach ? (
              <Chip color={GRAY[500]} label={`${enteredCount} entered`} />
            ) : myEntry?.entered ? (
              <Chip
                color={BRAND_COLORS.green}
                label={`Entered${myEntry.event ? ` · ${myEntry.event}` : ''}`}
              />
            ) : (
              <Chip color={GRAY[400]} label="Not entered" />
            )}
            {needsDebrief ? <Chip color={BRAND_COLORS.crimson} label="📝 debrief due" /> : null}
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <Screen
      title="Meets"
      subtitle="What we're training for"
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ErrorText>{error}</ErrorText>
      {meets.length === 0 ? (
        <EmptyState
          icon="flag-outline"
          title="No meets posted"
          hint={
            isCoach
              ? 'Add the season schedule from the web console (Meets tab).'
              : 'The race schedule shows here once your coach posts it.'
          }
        />
      ) : (
        <>
          {upcoming.map(renderMeet)}
          {past.length ? (
            <>
              <Text style={st.pastHeader}>Past</Text>
              {past.map(renderMeet)}
            </>
          ) : null}
        </>
      )}

      {openMeet ? (
        <MeetDetail
          visible={Boolean(openMeet)}
          meet={openMeet}
          membership={membership}
          myEntry={
            entries.find((e) => e.meet_id === openMeet.id && e.team_member_id === membership.id) ??
            null
          }
          allEntries={entries.filter((e) => e.meet_id === openMeet.id)}
          onClose={() => setOpenMeet(null)}
          onChanged={load}
        />
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Meet detail: info, my result, my debrief; coach entry management
// ---------------------------------------------------------------------------

function MeetDetail({
  visible,
  meet,
  membership,
  myEntry,
  allEntries,
  onClose,
  onChanged,
}: {
  visible: boolean;
  meet: MeetRow;
  membership: Membership;
  myEntry: EntryRow | null;
  allEntries: EntryRow[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [mark, setMark] = useState('');
  const [place, setPlace] = useState('');
  const [showDebrief, setShowDebrief] = useState(false);
  const [debrief, setDebrief] = useState<DebriefState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const raceDone = meet.date <= todayISO();

  useEffect(() => {
    void (async () => {
      const sb = await getSupabase();
      if (isCoach) {
        const { data } = await sb
          .from('team_members')
          .select('id, role, user:users(id, name, class_year)')
          .eq('team_id', membership.team.id)
          .eq('role', 'athlete')
          .eq('status', 'active');
        setRoster(
          ((data ?? []) as unknown as RosterRow[]).sort((a, b) =>
            a.user.name.localeCompare(b.user.name),
          ),
        );
      }
      if (myEntry) {
        const { data: res } = await sb
          .from('meet_results')
          .select('mark, place')
          .eq('meet_entry_id', myEntry.id)
          .maybeSingle();
        if (res) {
          setMark((res as { mark: string | null }).mark ?? '');
          setPlace(
            (res as { place: number | null }).place != null
              ? String((res as { place: number | null }).place)
              : '',
          );
        }
        const { data: deb } = await sb
          .from('race_debriefs')
          .select(
            'went_well, didnt_go_well, prep_done_well, prep_would_change, academic_stress, academic_stress_note, fatigue, fatigue_note, sleep_fueling_note, note_to_coach, submitted_at',
          )
          .eq('meet_entry_id', myEntry.id)
          .maybeSingle();
        if (deb) {
          const d = deb as Record<string, unknown>;
          setDebrief({
            went_well: (d.went_well as string) ?? '',
            didnt_go_well: (d.didnt_go_well as string) ?? '',
            prep_done_well: (d.prep_done_well as string) ?? '',
            prep_would_change: (d.prep_would_change as string) ?? '',
            academic_stress: (d.academic_stress as number) ?? null,
            academic_stress_note: (d.academic_stress_note as string) ?? '',
            fatigue: (d.fatigue as number) ?? null,
            fatigue_note: (d.fatigue_note as string) ?? '',
            sleep_fueling_note: (d.sleep_fueling_note as string) ?? '',
            note_to_coach: (d.note_to_coach as string) ?? '',
            submitted_at: (d.submitted_at as string) ?? null,
          });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meet.id]);

  async function saveResult() {
    if (!myEntry) return;
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.rpc('save_meet_result', {
      p_meet_entry_id: myEntry.id,
      p_mark: mark || null,
      p_place: place ? Number(place) : null,
      p_splits: null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onChanged();
  }

  async function toggleEntry(memberId: string, entered: boolean, event: string | null) {
    const sb = await getSupabase();
    const { error } = await sb.rpc('set_meet_entry', {
      p_meet_id: meet.id,
      p_team_member_id: memberId,
      p_entered: entered,
      p_event: event,
    });
    if (error) return setError(error.message);
    await onChanged();
  }

  return (
    <SubScreen visible={visible} title={meet.name} onClose={onClose}>
      <ErrorText>{error}</ErrorText>
      <Card>
        <Text style={st.detailLine}>📅 {formatDateShort(meet.date)}</Text>
        {meet.location ? <Text style={st.detailLine}>📍 {meet.location}</Text> : null}
        {meet.course ? <Text style={st.detailLine}>🌲 {meet.course}</Text> : null}
        {meet.departure_at ? (
          <Text style={st.detailLine}>🚌 Depart {formatDateTime(meet.departure_at)}</Text>
        ) : null}
        {meet.notes ? <Text style={[st.detailLine, { marginTop: 6 }]}>{meet.notes}</Text> : null}
      </Card>

      {!isCoach && myEntry?.entered && raceDone ? (
        <>
          <Text style={st.sectionLabel}>Your result</Text>
          <Card>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 2 }}>
                <Input
                  label="Time / mark"
                  placeholder="26:14"
                  value={mark}
                  onChangeText={setMark}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Place"
                  placeholder="12"
                  value={place}
                  onChangeText={setPlace}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <Button small label="Save result" onPress={() => void saveResult()} busy={busy} />
          </Card>

          <Text style={st.sectionLabel}>Race debrief</Text>
          <Card accent={BRAND_COLORS.maroon}>
            <Text style={st.debriefPitch}>
              {debrief?.submitted_at
                ? `Submitted ${formatDateTime(debrief.submitted_at)} — you can edit anytime.`
                : 'Capture it while it’s fresh. This is how your training actually improves.'}
            </Text>
            <Text style={st.privacyNote}>🔒 Only your coaches can see this. Never teammates.</Text>
            <Button
              label={debrief?.submitted_at ? 'Edit debrief' : 'Start debrief'}
              onPress={() => setShowDebrief(true)}
            />
          </Card>
        </>
      ) : null}

      {!isCoach && !myEntry?.entered ? (
        <Text style={st.notEntered}>
          You’re not entered in this meet — it’s on the calendar for the whole team.
        </Text>
      ) : null}

      {isCoach ? (
        <>
          <Text style={st.sectionLabel}>
            Entries ({allEntries.filter((e) => e.entered).length})
          </Text>
          {roster.map((r) => {
            const entry = allEntries.find((e) => e.team_member_id === r.id);
            const entered = entry?.entered ?? false;
            return (
              <View key={r.id} style={st.entryRow}>
                <Pressable
                  onPress={() => void toggleEntry(r.id, !entered, entry?.event ?? null)}
                  hitSlop={6}
                >
                  <Text style={{ fontSize: 18 }}>{entered ? '☑️' : '⬜️'}</Text>
                </Pressable>
                <Text style={st.entryName}>{r.user.name}</Text>
                <TextInput
                  style={[st.eventInput, !entered && { opacity: 0.4 }]}
                  placeholder="event"
                  placeholderTextColor={GRAY[400]}
                  editable={entered}
                  defaultValue={entry?.event ?? ''}
                  onEndEditing={(e) => void toggleEntry(r.id, true, e.nativeEvent.text || null)}
                />
              </View>
            );
          })}
          <Text style={{ fontSize: 12, color: GRAY[400], marginTop: 6 }}>
            Entering an athlete creates a Race day on their plan. Results + debrief roll-ups are on
            the web console.
          </Text>
        </>
      ) : null}

      {myEntry && showDebrief ? (
        <DebriefForm
          visible={showDebrief}
          entryId={myEntry.id}
          meetName={meet.name}
          initial={debrief}
          onClose={() => setShowDebrief(false)}
          onSaved={async (d) => {
            setDebrief(d);
            setShowDebrief(false);
            await onChanged();
          }}
        />
      ) : null}
    </SubScreen>
  );
}

// ---------------------------------------------------------------------------
// The debrief form — the reflective counterpart to split submission
// ---------------------------------------------------------------------------

function DebriefForm({
  visible,
  entryId,
  meetName,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  entryId: string;
  meetName: string;
  initial: DebriefState | null;
  onClose: () => void;
  onSaved: (d: DebriefState) => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [d, setD] = useState<DebriefState>(
    initial ?? {
      went_well: '',
      didnt_go_well: '',
      prep_done_well: '',
      prep_would_change: '',
      academic_stress: null,
      academic_stress_note: '',
      fatigue: null,
      fatigue_note: '',
      sleep_fueling_note: '',
      note_to_coach: '',
      submitted_at: null,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof DebriefState>(key: K, value: DebriefState[K]) {
    setD((p) => ({ ...p, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('save_race_debrief', {
      p_meet_entry_id: entryId,
      p_went_well: d.went_well || null,
      p_didnt_go_well: d.didnt_go_well || null,
      p_prep_done_well: d.prep_done_well || null,
      p_prep_would_change: d.prep_would_change || null,
      p_academic_stress: d.academic_stress,
      p_academic_stress_note: d.academic_stress_note || null,
      p_fatigue: d.fatigue,
      p_fatigue_note: d.fatigue_note || null,
      p_sleep_fueling_note: d.sleep_fueling_note || null,
      p_note_to_coach: d.note_to_coach || null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved({ ...d, submitted_at: d.submitted_at ?? new Date().toISOString() });
  }

  return (
    <SubScreen
      visible={visible}
      title={`Debrief · ${meetName}`}
      onClose={onClose}
      footer={
        <Button
          label={busy ? 'Saving…' : 'Submit debrief'}
          onPress={() => void submit()}
          busy={busy}
        />
      }
    >
      <View style={st.privacyBanner}>
        <Text style={st.privacyBannerText}>
          🔒 Only your coaches can see this. Never teammates — under any setting. Be honest; that’s
          the whole point.
        </Text>
      </View>
      <ErrorText>{error}</ErrorText>

      <DebriefInput
        label="What went well in the race?"
        value={d.went_well}
        onChange={(v) => set('went_well', v)}
      />
      <DebriefInput
        label="What didn’t go well?"
        value={d.didnt_go_well}
        onChange={(v) => set('didnt_go_well', v)}
      />
      <DebriefInput
        label="What did you do well in preparation?"
        value={d.prep_done_well}
        onChange={(v) => set('prep_done_well', v)}
      />
      <DebriefInput
        label="What could you have changed in preparation?"
        value={d.prep_would_change}
        onChange={(v) => set('prep_would_change', v)}
      />

      <ScaleInput
        label="Academic stress leading into this race"
        value={d.academic_stress}
        onChange={(v) => set('academic_stress', v)}
        lowLabel="calm"
        highLabel="slammed"
      />
      <Input
        placeholder="Optional note (midterms, project due…)"
        value={d.academic_stress_note}
        onChangeText={(v) => set('academic_stress_note', v)}
      />

      <ScaleInput
        label="Overall fatigue leading into this race"
        value={d.fatigue}
        onChange={(v) => set('fatigue', v)}
        lowLabel="fresh"
        highLabel="cooked"
      />
      <Input
        placeholder="Optional note"
        value={d.fatigue_note}
        onChangeText={(v) => set('fatigue_note', v)}
      />

      <DebriefInput
        label="Sleep and fueling in race week (optional)"
        value={d.sleep_fueling_note}
        onChange={(v) => set('sleep_fueling_note', v)}
      />
      <DebriefInput
        label="Anything you want your coach to know"
        value={d.note_to_coach}
        onChange={(v) => set('note_to_coach', v)}
      />
    </SubScreen>
  );
}

function DebriefInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChange}
      multiline
      numberOfLines={3}
      style={{ minHeight: 72, textAlignVertical: 'top' }}
    />
  );
}

function ScaleInput({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={st.scaleLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text style={st.scaleEnd}>{lowLabel}</Text>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(value === n ? null : n)}
            style={[st.scaleBtn, value === n && st.scaleBtnActive]}
          >
            <Text style={[st.scaleBtnText, value === n && { color: BRAND_COLORS.white }]}>{n}</Text>
          </Pressable>
        ))}
        <Text style={st.scaleEnd}>{highLabel}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  meetName: { fontSize: 16, fontWeight: '800', color: GRAY[900], flexShrink: 1 },
  meetMeta: { fontSize: 13, color: GRAY[500], marginTop: 2 },
  pastHeader: { fontSize: 13, fontWeight: '800', color: GRAY[500], marginTop: 14, marginBottom: 6 },
  detailLine: { fontSize: 14, color: GRAY[700], marginBottom: 3, lineHeight: 20 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_COLORS.forest,
    marginTop: 14,
    marginBottom: 8,
  },
  debriefPitch: { fontSize: 14, color: GRAY[700], marginBottom: 6, lineHeight: 19 },
  privacyNote: { fontSize: 12, color: BRAND_COLORS.maroon, fontWeight: '600', marginBottom: 10 },
  notEntered: { fontSize: 13, color: GRAY[400], fontStyle: 'italic', marginTop: 12 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  entryName: { flex: 1, fontSize: 14, fontWeight: '600', color: GRAY[900] },
  eventInput: {
    width: 110,
    borderWidth: 1,
    borderColor: GRAY[300],
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: GRAY[900],
    backgroundColor: BRAND_COLORS.white,
  },
  privacyBanner: {
    backgroundColor: `${BRAND_COLORS.maroon}0D`,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  privacyBannerText: {
    color: BRAND_COLORS.maroon,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  scaleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  scaleEnd: { fontSize: 11, color: GRAY[400] },
  scaleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GRAY[300],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLORS.white,
  },
  scaleBtnActive: { backgroundColor: BRAND_COLORS.maroon, borderColor: BRAND_COLORS.maroon },
  scaleBtnText: { fontWeight: '700', color: GRAY[600] },
});
