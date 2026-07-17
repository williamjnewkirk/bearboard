/**
 * Messaging (PRD §5.6): DMs, groups, team chat. Text + image attachments
 * (compressed, 10 MB cap), delete-own, per-conversation mute, unread badges.
 * Polling (4s) keeps delivery dependable everywhere including Expo Go.
 */
import { BRAND_COLORS, formatRelative, type ConversationKind } from '@bearboard/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal as RNModal,
} from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership, RosterRow } from '../lib/team-types';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorText,
  GRAY,
  Input,
  Loading,
  LoadingScreen,
  Screen,
  SubScreen,
} from '../lib/ui';

interface ConversationRow {
  id: string;
  kind: ConversationKind;
  name: string | null;
  members: Array<{ team_member_id: string; muted: boolean; last_read_at: string | null }>;
  last: MessageRow | null;
  unread: number;
}
interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  deleted: boolean;
}

const POLL_MS = 4000;

export function ChatScreen({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const teamId = membership.team.id;
  const myMemberId = membership.id;

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [active, setActive] = useState<ConversationRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const memberName = useCallback(
    (id: string) => roster.find((r) => r.id === id)?.user.name ?? 'Former member',
    [roster],
  );

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();

    const { data: rosterData } = await sb
      .from('team_members')
      .select('id, role, user:users(id, name, class_year)')
      .eq('team_id', teamId)
      .eq('status', 'active');
    setRoster(
      ((rosterData ?? []) as unknown as RosterRow[]).sort((a, b) =>
        a.user.name.localeCompare(b.user.name),
      ),
    );

    const { data, error } = await sb
      .from('conversations')
      .select('id, kind, name, conversation_members(team_member_id, muted, last_read_at)')
      .eq('team_id', teamId);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const convs = (data ?? []) as unknown as Array<{
      id: string;
      kind: ConversationKind;
      name: string | null;
      conversation_members: ConversationRow['members'];
    }>;

    const rows: ConversationRow[] = [];
    for (const c of convs) {
      const { data: msgs } = await sb
        .from('messages')
        .select('id, conversation_id, sender_id, body, image_url, created_at, deleted')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1);
      const last = ((msgs ?? []) as unknown as MessageRow[])[0] ?? null;
      const me = c.conversation_members.find((m) => m.team_member_id === myMemberId);
      let unread = 0;
      if (
        last &&
        last.sender_id !== myMemberId &&
        (!me?.last_read_at || last.created_at > me.last_read_at)
      ) {
        const { count } = await sb
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .neq('sender_id', myMemberId)
          .gt('created_at', me?.last_read_at ?? '1970-01-01');
        unread = count ?? 0;
      }
      rows.push({
        id: c.id,
        kind: c.kind,
        name: c.name,
        members: c.conversation_members,
        last,
        unread,
      });
    }
    rows.sort((a, b) => {
      if (a.kind === 'team') return -1;
      if (b.kind === 'team') return 1;
      return (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? '');
    });
    setConversations(rows);
    setLoading(false);
  }, [getSupabase, teamId, myMemberId]);

  useEffect(() => {
    void load();
  }, [load]);

  function title(c: ConversationRow): string {
    if (c.kind === 'team') return c.name ?? 'Team chat';
    if (c.kind === 'group') return c.name ?? 'Group';
    const other = c.members.find((m) => m.team_member_id !== myMemberId);
    return other ? memberName(other.team_member_id) : 'DM';
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) return <LoadingScreen title="Chat" variant="chat" />;

  return (
    <Screen
      title="Chat"
      right={<Button small label="+ New" onPress={() => setShowNew(true)} />}
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ErrorText>{error}</ErrorText>
      {conversations.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No conversations yet"
          hint="Start a DM or group with + New."
        />
      ) : (
        conversations.map((c) => (
          <Pressable key={c.id} onPress={() => setActive(c)}>
            <View style={st.convRow}>
              <Text style={{ fontSize: 24 }}>
                {c.kind === 'team' ? '🐻' : c.kind === 'group' ? '👥' : '💬'}
              </Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                  <Text style={st.convTitle} numberOfLines={1}>
                    {title(c)}
                  </Text>
                  {c.last ? (
                    <Text style={st.convTime}>{formatRelative(c.last.created_at)}</Text>
                  ) : null}
                </View>
                <Text style={st.convPreview} numberOfLines={1}>
                  {c.last
                    ? c.last.deleted
                      ? 'Message deleted'
                      : (c.last.body ?? '📷 Photo')
                    : 'Say hi'}
                </Text>
              </View>
              {c.unread > 0 ? (
                <View style={st.unreadBadge}>
                  <Text style={st.unreadText}>{c.unread}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ))
      )}

      {active ? (
        <ThreadModal
          visible={Boolean(active)}
          conversation={active}
          title={title(active)}
          teamId={teamId}
          myMemberId={myMemberId}
          memberName={memberName}
          onClose={() => {
            setActive(null);
            void load();
          }}
        />
      ) : null}

      {showNew ? (
        <NewConversation
          visible={showNew}
          membership={membership}
          roster={roster.filter((r) => r.id !== myMemberId)}
          onClose={() => setShowNew(false)}
          onCreated={async (id) => {
            setShowNew(false);
            await load();
            // Open the created conversation on next poll of list state.
            const conv = conversations.find((c) => c.id === id);
            if (conv) setActive(conv);
          }}
        />
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

function ThreadModal({
  visible,
  conversation,
  title,
  teamId,
  myMemberId,
  memberName,
  onClose,
}: {
  visible: boolean;
  conversation: ConversationRow;
  title: string;
  teamId: string;
  myMemberId: string;
  memberName: (id: string) => string;
  onClose: () => void;
}) {
  const getSupabase = useSupabase();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<{ uri: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const me = conversation.members.find((m) => m.team_member_id === myMemberId);
  const [muted, setMuted] = useState(me?.muted ?? false);
  const listRef = useRef<FlatList<MessageRow>>(null);

  const load = useCallback(async () => {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('messages')
      .select('id, conversation_id, sender_id, body, image_url, created_at, deleted')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) {
      setError(error.message);
      return;
    }
    const rows = (data ?? []) as unknown as MessageRow[];
    setMessages(rows);

    const needed = rows.filter((m) => m.image_url && !m.deleted);
    for (const m of needed) {
      if (!imageUrls[m.id]) {
        const { data: signed } = await sb.storage
          .from('images')
          .createSignedUrl(m.image_url!, 3600);
        if (signed?.signedUrl) setImageUrls((p) => ({ ...p, [m.id]: signed.signedUrl }));
      }
    }

    await sb
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id)
      .eq('team_member_id', myMemberId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getSupabase, conversation.id, myMemberId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function send() {
    const body = text.trim();
    if (!body && !pendingImage) return;
    setBusy(true);
    setError('');
    const sb = await getSupabase();

    // Upload the staged photo (if any) only now, on Send.
    let imagePath: string | null = null;
    if (pendingImage) {
      try {
        const path = `${teamId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const res = await fetch(pendingImage.uri);
        const buf = await res.arrayBuffer();
        const { error: upErr } = await sb.storage
          .from('images')
          .upload(path, buf, { contentType: 'image/jpeg' });
        if (upErr) {
          setBusy(false);
          return setError(`Upload: ${upErr.message}`);
        }
        imagePath = path;
      } catch (e) {
        setBusy(false);
        return setError(e instanceof Error ? e.message : String(e));
      }
    }

    const { error } = await sb.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: myMemberId,
      body: body || null,
      image_url: imagePath,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setText('');
    setPendingImage(null);
    await load();
    listRef.current?.scrollToEnd({ animated: true });
  }

  // Pick a photo and STAGE it for preview — nothing sends until Send is tapped.
  async function attachImage() {
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6, // client-side compression (PRD §5.6)
        base64: false,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) {
        setError('Images are capped at 10 MB.');
        return;
      }
      setError('');
      setPendingImage({ uri: asset.uri, size: asset.fileSize ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteMessage(id: string) {
    const sb = await getSupabase();
    await sb.from('messages').update({ deleted: true }).eq('id', id);
    await load();
  }

  async function toggleMute() {
    const sb = await getSupabase();
    const next = !muted;
    setMuted(next);
    const { error } = await sb
      .from('conversation_members')
      .update({ muted: next })
      .eq('conversation_id', conversation.id)
      .eq('team_member_id', myMemberId);
    if (error) setMuted(!next);
  }

  return (
    <RNModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={st.thread}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={st.threadHeader}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ fontSize: 22, color: GRAY[500] }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.threadTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={st.threadMeta}>
              {conversation.kind === 'dm'
                ? 'Direct message'
                : `${conversation.members.length} members`}
            </Text>
          </View>
          <Pressable onPress={() => void toggleMute()} hitSlop={8}>
            <Text style={{ fontSize: 18 }}>{muted ? '🔕' : '🔔'}</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 14, gap: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: m }) => {
            const mine = m.sender_id === myMemberId;
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {!mine ? <Text style={st.senderName}>{memberName(m.sender_id)}</Text> : null}
                <Pressable
                  onLongPress={() => mine && !m.deleted && void deleteMessage(m.id)}
                  style={[
                    st.bubble,
                    mine ? st.bubbleMine : st.bubbleTheirs,
                    m.deleted && { opacity: 0.55 },
                  ]}
                >
                  {m.deleted ? (
                    <Text
                      style={[
                        st.bubbleText,
                        mine && { color: BRAND_COLORS.white },
                        { fontStyle: 'italic' },
                      ]}
                    >
                      Message deleted
                    </Text>
                  ) : (
                    <>
                      {m.image_url && imageUrls[m.id] ? (
                        <Image
                          source={{ uri: imageUrls[m.id] }}
                          style={st.bubbleImage}
                          resizeMode="cover"
                        />
                      ) : m.image_url ? (
                        <Text style={[st.bubbleText, mine && { color: BRAND_COLORS.white }]}>
                          📷 Photo…
                        </Text>
                      ) : null}
                      {m.body ? (
                        <Text style={[st.bubbleText, mine && { color: BRAND_COLORS.white }]}>
                          {m.body}
                        </Text>
                      ) : null}
                    </>
                  )}
                </Pressable>
                <Text style={st.bubbleTime}>
                  {formatRelative(m.created_at)}
                  {mine && !m.deleted ? ' · hold to delete' : ''}
                </Text>
              </View>
            );
          }}
        />

        {error ? <Text style={[st.threadError]}>{error}</Text> : null}
        {pendingImage ? (
          <View style={st.previewBar}>
            <Image source={{ uri: pendingImage.uri }} style={st.previewThumb} resizeMode="cover" />
            <Text style={st.previewText}>Photo ready — add a caption or tap send.</Text>
            <Pressable onPress={() => setPendingImage(null)} hitSlop={8} style={st.previewRemove}>
              <Text style={{ color: GRAY[500], fontWeight: '800' }}>✕</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={st.composer}>
          <Pressable
            onPress={() => void attachImage()}
            disabled={busy}
            hitSlop={8}
            style={st.attachBtn}
          >
            <Text style={{ fontSize: 18 }}>📷</Text>
          </Pressable>
          <TextInput
            style={st.composerInput}
            placeholder="Message…"
            placeholderTextColor={GRAY[400]}
            value={text}
            onChangeText={setText}
            multiline
          />
          <Pressable
            onPress={() => void send()}
            disabled={busy || (!text.trim() && !pendingImage)}
            style={[st.sendBtn, (busy || (!text.trim() && !pendingImage)) && { opacity: 0.4 }]}
          >
            <Text style={{ color: BRAND_COLORS.white, fontWeight: '800' }}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

// ---------------------------------------------------------------------------
// New conversation
// ---------------------------------------------------------------------------

function NewConversation({
  visible,
  membership,
  roster,
  onClose,
  onCreated,
}: {
  visible: boolean;
  membership: Membership;
  roster: RosterRow[];
  onClose: () => void;
  onCreated: (conversationId: string) => Promise<void>;
}) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const eligible =
    mode === 'group' && !isCoach ? roster.filter((r) => r.role === 'athlete') : roster;

  async function startDm(memberId: string) {
    setBusy(true);
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('create_dm', {
      p_team_id: membership.team.id,
      p_other_member_id: memberId,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onCreated(data as unknown as string);
  }

  async function createGroup() {
    setBusy(true);
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('create_group', {
      p_team_id: membership.team.id,
      p_name: groupName,
      p_member_ids: selected,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onCreated(data as unknown as string);
  }

  return (
    <SubScreen
      visible={visible}
      title="New conversation"
      onClose={onClose}
      footer={
        mode === 'group' ? (
          <Button
            label="Create group"
            onPress={() => void createGroup()}
            busy={busy}
            disabled={!groupName.trim() || selected.length === 0}
          />
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {(['dm', 'group'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[st.modeChip, mode === m && st.modeChipActive]}
          >
            <Text style={[st.modeChipText, mode === m && { color: BRAND_COLORS.white }]}>
              {m === 'dm' ? 'Direct message' : 'Group chat'}
            </Text>
          </Pressable>
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      {mode === 'group' ? (
        <>
          <Input
            label="Group name"
            placeholder="800 group"
            value={groupName}
            onChangeText={setGroupName}
          />
          {!isCoach ? (
            <Text style={{ fontSize: 12, color: GRAY[400], marginBottom: 8 }}>
              Athlete-created groups can include athletes only.
            </Text>
          ) : null}
        </>
      ) : null}
      {eligible.map((r) => (
        <Pressable
          key={r.id}
          onPress={() =>
            mode === 'dm'
              ? void startDm(r.id)
              : setSelected((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))
          }
        >
          <View style={st.personRow}>
            {mode === 'group' ? (
              <Text style={{ fontSize: 16 }}>{selected.includes(r.id) ? '☑️' : '⬜️'}</Text>
            ) : null}
            <Avatar name={r.user.name} size={30} />
            <Text style={st.personName}>{r.user.name}</Text>
            <Text style={st.personRole}>{r.role}</Text>
            {mode === 'dm' ? <Text style={{ color: GRAY[300] }}>›</Text> : null}
          </View>
        </Pressable>
      ))}
    </SubScreen>
  );
}

const st = StyleSheet.create({
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BRAND_COLORS.white,
    borderWidth: 1,
    borderColor: GRAY[200],
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  convTitle: { fontWeight: '800', fontSize: 15, color: GRAY[900], flexShrink: 1 },
  convTime: { fontSize: 11, color: GRAY[400] },
  convPreview: { fontSize: 13, color: GRAY[500], marginTop: 1 },
  unreadBadge: {
    backgroundColor: BRAND_COLORS.crimson,
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadText: { color: BRAND_COLORS.white, fontSize: 11, fontWeight: '800' },
  thread: { flex: 1, backgroundColor: GRAY[50] },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 56,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: BRAND_COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: GRAY[200],
  },
  threadTitle: { fontSize: 17, fontWeight: '800', color: BRAND_COLORS.forest },
  threadMeta: { fontSize: 12, color: GRAY[400] },
  senderName: { fontSize: 11, fontWeight: '700', color: GRAY[400], marginBottom: 2, marginLeft: 4 },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: BRAND_COLORS.maroon, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: GRAY[200], borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: GRAY[900], lineHeight: 20 },
  bubbleImage: { width: 200, height: 200, borderRadius: 10, marginBottom: 4 },
  bubbleTime: { fontSize: 10, color: GRAY[400], marginTop: 2, marginHorizontal: 4 },
  threadError: {
    color: BRAND_COLORS.crimson,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    paddingBottom: 26,
    backgroundColor: BRAND_COLORS.white,
    borderTopWidth: 1,
    borderTopColor: GRAY[200],
  },
  attachBtn: { padding: 8 },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: GRAY[100],
    borderTopWidth: 1,
    borderTopColor: GRAY[200],
  },
  previewThumb: { width: 40, height: 40, borderRadius: 6 },
  previewText: { flex: 1, fontSize: 13, color: GRAY[600] },
  previewRemove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GRAY[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: GRAY[300],
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 15,
    maxHeight: 110,
    color: GRAY[900],
    backgroundColor: BRAND_COLORS.white,
  },
  sendBtn: {
    backgroundColor: BRAND_COLORS.maroon,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: GRAY[300],
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: BRAND_COLORS.white,
  },
  modeChipActive: { backgroundColor: BRAND_COLORS.maroon, borderColor: BRAND_COLORS.maroon },
  modeChipText: { fontWeight: '700', color: GRAY[600] },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[300],
  },
  personName: { flex: 1, fontSize: 15, fontWeight: '600', color: GRAY[900] },
  personRole: { fontSize: 12, color: GRAY[400], textTransform: 'capitalize' },
});
