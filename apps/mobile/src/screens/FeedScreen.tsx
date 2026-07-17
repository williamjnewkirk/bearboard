/**
 * Team feed (PRD §5.4) + the athlete's own activity management: pending
 * review tray, manual entry, edit/delete. Coaches see everything (incl.
 * private-note indicator); athletes see teammates only when the team feed
 * toggle is on — enforced by RLS via the feed_activities view.
 */
import {
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  BRAND_COLORS,
  formatDuration,
  formatMiles,
  formatPace,
  formatRelative,
  type ActivityType,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership } from '../lib/team-types';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorText,
  GRAY,
  Loading,
  LoadingScreen,
  Screen,
} from '../lib/ui';
import { ActivityForm, type ActivityRow } from './ActivityForm';

interface MemberInfo {
  id: string;
  name: string;
}

export function FeedScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;
  const myMemberId = membership.id;

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [pending, setPending] = useState<ActivityRow[]>([]);
  const [likes, setLikes] = useState<Record<string, string[]>>({});
  const [members, setMembers] = useState<Record<string, MemberInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ActivityRow | 'new' | null>(null);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();

    const { data: rosterData } = await sb
      .from('team_members')
      .select('id, user:users(name)')
      .eq('team_id', teamId)
      .eq('status', 'active');
    const mMap: Record<string, MemberInfo> = {};
    for (const r of (rosterData ?? []) as unknown as Array<{
      id: string;
      user: { name: string };
    }>) {
      mMap[r.id] = { id: r.id, name: r.user.name };
    }
    setMembers(mMap);
    const memberIds = Object.keys(mMap);
    if (!memberIds.length) {
      setLoading(false);
      return;
    }

    // Feed: coaches read the base table; athletes read the teammate-safe view
    // for others + base table for their own rows (own always visible).
    const cols =
      'id, team_member_id, type, title, started_at, distance_m, duration_s, avg_hr, max_hr, elevation_m, description, shoe_id, source, status';
    let feed: ActivityRow[] = [];
    if (isCoach) {
      const { data, error } = await sb
        .from('activities')
        .select(`${cols}, private_note`)
        .in('team_member_id', memberIds)
        .eq('status', 'published')
        .order('started_at', { ascending: false })
        .limit(80);
      if (error) setError(error.message);
      feed = (data ?? []) as unknown as ActivityRow[];
    } else {
      const [mine, teammates] = await Promise.all([
        sb
          .from('activities')
          .select(`${cols}, private_note`)
          .eq('team_member_id', myMemberId)
          .eq('status', 'published')
          .order('started_at', { ascending: false })
          .limit(40),
        sb
          .from('feed_activities')
          .select(cols)
          .in(
            'team_member_id',
            memberIds.filter((id) => id !== myMemberId),
          )
          .order('started_at', { ascending: false })
          .limit(60),
      ]);
      if (mine.error) setError(mine.error.message);
      const seen = new Set<string>();
      feed = [
        ...((mine.data ?? []) as unknown as ActivityRow[]),
        ...((teammates.data ?? []) as unknown as ActivityRow[]),
      ]
        .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, 80);
    }
    setRows(feed);

    if (!isCoach) {
      const { data: pend } = await sb
        .from('activities')
        .select(`${cols}, private_note`)
        .eq('team_member_id', myMemberId)
        .eq('status', 'pending')
        .order('started_at', { ascending: false });
      setPending((pend ?? []) as unknown as ActivityRow[]);
    }

    if (feed.length) {
      const { data: likeData } = await sb
        .from('activity_likes')
        .select('activity_id, team_member_id')
        .in(
          'activity_id',
          feed.map((f) => f.id),
        );
      const lMap: Record<string, string[]> = {};
      for (const l of (likeData ?? []) as Array<{ activity_id: string; team_member_id: string }>) {
        (lMap[l.activity_id] ??= []).push(l.team_member_id);
      }
      setLikes(lMap);
    }
    setLoading(false);
  }, [getSupabase, teamId, isCoach, myMemberId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleLike(activityId: string) {
    const sb = await getSupabase();
    const mine = likes[activityId]?.includes(myMemberId) ?? false;
    setLikes((prev) => {
      const cur = prev[activityId] ?? [];
      return {
        ...prev,
        [activityId]: mine ? cur.filter((id) => id !== myMemberId) : [...cur, myMemberId],
      };
    });
    const { error } = mine
      ? await sb
          .from('activity_likes')
          .delete()
          .eq('activity_id', activityId)
          .eq('team_member_id', myMemberId)
      : await sb
          .from('activity_likes')
          .insert({ activity_id: activityId, team_member_id: myMemberId });
    if (error) {
      setError(error.message);
      await load();
    }
  }

  async function reviewPending(a: ActivityRow, approve: boolean) {
    const sb = await getSupabase();
    const { error } = await sb
      .from('activities')
      .update({ status: approve ? 'published' : 'discarded' })
      .eq('id', a.id);
    if (error) setError(error.message);
    await load();
  }

  if (loading) return <LoadingScreen title="Feed" variant="feed" />;

  const feedHiddenForAthletes = !isCoach && !membership.team.feed_visible_to_athletes;

  return (
    <Screen
      title="Feed"
      subtitle={
        feedHiddenForAthletes ? 'Feed is coach-only right now — you still see your own' : undefined
      }
      right={
        !isCoach ? <Button small label="+ Log" onPress={() => setEditing('new')} /> : undefined
      }
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ErrorText>{error}</ErrorText>

      {pending.length > 0 ? (
        <Card accent="#B45309">
          <Text style={st.trayTitle}>📥 Review tray ({pending.length})</Text>
          <Text style={st.trayHint}>Synced workouts wait here until you approve them.</Text>
          {pending.map((a) => (
            <View key={a.id} style={st.pendingRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.pendingTitle} numberOfLines={1}>
                  {ACTIVITY_TYPE_ICONS[a.type]} {a.title ?? ACTIVITY_TYPE_LABELS[a.type]}
                </Text>
                <Text style={st.pendingMeta}>
                  {formatMiles(a.distance_m != null ? Number(a.distance_m) : null)} ·{' '}
                  {formatDuration(a.duration_s)} · {formatRelative(a.started_at)}
                </Text>
              </View>
              <Button
                small
                variant="secondary"
                label="✓"
                onPress={() => void reviewPending(a, true)}
              />
              <Button
                small
                variant="danger"
                label="✕"
                onPress={() => void reviewPending(a, false)}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon="pulse-outline"
          title="No activities yet"
          hint={
            isCoach
              ? 'Runs appear here once athletes connect sync or log manually.'
              : 'Log your first run with + Log, or connect your watch in More → Settings.'
          }
        />
      ) : (
        rows.map((a) => {
          const likeList = likes[a.id] ?? [];
          const liked = likeList.includes(myMemberId);
          const isMine = a.team_member_id === myMemberId;
          return (
            <Card key={a.id}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Avatar name={members[a.team_member_id]?.name ?? '?'} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={st.feedHeader}>
                    <Text style={st.feedName} numberOfLines={1}>
                      {members[a.team_member_id]?.name ?? 'Athlete'}
                    </Text>
                    <Text style={st.feedTime}>{formatRelative(a.started_at)}</Text>
                  </View>
                  <Text style={st.feedTitle}>
                    {ACTIVITY_TYPE_ICONS[a.type]} {a.title ?? ACTIVITY_TYPE_LABELS[a.type]}
                  </Text>
                  <View style={st.stats}>
                    {a.distance_m != null ? (
                      <Stat
                        label="mi"
                        value={formatMiles(Number(a.distance_m)).replace(' mi', '')}
                      />
                    ) : null}
                    {a.duration_s != null ? (
                      <Stat label="time" value={formatDuration(a.duration_s)} />
                    ) : null}
                    {a.distance_m != null && a.duration_s ? (
                      <Stat
                        label="pace"
                        value={formatPace(Number(a.distance_m), a.duration_s).replace(' /mi', '')}
                      />
                    ) : null}
                    {a.avg_hr ? <Stat label="hr" value={String(a.avg_hr)} /> : null}
                  </View>
                  {a.description ? <Text style={st.desc}>{a.description}</Text> : null}
                  {isCoach && a.private_note ? (
                    <View style={st.privateNote}>
                      <Text style={st.privateNoteText}>🔒 {a.private_note}</Text>
                    </View>
                  ) : null}
                  <View style={st.feedActions}>
                    <Pressable
                      onPress={() => void toggleLike(a.id)}
                      style={[st.likeBtn, liked && st.likeBtnActive]}
                    >
                      <Ionicons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={14}
                        color={liked ? BRAND_COLORS.maroon : GRAY[500]}
                      />
                      <Text style={[st.likeText, liked && { color: BRAND_COLORS.maroon }]}>
                        {likeList.length || ''}
                      </Text>
                    </Pressable>
                    {isMine ? (
                      <Pressable onPress={() => setEditing(a)}>
                        <Text style={st.editLink}>edit</Text>
                      </Pressable>
                    ) : null}
                    {a.source !== 'manual' ? <Chip color={GRAY[400]} label="sync" /> : null}
                  </View>
                </View>
              </View>
            </Card>
          );
        })
      )}

      {editing ? (
        <ActivityForm
          visible={Boolean(editing)}
          membership={membership}
          activity={editing === 'new' ? null : editing}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginRight: 16 }}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  trayTitle: { fontWeight: '800', fontSize: 15, color: GRAY[900] },
  trayHint: { fontSize: 12, color: GRAY[500], marginBottom: 6 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GRAY[300],
  },
  pendingTitle: { fontSize: 14, fontWeight: '600', color: GRAY[900] },
  pendingMeta: { fontSize: 12, color: GRAY[500] },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  feedName: { fontWeight: '700', color: GRAY[900], fontSize: 14, flexShrink: 1 },
  feedTime: { color: GRAY[400], fontSize: 12 },
  feedTitle: { color: GRAY[700], fontSize: 14, marginTop: 1 },
  stats: { flexDirection: 'row', marginTop: 8 },
  statValue: { fontWeight: '800', fontSize: 16, color: GRAY[900], fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10, color: GRAY[400], textTransform: 'uppercase', letterSpacing: 0.5 },
  desc: { marginTop: 6, fontSize: 13, color: GRAY[600], lineHeight: 18 },
  privateNote: {
    marginTop: 6,
    backgroundColor: `${BRAND_COLORS.maroon}0D`,
    borderRadius: 8,
    padding: 8,
  },
  privateNoteText: { fontSize: 13, color: BRAND_COLORS.maroon },
  feedActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: GRAY[200],
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  likeBtnActive: {
    borderColor: `${BRAND_COLORS.maroon}66`,
    backgroundColor: `${BRAND_COLORS.maroon}0D`,
  },
  likeText: { fontSize: 12, fontWeight: '700', color: GRAY[500] },
  editLink: { fontSize: 12, color: GRAY[400], textDecorationLine: 'underline' },
});
