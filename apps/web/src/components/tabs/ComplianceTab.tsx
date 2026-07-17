'use client';

import {
  INJURY_STATUS_COLORS,
  INJURY_STATUS_LABELS,
  addDays,
  daysUntil,
  formatMiles,
  formatRelative,
  metersToMiles,
  mondayOf,
  type InjuryStatus,
} from '@bearboard/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useRoster } from '@/lib/useRoster';
import type { Membership } from '@/lib/team-types';
import { ChevronLeft, ChevronRight, Flag, Users } from 'lucide-react';
import { Avatar, Badge, Button, Card, Empty, ErrorNote, TableSkeleton } from '../ui';

interface WeekMileage {
  team_member_id: string;
  run_m: number | null;
  total_m: number | null;
  activity_count: number;
  last_activity_at: string | null;
}
interface Goal {
  team_member_id: string;
  goal_low: number | null;
  goal_high: number | null;
  qualifier: string | null;
}
interface InjuryRow {
  team_member_id: string;
  status: InjuryStatus;
  body_area: string | null;
}
interface SeenAgg {
  seenSkeleton: boolean;
  confirmed: number;
  assigned: number;
}

type SortKey = 'name' | 'miles' | 'pct' | 'last';

/** Team roll-up: mileage vs. goal, last activity, injury, plan-seen (PRD §5.11). */
export function ComplianceTab({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const teamId = membership.team.id;
  const { roster, squads, loading: rosterLoading } = useRoster(teamId, { athletesOnly: true });

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [mileage, setMileage] = useState<Record<string, WeekMileage>>({});
  const [goals, setGoals] = useState<Record<string, Goal>>({});
  const [injuries, setInjuries] = useState<Record<string, InjuryRow>>({});
  const [seen, setSeen] = useState<Record<string, SeenAgg>>({});
  const [goalRace, setGoalRace] = useState<{ name: string; date: string } | null>(null);
  const [squadFilter, setSquadFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    const sb = await getSupabase();

    const { data: wm, error: wmErr } = await sb
      .from('weekly_mileage')
      .select('team_member_id, run_m, total_m, activity_count, last_activity_at')
      .eq('week_start', weekStart);
    if (wmErr) {
      setError(wmErr.message);
      setLoading(false);
      return;
    }
    const wmMap: Record<string, WeekMileage> = {};
    for (const r of (wm ?? []) as unknown as WeekMileage[]) wmMap[r.team_member_id] = r;
    setMileage(wmMap);

    const { data: weekRow } = await sb
      .from('weeks')
      .select('id')
      .eq('team_id', teamId)
      .eq('start_date', weekStart)
      .maybeSingle();
    const weekId = (weekRow as { id?: string } | null)?.id;
    if (weekId) {
      const { data: g } = await sb
        .from('mileage_goals')
        .select('team_member_id, goal_low, goal_high, qualifier')
        .eq('week_id', weekId);
      const gMap: Record<string, Goal> = {};
      for (const r of (g ?? []) as unknown as Goal[]) gMap[r.team_member_id] = r;
      setGoals(gMap);
    } else {
      setGoals({});
    }

    const { data: inj } = await sb
      .from('current_injury')
      .select('team_member_id, status, body_area');
    const iMap: Record<string, InjuryRow> = {};
    for (const r of (inj ?? []) as unknown as InjuryRow[]) iMap[r.team_member_id] = r;
    setInjuries(iMap);

    // Plan-seen: aggregate this week's assignments per athlete.
    const { data: days } = await sb
      .from('training_days')
      .select('id')
      .eq('team_id', teamId)
      .gte('date', weekStart)
      .lte('date', addDays(weekStart, 6));
    const dayIds = ((days ?? []) as Array<{ id: string }>).map((d) => d.id);
    if (dayIds.length) {
      const { data: asg } = await sb
        .from('day_assignments')
        .select('team_member_id, skeleton_seen_at, confirmed_at')
        .in('training_day_id', dayIds);
      const sMap: Record<string, SeenAgg> = {};
      for (const a of (asg ?? []) as Array<{
        team_member_id: string;
        skeleton_seen_at: string | null;
        confirmed_at: string | null;
      }>) {
        const cur = sMap[a.team_member_id] ?? { seenSkeleton: false, confirmed: 0, assigned: 0 };
        cur.assigned += 1;
        if (a.skeleton_seen_at) cur.seenSkeleton = true;
        if (a.confirmed_at) cur.confirmed += 1;
        sMap[a.team_member_id] = cur;
      }
      setSeen(sMap);
    } else {
      setSeen({});
    }

    const { data: gr } = await sb
      .from('meets')
      .select('name, date')
      .eq('team_id', teamId)
      .eq('is_goal_race', true)
      .gte('date', new Date().toISOString().slice(0, 10))
      .order('date')
      .limit(1)
      .maybeSingle();
    setGoalRace((gr as { name: string; date: string } | null) ?? null);

    setLoading(false);
  }, [getSupabase, teamId, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const squad = squads.find((s) => s.id === squadFilter);
    let list = roster;
    if (squad) list = list.filter((r) => squad.member_ids.includes(r.id));
    const derived = list.map((r) => {
      const m = mileage[r.id];
      const g = goals[r.id];
      const miles = m?.run_m != null ? metersToMiles(Number(m.run_m)) : 0;
      const target = g?.goal_high ?? g?.goal_low ?? null;
      const pct = target ? miles / Number(target) : null;
      return { r, m, g, miles, pct };
    });
    derived.sort((a, b) => {
      if (sortKey === 'miles') return b.miles - a.miles;
      if (sortKey === 'pct') return (b.pct ?? -1) - (a.pct ?? -1);
      if (sortKey === 'last')
        return (
          new Date(b.m?.last_activity_at ?? 0).getTime() -
          new Date(a.m?.last_activity_at ?? 0).getTime()
        );
      return a.r.user.name.localeCompare(b.r.user.name);
    });
    return derived;
  }, [roster, squads, squadFilter, mileage, goals, sortKey]);

  if (rosterLoading || loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-brand-forest">Dashboard</h1>
        <TableSkeleton rows={8} cols={7} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-brand-forest">Dashboard</h1>
        {goalRace ? (
          <Badge color="#BA0C2F" className="!inline-flex !items-center !gap-1 !text-xs">
            <Flag size={12} /> {daysUntil(goalRace.date)} days to {goalRace.name}
          </Badge>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" small onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft size={14} /> Prev
          </Button>
          <span className="text-sm font-medium text-gray-700">Week of {weekStart}</span>
          <Button variant="outline" small onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Next <ChevronRight size={14} />
          </Button>
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
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <Card>
        {rows.length === 0 ? (
          <Empty
            icon={<Users size={22} />}
            title="No athletes yet"
            hint="Share your athlete join code (Settings) so your roster can join."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                  <Th onClick={() => setSortKey('name')} active={sortKey === 'name'}>
                    Athlete
                  </Th>
                  <th className="px-2 py-2">Squads</th>
                  <Th onClick={() => setSortKey('miles')} active={sortKey === 'miles'}>
                    Run miles
                  </Th>
                  <th className="px-2 py-2">Goal</th>
                  <Th onClick={() => setSortKey('pct')} active={sortKey === 'pct'}>
                    Status
                  </Th>
                  <Th onClick={() => setSortKey('last')} active={sortKey === 'last'}>
                    Last activity
                  </Th>
                  <th className="px-2 py-2">Injury</th>
                  <th className="px-2 py-2">Plan seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, m, g, miles, pct }) => {
                  const inj = injuries[r.id];
                  const s = seen[r.id];
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={r.user.name} photoUrl={r.user.photo_url} size={28} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">{r.user.name}</p>
                            {r.user.class_year ? (
                              <p className="text-xs text-gray-400">
                                ’{r.user.class_year.slice(-2)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-500">
                        {squads
                          .filter((sq) => sq.member_ids.includes(r.id))
                          .map((sq) => sq.name)
                          .join(', ') || '—'}
                      </td>
                      <td className="px-2 py-2 font-semibold text-gray-900">
                        {m?.run_m != null ? formatMiles(Number(m.run_m)) : '0 mi'}
                      </td>
                      <td className="px-2 py-2 text-gray-600">
                        {g
                          ? `${g.goal_low ?? ''}${g.goal_low != null && g.goal_high != null ? '–' : ''}${g.goal_high ?? ''} mi${g.qualifier ? ` · ${g.qualifier}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-2 py-2">
                        <StatusPill
                          miles={miles}
                          pct={pct}
                          hasData={(m?.activity_count ?? 0) > 0}
                        />
                      </td>
                      <td className="px-2 py-2 text-gray-600">
                        {m?.last_activity_at ? formatRelative(m.last_activity_at) : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {inj && inj.status !== 'healthy' ? (
                          <Badge color={INJURY_STATUS_COLORS[inj.status]}>
                            {INJURY_STATUS_LABELS[inj.status]}
                            {inj.body_area ? ` · ${inj.body_area}` : ''}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">Healthy</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {s?.seenSkeleton ? (
                          <Badge color="#215732">
                            Seen{s.confirmed ? ` · ${s.confirmed}/${s.assigned} 👍` : ''}
                          </Badge>
                        ) : (s?.assigned ?? 0) > 0 ? (
                          <Badge color="#B45309">Not seen</Badge>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-gray-400">
        Run miles count published run activities Mon–Sun in the team timezone. “Plan seen” is the
        week skeleton; per-day detail receipts live in the Plan grid.
      </p>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th className="px-2 py-2">
      <button
        onClick={onClick}
        className={`uppercase tracking-wide ${active ? 'text-brand-maroon' : ''}`}
      >
        {children} {active ? '↓' : ''}
      </button>
    </th>
  );
}

function StatusPill({
  miles,
  pct,
  hasData,
}: {
  miles: number;
  pct: number | null;
  hasData: boolean;
}) {
  if (!hasData) return <Badge color="#9CA3AF">No data</Badge>;
  if (pct == null) return <Badge color="#6B7280">{miles.toFixed(1)} mi</Badge>;
  if (pct > 1.15) return <Badge color="#0E7490">Over · {(pct * 100).toFixed(0)}%</Badge>;
  if (pct >= 0.85) return <Badge color="#215732">On track · {(pct * 100).toFixed(0)}%</Badge>;
  return <Badge color="#BA0C2F">Behind · {(pct * 100).toFixed(0)}%</Badge>;
}
