/**
 * Mobile coach planning (PRD §5.2.4): full parity with the web grid, list-based.
 * Week nav → tap a day → set day_type + label → write detail → per-athlete
 * overrides → publish or schedule. The web grid is where this is pleasant;
 * this screen is where it's always possible.
 */
import {
  BRAND_COLORS,
  DAY_TYPES,
  DAY_TYPE_COLORS,
  DAY_TYPE_LABELS,
  dayTypeName,
  WEEKDAY_LABELS,
  addDays,
  describeScheme,
  formatDateTime,
  mondayOf,
  todayISO,
  weekDates,
  type DayType,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership, RosterRow } from '../lib/team-types';
import { loadDays, type AssignmentRow, type DayRow } from '../lib/plan-data';
import { Button, Card, Chip, ErrorText, GRAY, Input, Loading, LoadingScreen, Screen, SubScreen } from '../lib/ui';

export function CoachPlanScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const teamId = membership.team.id;
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [days, setDays] = useState<Record<string, DayRow>>({});
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openDate, setOpenDate] = useState<string | null>(null);

  const dates = weekDates(weekStart);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();

    const { data: rosterData } = await sb
      .from('team_members')
      .select('id, role, user:users(id, name, class_year)')
      .eq('team_id', teamId)
      .eq('role', 'athlete')
      .eq('status', 'active');
    const athletes = ((rosterData ?? []) as unknown as RosterRow[]).sort((a, b) =>
      a.user.name.localeCompare(b.user.name),
    );
    setRoster(athletes);

    const { data: weekRow } = await sb
      .from('weeks')
      .select('skeleton_published_at')
      .eq('team_id', teamId)
      .eq('start_date', weekStart)
      .maybeSingle();
    setPublishedAt(
      (weekRow as { skeleton_published_at?: string } | null)?.skeleton_published_at ?? null,
    );

    const { days: dayMap, error: dErr } = await loadDays(sb, teamId, dates, membership.id);
    if (dErr) setError(dErr);
    setDays(dayMap);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSupabase, teamId, weekStart, membership.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publishWeek() {
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.rpc('publish_week', { p_team_id: teamId, p_week_start: weekStart });
    setBusy(false);
    if (error) return setError(error.message);
    await load();
  }

  async function copyLastWeek() {
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.rpc('copy_week', {
      p_team_id: teamId,
      p_from_start: addDays(weekStart, -7),
      p_to_start: weekStart,
      p_include_details: false,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await load();
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) return <LoadingScreen title="Plan" variant="days" />;

  return (
    <Screen
      title="Plan"
      subtitle={`Week of ${weekStart}${publishedAt ? ' · published ✓' : ' · not published'}`}
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

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Button
            label={publishedAt ? 'Re-publish week' : 'Publish week'}
            onPress={() => void publishWeek()}
            busy={busy}
          />
        </View>
        <Button
          label="⎘ Copy last week"
          variant="outline"
          onPress={() => void copyLastWeek()}
          disabled={busy}
        />
      </View>
      {!publishedAt ? (
        <Text style={st.hint}>Athletes can’t see this week until you publish the skeleton.</Text>
      ) : null}

      {dates.map((date, i) => {
        const d = days[date];
        const isToday = date === todayISO();
        const detailState = d?.detail?.release_state;
        const seen = d ? d.assignments.filter((a) => a.detail_seen_at).length : 0;
        const skeletonSeen = d ? d.assignments.filter((a) => a.skeleton_seen_at).length : 0;
        const confirmed = d ? d.assignments.filter((a) => a.confirmed_at).length : 0;
        const assignedCount = d && d.assignments.length ? d.assignments.length : roster.length;
        return (
          <Pressable key={date} onPress={() => setOpenDate(date)}>
            <Card
              accent={d ? DAY_TYPE_COLORS[d.day_type] : GRAY[300]}
              style={isToday ? st.todayCard : undefined}
            >
              <View style={st.rowBetween}>
                <Text style={st.weekday}>
                  {WEEKDAY_LABELS[i]} · {date.slice(5)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {detailState === 'published' ? (
                    <Chip
                      color={BRAND_COLORS.green}
                      label={`Published · seen ${seen}/${assignedCount}${confirmed ? ` · 👍${confirmed}` : ''}`}
                    />
                  ) : detailState === 'scheduled' ? (
                    <Chip
                      color="#2563EB"
                      label={`⏱ ${d?.detail?.release_at ? formatDateTime(d.detail.release_at) : 'scheduled'}`}
                    />
                  ) : detailState === 'draft' ? (
                    <Chip color={GRAY[500]} label="Draft" />
                  ) : null}
                  {publishedAt && d && detailState !== 'published' ? (
                    <Chip color={GRAY[500]} label={`👁 ${skeletonSeen}/${assignedCount}`} />
                  ) : null}
                </View>
              </View>
              <Text style={[st.dayType, { color: d ? DAY_TYPE_COLORS[d.day_type] : GRAY[400] }]}>
                {d ? dayTypeName(d.day_type, d.custom_type_label) : 'Tap to set this day'}
              </Text>
              {d?.skeleton_label ? <Text style={st.label}>{d.skeleton_label}</Text> : null}
              {d?.detail?.rep_scheme?.length ? (
                <Text style={st.scheme}>{describeScheme(d.detail.rep_scheme)}</Text>
              ) : null}
            </Card>
          </Pressable>
        );
      })}

      {openDate ? (
        <DayEditor
          visible={Boolean(openDate)}
          teamId={teamId}
          weekStart={weekStart}
          date={openDate}
          day={days[openDate] ?? null}
          roster={roster}
          onClose={() => setOpenDate(null)}
          onChanged={load}
        />
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Day editor: skeleton + detail + per-athlete overrides
// ---------------------------------------------------------------------------

function DayEditor({
  visible,
  teamId,
  weekStart,
  date,
  day,
  roster,
  onClose,
  onChanged,
}: {
  visible: boolean;
  teamId: string;
  weekStart: string;
  date: string;
  day: DayRow | null;
  roster: RosterRow[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [dayType, setDayType] = useState<DayType>(day?.day_type ?? 'easy');
  const [customType, setCustomType] = useState(day?.custom_type_label ?? '');
  const [label, setLabel] = useState(day?.skeleton_label ?? '');
  const [description, setDescription] = useState(day?.detail?.description_rich ?? '');
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [overrideFor, setOverrideFor] = useState<RosterRow | null>(null);
  const isPublished = day?.detail?.release_state === 'published';

  async function saveSkeleton(): Promise<string | null> {
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('set_training_day', {
      p_team_id: teamId,
      p_week_start: weekStart,
      p_date: date,
      p_day_type: dayType,
      p_skeleton_label: label,
      p_custom_type_label: dayType === 'other' ? customType : null,
    });
    if (error) {
      setError(error.message);
      return null;
    }
    return data as unknown as string;
  }

  async function save(publishDetail: boolean) {
    setBusy(true);
    setError('');
    const tdId = await saveSkeleton();
    if (!tdId) {
      setBusy(false);
      return;
    }
    if (description.trim() || day?.detail) {
      const sb = await getSupabase();
      const { error } = await sb.rpc('save_workout_detail', {
        p_training_day_id: tdId,
        p_description_rich: description || null,
        p_rep_scheme: day?.detail?.rep_scheme ?? null,
        p_publish: publishDetail,
        p_release_at: null,
        p_notify: notify,
      });
      if (error) {
        setBusy(false);
        return setError(error.message);
      }
    }
    setBusy(false);
    await onChanged();
    onClose();
  }

  return (
    <SubScreen
      visible={visible}
      title={`${date} · ${dayTypeName(dayType, customType)}`}
      onClose={onClose}
      footer={
        <View style={{ gap: 8 }}>
          {isPublished ? (
            <Pressable onPress={() => setNotify(!notify)} style={st.notifyRow}>
              <Text style={{ fontSize: 15 }}>{notify ? '☑️' : '⬜️'}</Text>
              <Text style={st.notifyText}>Notify athletes about this edit</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={isPublished ? 'Save (published)' : 'Save draft'}
                variant="outline"
                onPress={() => void save(isPublished)}
                busy={busy}
              />
            </View>
            {!isPublished ? (
              <View style={{ flex: 1 }}>
                <Button label="Publish detail" onPress={() => void save(true)} busy={busy} />
              </View>
            ) : null}
          </View>
        </View>
      }
    >
      <ErrorText>{error}</ErrorText>

      <Text style={st.editorLabel}>Day type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {DAY_TYPES.map((dt) => (
            <Pressable
              key={dt}
              onPress={() => setDayType(dt)}
              style={[
                st.typeChip,
                dayType === dt && {
                  backgroundColor: DAY_TYPE_COLORS[dt],
                  borderColor: DAY_TYPE_COLORS[dt],
                },
              ]}
            >
              <Text style={[st.typeChipText, dayType === dt && { color: BRAND_COLORS.white }]}>
                {dt === 'other' ? 'Custom…' : DAY_TYPE_LABELS[dt]}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {dayType === 'other' ? (
        <Input
          label="Name this day type"
          placeholder="e.g. Fartlek, Tempo, Shakeout"
          value={customType}
          onChangeText={setCustomType}
        />
      ) : null}

      <Input
        label="Skeleton label (what athletes see in the week shape)"
        placeholder="Rolling hilly route / Double T / Meet day"
        value={label}
        onChangeText={setLabel}
      />

      <Input
        label="Workout detail (release on its own clock)"
        placeholder={'WU 2 mi / Drills\n4-5 × 200m hill\n20 min @ T\nCD'}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={6}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />
      <Text style={st.hint}>
        Tip: the structured rep scheme editor (for split submission) lives on the web grid; the
        description alone still publishes fine.
      </Text>

      <Text style={[st.editorLabel, { marginTop: 16 }]}>Per-athlete overrides</Text>
      {day && day.assignments.length === 0 ? (
        <Text style={st.hint}>
          Publish the week first to fan out assignments, then override here.
        </Text>
      ) : null}
      {roster.map((r) => {
        const asg = day?.assignments.find((a) => a.team_member_id === r.id) ?? null;
        const o = asg?.overrides;
        return (
          <Pressable key={r.id} onPress={() => asg && setOverrideFor(r)} disabled={!asg}>
            <View style={[st.athleteRow, !asg && { opacity: 0.4 }]}>
              <Text style={st.athleteName}>{r.user.name}</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {o?.day_type ? (
                  <Chip color={BRAND_COLORS.maroon} label={DAY_TYPE_LABELS[o.day_type]} />
                ) : null}
                {asg?.note ? <Chip color={GRAY[500]} label="📝" /> : null}
                {asg?.confirmed_at ? (
                  <Text style={{ color: BRAND_COLORS.green, fontSize: 12 }}>👍</Text>
                ) : null}
                {asg?.detail_seen_at ? (
                  <Text style={{ color: GRAY[400], fontSize: 12 }}>👁</Text>
                ) : null}
                <Text style={{ color: GRAY[300] }}>›</Text>
              </View>
            </View>
          </Pressable>
        );
      })}

      {overrideFor && day ? (
        <OverrideEditor
          visible={Boolean(overrideFor)}
          member={overrideFor}
          day={day}
          assignment={day.assignments.find((a) => a.team_member_id === overrideFor.id) ?? null}
          onClose={() => setOverrideFor(null)}
          onSaved={async () => {
            setOverrideFor(null);
            await onChanged();
          }}
        />
      ) : null}
    </SubScreen>
  );
}

function OverrideEditor({
  visible,
  member,
  day,
  assignment,
  onClose,
  onSaved,
}: {
  visible: boolean;
  member: RosterRow;
  day: DayRow;
  assignment: AssignmentRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [dayType, setDayType] = useState<DayType | ''>(assignment?.overrides?.day_type ?? '');
  const [custom, setCustom] = useState(assignment?.overrides?.description_rich ?? '');
  const [note, setNote] = useState(assignment?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!assignment) return;
    setBusy(true);
    const sb = await getSupabase();
    const overrides: Record<string, unknown> = {};
    if (dayType) overrides.day_type = dayType;
    if (custom.trim()) overrides.description_rich = custom.trim();
    const { error } = await sb.rpc('set_assignment_override', {
      p_assignment_id: assignment.id,
      p_overrides: overrides,
      p_note: note,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <SubScreen
      visible={visible}
      title={`${member.user.name} · ${day.date}`}
      onClose={onClose}
      footer={
        <Button
          label="Save override"
          onPress={() => void save()}
          busy={busy}
          disabled={!assignment}
        />
      }
    >
      <ErrorText>{error}</ErrorText>
      <Text style={st.editorLabel}>
        Replace day type (blank = inherit {DAY_TYPE_LABELS[day.day_type]})
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        <Pressable
          onPress={() => setDayType('')}
          style={[st.typeChip, dayType === '' && st.typeChipInherit]}
        >
          <Text style={[st.typeChipText, dayType === '' && { color: BRAND_COLORS.white }]}>
            Inherit
          </Text>
        </Pressable>
        {DAY_TYPES.map((dt) => (
          <Pressable
            key={dt}
            onPress={() => setDayType(dt)}
            style={[
              st.typeChip,
              dayType === dt && {
                backgroundColor: DAY_TYPE_COLORS[dt],
                borderColor: DAY_TYPE_COLORS[dt],
              },
            ]}
          >
            <Text style={[st.typeChipText, dayType === dt && { color: BRAND_COLORS.white }]}>
              {DAY_TYPE_LABELS[dt]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Input
        label="Custom prescription (replaces the day's detail for them)"
        placeholder="25–28 min T instead of 20"
        value={custom}
        onChangeText={setCustom}
        multiline
        numberOfLines={3}
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />
      <Input
        label="Note to this athlete"
        placeholder="TBD based on your calf"
        value={note}
        onChangeText={setNote}
      />
    </SubScreen>
  );
}

const st = StyleSheet.create({
  todayCard: { borderWidth: 2, borderColor: BRAND_COLORS.maroon },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekday: { fontSize: 12, color: GRAY[500], fontWeight: '800', letterSpacing: 0.4 },
  dayType: { fontSize: 17, fontWeight: '800', marginTop: 3 },
  label: { fontSize: 14, color: GRAY[700], marginTop: 2 },
  scheme: { fontSize: 13, color: BRAND_COLORS.green, marginTop: 4, fontWeight: '600' },
  hint: { fontSize: 12, color: GRAY[400], marginBottom: 10 },
  editorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GRAY[300],
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: BRAND_COLORS.white,
  },
  typeChipInherit: { backgroundColor: GRAY[500], borderColor: GRAY[500] },
  typeChipText: { fontSize: 13, fontWeight: '700', color: GRAY[600] },
  athleteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[300],
  },
  athleteName: { fontSize: 14, fontWeight: '600', color: GRAY[900] },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifyText: { fontSize: 13, color: GRAY[600] },
});
