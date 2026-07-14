'use client';

import {
  DAY_TYPE_LABELS,
  DAY_TYPES,
  WEEKDAY_LABELS,
  addDays,
  mondayOf,
  weekDates,
  type AssignmentView,
  type DayType,
  type PlanDay,
} from '@bearboard/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import type { RosterRow } from '@/lib/team-types';

interface Goal {
  goal_low: number | null;
  goal_high: number | null;
  qualifier: string | null;
}

export function PlanGrid({ teamId }: { teamId: string }) {
  const getSupabase = useSupabase();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [days, setDays] = useState<Record<string, PlanDay>>({});
  const [assignments, setAssignments] = useState<Record<string, AssignmentView>>({});
  const [goals, setGoals] = useState<Record<string, Goal>>({});
  const [weekId, setWeekId] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editDetailDate, setEditDetailDate] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ day: PlanDay; member: RosterRow } | null>(null);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();

    const { data: rosterData, error: rErr } = await sb
      .from('team_members')
      .select('id, role, user:users(id, name, class_year)')
      .eq('team_id', teamId)
      .eq('role', 'athlete')
      .eq('status', 'active');
    if (rErr) return setError(`Roster: ${rErr.message}`);
    const athletes = ((rosterData ?? []) as unknown as RosterRow[]).sort((a, b) =>
      a.user.name.localeCompare(b.user.name),
    );
    setRoster(athletes);

    const { data: weekRow } = await sb
      .from('weeks')
      .select('id, skeleton_published_at')
      .eq('team_id', teamId)
      .eq('start_date', weekStart)
      .maybeSingle();
    setWeekId((weekRow as { id?: string } | null)?.id ?? null);
    setPublishedAt(
      (weekRow as { skeleton_published_at?: string } | null)?.skeleton_published_at ?? null,
    );

    const { data: dayData, error: dErr } = await sb
      .from('training_days')
      .select(
        'id, date, day_type, skeleton_label, workout_details(id, description_rich, rep_scheme, release_state, published_at)',
      )
      .eq('team_id', teamId)
      .in('date', dates);
    if (dErr) return setError(`Days: ${dErr.message}`);
    const dayMap: Record<string, PlanDay> = {};
    const dayIds: string[] = [];
    for (const row of (dayData ?? []) as unknown as Array<
      PlanDay & { workout_details: PlanDay['detail'][] }
    >) {
      const detail = Array.isArray(row.workout_details) ? (row.workout_details[0] ?? null) : null;
      dayMap[row.date] = {
        id: row.id,
        date: row.date,
        day_type: row.day_type,
        skeleton_label: row.skeleton_label,
        detail,
      };
      dayIds.push(row.id);
    }
    setDays(dayMap);

    if (dayIds.length) {
      const { data: asgData } = await sb
        .from('day_assignments')
        .select(
          'id, training_day_id, team_member_id, overrides, note, skeleton_seen_at, detail_seen_at, confirmed_at',
        )
        .in('training_day_id', dayIds);
      const asgMap: Record<string, AssignmentView> = {};
      for (const a of (asgData ?? []) as unknown as AssignmentView[]) {
        asgMap[`${a.training_day_id}:${a.team_member_id}`] = a;
      }
      setAssignments(asgMap);
    } else {
      setAssignments({});
    }

    if (weekRow && (weekRow as { id?: string }).id) {
      const { data: goalData } = await sb
        .from('mileage_goals')
        .select('team_member_id, goal_low, goal_high, qualifier')
        .eq('week_id', (weekRow as { id: string }).id);
      const gMap: Record<string, Goal> = {};
      for (const g of (goalData ?? []) as unknown as Array<Goal & { team_member_id: string }>) {
        gMap[g.team_member_id] = g;
      }
      setGoals(gMap);
    } else {
      setGoals({});
    }
  }, [getSupabase, teamId, weekStart, dates]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setDay(date: string, dayType: DayType, label: string) {
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.rpc('set_training_day', {
      p_team_id: teamId,
      p_week_start: weekStart,
      p_date: date,
      p_day_type: dayType,
      p_skeleton_label: label,
    });
    setBusy(false);
    if (error) return setError(`Save day: ${error.message}`);
    await load();
  }

  async function publishWeek() {
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.rpc('publish_week', {
      p_team_id: teamId,
      p_week_start: weekStart,
    });
    setBusy(false);
    if (error) return setError(`Publish: ${error.message}`);
    await load();
  }

  async function saveGoal(memberId: string, low: string, high: string) {
    const sb = await getSupabase();
    let wid = weekId;
    if (!wid) {
      const { data, error } = await sb.rpc('ensure_week', {
        p_team_id: teamId,
        p_week_start: weekStart,
      });
      if (error) return setError(`Week: ${error.message}`);
      wid = data as unknown as string;
    }
    const { error } = await sb.rpc('set_mileage_goal', {
      p_team_member_id: memberId,
      p_week_id: wid,
      p_goal_low: low ? Number(low) : null,
      p_goal_high: high ? Number(high) : null,
      p_qualifier: null,
    });
    if (error) return setError(`Goal: ${error.message}`);
    await load();
  }

  const seenCount = (day: PlanDay) =>
    roster.filter((r) => assignments[`${day.id}:${r.id}`]?.detail_seen_at).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="rounded border px-3 py-1"
        >
          ← Prev
        </button>
        <span className="font-semibold text-brand-forest">Week of {weekStart}</span>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="rounded border px-3 py-1"
        >
          Next →
        </button>
        <button
          onClick={() => setWeekStart(mondayOf(new Date()))}
          className="rounded border px-3 py-1 text-sm"
        >
          This week
        </button>
        <div className="ml-auto flex items-center gap-3">
          {publishedAt ? (
            <span className="text-sm text-brand-green">
              Skeleton published {new Date(publishedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-sm text-gray-500">Skeleton not published</span>
          )}
          <button
            onClick={() => void publishWeek()}
            disabled={busy}
            className="rounded bg-brand-maroon px-4 py-1.5 font-medium text-white disabled:opacity-50"
          >
            {publishedAt ? 'Re-publish week' : 'Publish week'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded border border-brand-crimson/30 bg-brand-crimson/5 p-2 text-sm text-brand-crimson">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-[900px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border bg-white p-2 text-left">Athlete / mpw</th>
              {dates.map((date, i) => {
                const day = days[date];
                return (
                  <th key={date} className="border p-2 align-top" style={{ minWidth: 120 }}>
                    <div className="text-xs text-gray-500">
                      {WEEKDAY_LABELS[i]} {date.slice(5)}
                    </div>
                    <select
                      value={day?.day_type ?? 'easy'}
                      onChange={(e) =>
                        void setDay(date, e.target.value as DayType, day?.skeleton_label ?? '')
                      }
                      className="mt-1 w-full rounded border px-1 py-0.5 text-xs"
                    >
                      {DAY_TYPES.map((dt) => (
                        <option key={dt} value={dt}>
                          {DAY_TYPE_LABELS[dt]}
                        </option>
                      ))}
                    </select>
                    <input
                      defaultValue={day?.skeleton_label ?? ''}
                      onBlur={(e) => {
                        if ((e.target.value || '') !== (day?.skeleton_label ?? ''))
                          void setDay(date, day?.day_type ?? 'easy', e.target.value);
                      }}
                      placeholder="label…"
                      className="mt-1 w-full rounded border px-1 py-0.5 text-xs"
                    />
                    <div className="mt-1 flex items-center justify-between">
                      <DetailChip day={day} />
                      {day ? (
                        <button
                          onClick={() => setEditDetailDate(date)}
                          className="text-xs text-brand-maroon underline"
                        >
                          Detail
                        </button>
                      ) : null}
                    </div>
                    {day?.detail?.release_state === 'published' && roster.length ? (
                      <div className="mt-0.5 text-[10px] text-gray-400">
                        seen {seenCount(day)}/{roster.length}
                      </div>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {roster.length === 0 ? (
              <tr>
                <td colSpan={8} className="border p-4 text-center text-gray-500">
                  No athletes yet. Share your athlete join code so runners can join.
                </td>
              </tr>
            ) : null}
            {roster.map((r) => (
              <tr key={r.id}>
                <td className="sticky left-0 z-10 border bg-white p-2">
                  <div className="font-medium">{r.user.name}</div>
                  <div className="mt-1 flex items-center gap-1">
                    <input
                      type="number"
                      defaultValue={goals[r.id]?.goal_low ?? ''}
                      onBlur={(e) =>
                        void saveGoal(r.id, e.target.value, String(goals[r.id]?.goal_high ?? ''))
                      }
                      className="w-12 rounded border px-1 py-0.5 text-xs"
                      placeholder="lo"
                    />
                    <span className="text-xs text-gray-400">–</span>
                    <input
                      type="number"
                      defaultValue={goals[r.id]?.goal_high ?? ''}
                      onBlur={(e) =>
                        void saveGoal(r.id, String(goals[r.id]?.goal_low ?? ''), e.target.value)
                      }
                      className="w-12 rounded border px-1 py-0.5 text-xs"
                      placeholder="hi"
                    />
                  </div>
                </td>
                {dates.map((date) => {
                  const day = days[date];
                  const asg = day ? assignments[`${day.id}:${r.id}`] : undefined;
                  const overrideType = asg?.overrides?.day_type;
                  return (
                    <td
                      key={date}
                      onClick={() => day && setEditCell({ day, member: r })}
                      className={`border p-1 align-top ${day ? 'cursor-pointer hover:bg-gray-50' : 'bg-gray-50'} ${
                        overrideType ? 'bg-brand-maroon/5' : ''
                      }`}
                    >
                      {day ? (
                        <>
                          <div
                            className={
                              overrideType ? 'font-medium text-brand-maroon' : 'text-gray-700'
                            }
                          >
                            {DAY_TYPE_LABELS[overrideType ?? day.day_type]}
                          </div>
                          {asg?.note ? (
                            <div className="mt-0.5 text-[11px] text-gray-500">{asg.note}</div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editDetailDate && days[editDetailDate] ? (
        <DetailEditor
          day={days[editDetailDate]!}
          onClose={() => setEditDetailDate(null)}
          onSaved={async () => {
            setEditDetailDate(null);
            await load();
          }}
        />
      ) : null}

      {editCell ? (
        <OverrideEditor
          day={editCell.day}
          member={editCell.member}
          assignment={assignments[`${editCell.day.id}:${editCell.member.id}`] ?? null}
          onClose={() => setEditCell(null)}
          onSaved={async () => {
            setEditCell(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function DetailChip({ day }: { day?: PlanDay }) {
  if (!day) return <span className="text-[10px] text-gray-400">—</span>;
  const state = day.detail?.release_state;
  if (state === 'published')
    return (
      <span className="rounded bg-brand-green/15 px-1 text-[10px] text-brand-green">Published</span>
    );
  if (state === 'draft')
    return <span className="rounded bg-gray-200 px-1 text-[10px] text-gray-600">Draft</span>;
  return <span className="text-[10px] text-gray-400">no detail</span>;
}

function DetailEditor({
  day,
  onClose,
  onSaved,
}: {
  day: PlanDay;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [text, setText] = useState(day.detail?.description_rich ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(publish: boolean) {
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('save_workout_detail', {
      p_training_day_id: day.id,
      p_description_rich: text,
      p_rep_scheme: day.detail?.rep_scheme ?? null,
      p_publish: publish,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <Modal onClose={onClose} title={`Detail · ${DAY_TYPE_LABELS[day.day_type]} · ${day.date}`}>
      <p className="mb-2 text-sm text-gray-500">
        Write the session (e.g. “WU 2mi / drills / 5×1k @ T, 90s rest / CD”). Publishing releases it
        to assigned athletes.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full rounded border p-2 font-mono text-sm"
        placeholder="Warm up…"
      />
      {error ? <p className="mt-2 text-sm text-brand-crimson">{error}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
          Cancel
        </button>
        <button
          onClick={() => void save(false)}
          disabled={busy}
          className="rounded border border-brand-forest px-3 py-1.5 text-sm text-brand-forest disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          onClick={() => void save(true)}
          disabled={busy}
          className="rounded bg-brand-maroon px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Publish now
        </button>
      </div>
    </Modal>
  );
}

function OverrideEditor({
  day,
  member,
  assignment,
  onClose,
  onSaved,
}: {
  day: PlanDay;
  member: RosterRow;
  assignment: AssignmentView | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [dayType, setDayType] = useState<DayType | ''>(assignment?.overrides?.day_type ?? '');
  const [note, setNote] = useState(assignment?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!assignment) {
      setError('Publish the week first so athletes have assignments to override.');
      return;
    }
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const overrides = dayType ? { day_type: dayType } : {};
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
    <Modal onClose={onClose} title={`${member.user.name} · ${day.date}`}>
      {!assignment ? (
        <p className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-800">
          This athlete has no assignment yet. Click “Publish week” to fan out assignments, then
          override here.
        </p>
      ) : null}
      <label className="block text-sm font-medium">Replace day type (optional)</label>
      <select
        value={dayType}
        onChange={(e) => setDayType(e.target.value as DayType | '')}
        className="mt-1 w-full rounded border px-2 py-1"
      >
        <option value="">— inherit ({DAY_TYPE_LABELS[day.day_type]}) —</option>
        {DAY_TYPES.map((dt) => (
          <option key={dt} value={dt}>
            {DAY_TYPE_LABELS[dt]}
          </option>
        ))}
      </select>
      <label className="mt-3 block text-sm font-medium">Note to this athlete</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded border p-2 text-sm"
        placeholder="e.g. TBD based on your calf"
      />
      {error ? <p className="mt-2 text-sm text-brand-crimson">{error}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
          Cancel
        </button>
        <button
          onClick={() => void save()}
          disabled={busy || !assignment}
          className="rounded bg-brand-maroon px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Save override
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-semibold text-brand-forest">{title}</h3>
        {children}
      </div>
    </div>
  );
}
