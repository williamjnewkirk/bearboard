'use client';

import {
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  formatDuration,
  formatMiles,
  formatPace,
  formatRelative,
  type ActivityType,
} from '@bearboard/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useRoster } from '@/lib/useRoster';
import type { Membership } from '@/lib/team-types';
import { Activity as ActivityIcon, Lock, Hand } from 'lucide-react';
import { Avatar, Badge, Card, Empty, ErrorNote, FeedSkeleton } from '../ui';
import { AthleteProfileModal } from './AthleteProfileModal';

interface FeedRow {
  id: string;
  team_member_id: string;
  type: ActivityType;
  title: string | null;
  started_at: string;
  distance_m: number | null;
  duration_s: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_m: number | null;
  description: string | null;
  private_note?: string | null;
  source: string;
  status: string;
}

/**
 * Team activity feed. Coaches read the base table (includes private notes +
 * filters); athletes read the teammate-safe `feed_activities` view — the
 * toggle and the private-note exclusion are enforced by the database.
 */
export function FeedTab({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;
  const { roster, squads } = useRoster(teamId);

  const [rows, setRows] = useState<FeedRow[]>([]);
  const [likes, setLikes] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [squadFilter, setSquadFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [athleteFilter, setAthleteFilter] = useState('');
  const [profileMember, setProfileMember] = useState<string | null>(null);

  const memberById = useMemo(() => {
    const m: Record<string, (typeof roster)[number]> = {};
    for (const r of roster) m[r.id] = r;
    return m;
  }, [roster]);
  const myMemberId = membership.id;

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    const memberIds = roster.map((r) => r.id);
    if (memberIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const source = isCoach ? 'activities' : 'feed_activities';
    let q = sb
      .from(source)
      .select(
        `id, team_member_id, type, title, started_at, distance_m, duration_s, avg_hr, max_hr, elevation_m, description, source, status${isCoach ? ', private_note' : ''}`,
      )
      .in('team_member_id', memberIds)
      .eq('status', 'published')
      .order('started_at', { ascending: false })
      .limit(100);
    const { data, error } = await q;
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const feed = (data ?? []) as unknown as FeedRow[];
    setRows(feed);

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
  }, [getSupabase, roster, isCoach]);

  useEffect(() => {
    if (roster.length) void load();
    else setLoading(false);
  }, [load, roster.length]);

  async function toggleLike(activityId: string) {
    const sb = await getSupabase();
    const mine = likes[activityId]?.includes(myMemberId) ?? false;
    // Optimistic update with rollback.
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

  const visible = useMemo(() => {
    let list = rows;
    if (athleteFilter) list = list.filter((r) => r.team_member_id === athleteFilter);
    if (typeFilter) list = list.filter((r) => r.type === typeFilter);
    if (squadFilter) {
      const squad = squads.find((s) => s.id === squadFilter);
      if (squad) list = list.filter((r) => squad.member_ids.includes(r.team_member_id));
    }
    return list;
  }, [rows, athleteFilter, typeFilter, squadFilter, squads]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-bold text-brand-forest">Feed</h1>
        <FeedSkeleton />
      </div>
    );
  }

  const feedHidden = !isCoach && !membership.team.feed_visible_to_athletes;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-brand-forest">Feed</h1>
        {isCoach ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <select
              value={squadFilter}
              onChange={(e) => setSquadFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">All squads</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={athleteFilter}
              onChange={(e) => setAthleteFilter(e.target.value)}
              className="max-w-[160px] rounded-lg border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">All athletes</option>
              {roster
                .filter((r) => r.role === 'athlete')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.user.name}
                  </option>
                ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">All types</option>
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <ErrorNote>{error}</ErrorNote>

      {feedHidden ? (
        <Empty
          icon={<Lock size={22} />}
          title="The team feed is coach-only right now"
          hint="Your coach controls feed visibility. You can still see your own activities in the app."
        />
      ) : visible.length === 0 ? (
        <Empty
          icon={<ActivityIcon size={22} />}
          title="No activities yet"
          hint="Runs appear here automatically once athletes connect sync in the app, or when they log one manually."
        />
      ) : (
        visible.map((a) => {
          const member = memberById[a.team_member_id];
          const likeList = likes[a.id] ?? [];
          const liked = likeList.includes(myMemberId);
          return (
            <Card key={a.id} className="!p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => isCoach && setProfileMember(a.team_member_id)}>
                  <Avatar
                    name={member?.user.name ?? 'Athlete'}
                    photoUrl={member?.user.photo_url}
                    size={38}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <button
                      className={`font-semibold text-gray-900 ${isCoach ? 'hover:text-brand-maroon hover:underline' : ''}`}
                      onClick={() => isCoach && setProfileMember(a.team_member_id)}
                    >
                      {member?.user.name ?? 'Athlete'}
                    </button>
                    <span className="text-xs text-gray-400">{formatRelative(a.started_at)}</span>
                    {a.source !== 'manual' ? (
                      <span className="text-[10px] uppercase tracking-wide text-gray-300">
                        sync
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-gray-700">
                    <span className="mr-1">{ACTIVITY_TYPE_ICONS[a.type]}</span>
                    {a.title ?? ACTIVITY_TYPE_LABELS[a.type]}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    {a.distance_m != null ? (
                      <Stat label="Distance" value={formatMiles(Number(a.distance_m))} />
                    ) : null}
                    {a.duration_s != null ? (
                      <Stat label="Time" value={formatDuration(a.duration_s)} />
                    ) : null}
                    {a.distance_m && a.duration_s ? (
                      <Stat label="Pace" value={formatPace(Number(a.distance_m), a.duration_s)} />
                    ) : null}
                    {a.avg_hr ? <Stat label="Avg HR" value={`${a.avg_hr}`} /> : null}
                  </div>
                  {a.description ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                      {a.description}
                    </p>
                  ) : null}
                  {isCoach && a.private_note ? (
                    <div className="mt-2 rounded-lg bg-brand-maroon/5 p-2 text-sm text-brand-maroon">
                      <span className="font-semibold">Private note:</span> {a.private_note}
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => void toggleLike(a.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        liked
                          ? 'border-brand-maroon/40 bg-brand-maroon/10 text-brand-maroon'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <Hand size={13} className={liked ? 'fill-brand-maroon/20' : ''} />
                      {likeList.length || ''}
                    </button>
                    {isCoach ? (
                      <Badge color="#6B7280" className="!font-normal">
                        {a.status}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}

      {profileMember ? (
        <AthleteProfileModal
          membership={membership}
          teamMemberId={profileMember}
          member={memberById[profileMember] ?? null}
          onClose={() => setProfileMember(null)}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-[10px] uppercase tracking-wide text-gray-400">{label} </span>
      <span className="font-semibold text-gray-900">{value}</span>
    </span>
  );
}
