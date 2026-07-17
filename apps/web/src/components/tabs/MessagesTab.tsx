'use client';

import { formatRelative, type ConversationKind } from '@bearboard/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useRoster } from '@/lib/useRoster';
import type { Membership, RosterRow } from '@/lib/team-types';
import { MessageSquare } from 'lucide-react';
import { Avatar, Button, Empty, ErrorNote, Field, Modal, Spinner, inputCls } from '../ui';

interface ConversationRow {
  id: string;
  kind: ConversationKind;
  name: string | null;
  members: Array<{ team_member_id: string; muted: boolean; last_read_at: string | null }>;
  lastMessage: MessageRow | null;
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

/** DMs, groups, team chat (PRD §5.6). Polling keeps it simple + reliable. */
export function MessagesTab({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const teamId = membership.team.id;
  const myMemberId = membership.id;
  const { roster } = useRoster(teamId);

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);

  const memberName = useCallback(
    (id: string) => roster.find((r) => r.id === id)?.user.name ?? 'Former member',
    [roster],
  );

  const loadConversations = useCallback(async () => {
    const sb = await getSupabase();
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

    // Last message + unread count per conversation.
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
        (!me?.last_read_at || last.created_at > me.last_read_at) &&
        last.sender_id !== myMemberId
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
        lastMessage: last,
        unread,
      });
    }
    // Team chat first, then most recent activity.
    rows.sort((a, b) => {
      if (a.kind === 'team') return -1;
      if (b.kind === 'team') return 1;
      return (b.lastMessage?.created_at ?? '').localeCompare(a.lastMessage?.created_at ?? '');
    });
    setConversations(rows);
    setLoading(false);
  }, [getSupabase, teamId, myMemberId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  function convTitle(c: ConversationRow): string {
    if (c.kind === 'team') return c.name ?? 'Team chat';
    if (c.kind === 'group') return c.name ?? 'Group';
    const other = c.members.find((m) => m.team_member_id !== myMemberId);
    return other ? memberName(other.team_member_id) : 'DM';
  }

  if (loading) return <Spinner />;

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* Conversation list */}
      <div className={`w-full shrink-0 md:w-72 ${active ? 'hidden md:block' : ''}`}>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand-forest">Messages</h1>
          <Button small onClick={() => setShowNew(true)}>
            + New
          </Button>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2">
          {conversations.length === 0 ? (
            <Empty icon={<MessageSquare size={22} />} title="No conversations" />
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${
                  activeId === c.id ? 'bg-brand-maroon/10' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {c.kind === 'team' ? '🐻' : c.kind === 'group' ? '👥' : '💬'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">
                      {convTitle(c)}
                    </span>
                    {c.lastMessage ? (
                      <span className="shrink-0 text-[10px] text-gray-400">
                        {formatRelative(c.lastMessage.created_at)}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {c.lastMessage
                      ? c.lastMessage.deleted
                        ? 'Message deleted'
                        : (c.lastMessage.body ?? '📷 Photo')
                      : 'Say hi'}
                  </span>
                </span>
                {c.unread > 0 ? (
                  <span className="rounded-full bg-brand-crimson px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {c.unread}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className={`min-w-0 flex-1 ${active ? '' : 'hidden md:block'}`}>
        {active ? (
          <Thread
            key={active.id}
            conversation={active}
            title={convTitle(active)}
            teamId={teamId}
            myMemberId={myMemberId}
            memberName={memberName}
            onBack={() => setActiveId(null)}
            onChanged={loadConversations}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Empty
              icon={<MessageSquare size={22} />}
              title="Pick a conversation"
              hint="Or start a new DM or group chat."
            />
          </div>
        )}
      </div>

      {showNew ? (
        <NewConversationModal
          membership={membership}
          roster={roster.filter((r) => r.id !== myMemberId)}
          onClose={() => setShowNew(false)}
          onCreated={async (id) => {
            setShowNew(false);
            await loadConversations();
            setActiveId(id);
          }}
        />
      ) : null}
    </div>
  );
}

function Thread({
  conversation,
  title,
  teamId,
  myMemberId,
  memberName,
  onBack,
  onChanged,
}: {
  conversation: ConversationRow;
  title: string;
  teamId: string;
  myMemberId: string;
  memberName: (id: string) => string;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const me = conversation.members.find((m) => m.team_member_id === myMemberId);
  const [muted, setMuted] = useState(me?.muted ?? false);

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

    // Signed URLs for images (bucket is private).
    const needed = rows.filter((m) => m.image_url && !m.deleted);
    if (needed.length) {
      const urls: Record<string, string> = {};
      for (const m of needed) {
        const { data: signed } = await sb.storage
          .from('images')
          .createSignedUrl(m.image_url!, 3600);
        if (signed?.signedUrl) urls[m.id] = signed.signedUrl;
      }
      setImageUrls((prev) => ({ ...prev, ...urls }));
    }

    // Advance my read cursor.
    await sb
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id)
      .eq('team_member_id', myMemberId);
  }, [getSupabase, conversation.id, myMemberId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body && !pendingImage) return;
    setBusy(true);
    setError('');
    const sb = await getSupabase();

    // Upload the staged photo only now, on Send.
    let imagePath: string | null = null;
    if (pendingImage) {
      const path = `${teamId}/${crypto.randomUUID()}-${pendingImage.name.replace(/[^\w.\-]/g, '_')}`;
      const { error: upErr } = await sb.storage.from('images').upload(path, pendingImage, {
        contentType: pendingImage.type || 'image/jpeg',
      });
      if (upErr) {
        setBusy(false);
        return setError(`Upload: ${upErr.message}`);
      }
      imagePath = path;
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
    setPendingPreview(null);
    await load();
    await onChanged();
  }

  // Stage the photo for preview — nothing sends until Send is clicked.
  function attachImage(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setError('Images are capped at 10 MB.');
      return;
    }
    setError('');
    setPendingImage(file);
    setPendingPreview(URL.createObjectURL(file));
  }

  async function deleteMessage(id: string) {
    const sb = await getSupabase();
    const { error } = await sb.from('messages').update({ deleted: true }).eq('id', id);
    if (error) setError(error.message);
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
    if (error) {
      setMuted(!next);
      setError(error.message);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b p-3">
        <button onClick={onBack} className="rounded p-1 text-gray-400 hover:bg-gray-100 md:hidden">
          ←
        </button>
        <span className="text-lg" aria-hidden>
          {conversation.kind === 'team' ? '🐻' : conversation.kind === 'group' ? '👥' : '💬'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-400">
            {conversation.kind === 'dm'
              ? 'Direct message'
              : `${conversation.members.length} members`}
          </p>
        </div>
        <Button small variant={muted ? 'outline' : 'ghost'} onClick={() => void toggleMute()}>
          {muted ? '🔕 Muted' : '🔔'}
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m) => {
          const mine = m.sender_id === myMemberId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`group max-w-[75%] ${mine ? 'text-right' : ''}`}>
                {!mine ? (
                  <p className="mb-0.5 text-[11px] font-semibold text-gray-400">
                    {memberName(m.sender_id)}
                  </p>
                ) : null}
                <div
                  className={`inline-block rounded-2xl px-3 py-2 text-sm ${
                    mine ? 'bg-brand-maroon text-white' : 'bg-gray-100 text-gray-900'
                  } ${m.deleted ? 'italic opacity-60' : ''}`}
                >
                  {m.deleted ? (
                    'Message deleted'
                  ) : (
                    <>
                      {m.image_url && imageUrls[m.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imageUrls[m.id]}
                          alt="attachment"
                          className="mb-1 max-h-64 max-w-full rounded-lg"
                        />
                      ) : m.image_url ? (
                        <span className="opacity-70">📷 Photo…</span>
                      ) : null}
                      {m.body ? (
                        <span className="whitespace-pre-wrap break-words">{m.body}</span>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span className={mine ? 'ml-auto' : ''}>{formatRelative(m.created_at)}</span>
                  {mine && !m.deleted ? (
                    <button
                      onClick={() => void deleteMessage(m.id)}
                      className="hidden text-brand-crimson group-hover:inline"
                    >
                      delete
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="px-3 pb-1 text-xs text-brand-crimson">{error}</p> : null}
      {pendingPreview ? (
        <div className="flex items-center gap-3 border-t bg-gray-50 px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingPreview} alt="preview" className="h-10 w-10 rounded object-cover" />
          <span className="flex-1 text-sm text-gray-600">Photo ready — add a caption or send.</span>
          <button
            onClick={() => {
              setPendingImage(null);
              setPendingPreview(null);
            }}
            className="rounded-full bg-gray-200 px-2 text-gray-600"
          >
            ✕
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-t p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) attachImage(f);
            e.target.value = '';
          }}
        />
        <Button
          small
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Attach image"
        >
          📷
        </Button>
        <input
          className={inputCls}
          placeholder="Message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button onClick={() => void send()} disabled={busy || (!text.trim() && !pendingImage)}>
          Send
        </Button>
      </div>
    </div>
  );
}

function NewConversationModal({
  membership,
  roster,
  onClose,
  onCreated,
}: {
  membership: Membership;
  roster: RosterRow[];
  onClose: () => void;
  onCreated: (conversationId: string) => void | Promise<void>;
}) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Athlete-created groups: athletes only (PRD §4.4).
  const eligible = useMemo(
    () => (mode === 'group' && !isCoach ? roster.filter((r) => r.role === 'athlete') : roster),
    [mode, isCoach, roster],
  );

  async function startDm(memberId: string) {
    setBusy(true);
    setError('');
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
    setError('');
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
    <Modal title="New conversation" onClose={onClose}>
      <div className="mb-3 flex gap-2">
        {(['dm', 'group'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              mode === m
                ? 'border-brand-maroon bg-brand-maroon/10 text-brand-maroon'
                : 'border-gray-300 text-gray-600'
            }`}
          >
            {m === 'dm' ? 'Direct message' : 'Group chat'}
          </button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>

      {mode === 'group' ? (
        <Field label="Group name">
          <input
            className={inputCls}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="800 group"
          />
        </Field>
      ) : null}

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {eligible.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-gray-50"
          >
            {mode === 'group' ? (
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                  )
                }
              />
            ) : null}
            <Avatar name={r.user.name} photoUrl={r.user.photo_url} size={26} />
            <span className="flex-1 text-sm font-medium text-gray-800">{r.user.name}</span>
            <span className="text-xs capitalize text-gray-400">{r.role}</span>
            {mode === 'dm' ? (
              <Button small variant="outline" disabled={busy} onClick={() => void startDm(r.id)}>
                Message
              </Button>
            ) : null}
          </label>
        ))}
      </div>

      {mode === 'group' ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void createGroup()}
            disabled={busy || !groupName.trim() || selected.length === 0}
          >
            Create group
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}
