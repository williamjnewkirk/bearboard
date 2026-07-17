'use client';

import {
  EVENT_TYPES,
  EVENT_TYPE_ICONS,
  EVENT_TYPE_LABELS,
  WEEKDAY_LABELS,
  addDays,
  addMonths,
  describeRecurrence,
  expandEventOccurrences,
  formatTime,
  isoDow,
  localDateOf,
  mondayOf,
  monthGrid,
  monthTitle,
  sameMonth,
  todayISO,
  weekDates,
  type EventType,
} from '@bearboard/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useRoster } from '@/lib/useRoster';
import type { Membership } from '@/lib/team-types';
import { Badge, Button, ErrorNote, Field, Modal, Spinner, inputCls, selectCls } from '../ui';

interface EventRow {
  id: string;
  title: string;
  type: EventType;
  starts_at: string;
  location: string | null;
  notes: string | null;
  recurrence: string | null;
  recurrence_days: number[] | null;
  event_targets: Array<{ squad_id: string | null; team_member_id: string | null }>;
}
interface MeetLite {
  id: string;
  name: string;
  date: string;
}
type CalView = 'day' | 'week' | 'month';

/** Schedule calendar: day / week / month views (week default), + reminders (§5.9). */
export function ScheduleTab({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;
  const { roster, squads } = useRoster(teamId);

  const [view, setView] = useState<CalView>('week');
  const [anchor, setAnchor] = useState(() => todayISO());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [meets, setMeets] = useState<MeetLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<EventRow | 'new' | null>(null);
  const [dayModal, setDayModal] = useState<string | null>(null);

  // The visible date range for the current view.
  const range = useMemo(() => {
    if (view === 'day') return { from: anchor, to: anchor };
    if (view === 'week') {
      const start = mondayOf(new Date(anchor + 'T00:00:00'));
      return { from: start, to: addDays(start, 6) };
    }
    const grid = monthGrid(anchor);
    return { from: grid[0]!, to: grid[41]! };
  }, [view, anchor]);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    const fromISO = new Date(range.from + 'T00:00:00').toISOString();
    const toISO = new Date(range.to + 'T23:59:59').toISOString();
    // Include recurring events with any past anchor (they may repeat into this
    // range) plus one-time events that start within the range.
    const { data, error } = await sb
      .from('events')
      .select(
        'id, title, type, starts_at, location, notes, recurrence, recurrence_days, event_targets(squad_id, team_member_id)',
      )
      .eq('team_id', teamId)
      .lte('starts_at', toISO)
      .or(`recurrence.not.is.null,starts_at.gte.${fromISO}`)
      .order('starts_at')
      .limit(400);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setEvents((data ?? []) as unknown as EventRow[]);

    const { data: meetData } = await sb
      .from('meets')
      .select('id, name, date')
      .eq('team_id', teamId)
      .gte('date', range.from)
      .lte('date', range.to);
    setMeets((meetData ?? []) as unknown as MeetLite[]);
    setLoading(false);
  }, [getSupabase, teamId, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Events + meets indexed by ISO day. Recurring events are expanded into every
  // matching day within the visible range.
  const byDay = useMemo(() => {
    const map = new Map<string, { events: EventRow[]; meets: MeetLite[] }>();
    const bucket = (d: string) => {
      let b = map.get(d);
      if (!b) map.set(d, (b = { events: [], meets: [] }));
      return b;
    };
    for (const e of events) {
      for (const day of expandEventOccurrences(e, range.from, range.to)) {
        bucket(day).events.push(e);
      }
    }
    for (const m of meets) bucket(m.date).meets.push(m);
    return map;
  }, [events, meets, range.from, range.to]);

  const targetLabel = useCallback(
    (e: EventRow) => {
      const targets = e.event_targets ?? [];
      if (targets.length === 0) return 'Team';
      return (
        targets
          .map((t) =>
            t.squad_id
              ? (squads.find((s) => s.id === t.squad_id)?.name ?? 'Squad')
              : (roster.find((r) => r.id === t.team_member_id)?.user.name ?? 'Member'),
          )
          .slice(0, 2)
          .join(', ') + (targets.length > 2 ? '…' : '')
      );
    },
    [squads, roster],
  );

  function shift(delta: number) {
    if (view === 'day') setAnchor(addDays(anchor, delta));
    else if (view === 'week') setAnchor(addDays(anchor, delta * 7));
    else setAnchor(addMonths(anchor, delta));
  }

  const rangeTitle =
    view === 'month'
      ? monthTitle(anchor)
      : view === 'week'
        ? `Week of ${range.from}`
        : new Date(anchor + 'T00:00:00').toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-brand-forest">Schedule</h1>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm font-medium capitalize ${
                view === v
                  ? 'bg-brand-maroon text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button small variant="outline" onClick={() => shift(-1)}>
            ←
          </Button>
          <Button small variant="ghost" onClick={() => setAnchor(todayISO())}>
            Today
          </Button>
          <Button small variant="outline" onClick={() => shift(1)}>
            →
          </Button>
        </div>
        <span className="text-sm font-semibold text-gray-700">{rangeTitle}</span>
        {isCoach ? (
          <span className="ml-auto">
            <Button small onClick={() => setEditing('new')}>
              + Add event
            </Button>
          </span>
        ) : null}
      </div>
      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Spinner />
      ) : view === 'month' ? (
        <MonthView anchor={anchor} byDay={byDay} onPickDay={(d) => setDayModal(d)} />
      ) : view === 'week' ? (
        <WeekView
          weekStart={range.from}
          byDay={byDay}
          isCoach={isCoach}
          targetLabel={targetLabel}
          onEdit={(e) => setEditing(e)}
        />
      ) : (
        <DayView
          day={anchor}
          bucket={byDay.get(anchor) ?? { events: [], meets: [] }}
          isCoach={isCoach}
          targetLabel={targetLabel}
          onEdit={(e) => setEditing(e)}
        />
      )}

      {dayModal ? (
        <Modal
          title={new Date(dayModal + 'T00:00:00').toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          onClose={() => setDayModal(null)}
        >
          <DayView
            day={dayModal}
            bucket={byDay.get(dayModal) ?? { events: [], meets: [] }}
            isCoach={isCoach}
            targetLabel={targetLabel}
            onEdit={(e) => {
              setDayModal(null);
              setEditing(e);
            }}
          />
        </Modal>
      ) : null}

      {editing ? (
        <EventEditor
          teamId={teamId}
          myMemberId={membership.id}
          event={editing === 'new' ? null : editing}
          roster={roster}
          squads={squads}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

type DayBucket = { events: EventRow[]; meets: MeetLite[] };

function MonthView({
  anchor,
  byDay,
  onPickDay,
}: {
  anchor: string;
  byDay: Map<string, DayBucket>;
  onPickDay: (d: string) => void;
}) {
  const grid = monthGrid(anchor);
  const today = todayISO();
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-7 border-b bg-gray-50 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((d) => {
          const bucket = byDay.get(d);
          const count = (bucket?.events.length ?? 0) + (bucket?.meets.length ?? 0);
          const inMonth = sameMonth(d, anchor);
          const isToday = d === today;
          return (
            <button
              key={d}
              onClick={() => onPickDay(d)}
              className={`min-h-[92px] border-b border-r p-1.5 text-left align-top last:border-r-0 hover:bg-gray-50 ${
                inMonth ? '' : 'bg-gray-50/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday
                      ? 'bg-brand-maroon text-white'
                      : inMonth
                        ? 'text-gray-700'
                        : 'text-gray-400'
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                {bucket?.meets.slice(0, 2).map((m) => (
                  <div
                    key={m.id}
                    className="truncate rounded bg-brand-crimson/10 px-1 py-0.5 text-[10px] font-medium text-brand-crimson"
                  >
                    🏁 {m.name}
                  </div>
                ))}
                {bucket?.events.slice(0, count > 3 ? 2 : 3).map((e) => (
                  <div
                    key={e.id}
                    className="truncate rounded bg-brand-maroon/10 px-1 py-0.5 text-[10px] font-medium text-brand-maroon"
                  >
                    {EVENT_TYPE_ICONS[e.type]} {e.title}
                  </div>
                ))}
                {count > 3 ? (
                  <div className="px-1 text-[10px] text-gray-400">+{count - 3} more</div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  weekStart,
  byDay,
  isCoach,
  targetLabel,
  onEdit,
}: {
  weekStart: string;
  byDay: Map<string, DayBucket>;
  isCoach: boolean;
  targetLabel: (e: EventRow) => string;
  onEdit: (e: EventRow) => void;
}) {
  const days = weekDates(weekStart);
  const today = todayISO();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((d, i) => {
        const bucket = byDay.get(d);
        const isToday = d === today;
        return (
          <div
            key={d}
            className={`min-h-[120px] rounded-xl border bg-white p-2 ${
              isToday ? 'border-brand-maroon' : 'border-gray-200'
            }`}
          >
            <div className="mb-1.5 flex items-baseline justify-between">
              <span
                className={`text-xs font-bold uppercase ${isToday ? 'text-brand-maroon' : 'text-gray-500'}`}
              >
                {WEEKDAY_LABELS[i]}
              </span>
              <span className="text-xs text-gray-400">{d.slice(5)}</span>
            </div>
            <div className="space-y-1.5">
              {bucket?.meets.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg bg-brand-crimson/10 px-2 py-1 text-xs font-medium text-brand-crimson"
                >
                  🏁 {m.name}
                </div>
              ))}
              {(bucket?.events ?? []).map((e) => (
                <button
                  key={e.id}
                  onClick={() => isCoach && onEdit(e)}
                  className={`block w-full rounded-lg border border-gray-100 bg-gray-50 px-2 py-1 text-left ${
                    isCoach ? 'hover:border-gray-300' : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs font-semibold text-gray-800">
                    <span>{EVENT_TYPE_ICONS[e.type]}</span>
                    <span className="truncate">{e.title}</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {formatTime(e.starts_at)}
                    {e.location ? ` · ${e.location}` : ''}
                  </div>
                  <div className="text-[10px] text-cyan-700">{targetLabel(e)}</div>
                </button>
              ))}
              {!bucket?.events.length && !bucket?.meets.length ? (
                <p className="text-xs text-gray-300">—</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({
  day,
  bucket,
  isCoach,
  targetLabel,
  onEdit,
}: {
  day: string;
  bucket: DayBucket;
  isCoach: boolean;
  targetLabel: (e: EventRow) => string;
  onEdit: (e: EventRow) => void;
}) {
  const items = [...bucket.events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (items.length === 0 && bucket.meets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        Nothing scheduled for this day.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {bucket.meets.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-3 rounded-xl border border-brand-crimson/30 bg-brand-crimson/5 p-3"
        >
          <span className="text-xl">🏁</span>
          <div>
            <p className="font-semibold text-brand-crimson">{m.name}</p>
            <p className="text-sm text-gray-500">Race day</p>
          </div>
        </div>
      ))}
      {items.map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
        >
          <span className="text-xl">{EVENT_TYPE_ICONS[e.type]}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900">{e.title}</p>
            <p className="text-sm text-gray-500">
              {formatTime(e.starts_at)}
              {e.location ? ` · ${e.location}` : ''}
              {e.recurrence
                ? ` · repeats ${describeRecurrence(e.recurrence, e.recurrence_days)}`
                : ''}
            </p>
            {e.notes ? <p className="text-xs text-gray-400">{e.notes}</p> : null}
          </div>
          <Badge color="#0E7490">{targetLabel(e)}</Badge>
          {isCoach ? (
            <Button small variant="outline" onClick={() => onEdit(e)}>
              Edit
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function EventEditor({
  teamId,
  myMemberId,
  event,
  roster,
  squads,
  onClose,
  onSaved,
}: {
  teamId: string;
  myMemberId: string;
  event: EventRow | null;
  roster: Array<{ id: string; role: string; user: { name: string } }>;
  squads: Array<{ id: string; name: string; member_ids: string[] }>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [title, setTitle] = useState(event?.title ?? '');
  const [type, setType] = useState<EventType>(event?.type ?? 'practice');
  const [when, setWhen] = useState(event ? toLocalInput(event.starts_at) : '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [repeats, setRepeats] = useState(event?.recurrence === 'weekly');
  const [repeatDays, setRepeatDays] = useState<number[]>(
    event?.recurrence_days && event.recurrence_days.length
      ? event.recurrence_days
      : event
        ? [isoDow(localDateOf(event.starts_at))]
        : [],
  );
  const [targetMode, setTargetMode] = useState<'team' | 'squads' | 'people'>(
    !event || event.event_targets.length === 0
      ? 'team'
      : event.event_targets.some((t) => t.squad_id)
        ? 'squads'
        : 'people',
  );
  const [targetSquads, setTargetSquads] = useState<string[]>(
    event?.event_targets.filter((t) => t.squad_id).map((t) => t.squad_id!) ?? [],
  );
  const [targetPeople, setTargetPeople] = useState<string[]>(
    event?.event_targets.filter((t) => t.team_member_id).map((t) => t.team_member_id!) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    // Default the anchor's own weekday into the repeat set if the coach turned
    // on "repeat" but didn't pick any day.
    const days = repeats
      ? repeatDays.length
        ? [...repeatDays].sort((a, b) => a - b)
        : [isoDow(localDateOf(new Date(when).toISOString()))]
      : null;
    const payload = {
      team_id: teamId,
      title: title.trim(),
      type,
      starts_at: new Date(when).toISOString(),
      location: location || null,
      notes: notes || null,
      recurrence: repeats ? 'weekly' : null,
      recurrence_days: days,
      created_by: myMemberId,
    };
    let eventId = event?.id ?? null;
    if (eventId) {
      const { error } = await sb.from('events').update(payload).eq('id', eventId);
      if (error) {
        setBusy(false);
        return setError(error.message);
      }
      await sb.from('event_targets').delete().eq('event_id', eventId);
    } else {
      const { data, error } = await sb.from('events').insert(payload).select('id').single();
      if (error) {
        setBusy(false);
        return setError(error.message);
      }
      eventId = (data as { id: string }).id;
    }

    const targets: Array<{
      event_id: string | null;
      squad_id: string | null;
      team_member_id: string | null;
    }> =
      targetMode === 'squads'
        ? targetSquads.map((sid) => ({ event_id: eventId, squad_id: sid, team_member_id: null }))
        : targetMode === 'people'
          ? targetPeople.map((mid) => ({ event_id: eventId, squad_id: null, team_member_id: mid }))
          : [];
    if (targets.length) {
      const { error } = await sb.from('event_targets').insert(targets);
      if (error) {
        setBusy(false);
        return setError(error.message);
      }
    }
    setBusy(false);
    await onSaved();
  }

  async function remove() {
    if (!event) return;
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.from('events').delete().eq('id', event.id);
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <Modal title={event ? 'Edit event' : 'Add event'} onClose={onClose}>
      <Field label="Title">
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Morning practice"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select
            className={`${selectCls} w-full`}
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="When">
          <input
            type="datetime-local"
            className={inputCls}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Location">
        <input
          className={inputCls}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Track / Francis Field"
        />
      </Field>
      <Field label="Notes">
        <textarea
          className={inputCls}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <Field label="Repeat">
        <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={repeats}
            onChange={(e) => {
              setRepeats(e.target.checked);
              if (e.target.checked && repeatDays.length === 0 && when)
                setRepeatDays([isoDow(localDateOf(new Date(when).toISOString()))]);
            }}
          />
          Repeat weekly on selected days
        </label>
        {repeats ? (
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, i) => {
              const dow = i + 1; // 1=Mon..7=Sun
              const on = repeatDays.includes(dow);
              return (
                <button
                  key={dow}
                  type="button"
                  onClick={() =>
                    setRepeatDays((prev) =>
                      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow],
                    )
                  }
                  className={`h-9 w-9 rounded-full text-xs font-semibold transition-colors ${
                    on
                      ? 'bg-brand-maroon text-white'
                      : 'border border-gray-300 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {label[0]}
                </button>
              );
            })}
          </div>
        ) : null}
      </Field>

      <Field label="Who">
        <div className="mb-2 flex gap-2">
          {(['team', 'squads', 'people'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTargetMode(m)}
              className={`rounded-lg border px-3 py-1 text-sm capitalize ${
                targetMode === m
                  ? 'border-brand-maroon bg-brand-maroon/10 text-brand-maroon'
                  : 'border-gray-300 text-gray-600'
              }`}
            >
              {m === 'team' ? 'Whole team' : m}
            </button>
          ))}
        </div>
        {targetMode === 'squads' ? (
          <div className="flex flex-wrap gap-2">
            {squads.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={targetSquads.includes(s.id)}
                  onChange={(e) =>
                    setTargetSquads((prev) =>
                      e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                    )
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
        ) : null}
        {targetMode === 'people' ? (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
            {roster.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={targetPeople.includes(r.id)}
                  onChange={(e) =>
                    setTargetPeople((prev) =>
                      e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                    )
                  }
                />
                {r.user.name}
              </label>
            ))}
            <p className="pt-1 text-xs text-gray-400">
              Only the selected people (and coaches) can see this event — private meetings work this
              way.
            </p>
          </div>
        ) : null}
      </Field>

      {error ? <p className="mb-2 text-sm text-brand-crimson">{error}</p> : null}
      <div className="flex justify-between gap-2">
        {event ? (
          <Button variant="danger" onClick={() => void remove()} disabled={busy}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || !title.trim() || !when}>
            Save event
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
