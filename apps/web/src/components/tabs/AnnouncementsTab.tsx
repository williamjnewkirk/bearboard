'use client';

import { formatDateTime } from '@bearboard/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useRoster } from '@/lib/useRoster';
import type { Membership } from '@/lib/team-types';
import { Megaphone } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Spinner, inputCls } from '../ui';

interface AnnouncementRow {
  id: string;
  author_id: string | null;
  body_rich: string;
  image_url: string | null;
  pinned: boolean;
  squad_id: string | null;
  created_at: string;
}

/** Coach posts, pinned slot, 👍 reactions, link previews (PRD §5.7). */
export function AnnouncementsTab({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;
  const myMemberId = membership.id;
  const { roster, squads } = useRoster(teamId);

  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Composer (coach)
  const [body, setBody] = useState('');
  const [squadId, setSquadId] = useState('');
  const [pinned, setPinned] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

      const urls: Record<string, string> = {};
      for (const a of list.filter((x) => x.image_url)) {
        const { data: signed } = await sb.storage
          .from('images')
          .createSignedUrl(a.image_url!, 3600);
        if (signed?.signedUrl) urls[a.id] = signed.signedUrl;
      }
      setImageUrls(urls);
    }
    setLoading(false);
  }, [getSupabase, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    const sb = await getSupabase();

    let imagePath: string | null = null;
    if (imageFile) {
      if (imageFile.size > 10 * 1024 * 1024) {
        setBusy(false);
        return setError('Images are capped at 10 MB.');
      }
      const path = `${teamId}/${crypto.randomUUID()}-${imageFile.name.replace(/[^\w.\-]/g, '_')}`;
      const { error: upErr } = await sb.storage.from('images').upload(path, imageFile, {
        contentType: imageFile.type || 'image/jpeg',
      });
      if (upErr) {
        setBusy(false);
        return setError(`Upload: ${upErr.message}`);
      }
      imagePath = path;
    }

    // Only one pinned announcement: unpin others first.
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
      image_url: imagePath,
      pinned,
      squad_id: squadId || null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setBody('');
    setPinned(false);
    setSquadId('');
    setImageFile(null);
    await load();
  }

  async function togglePin(a: AnnouncementRow) {
    const sb = await getSupabase();
    if (!a.pinned) {
      await sb
        .from('announcements')
        .update({ pinned: false })
        .eq('team_id', teamId)
        .eq('pinned', true);
    }
    const { error } = await sb.from('announcements').update({ pinned: !a.pinned }).eq('id', a.id);
    if (error) setError(error.message);
    await load();
  }

  async function remove(a: AnnouncementRow) {
    const sb = await getSupabase();
    const { error } = await sb.from('announcements').delete().eq('id', a.id);
    if (error) setError(error.message);
    await load();
  }

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
    if (error) {
      setError(error.message);
      await load();
    }
  }

  if (loading) return <Spinner />;

  const authorOf = (id: string | null) => roster.find((r) => r.id === id)?.user ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-brand-forest">Announcements</h1>
      <ErrorNote>{error}</ErrorNote>

      {isCoach ? (
        <Card title="Post an announcement">
          <textarea
            className={inputCls}
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              'Quote of the day, logistics, mindset…\nLinks become tappable automatically.'
            }
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <select
              value={squadId}
              onChange={(e) => setSquadId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Whole team</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} only
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              📌 Pin
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            <Button small variant="outline" onClick={() => fileRef.current?.click()}>
              {imageFile ? `🖼️ ${imageFile.name.slice(0, 18)}…` : '🖼️ Image'}
            </Button>
            <div className="ml-auto">
              <Button onClick={() => void post()} disabled={busy || !body.trim()}>
                {busy ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <Empty
          icon={<Megaphone size={22} />}
          title="No announcements yet"
          hint={
            isCoach
              ? 'This replaces the weekly email — post the first one above.'
              : 'Your coach hasn’t posted yet.'
          }
        />
      ) : (
        rows.map((a) => {
          const author = authorOf(a.author_id);
          const reacts = reactions[a.id] ?? [];
          const mine = reacts.includes(myMemberId);
          return (
            <Card
              key={a.id}
              className={a.pinned ? '!border-brand-maroon/40 !bg-brand-maroon/[0.03]' : ''}
            >
              <div className="flex items-start gap-3">
                <Avatar name={author?.name ?? 'Coach'} photoUrl={author?.photo_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{author?.name ?? 'Coach'}</span>
                    {author?.title ? (
                      <span className="text-xs text-gray-400">{author.title}</span>
                    ) : null}
                    {a.pinned ? <Badge color="#971B2F">📌 Pinned</Badge> : null}
                    {a.squad_id ? (
                      <Badge color="#0E7490">
                        {squads.find((s) => s.id === a.squad_id)?.name ?? 'Squad'}
                      </Badge>
                    ) : null}
                    <span className="ml-auto text-xs text-gray-400">
                      {formatDateTime(a.created_at)}
                    </span>
                  </div>
                  <Linkified text={a.body_rich} />
                  {a.image_url && imageUrls[a.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrls[a.id]} alt="" className="mt-2 max-h-80 rounded-lg" />
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => void toggleReact(a)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        mine
                          ? 'border-brand-green/40 bg-brand-green/10 text-brand-green'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      👍 {reacts.length || ''}
                    </button>
                    {isCoach ? (
                      <>
                        <Button small variant="ghost" onClick={() => void togglePin(a)}>
                          {a.pinned ? 'Unpin' : 'Pin'}
                        </Button>
                        <Button small variant="ghost" onClick={() => void remove(a)}>
                          Delete
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

/** Render body text with URLs as tappable links. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-maroon underline"
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}
