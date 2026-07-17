'use client';

import {
  BODY_AREA_LABELS,
  INJURY_STATUS_COLORS,
  INJURY_STATUS_LABELS,
  SHOE_CATEGORY_LABELS,
  addDays,
  formatDateTime,
  formatMiles,
  formatRelative,
  metersToMiles,
  mondayOf,
  type BodyArea,
  type InjuryStatus,
  type ShoeCategory,
} from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import type { Membership, RosterRow } from '@/lib/team-types';
import { Avatar, Badge, ErrorNote, Modal, Spinner } from '../ui';

interface InjuryHist {
  id: string;
  status: InjuryStatus;
  body_area: BodyArea | null;
  note: string | null;
  created_at: string;
}
interface ShoeRow {
  id: string;
  brand_model: string;
  nickname: string | null;
  category: ShoeCategory | null;
  start_miles: number;
  retired: boolean;
  threshold_miles: number | null;
  is_default: boolean;
}
interface WeekRow {
  week_start: string;
  run_m: number | null;
}
interface RecentActivity {
  id: string;
  type: string;
  title: string | null;
  started_at: string;
  distance_m: number | null;
}
interface FatigueRow {
  score: number;
  created_at: string;
}

/** Coach view of one athlete: everything the permissions matrix allows (§4.4). */
export function AthleteProfileModal({
  membership,
  teamMemberId,
  member,
  onClose,
}: {
  membership: Membership;
  teamMemberId: string;
  member: RosterRow | null;
  onClose: () => void;
}) {
  const getSupabase = useSupabase();
  const [injuries, setInjuries] = useState<InjuryHist[]>([]);
  const [shoes, setShoes] = useState<Array<ShoeRow & { current_miles: number }>>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [goals, setGoals] = useState<Record<string, { low: number | null; high: number | null }>>(
    {},
  );
  const [recent, setRecent] = useState<RecentActivity[]>([]);
  const [fatigue, setFatigue] = useState<FatigueRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const sb = await getSupabase();

    const [inj, shoeRows, mileageRows, mg, acts, fat] = await Promise.all([
      sb
        .from('injury_statuses')
        .select('id, status, body_area, note, created_at')
        .eq('team_member_id', teamMemberId)
        .order('created_at', { ascending: false })
        .limit(10),
      sb
        .from('shoes')
        .select(
          'id, brand_model, nickname, category, start_miles, retired, threshold_miles, is_default',
        )
        .eq('team_member_id', teamMemberId),
      sb
        .from('weekly_mileage')
        .select('week_start, run_m')
        .eq('team_member_id', teamMemberId)
        .order('week_start', { ascending: false })
        .limit(5),
      sb
        .from('mileage_goals')
        .select('goal_low, goal_high, week:weeks(start_date)')
        .eq('team_member_id', teamMemberId),
      sb
        .from('activities')
        .select('id, type, title, started_at, distance_m')
        .eq('team_member_id', teamMemberId)
        .eq('status', 'published')
        .order('started_at', { ascending: false })
        .limit(8),
      sb
        .from('fatigue_checkins')
        .select('score, created_at')
        .eq('team_member_id', teamMemberId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const firstError =
      inj.error ?? shoeRows.error ?? mileageRows.error ?? mg.error ?? acts.error ?? fat.error;
    if (firstError) setError(firstError.message);

    setInjuries((inj.data ?? []) as unknown as InjuryHist[]);
    setWeeks((mileageRows.data ?? []) as unknown as WeekRow[]);
    setRecent((acts.data ?? []) as unknown as RecentActivity[]);
    setFatigue((fat.data ?? null) as FatigueRow | null);

    const goalMap: Record<string, { low: number | null; high: number | null }> = {};
    for (const g of (mg.data ?? []) as unknown as Array<{
      goal_low: number | null;
      goal_high: number | null;
      week: { start_date: string } | null;
    }>) {
      if (g.week) goalMap[g.week.start_date] = { low: g.goal_low, high: g.goal_high };
    }
    setGoals(goalMap);

    // Shoe mileage from the view.
    const shoeList = (shoeRows.data ?? []) as unknown as ShoeRow[];
    if (shoeList.length) {
      const { data: sm } = await sb
        .from('shoe_mileage')
        .select('shoe_id, current_miles')
        .in(
          'shoe_id',
          shoeList.map((s) => s.id),
        );
      const miles: Record<string, number> = {};
      for (const r of (sm ?? []) as Array<{ shoe_id: string; current_miles: number }>) {
        miles[r.shoe_id] = Number(r.current_miles);
      }
      setShoes(shoeList.map((s) => ({ ...s, current_miles: miles[s.id] ?? s.start_miles ?? 0 })));
    } else {
      setShoes([]);
    }
    setLoading(false);
  }, [getSupabase, teamMemberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = member?.user.name ?? 'Athlete';
  const thisWeek = mondayOf(new Date());
  const weekLabels = [0, -1, -2, -3].map((i) => addDays(thisWeek, i * 7));

  return (
    <Modal
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <Avatar name={name} photoUrl={member?.user.photo_url} size={30} />
          {name}
          {member?.user.class_year ? (
            <span className="text-sm font-normal text-gray-400">
              ’{member.user.class_year.slice(-2)}
            </span>
          ) : null}
          {member?.user.events ? (
            <span className="text-sm font-normal text-gray-500">· {member.user.events}</span>
          ) : null}
        </span>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section>
            <h4 className="mb-2 text-sm font-semibold text-brand-forest">Mileage vs. goal</h4>
            <table className="w-full text-sm">
              <tbody>
                {weekLabels.map((w) => {
                  const row = weeks.find((x) => x.week_start === w);
                  const goal = goals[w];
                  const miles = row?.run_m != null ? metersToMiles(Number(row.run_m)) : 0;
                  return (
                    <tr key={w} className="border-b last:border-0">
                      <td className="py-1.5 text-gray-500">
                        {w === thisWeek ? 'This week' : `Wk of ${w.slice(5)}`}
                      </td>
                      <td className="py-1.5 font-semibold">{miles.toFixed(1)} mi</td>
                      <td className="py-1.5 text-gray-500">
                        {goal ? `goal ${goal.low ?? ''}–${goal.high ?? ''}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h4 className="mb-2 mt-4 text-sm font-semibold text-brand-forest">Shoes</h4>
            {shoes.length === 0 ? (
              <p className="text-sm text-gray-400">No shoes added.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {shoes.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className={s.retired ? 'text-gray-400 line-through' : 'text-gray-800'}>
                      {s.nickname || s.brand_model}
                      {s.category ? (
                        <span className="text-xs text-gray-400">
                          {' '}
                          · {SHOE_CATEGORY_LABELS[s.category]}
                        </span>
                      ) : null}
                      {s.is_default ? (
                        <span className="text-xs text-brand-green"> · default</span>
                      ) : null}
                    </span>
                    <Badge
                      color={
                        s.threshold_miles && s.current_miles >= s.threshold_miles
                          ? '#BA0C2F'
                          : '#215732'
                      }
                    >
                      {s.current_miles.toFixed(0)} mi
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold text-brand-forest">
              Injury history{' '}
              {fatigue ? (
                <span className="font-normal text-gray-400">
                  · fatigue {fatigue.score}/5 ({formatRelative(fatigue.created_at)})
                </span>
              ) : null}
            </h4>
            {injuries.length === 0 ? (
              <p className="text-sm text-gray-400">No status reported — treated as Healthy.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {injuries.map((i) => (
                  <li key={i.id} className="rounded-lg border border-gray-100 p-2">
                    <div className="flex items-center gap-2">
                      <Badge color={INJURY_STATUS_COLORS[i.status]}>
                        {INJURY_STATUS_LABELS[i.status]}
                      </Badge>
                      {i.body_area ? (
                        <span className="text-gray-600">{BODY_AREA_LABELS[i.body_area]}</span>
                      ) : null}
                      <span className="ml-auto text-xs text-gray-400">
                        {formatDateTime(i.created_at)}
                      </span>
                    </div>
                    {i.note ? <p className="mt-1 text-gray-600">{i.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}

            <h4 className="mb-2 mt-4 text-sm font-semibold text-brand-forest">Recent activities</h4>
            {recent.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {recent.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="truncate text-gray-700">{a.title ?? a.type}</span>
                    <span className="shrink-0 text-gray-400">
                      {a.distance_m != null ? `${formatMiles(Number(a.distance_m))} · ` : ''}
                      {formatRelative(a.started_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
