/**
 * Injury & fatigue (PRD §5.8). Athlete: self-report status + daily-optional
 * fatigue slider (a signal, not a chore — no streaks). Coach: the injury board
 * grouped by status, with coach-attributed updates.
 */
import {
  BODY_AREAS,
  BODY_AREA_LABELS,
  BRAND_COLORS,
  INJURY_STATUSES,
  INJURY_STATUS_COLORS,
  INJURY_STATUS_LABELS,
  formatRelative,
  type BodyArea,
  type InjuryStatus,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership, RosterRow } from '../lib/team-types';
import {
  Avatar,
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

interface StatusRow {
  id: string;
  team_member_id: string;
  status: InjuryStatus;
  body_area: BodyArea | null;
  note: string | null;
  created_at: string;
}

export function InjuryScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;

  const [current, setCurrent] = useState<StatusRow[]>([]);
  const [history, setHistory] = useState<StatusRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [todayFatigue, setTodayFatigue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editFor, setEditFor] = useState<{ memberId: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();

    if (isCoach) {
      const { data: rosterData } = await sb
        .from('team_members')
        .select('id, role, user:users(id, name, class_year)')
        .eq('team_id', teamId)
        .eq('role', 'athlete')
        .eq('status', 'active');
      setRoster(
        ((rosterData ?? []) as unknown as RosterRow[]).sort((a, b) =>
          a.user.name.localeCompare(b.user.name),
        ),
      );
      const { data, error } = await sb
        .from('current_injury')
        .select('id, team_member_id, status, body_area, note, created_at');
      if (error) setError(error.message);
      setCurrent((data ?? []) as unknown as StatusRow[]);
    } else {
      const { data, error } = await sb
        .from('injury_statuses')
        .select('id, team_member_id, status, body_area, note, created_at')
        .eq('team_member_id', membership.id)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) setError(error.message);
      setHistory((data ?? []) as unknown as StatusRow[]);

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { data: fat } = await sb
        .from('fatigue_checkins')
        .select('score')
        .eq('team_member_id', membership.id)
        .gte('created_at', dayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setTodayFatigue((fat as { score: number } | null)?.score ?? null);
    }
    setLoading(false);
  }, [getSupabase, teamId, isCoach, membership.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkInFatigue(score: number) {
    setTodayFatigue(score);
    const sb = await getSupabase();
    const { error } = await sb
      .from('fatigue_checkins')
      .insert({ team_member_id: membership.id, score });
    if (error) {
      setError(error.message);
      setTodayFatigue(null);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading)
    return (
      <LoadingScreen
        title={isCoach ? 'Injury board' : "How's the body?"}
        variant={isCoach ? 'cards' : 'status'}
      />
    );

  if (isCoach) {
    const flagged = current.filter((c) => c.status !== 'healthy');
    const nameOf = (id: string) => roster.find((r) => r.id === id)?.user.name ?? 'Athlete';
    const order: InjuryStatus[] = ['out', 'modified', 'managing'];
    return (
      <Screen
        title="Injury board"
        subtitle={`${flagged.length} of ${roster.length} flagged`}
        scroll
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <ErrorText>{error}</ErrorText>
        {flagged.length === 0 ? (
          <EmptyState
            icon="shield-checkmark-outline"
            title="Everyone is Healthy"
            hint="Statuses athletes report show up here instantly."
          />
        ) : (
          order.map((status) => {
            const list = flagged.filter((c) => c.status === status);
            if (!list.length) return null;
            return (
              <View key={status}>
                <View style={{ marginTop: 10, marginBottom: 6 }}>
                  <Chip
                    color={INJURY_STATUS_COLORS[status]}
                    label={`${INJURY_STATUS_LABELS[status]} · ${list.length}`}
                  />
                </View>
                {list.map((c) => {
                  const days = Math.floor(
                    (Date.now() - new Date(c.created_at).getTime()) / 86_400_000,
                  );
                  return (
                    <Card key={c.id}>
                      <View style={st.boardRow}>
                        <Avatar name={nameOf(c.team_member_id)} size={32} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={st.boardName}>{nameOf(c.team_member_id)}</Text>
                          <Text style={st.boardMeta} numberOfLines={2}>
                            {c.body_area ? `${BODY_AREA_LABELS[c.body_area]} · ` : ''}
                            {c.note ?? 'No note'} · {days === 0 ? 'today' : `${days}d`}
                          </Text>
                        </View>
                        <Button
                          small
                          variant="outline"
                          label="Update"
                          onPress={() =>
                            setEditFor({
                              memberId: c.team_member_id,
                              name: nameOf(c.team_member_id),
                            })
                          }
                        />
                      </View>
                    </Card>
                  );
                })}
              </View>
            );
          })
        )}
        <Text style={st.sectionLabel}>Set a status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {roster.map((r) => (
            <Button
              key={r.id}
              small
              variant="outline"
              label={r.user.name}
              onPress={() => setEditFor({ memberId: r.id, name: r.user.name })}
            />
          ))}
        </View>
        {editFor ? (
          <StatusForm
            visible={Boolean(editFor)}
            memberId={editFor.memberId}
            name={editFor.name}
            onClose={() => setEditFor(null)}
            onSaved={async () => {
              setEditFor(null);
              await load();
            }}
          />
        ) : null}
      </Screen>
    );
  }

  // Athlete view
  const latest = history[0] ?? null;
  return (
    <Screen
      title="How's the body?"
      subtitle="Only you and your coaches see this"
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ErrorText>{error}</ErrorText>

      <Card accent={latest ? INJURY_STATUS_COLORS[latest.status] : BRAND_COLORS.green}>
        <Text style={st.currentLabel}>Current status</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text
            style={[st.currentStatus, { color: INJURY_STATUS_COLORS[latest?.status ?? 'healthy'] }]}
          >
            {INJURY_STATUS_LABELS[latest?.status ?? 'healthy']}
          </Text>
          {latest?.body_area ? (
            <Chip color={GRAY[500]} label={BODY_AREA_LABELS[latest.body_area]} />
          ) : null}
        </View>
        {latest?.note ? <Text style={st.currentNote}>{latest.note}</Text> : null}
        <View style={{ marginTop: 10 }}>
          <Button
            small
            label="Update status"
            onPress={() => setEditFor({ memberId: membership.id, name: 'you' })}
          />
        </View>
      </Card>

      <Text style={st.sectionLabel}>Today’s fatigue check-in</Text>
      <Card>
        <Text style={st.fatigueHint}>Optional, takes two seconds. 1 = fresh, 5 = cooked.</Text>
        <View style={st.fatigueRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => void checkInFatigue(n)}
              style={[st.fatigueBtn, todayFatigue === n && st.fatigueBtnActive]}
            >
              <Text style={{ fontSize: 20 }}>{['😃', '🙂', '😐', '😩', '🥵'][n - 1]}</Text>
              <Text
                style={[
                  st.fatigueNum,
                  todayFatigue === n && { color: BRAND_COLORS.maroon, fontWeight: '800' },
                ]}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
        {todayFatigue ? (
          <Text style={st.fatigueDone}>Logged {todayFatigue}/5 for today ✓</Text>
        ) : null}
      </Card>

      {history.length > 1 ? (
        <>
          <Text style={st.sectionLabel}>History</Text>
          {history.slice(1).map((h) => (
            <Card key={h.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Chip
                  color={INJURY_STATUS_COLORS[h.status]}
                  label={INJURY_STATUS_LABELS[h.status]}
                />
                {h.body_area ? (
                  <Text style={st.histArea}>{BODY_AREA_LABELS[h.body_area]}</Text>
                ) : null}
                <Text style={st.histTime}>{formatRelative(h.created_at)}</Text>
              </View>
              {h.note ? <Text style={st.histNote}>{h.note}</Text> : null}
            </Card>
          ))}
        </>
      ) : null}

      {editFor ? (
        <StatusForm
          visible={Boolean(editFor)}
          memberId={membership.id}
          name="you"
          onClose={() => setEditFor(null)}
          onSaved={async () => {
            setEditFor(null);
            await load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function StatusForm({
  visible,
  memberId,
  name,
  onClose,
  onSaved,
}: {
  visible: boolean;
  memberId: string;
  name: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [status, setStatus] = useState<InjuryStatus>('healthy');
  const [area, setArea] = useState<BodyArea | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.rpc('set_injury_status', {
      p_team_member_id: memberId,
      p_status: status,
      p_body_area: status === 'healthy' ? null : area,
      p_note: note || null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <SubScreen
      visible={visible}
      title={`Status update · ${name}`}
      onClose={onClose}
      footer={<Button label="Save status" onPress={() => void save()} busy={busy} />}
    >
      <ErrorText>{error}</ErrorText>
      <Text style={st.formLabel}>Status</Text>
      <View style={st.chipWrap}>
        {INJURY_STATUSES.map((s) => (
          <Pressable
            key={s}
            onPress={() => setStatus(s)}
            style={[
              st.statusChip,
              status === s && {
                backgroundColor: INJURY_STATUS_COLORS[s],
                borderColor: INJURY_STATUS_COLORS[s],
              },
            ]}
          >
            <Text style={[st.statusChipText, status === s && { color: BRAND_COLORS.white }]}>
              {INJURY_STATUS_LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={st.statusHelp}>
        Healthy · Managing (something’s off, still training) · Modified (XT or reduced) · Out
      </Text>
      {status !== 'healthy' ? (
        <>
          <Text style={st.formLabel}>Body area</Text>
          <View style={st.chipWrap}>
            {BODY_AREAS.map((a) => (
              <Pressable
                key={a}
                onPress={() => setArea(area === a ? null : a)}
                style={[
                  st.statusChip,
                  area === a && {
                    backgroundColor: BRAND_COLORS.forest,
                    borderColor: BRAND_COLORS.forest,
                  },
                ]}
              >
                <Text style={[st.statusChipText, area === a && { color: BRAND_COLORS.white }]}>
                  {BODY_AREA_LABELS[a]}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      <Input
        label="Note"
        placeholder="e.g. left calf tight since Tuesday's workout"
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />
    </SubScreen>
  );
}

const st = StyleSheet.create({
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boardName: { fontSize: 15, fontWeight: '700', color: GRAY[900] },
  boardMeta: { fontSize: 13, color: GRAY[500], marginTop: 1 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_COLORS.forest,
    marginTop: 14,
    marginBottom: 8,
  },
  currentLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: GRAY[400],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentStatus: { fontSize: 22, fontWeight: '800' },
  currentNote: { fontSize: 14, color: GRAY[600], marginTop: 4 },
  fatigueHint: { fontSize: 13, color: GRAY[500], marginBottom: 10 },
  fatigueRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fatigueBtn: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[200],
    width: 56,
    backgroundColor: BRAND_COLORS.white,
  },
  fatigueBtnActive: {
    borderColor: BRAND_COLORS.maroon,
    backgroundColor: `${BRAND_COLORS.maroon}0D`,
  },
  fatigueNum: { fontSize: 12, color: GRAY[500], marginTop: 2 },
  fatigueDone: { color: BRAND_COLORS.green, fontWeight: '600', fontSize: 13, marginTop: 10 },
  histArea: { fontSize: 13, color: GRAY[600] },
  histTime: { fontSize: 12, color: GRAY[400], marginLeft: 'auto' },
  histNote: { fontSize: 13, color: GRAY[600], marginTop: 4 },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GRAY[300],
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: BRAND_COLORS.white,
  },
  statusChipText: { fontSize: 13, fontWeight: '700', color: GRAY[600] },
  statusHelp: { fontSize: 12, color: GRAY[400], marginBottom: 12 },
});
