'use client';

import {
  DAY_TYPE_COLORS,
  DAY_TYPE_LABELS,
  DAY_TYPES,
  dayTypeName,
  INJURY_STATUS_COLORS,
  INJURY_STATUS_LABELS,
  WEEKDAY_LABELS,
  addDays,
  describeScheme,
  expandScheme,
  formatDateTime,
  formatSplit,
  mondayOf,
  splitForRep,
  todayISO,
  weekDates,
  type AssignmentView,
  type DayType,
  type InjuryStatus,
  type PlanDay,
  type RepBlock,
  type RepScheme,
  type Split,
} from '@bearboard/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useRoster } from '@/lib/useRoster';
import type { RosterRow } from '@/lib/team-types';
import {
  Badge,
  Button,
  ErrorNote,
  Field,
  Modal,
  Spinner,
  TableSkeleton,
  inputCls,
  selectCls,
} from '../ui';

interface Goal {
  goal_low: number | null;
  goal_high: number | null;
  qualifier: string | null;
}
interface TemplateRow {
  id: string;
  name: string;
  description_rich: string | null;
  rep_scheme: RepScheme | null;
}
interface ResultRow {
  assignment_id: string;
  splits: Split[] | null;
  rpe: number | null;
  comment: string | null;
  submitted_at: string;
}

/**
 * The flagship coach screen (PRD §5.2.3): rows = athletes, columns = all 7
 * days. Two-row headers (skeleton + detail release chip), per-athlete override
 * cells, mileage goal column, seen receipts at both layers, copy-last-week,
 * templates, scheduled release, and the per-day results table.
 */
