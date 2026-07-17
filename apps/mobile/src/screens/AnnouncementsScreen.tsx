/**
 * Announcements (PRD §5.7): coach posts (team/squad, pinned slot, image),
 * athletes read + react 👍. Links open in the browser.
 */
import { BRAND_COLORS, formatDateTime } from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
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
  Input,
  Loading,
  LoadingScreen,
  Screen,
  SubScreen,
} from '../lib/ui';

interface AnnouncementRow {
  id: string;
  author_id: string | null;
  body_rich: string;
  image_url: string | null;
  pinned: boolean;
  squad_id: string | null;
  created_at: string;
}
interface SquadOpt {
  id: string;
  name: string;
}

export function AnnouncementsScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;
  const myMemberId = membership.id;

  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [squads, setSquads] = useState<SquadOpt[]>([]);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('announcements')
      .select('id, author_id, body_rich, image_url, pinned, squad_id, created_at')
      .eq('team_id', teamId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as AnnouncementRow[];
    setRows(list);

    const { data: rosterData } = await sb
      .from('team_members')
      .select('id, user:users(name)')
      .eq('team_id', teamId);
    const aMap: Record<string, string> = {};
    for (const r of (rosterData ?? []) as unknown as Array<{
      id: string;
      user: { name: string };
    }>) {
      aMap[r.id] = r.user.name;
    }
    setAuthors(aMap);

    const { data: squadData } = await sb.from('squads').select('id, name').eq('team_id', teamId);
    setSquads((squadData ?? []) as SquadOpt[]);

    if (list.length) {
      const { data: reacts } = await sb
        .from('announcement_reactions')
        .select('announcement_id, team_member_id')
        .in(
          'announcement_id',
          list.map((a) => a.id),
        );
      const rMap: Record<string, string[]> = {};
      for (const r of (reacts ?? []) as Array<{
        announcement_id: string;
        team_member_id: string;
      }>) {
        (rMap[r.announcement_id] ??= []).push(r.team_member_id);
      }
      setReactions(rMap);

      for (const a of list.filter((x) => x.image_url)) {
        const { data: signed } = await sb.storage
          .from('images')
          .createSignedUrl(a.image_url!, 3600);
        if (signed?.signedUrl) setImageUrls((p) => ({ ...p, [a.id]: signed.signedUrl }));
      }
    }
    setLoading(false);
  }, [getSupabase, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleReact(a: AnnouncementRow) {
    const sb = await getSupabase();
    const mine = reactions[a.id]?.includes(myMemberId) ?? false;
    setReactions((prev) => {
      const cur = prev[a.id] ?? [];
      return {
        ...prev,
        [a.id]: mine ? cur.filter((id) => id !== myMemberId) : [...cur, myMemberId],
      };
    });
    const { error } = mine
      ? await sb
          .from('announcement_reactions')
          .delete()
          .eq('announcement_id', a.id)
          .eq('team_member_id', myMemberId)
      : await sb
          .from('announcement_reactions')
          .insert({ announcement_id: a.id, team_member_id: myMemberId });
    if (error) await load();
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) return <LoadingScreen title="Announcements" variant="announcements" />;

  return (
    <Screen
      title="Announcements"
      right={
        isCoach ? <Button small label="+ Post" onPress={() => setComposing(true)} /> : undefined
      }
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ErrorText>{error}</ErrorText>
      {rows.length === 0 ? (
        <EmptyState
          icon="megaphone-outline"
          title="Nothing yet"
          hint={
            isCoach
              ? 'Post the first announcement — quote of the day, logistics, season goal.'
              : 'Announcements from your coach land here.'
          }
        />
      ) : (
        rows.map((a) => {
          const reacts = reactions[a.id] ?? [];
          const mine = reacts.includes(myMemberId);
          return (
            <Card key={a.id} accent={a.pinned ? BRAND_COLORS.maroon : undefined}>
              <View style={st.header}>
                <Avatar name={authors[a.author_id ?? ''] ?? 'Coach'} size={30} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.author}>{authors[a.author_id ?? ''] ?? 'Coach'}</Text>
                  <Text style={st.time}>{formatDateTime(a.created_at)}</Text>
                </View>
                {a.pinned ? <Chip color={BRAND_COLORS.maroon} label="📌 pinned" /> : null}
                {a.squad_id ? (
                  <Chip
                    color="#0E7490"
                    label={squads.find((s) => s.id === a.squad_id)?.name ?? 'squad'}
                  />
                ) : null}
              </View>
              <LinkifiedText text={a.body_rich} />
              {a.image_url && imageUrls[a.id] ? (
                <Image source={{ uri: imageUrls[a.id] }} style={st.image} resizeMode="cover" />
              ) : null}
              <Pressable
                onPress={() => void toggleReact(a)}
                style={[st.reactBtn, mine && st.reactBtnActive]}
              >
                <Text style={[st.reactText, mine && { color: BRAND_COLORS.green }]}>
                  👍 {reacts.length || ''}
                </Text>
              </Pressable>
            </Card>
          );
        })
      )}

      {composing ? (
        <Composer
          visible={composing}
          teamId={teamId}
          myMemberId={myMemberId}
          squads={squads}
          onClose={() => setComposing(false)}
          onPosted={async () => {
            setComposing(false);
            await load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function Composer({
  visible,
  teamId,
  myMemberId,
  squads,
  onClose,
  onPosted,
}: {
  visible: boolean;
  teamId: string;
  myMemberId: string;
  squads: SquadOpt[];
  onClose: () => void;
  onPosted: () => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [body, setBody] = useState('');
  const [squadId, setSquadId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    const sb = await getSupabase();
    if (pinned) {
      await sb
        .from('announcements')
        .update({ pinned: false })
        .eq('team_id', teamId)
        .eq('pinned', true);
    }
    const { error } = await sb.from('announcements').insert({
      team_id: teamId,
      author_id: myMemberId,
      body_rich: body.trim(),
      pinned,
      squad_id: squadId,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onPosted();
  }

  return (
    <SubScreen
      visible={visible}
      title="Post announcement"
      onClose={onClose}
      footer={
        <Button
          label={busy ? 'Posting…' : 'Post'}
          onPress={() => void post()}
          busy={busy}
          disabled={!body.trim()}
        />
      }
    >
      <ErrorText>{error}</ErrorText>
      <Input
        label="Announcement"
        placeholder={'Quote of the day, logistics, mindset…\nPaste links — they become tappable.'}
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={6}
        style={{ minHeight: 130, textAlignVertical: 'top' }}
      />
      <Text style={st.formLabel}>Audience</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        <Pressable
          onPress={() => setSquadId(null)}
          style={[st.audChip, squadId === null && st.audChipActive]}
        >
          <Text style={[st.audText, squadId === null && { color: BRAND_COLORS.white }]}>
            Whole team
          </Text>
        </Pressable>
        {squads.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setSquadId(s.id)}
            style={[st.audChip, squadId === s.id && st.audChipActive]}
          >
            <Text style={[st.audText, squadId === s.id && { color: BRAND_COLORS.white }]}>
              {s.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={() => setPinned(!pinned)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <Text style={{ fontSize: 16 }}>{pinned ? '☑️' : '⬜️'}</Text>
        <Text style={{ fontSize: 14, color: GRAY[700] }}>
          📌 Pin (shows on everyone’s Today screen)
        </Text>
      </Pressable>
    </SubScreen>
  );
}

export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <Text style={st.body}>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <Text key={i} style={st.link} onPress={() => void Linking.openURL(p)}>
            {p}
          </Text>
        ) : (
          <Text key={i}>{p}</Text>
        ),
      )}
    </Text>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  author: { fontWeight: '800', fontSize: 14, color: GRAY[900] },
  time: { fontSize: 11, color: GRAY[400] },
  body: { fontSize: 14, color: GRAY[700], lineHeight: 20 },
  link: { color: BRAND_COLORS.maroon, textDecorationLine: 'underline' },
  image: { width: '100%', height: 200, borderRadius: 10, marginTop: 8 },
  reactBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderColor: GRAY[200],
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  reactBtnActive: {
    borderColor: `${BRAND_COLORS.green}66`,
    backgroundColor: `${BRAND_COLORS.green}0D`,
  },
  reactText: { fontSize: 13, fontWeight: '700', color: GRAY[500] },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GRAY[500],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  audChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GRAY[300],
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: BRAND_COLORS.white,
  },
  audChipActive: { backgroundColor: BRAND_COLORS.maroon, borderColor: BRAND_COLORS.maroon },
  audText: { fontSize: 13, fontWeight: '600', color: GRAY[600] },
});