export function PlanGrid({ teamId }: { teamId: string }) {
  const getSupabase = useSupabase();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const { roster: allAthletes, squads } = useRoster(teamId, { athletesOnly: true });

  const [days, setDays] = useState<Record<string, PlanDay>>({});
  const [assignments, setAssignments] = useState<Record<string, AssignmentView>>({});
  const [goals, setGoals] = useState<Record<string, Goal>>({});
  const [injuries, setInjuries] = useState<
    Record<string, { status: InjuryStatus; body_area: string | null }>
  >({});
  const [weekId, setWeekId] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [squadFilter, setSquadFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editDetailDate, setEditDetailDate] = useState<string | null>(null);
  const [resultsDate, setResultsDate] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ day: PlanDay; member: RosterRow } | null>(null);

  const roster = useMemo(() => {
    const squad = squads.find((s) => s.id === squadFilter);
    return squad ? allAthletes.filter((r) => squad.member_ids.includes(r.id)) : allAthletes;
  }, [allAthletes, squads, squadFilter]);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();

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
        'id, date, day_type, skeleton_label, custom_type_label, workout_details(id, description_rich, rep_scheme, release_state, release_at, published_at, updated_at)',
      )
      .eq('team_id', teamId)
      .in('date', dates);
    if (dErr) {
      setError(`Days: ${dErr.message}`);
      setLoading(false);
      return;
    }
    const dayMap: Record<string, PlanDay> = {};
    const dayIds: string[] = [];
    for (const row of (dayData ?? []) as unknown as Array<
      PlanDay & {
        workout_details: Array<
          NonNullable<PlanDay['detail']> & { release_at: string | null; updated_at: string }
        >;
      }
    >) {
      const detail = Array.isArray(row.workout_details) ? (row.workout_details[0] ?? null) : null;
      dayMap[row.date] = {
        id: row.id,
        date: row.date,
        day_type: row.day_type,
        skeleton_label: row.skeleton_label,
        custom_type_label: row.custom_type_label ?? null,
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

    if ((weekRow as { id?: string } | null)?.id) {
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

    const { data: inj } = await sb
      .from('current_injury')
      .select('team_member_id, status, body_area');
    const iMap: Record<string, { status: InjuryStatus; body_area: string | null }> = {};
    for (const r of (inj ?? []) as unknown as Array<{
      team_member_id: string;
      status: InjuryStatus;
      body_area: string | null;
    }>) {
      iMap[r.team_member_id] = r;
    }
    setInjuries(iMap);
    setLoading(false);
  }, [getSupabase, teamId, weekStart, dates]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setDay(date: string, dayType: DayType, label: string, customType?: string | null) {
    setBusy(true);
    const sb = await getSupabase();
    const existing = days[date];
    const { error } = await sb.rpc('set_training_day', {
      p_team_id: teamId,
      p_week_start: weekStart,
      p_date: date,
      p_day_type: dayType,
      p_skeleton_label: label,
      p_custom_type_label:
        customType !== undefined ? customType : (existing?.custom_type_label ?? null),
    });
    setBusy(false);
    if (error) return setError(`Save day: ${error.message}`);
    await load();
  }

  async function publishWeek() {
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.rpc('publish_week', { p_team_id: teamId, p_week_start: weekStart });
    setBusy(false);
    if (error) return setError(`Publish: ${error.message}`);
    await load();
  }

  async function copyLastWeek(includeDetails: boolean) {
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.rpc('copy_week', {
      p_team_id: teamId,
      p_from_start: addDays(weekStart, -7),
      p_to_start: weekStart,
      p_include_details: includeDetails,
    });
    setBusy(false);
    if (error) return setError(`Copy: ${error.message}`);
    await load();
  }

  async function saveGoal(memberId: string, low: string, high: string, qualifier: string) {
    const sb = await getSupabase();
    let wid = weekId;
    if (!wid) {
      const { data, error } = await sb.rpc('ensure_week', {
        p_team_id: teamId,
        p_week_start: weekStart,
      });
      if (error) return setError(`Week: ${error.message}`);
      wid = data as unknown as string;
      setWeekId(wid);
    }
    const { error } = await sb.rpc('set_mileage_goal', {
      p_team_member_id: memberId,
      p_week_id: wid,
      p_goal_low: low ? Number(low) : null,
      p_goal_high: high ? Number(high) : null,
      p_qualifier: qualifier || null,
    });
    if (error) return setError(`Goal: ${error.message}`);
    await load();
  }

  const skeletonSeen = (day: PlanDay) =>
    roster.filter((r) => assignments[`${day.id}:${r.id}`]?.skeleton_seen_at).length;
  const detailSeen = (day: PlanDay) =>
    roster.filter((r) => assignments[`${day.id}:${r.id}`]?.detail_seen_at).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-brand-forest">Plan</h1>
        <TableSkeleton rows={7} cols={8} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-bold text-brand-forest">Plan</h1>
        <Button variant="outline" small onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ← Prev
        </Button>
        <span className="text-sm font-semibold text-gray-700">Week of {weekStart}</span>
        <Button variant="outline" small onClick={() => setWeekStart(addDays(weekStart, 7))}>
          Next →
        </Button>
        <Button variant="ghost" small onClick={() => setWeekStart(mondayOf(new Date()))}>
          Today
        </Button>
        <select
          value={squadFilter}
          onChange={(e) => setSquadFilter(e.target.value)}
          className={selectCls}
        >
          <option value="">All squads</option>
          {squads.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          small
          onClick={() => void copyLastWeek(false)}
          disabled={busy}
          title="Copy last week's day types + labels"
        >
          ⎘ Copy last week
        </Button>
        <Button
          variant="outline"
          small
          onClick={() => void copyLastWeek(true)}
          disabled={busy}
          title="Copy skeleton AND workout details (as drafts)"
        >
          ⎘ + details
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {publishedAt ? (
            <span className="text-xs font-medium text-brand-green">
              Skeleton published {new Date(publishedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-xs text-gray-500">
              Skeleton not published — athletes can’t see this week yet
            </span>
          )}
          <Button onClick={() => void publishWeek()} disabled={busy}>
            {publishedAt ? 'Re-publish week' : 'Publish week'}
          </Button>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r bg-gray-50 p-2 text-left align-bottom">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Athlete · mpw goal
                </span>
              </th>
              {dates.map((date, i) => {
                const day = days[date];
                const isToday = date === todayISO();
                return (
                  <th
                    key={date}
                    className={`border-b border-r p-2 align-top last:border-r-0 ${isToday ? 'bg-brand-maroon/[0.04]' : 'bg-gray-50'}`}
                    style={{ minWidth: 132 }}
                  >
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span className={isToday ? 'font-bold text-brand-maroon' : ''}>
                        {WEEKDAY_LABELS[i]} {date.slice(5)}
                      </span>
                      {day?.detail?.release_state === 'published' && roster.length ? (
                        <span title="Detail seen / athletes">
                          👁 {detailSeen(day)}/{roster.length}
                        </span>
                      ) : publishedAt && day && roster.length ? (
                        <span title="Skeleton seen / athletes" className="text-gray-400">
                          {skeletonSeen(day)}/{roster.length}
                        </span>
                      ) : null}
                    </div>
                    <select
                      value={day?.day_type ?? ''}
                      onChange={(e) =>
                        void setDay(
                          date,
                          e.target.value as DayType,
                          day?.skeleton_label ?? '',
                          e.target.value === 'other' ? (day?.custom_type_label ?? '') : null,
                        )
                      }
                      className="mt-1 w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-semibold"
                      style={day ? { color: DAY_TYPE_COLORS[day.day_type] } : undefined}
                    >
                      {!day ? <option value="">— set day —</option> : null}
                      {DAY_TYPES.map((dt) => (
                        <option key={dt} value={dt}>
                          {dt === 'other' ? 'Custom…' : DAY_TYPE_LABELS[dt]}
                        </option>
                      ))}
                    </select>
                    {day?.day_type === 'other' ? (
                      <input
                        defaultValue={day?.custom_type_label ?? ''}
                        key={`${date}-custom-${day?.custom_type_label ?? ''}`}
                        onBlur={(e) => {
                          if ((e.target.value || '') !== (day?.custom_type_label ?? ''))
                            void setDay(date, 'other', day?.skeleton_label ?? '', e.target.value);
                        }}
                        placeholder="name this day (e.g. Fartlek)…"
                        className="mt-1 w-full rounded border border-brand-maroon/40 px-1 py-0.5 text-xs font-semibold text-brand-maroon"
                      />
                    ) : null}
                    <input
                      defaultValue={day?.skeleton_label ?? ''}
                      key={`${date}-${day?.skeleton_label ?? ''}`}
                      onBlur={(e) => {
                        if ((e.target.value || '') !== (day?.skeleton_label ?? ''))
                          void setDay(date, day?.day_type ?? 'easy', e.target.value);
                      }}
                      placeholder="label…"
                      className="mt-1 w-full rounded border border-gray-200 px-1 py-0.5 text-xs"
                    />
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <DetailChip day={day} />
                      {day ? (
                        <span className="flex gap-1.5">
                          {day.detail?.release_state === 'published' ? (
                            <button
                              onClick={() => setResultsDate(date)}
                              className="text-[11px] text-brand-green underline"
                              title="Workout results"
                            >
                              Results
                            </button>
                          ) : null}
                          <button
                            onClick={() => setEditDetailDate(date)}
                            className="text-[11px] text-brand-maroon underline"
                          >
                            Detail
                          </button>
                        </span>
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {roster.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  No athletes{squadFilter ? ' in this squad' : ' yet'}.{' '}
                  {squadFilter
                    ? ''
                    : 'Share your athlete join code (Settings) so runners can join.'}
                </td>
              </tr>
            ) : null}
            {roster.map((r) => {
              const inj = injuries[r.id];
              return (
                <tr key={r.id}>
                  <td className="sticky left-0 z-10 border-b border-r bg-white p-2">
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[120px] truncate font-medium">{r.user.name}</span>
                      {inj && inj.status !== 'healthy' ? (
                        <span
                          title={`${INJURY_STATUS_LABELS[inj.status]}${inj.body_area ? ` · ${inj.body_area}` : ''}`}
                        >
                          <Badge color={INJURY_STATUS_COLORS[inj.status]}>
                            {inj.status === 'out'
                              ? 'OUT'
                              : inj.status === 'modified'
                                ? 'MOD'
                                : 'MGD'}
                          </Badge>
                        </span>
                      ) : null}
                    </div>
                    <GoalInputs
                      goal={goals[r.id]}
                      onSave={(lo, hi, q) => void saveGoal(r.id, lo, hi, q)}
                    />
                  </td>
                  {dates.map((date) => {
                    const day = days[date];
                    const asg = day ? assignments[`${day.id}:${r.id}`] : undefined;
                    const overrideType = asg?.overrides?.day_type;
                    const hasOverride = Boolean(
                      overrideType ||
                      asg?.overrides?.rep_scheme ||
                      asg?.overrides?.description_rich,
                    );
                    const effectiveType = overrideType ?? day?.day_type;
                    return (
                      <td
                        key={date}
                        onClick={() => day && setEditCell({ day, member: r })}
                        className={`border-b border-r p-1.5 align-top last:border-r-0 ${
                          day ? 'cursor-pointer hover:bg-gray-50' : 'bg-gray-50/60'
                        } ${hasOverride ? 'bg-brand-maroon/[0.06]' : ''} ${effectiveType === 'race' ? 'bg-brand-crimson/[0.06]' : ''}`}
                      >
                        {day && effectiveType ? (
                          <>
                            <div className="flex items-center gap-1">
                              <span
                                className={`text-xs font-semibold ${hasOverride ? '' : 'opacity-70'}`}
                                style={{ color: DAY_TYPE_COLORS[effectiveType] }}
                              >
                                {overrideType
                                  ? DAY_TYPE_LABELS[overrideType]
                                  : dayTypeName(day.day_type, day.custom_type_label)}
                              </span>
                              {asg?.confirmed_at ? (
                                <span title="Confirmed 👍" className="text-[10px] text-brand-green">
                                  ✓
                                </span>
                              ) : null}
                            </div>
                            {asg?.note ? (
                              <div className="mt-0.5 line-clamp-2 max-w-[130px] text-[11px] leading-tight text-gray-500">
                                📝 {asg.note}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Set the week’s shape in the headers → <span className="font-medium">Publish week</span> →
        write each day’s detail when you’re ready (draft, publish now, or schedule). Click any cell
        for a per-athlete override. Gray = inherited, tinted = overridden, ✓ = athlete confirmed.
      </p>

      {editDetailDate && days[editDetailDate] ? (
        <DetailEditor
          teamId={teamId}
          day={days[editDetailDate]!}
          onClose={() => setEditDetailDate(null)}
          onSaved={async () => {
            setEditDetailDate(null);
            await load();
          }}
        />
      ) : null}

      {resultsDate && days[resultsDate] ? (
        <ResultsModal
          day={days[resultsDate]!}
          roster={roster}
          assignments={assignments}
          onClose={() => setResultsDate(null)}
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

function GoalInputs({
  goal,
  onSave,
}: {
  goal?: Goal;
  onSave: (lo: string, hi: string, q: string) => void;
}) {
  const [lo, setLo] = useState(goal?.goal_low != null ? String(goal.goal_low) : '');
  const [hi, setHi] = useState(goal?.goal_high != null ? String(goal.goal_high) : '');
  const [q, setQ] = useState(goal?.qualifier ?? '');
  useEffect(() => {
    setLo(goal?.goal_low != null ? String(goal.goal_low) : '');
    setHi(goal?.goal_high != null ? String(goal.goal_high) : '');
    setQ(goal?.qualifier ?? '');
  }, [goal?.goal_low, goal?.goal_high, goal?.qualifier]);
  const commit = () => onSave(lo, hi, q);
  return (
    <div className="mt-1 flex items-center gap-1">
      <input
        value={lo}
        onChange={(e) => setLo(e.target.value)}
        onBlur={commit}
        inputMode="numeric"
        className="w-10 rounded border border-gray-200 px-1 py-0.5 text-[11px]"
        placeholder="lo"
      />
      <span className="text-[10px] text-gray-400">–</span>
      <input
        value={hi}
        onChange={(e) => setHi(e.target.value)}
        onBlur={commit}
        inputMode="numeric"
        className="w-10 rounded border border-gray-200 px-1 py-0.5 text-[11px]"
        placeholder="hi"
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={commit}
        className="w-16 rounded border border-gray-200 px-1 py-0.5 text-[11px]"
        placeholder="notes"
        title='Qualifier, e.g. "Low Efficient"'
      />
    </div>
  );
}

function DetailChip({ day }: { day?: PlanDay }) {
  if (!day) return <span className="text-[10px] text-gray-300">—</span>;
  const detail = day.detail as
    (PlanDay['detail'] & { release_at?: string | null; updated_at?: string }) | null;
  const state = detail?.release_state;
  if (state === 'published') {
    const updated =
      detail?.updated_at && detail?.published_at && detail.updated_at > detail.published_at;
    return (
      <span className="flex items-center gap-1">
        <span className="rounded bg-brand-green/15 px-1 text-[10px] font-semibold text-brand-green">
          Published
        </span>
        {updated ? (
          <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">edited</span>
        ) : null}
      </span>
    );
  }
  if (state === 'scheduled')
    return (
      <span
        className="rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-700"
        title={detail?.release_at ? formatDateTime(detail.release_at) : ''}
      >
        ⏱ {detail?.release_at ? formatDateTime(detail.release_at) : 'Scheduled'}
      </span>
    );
  if (state === 'draft')
    return (
      <span className="rounded bg-gray-200 px-1 text-[10px] font-semibold text-gray-600">
        Draft
      </span>
    );
  return <span className="text-[10px] text-gray-400">no detail</span>;
}

// ---------------------------------------------------------------------------
// Detail editor: description + structured rep scheme + templates + release
// ---------------------------------------------------------------------------

function DetailEditor({
  teamId,
  day,
  onClose,
  onSaved,
}: {
  teamId: string;
  day: PlanDay;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [text, setText] = useState(day.detail?.description_rich ?? '');
  const [scheme, setScheme] = useState<RepScheme>(day.detail?.rep_scheme ?? []);
  const [releaseAt, setReleaseAt] = useState(''); // empty on purpose — no baked-in release time (PRD §5.2.1)
  const [notify, setNotify] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPublished = day.detail?.release_state === 'published';

  useEffect(() => {
    void (async () => {
      const sb = await getSupabase();
      const { data } = await sb
        .from('workout_templates')
        .select('id, name, description_rich, rep_scheme')
        .eq('team_id', teamId)
        .order('name');
      setTemplates((data ?? []) as unknown as TemplateRow[]);
    })();
  }, [getSupabase, teamId]);

  async function save(publish: boolean) {
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('save_workout_detail', {
      p_training_day_id: day.id,
      p_description_rich: text || null,
      p_rep_scheme: scheme.length ? scheme : null,
      p_publish: publish,
      p_release_at: !publish && releaseAt ? new Date(releaseAt).toISOString() : null,
      p_notify: notify,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) return;
    const sb = await getSupabase();
    const { error } = await sb.rpc('save_template', {
      p_team_id: teamId,
      p_name: templateName,
      p_description_rich: text || null,
      p_rep_scheme: scheme.length ? scheme : null,
    });
    if (error) return setError(error.message);
    setTemplateName('');
    const { data } = await sb
      .from('workout_templates')
      .select('id, name, description_rich, rep_scheme')
      .eq('team_id', teamId)
      .order('name');
    setTemplates((data ?? []) as unknown as TemplateRow[]);
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setText(t.description_rich ?? '');
    setScheme(t.rep_scheme ?? []);
  }

  return (
    <Modal
      wide
      onClose={onClose}
      title={`Workout detail · ${dayTypeName(day.day_type, day.custom_type_label)} · ${day.date}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          onChange={(e) => e.target.value && applyTemplate(e.target.value)}
          className={selectCls}
          value=""
        >
          <option value="">Load template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          className={`${inputCls} !w-44`}
          placeholder="Save as template…"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
        <Button
          small
          variant="outline"
          onClick={() => void saveAsTemplate()}
          disabled={!templateName.trim()}
        >
          Save template
        </Button>
      </div>

      <Field label="Session description">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className={`${inputCls} font-mono`}
          placeholder={'WU 2 mi / Drills\n4-5 × 200m hill, jog down\n20 min @ T\nCD 2 mi'}
        />
      </Field>

      <Field label="Structured rep scheme (powers split submission — optional)">
        <SchemeEditor scheme={scheme} onChange={setScheme} />
      </Field>

      {isPublished ? (
        <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify athletes about this edit (leave off for typo fixes)
        </label>
      ) : (
        <Field label="Schedule release (optional — leave empty to control it manually)">
          <input
            type="datetime-local"
            className={inputCls}
            value={releaseAt}
            onChange={(e) => setReleaseAt(e.target.value)}
          />
        </Field>
      )}

      {error ? <p className="mb-2 text-sm text-brand-crimson">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {!isPublished ? (
          <Button variant="outline" onClick={() => void save(false)} disabled={busy}>
            {releaseAt ? `Schedule for ${new Date(releaseAt).toLocaleString()}` : 'Save draft'}
          </Button>
        ) : null}
        <Button onClick={() => void save(true)} disabled={busy}>
          {isPublished ? 'Save (stays published)' : 'Publish now'}
        </Button>
      </div>
    </Modal>
  );
}

function SchemeEditor({
  scheme,
  onChange,
}: {
  scheme: RepScheme;
  onChange: (s: RepScheme) => void;
}) {
  function update(i: number, patch: Partial<RepBlock>) {
    onChange(scheme.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function remove(i: number) {
    onChange(scheme.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-2">
      {scheme.map((b, i) => {
        const mode: 'distance' | 'duration' =
          b.duration_s != null && b.distance_m == null ? 'duration' : 'distance';
        return (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2"
          >
            <input
              type="number"
              min={1}
              value={b.reps ?? 1}
              onChange={(e) => update(i, { reps: Math.max(1, Number(e.target.value) || 1) })}
              className="w-14 rounded border border-gray-300 px-1.5 py-1 text-sm"
              title="Reps"
            />
            <span className="text-gray-400">×</span>
            <select
              value={mode}
              onChange={(e) =>
                e.target.value === 'duration'
                  ? update(i, { duration_s: b.duration_s ?? 1200, distance_m: undefined })
                  : update(i, { distance_m: b.distance_m ?? 1000, duration_s: undefined })
              }
              className="rounded border border-gray-300 px-1.5 py-1 text-sm"
            >
              <option value="distance">distance</option>
              <option value="duration">minutes</option>
            </select>
            {mode === 'distance' ? (
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={b.distance_m ?? ''}
                  onChange={(e) => update(i, { distance_m: Number(e.target.value) || undefined })}
                  className="w-20 rounded border border-gray-300 px-1.5 py-1 text-sm"
                  placeholder="1000"
                />
                <span className="text-xs text-gray-400">m</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={b.duration_s != null ? Math.round(b.duration_s / 60) : ''}
                  onChange={(e) =>
                    update(i, { duration_s: (Number(e.target.value) || 0) * 60 || undefined })
                  }
                  className="w-16 rounded border border-gray-300 px-1.5 py-1 text-sm"
                  placeholder="20"
                />
                <span className="text-xs text-gray-400">min</span>
              </span>
            )}
            <input
              value={b.target ?? ''}
              onChange={(e) => update(i, { target: e.target.value || undefined })}
              className="w-20 rounded border border-gray-300 px-1.5 py-1 text-sm"
              placeholder="@ T"
              title="Target pace/effort"
            />
            <input
              value={b.rest ?? ''}
              onChange={(e) => update(i, { rest: e.target.value || undefined })}
              className="w-24 rounded border border-gray-300 px-1.5 py-1 text-sm"
              placeholder="rest (90s)"
            />
            <button
              onClick={() => remove(i)}
              className="ml-auto text-sm text-brand-crimson"
              title="Remove block"
            >
              ✕
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <Button
          small
          variant="outline"
          onClick={() =>
            onChange([...scheme, { reps: 5, distance_m: 1000, target: 'T', rest: '90s' }])
          }
        >
          + Add block
        </Button>
        {scheme.length ? (
          <span className="text-xs text-gray-500">{describeScheme(scheme)}</span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-day results table (rows = athletes, columns = reps) — PRD §5.5
// ---------------------------------------------------------------------------

function ResultsModal({
  day,
  roster,
  assignments,
  onClose,
}: {
  day: PlanDay;
  roster: RosterRow[];
  assignments: Record<string, AssignmentView>;
  onClose: () => void;
}) {
  const getSupabase = useSupabase();
  const [results, setResults] = useState<Record<string, ResultRow>>({});
  const [loading, setLoading] = useState(true);
  const scheme = day.detail?.rep_scheme ?? [];
  const rows = expandScheme(scheme);

  useEffect(() => {
    void (async () => {
      const sb = await getSupabase();
      const asgIds = roster
        .map((r) => assignments[`${day.id}:${r.id}`]?.id)
        .filter((x): x is string => Boolean(x));
      if (!asgIds.length) {
        setLoading(false);
        return;
      }
      const { data } = await sb
        .from('workout_results')
        .select('assignment_id, splits, rpe, comment, submitted_at')
        .in('assignment_id', asgIds);
      const map: Record<string, ResultRow> = {};
      for (const r of (data ?? []) as unknown as ResultRow[]) map[r.assignment_id] = r;
      setResults(map);
      setLoading(false);
    })();
  }, [getSupabase, day.id, roster, assignments]);

  return (
    <Modal
      wide
      onClose={onClose}
      title={`Results · ${day.date} · ${day.skeleton_label ?? dayTypeName(day.day_type, day.custom_type_label)}`}
    >
      {scheme.length ? (
        <p className="mb-2 text-sm text-gray-500">{describeScheme(scheme)}</p>
      ) : null}
      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Athlete</th>
                {rows.length ? (
                  rows.map((r) => (
                    <th key={r.rep} className="px-1.5 py-2 text-center" title={r.label}>
                      {r.rep}
                    </th>
                  ))
                ) : (
                  <th className="py-2">Result</th>
                )}
                <th className="px-2 py-2">RPE</th>
                <th className="px-2 py-2">Comment</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => {
                const asg = assignments[`${day.id}:${r.id}`];
                const res = asg ? results[asg.id] : undefined;
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-gray-800">
                      {r.user.name}
                    </td>
                    {rows.length ? (
                      rows.map((row) => {
                        const s = splitForRep(res?.splits, row.rep);
                        return (
                          <td key={row.rep} className="px-1.5 py-1.5 text-center tabular-nums">
                            {s?.felt_based ? (
                              <span className="text-xs text-gray-400" title="Felt-based / skipped">
                                ~
                              </span>
                            ) : s?.time_s != null ? (
                              formatSplit(s.time_s)
                            ) : (
                              <span className="text-gray-300">·</span>
                            )}
                          </td>
                        );
                      })
                    ) : (
                      <td className="py-1.5 text-gray-500">{res ? 'Submitted' : '—'}</td>
                    )}
                    <td className="px-2 py-1.5 text-center">{res?.rpe ?? ''}</td>
                    <td
                      className="max-w-[200px] truncate px-2 py-1.5 text-gray-500"
                      title={res?.comment ?? ''}
                    >
                      {res?.comment ?? ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-gray-400">
        Athletes submit splits from the app after the workout.
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Per-athlete override editor — day_type replacement, note, custom detail
// ---------------------------------------------------------------------------

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
  const [customDetail, setCustomDetail] = useState(assignment?.overrides?.description_rich ?? '');
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
    const overrides: Record<string, unknown> = {};
    if (dayType) overrides.day_type = dayType;
    if (customDetail.trim()) overrides.description_rich = customDetail.trim();
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
        <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          This athlete has no assignment yet. Click “Publish week” to fan out assignments, then
          override here.
        </p>
      ) : null}
      <Field label="Replace day type (optional)">
        <select
          value={dayType}
          onChange={(e) => setDayType(e.target.value as DayType | '')}
          className={`${selectCls} w-full`}
        >
          <option value="">— inherit ({DAY_TYPE_LABELS[day.day_type]}) —</option>
          {DAY_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {DAY_TYPE_LABELS[dt]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Custom prescription for this athlete (optional — replaces the day's detail)">
        <textarea
          value={customDetail}
          onChange={(e) => setCustomDetail(e.target.value)}
          rows={3}
          className={inputCls}
          placeholder='e.g. "25–28 min T instead of 20"'
        />
      </Field>
      <Field label="Note to this athlete">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={inputCls}
          placeholder="e.g. TBD based on your calf"
        />
      </Field>
      {assignment ? (
        <p className="mb-3 text-xs text-gray-400">
          Seen: skeleton {assignment.skeleton_seen_at ? '✓' : '—'} · detail{' '}
          {assignment.detail_seen_at ? '✓' : '—'} · confirmed {assignment.confirmed_at ? '👍' : '—'}
        </p>
      ) : null}
      {error ? <p className="mb-2 text-sm text-brand-crimson">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={busy || !assignment}>
          Save override
        </Button>
      </div>
    </Modal>
  );
}
