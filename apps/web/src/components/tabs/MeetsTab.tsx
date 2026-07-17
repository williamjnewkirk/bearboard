'use client';

import {
  MEET_TYPES,
  MEET_TYPE_LABELS,
  daysUntil,
  formatDateShort,
  formatDateTime,
  todayISO,
  type MeetType,
} from '@bearboard/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useRoster } from '@/lib/useRoster';
import type { Membership, RosterRow } from '@/lib/team-types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Modal,
  Spinner,
  inputCls,
  selectCls,
} from '../ui';
import { Flag } from 'lucide-react';

interface MeetRow {
  id: string;
  name: string;
  date: string;
  location: string | null;
  course: string | null;
  meet_type: MeetType | null;
  departure_at: string | null;
  notes: string | null;
  is_goal_race: boolean;
}
interface EntryRow {
  id: string;
  meet_id: string;
  team_member_id: string;
  event: string | null;
  entered: boolean;
}
interface ResultRow {
  id: string;
  meet_entry_id: string;
  mark: string | null;
  place: number | null;
}
interface DebriefRow {
  meet_entry_id: string;
  went_well: string | null;
  didnt_go_well: string | null;
  prep_done_well: string | null;
  prep_would_change: string | null;
  academic_stress: number | null;
  academic_stress_note: string | null;
  fatigue: number | null;
  fatigue_note: string | null;
  sleep_fueling_note: string | null;
  note_to_coach: string | null;
  submitted_at: string | null;
}

/** Season race schedule: meets, entries, results + the debrief roll-up (§5.9a). */
export function MeetsTab({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;
  const { roster, squads } = useRoster(teamId, { athletesOnly: true });

  const [meets, setMeets] = useState<MeetRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<MeetRow | 'new' | null>(null);
  const [openMeet, setOpenMeet] = useState<MeetRow | null>(null);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('meets')
      .select('id, name, date, location, course, meet_type, departure_at, notes, is_goal_race')
      .eq('team_id', teamId)
      .order('date');
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as MeetRow[];
    setMeets(rows);
    if (rows.length) {
      const { data: e } = await sb
        .from('meet_entries')
        .select('id, meet_id, team_member_id, event, entered')
        .in(
          'meet_id',
          rows.map((m) => m.id),
        );
      setEntries((e ?? []) as unknown as EntryRow[]);
    }
    setLoading(false);
  }, [getSupabase, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayISO();
  const upcoming = meets.filter((m) => m.date >= today);
  const past = meets.filter((m) => m.date < today).reverse();

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-brand-forest">Meets</h1>
        {isCoach ? (
          <Button small onClick={() => setEditing('new')}>
            + Add meet
          </Button>
        ) : null}
      </div>
      <ErrorNote>{error}</ErrorNote>

      {meets.length === 0 ? (
        <Empty
          icon={<Flag size={22} />}
          title="No meets on the schedule"
          hint={
            isCoach
              ? 'Add the season schedule — mark your championship as the goal race for the team countdown.'
              : 'Your coach hasn’t posted the race schedule yet.'
          }
        />
      ) : (
        <>
          {upcoming.length ? (
            <MeetList
              title="Upcoming"
              meets={upcoming}
              entries={entries}
              roster={roster}
              isCoach={isCoach}
              myMemberId={membership.id}
              onOpen={setOpenMeet}
              onEdit={isCoach ? setEditing : undefined}
            />
          ) : null}
          {past.length ? (
            <MeetList
              title="Past"
              meets={past}
              entries={entries}
              roster={roster}
              isCoach={isCoach}
              myMemberId={membership.id}
              onOpen={setOpenMeet}
              onEdit={isCoach ? setEditing : undefined}
            />
          ) : null}
        </>
      )}

      {editing ? (
        <MeetEditor
          teamId={teamId}
          meet={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      {openMeet ? (
        <MeetDetailModal
          meet={openMeet}
          membership={membership}
          roster={roster}
          squads={squads}
          entries={entries.filter((e) => e.meet_id === openMeet.id)}
          onClose={() => setOpenMeet(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

function MeetList({
  title,
  meets,
  entries,
  roster,
  isCoach,
  myMemberId,
  onOpen,
  onEdit,
}: {
  title: string;
  meets: MeetRow[];
  entries: EntryRow[];
  roster: RosterRow[];
  isCoach: boolean;
  myMemberId: string;
  onOpen: (m: MeetRow) => void;
  onEdit?: (m: MeetRow) => void;
}) {
  return (
    <Card title={title}>
      <ul className="divide-y">
        {meets.map((m) => {
          const meetEntries = entries.filter((e) => e.meet_id === m.id && e.entered);
          const mine = meetEntries.some((e) => e.team_member_id === myMemberId);
          const days = daysUntil(m.date);
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onOpen(m)}
                    className="font-semibold text-gray-900 hover:text-brand-maroon hover:underline"
                  >
                    {m.name}
                  </button>
                  {m.is_goal_race ? <Badge color="#BA0C2F">🎯 Goal race</Badge> : null}
                  {m.meet_type ? (
                    <Badge color="#6B7280">{MEET_TYPE_LABELS[m.meet_type]}</Badge>
                  ) : null}
                  {!isCoach && !mine ? <Badge color="#9CA3AF">Not entered</Badge> : null}
                </div>
                <p className="text-sm text-gray-500">
                  {formatDateShort(m.date)}
                  {days >= 0 ? ` · in ${days} day${days === 1 ? '' : 's'}` : ''}
                  {m.location ? ` · ${m.location}` : ''}
                </p>
              </div>
              <span className="text-xs text-gray-400">
                {meetEntries.length}/{roster.length} entered
              </span>
              {onEdit ? (
                <Button small variant="outline" onClick={() => onEdit(m)}>
                  Edit
                </Button>
              ) : null}
              <Button small variant="outline" onClick={() => onOpen(m)}>
                Open
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function MeetEditor({
  teamId,
  meet,
  onClose,
  onSaved,
}: {
  teamId: string;
  meet: MeetRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [name, setName] = useState(meet?.name ?? '');
  const [date, setDate] = useState(meet?.date ?? '');
  const [location, setLocation] = useState(meet?.location ?? '');
  const [course, setCourse] = useState(meet?.course ?? '');
  const [type, setType] = useState<MeetType | ''>(meet?.meet_type ?? '');
  const [departure, setDeparture] = useState(
    meet?.departure_at ? toLocalInput(meet.departure_at) : '',
  );
  const [notes, setNotes] = useState(meet?.notes ?? '');
  const [goal, setGoal] = useState(meet?.is_goal_race ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('save_meet', {
      p_team_id: teamId,
      p_meet_id: meet?.id ?? null,
      p_name: name,
      p_date: date,
      p_location: location || null,
      p_course: course || null,
      p_meet_type: type || null,
      p_departure_at: departure ? new Date(departure).toISOString() : null,
      p_notes: notes || null,
      p_is_goal_race: goal,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  async function remove() {
    if (!meet) return;
    setBusy(true);
    const sb = await getSupabase();
    const { error } = await sb.rpc('delete_meet', { p_meet_id: meet.id });
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <Modal title={meet ? `Edit · ${meet.name}` : 'Add meet'} onClose={onClose}>
      <Field label="Meet name">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Gans Creek Classic"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Type">
          <select
            className={`${selectCls} w-full`}
            value={type}
            onChange={(e) => setType(e.target.value as MeetType | '')}
          >
            <option value="">—</option>
            {MEET_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Host / location">
        <input
          className={inputCls}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Columbia, MO"
        />
      </Field>
      <Field label="Course">
        <input
          className={inputCls}
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          placeholder="8k, rolling, can run fast"
        />
      </Field>
      <Field label="Departure (optional)">
        <input
          type="datetime-local"
          className={inputCls}
          value={departure}
          onChange={(e) => setDeparture(e.target.value)}
        />
      </Field>
      <Field label="Notes (course, uniform, packing)">
        <textarea
          className={inputCls}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={goal} onChange={(e) => setGoal(e.target.checked)} />
        🎯 Goal race — show the team countdown for this meet
      </label>
      {error ? <p className="mb-2 text-sm text-brand-crimson">{error}</p> : null}
      <div className="flex justify-between gap-2">
        {meet ? (
          <Button variant="danger" onClick={() => void remove()} disabled={busy}>
            Delete meet
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim() || !date}>
            Save meet
          </Button>
        </div>
      </div>
    </Modal>
  );
}

type DetailTab = 'entries' | 'results' | 'debriefs';

function MeetDetailModal({
  meet,
  membership,
  roster,
  squads,
  entries,
  onClose,
  onChanged,
}: {
  meet: MeetRow;
  membership: Membership;
  roster: RosterRow[];
  squads: Array<{ id: string; name: string; member_ids: string[] }>;
  entries: EntryRow[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const [tab, setTab] = useState<DetailTab>(isCoach ? 'entries' : 'results');
  const [results, setResults] = useState<Record<string, ResultRow>>({});
  const [debriefs, setDebriefs] = useState<Record<string, DebriefRow>>({});
  const [error, setError] = useState('');
  const [busyMember, setBusyMember] = useState<string | null>(null);

  const entered = entries.filter((e) => e.entered);

  const loadExtras = useCallback(async () => {
    if (!entries.length) return;
    const sb = await getSupabase();
    const entryIds = entries.map((e) => e.id);
    const { data: res } = await sb
      .from('meet_results')
      .select('id, meet_entry_id, mark, place')
      .in('meet_entry_id', entryIds);
    const rMap: Record<string, ResultRow> = {};
    for (const r of (res ?? []) as unknown as ResultRow[]) rMap[r.meet_entry_id] = r;
    setResults(rMap);

    const { data: deb } = await sb
      .from('race_debriefs')
      .select(
        'meet_entry_id, went_well, didnt_go_well, prep_done_well, prep_would_change, academic_stress, academic_stress_note, fatigue, fatigue_note, sleep_fueling_note, note_to_coach, submitted_at',
      )
      .in('meet_entry_id', entryIds);
    const dMap: Record<string, DebriefRow> = {};
    for (const d of (deb ?? []) as unknown as DebriefRow[]) dMap[d.meet_entry_id] = d;
    setDebriefs(dMap);
  }, [getSupabase, entries]);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  async function setEntry(memberId: string, enteredNow: boolean, event: string | null) {
    setBusyMember(memberId);
    const sb = await getSupabase();
    const { error } = await sb.rpc('set_meet_entry', {
      p_meet_id: meet.id,
      p_team_member_id: memberId,
      p_entered: enteredNow,
      p_event: event,
    });
    setBusyMember(null);
    if (error) return setError(error.message);
    await onChanged();
  }

  async function enterSquad(squadId: string) {
    const squad = squads.find((s) => s.id === squadId);
    if (!squad) return;
    for (const memberId of squad.member_ids) {
      const already = entries.find((e) => e.team_member_id === memberId)?.entered;
      if (!already) await setEntry(memberId, true, null);
    }
  }

  const memberName = (id: string) => roster.find((r) => r.id === id)?.user.name ?? 'Former member';

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <span>
          {meet.name}{' '}
          <span className="text-sm font-normal text-gray-400">
            {formatDateShort(meet.date)}
            {meet.location ? ` · ${meet.location}` : ''}
          </span>
        </span>
      }
    >
      {meet.departure_at ? (
        <p className="mb-1 text-sm text-gray-600">
          🚌 Departure: {formatDateTime(meet.departure_at)}
        </p>
      ) : null}
      {meet.course ? <p className="mb-1 text-sm text-gray-600">Course: {meet.course}</p> : null}
      {meet.notes ? (
        <p className="mb-2 whitespace-pre-wrap text-sm text-gray-600">{meet.notes}</p>
      ) : null}
      <ErrorNote>{error}</ErrorNote>

      <div className="mb-3 flex gap-1 border-b">
        {(isCoach ? (['entries', 'results', 'debriefs'] as const) : (['results'] as const)).map(
          (t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium capitalize ${
                tab === t
                  ? 'border-brand-maroon text-brand-maroon'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {t === 'debriefs' ? `Debriefs (${Object.keys(debriefs).length})` : t}
            </button>
          ),
        )}
      </div>

      {tab === 'entries' && isCoach ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500">Quick enter:</span>
            {squads.map((s) => (
              <Button key={s.id} small variant="outline" onClick={() => void enterSquad(s.id)}>
                + {s.name}
              </Button>
            ))}
          </div>
          <ul className="divide-y">
            {roster.map((r) => {
              const entry = entries.find((e) => e.team_member_id === r.id);
              const isEntered = entry?.entered ?? false;
              return (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={isEntered}
                    disabled={busyMember === r.id}
                    onChange={(e) => void setEntry(r.id, e.target.checked, entry?.event ?? null)}
                  />
                  <Avatar name={r.user.name} photoUrl={r.user.photo_url} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                    {r.user.name}
                  </span>
                  <input
                    className="w-40 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    placeholder="event (8k, open 800…)"
                    defaultValue={entry?.event ?? ''}
                    disabled={!isEntered}
                    onBlur={(e) => {
                      if ((e.target.value || null) !== (entry?.event ?? null))
                        void setEntry(r.id, true, e.target.value || null);
                    }}
                  />
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-gray-400">
            Entering an athlete creates a Race day on their plan for {formatDateShort(meet.date)}.
          </p>
        </div>
      ) : null}

      {tab === 'results' ? (
        <div className="overflow-x-auto">
          {entered.length === 0 ? (
            <Empty title="No entries yet" hint="Results appear here once athletes are entered." />
          ) : (
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Athlete</th>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Mark</th>
                  <th className="py-2 pr-3">Place</th>
                  {isCoach ? <th className="py-2">Debrief</th> : null}
                </tr>
              </thead>
              <tbody>
                {entered.map((e) => {
                  const res = results[e.id];
                  return (
                    <ResultEditableRow
                      key={e.id}
                      name={memberName(e.team_member_id)}
                      entry={e}
                      result={res ?? null}
                      canEdit={isCoach || e.team_member_id === membership.id}
                      hasDebrief={isCoach ? Boolean(debriefs[e.id]?.submitted_at) : undefined}
                      onSaved={loadExtras}
                      onError={setError}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {tab === 'debriefs' && isCoach ? (
        <div className="space-y-3">
          {entered.length === 0 ? (
            <Empty title="No entries yet" />
          ) : (
            entered.map((e) => {
              const d = debriefs[e.id];
              const res = results[e.id];
              return (
                <div key={e.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {memberName(e.team_member_id)}
                    </span>
                    {e.event ? <Badge color="#6B7280">{e.event}</Badge> : null}
                    {res?.mark ? (
                      <Badge color="#13322B">
                        {res.mark}
                        {res.place ? ` · P${res.place}` : ''}
                      </Badge>
                    ) : null}
                    {d?.submitted_at ? (
                      <span className="ml-auto text-xs text-gray-400">
                        submitted {formatDateTime(d.submitted_at)}
                      </span>
                    ) : (
                      <Badge color="#B45309" className="ml-auto">
                        No debrief yet
                      </Badge>
                    )}
                  </div>
                  {d ? (
                    <div className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
                      <DebriefField label="What went well" value={d.went_well} />
                      <DebriefField label="What didn’t go well" value={d.didnt_go_well} />
                      <DebriefField label="Prep done well" value={d.prep_done_well} />
                      <DebriefField label="Prep to change" value={d.prep_would_change} />
                      <DebriefField
                        label="Academic stress"
                        value={
                          d.academic_stress
                            ? `${d.academic_stress}/5${d.academic_stress_note ? ` — ${d.academic_stress_note}` : ''}`
                            : null
                        }
                      />
                      <DebriefField
                        label="Fatigue"
                        value={
                          d.fatigue
                            ? `${d.fatigue}/5${d.fatigue_note ? ` — ${d.fatigue_note}` : ''}`
                            : null
                        }
                      />
                      <DebriefField label="Sleep & fueling" value={d.sleep_fueling_note} />
                      <DebriefField label="For coach" value={d.note_to_coach} emphasize />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
          <p className="text-xs text-gray-400">
            Debriefs are visible to the athlete and coaches only — never teammates. Enforced by the
            database, stated on the athlete’s form.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function DebriefField({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | null;
  emphasize?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={emphasize ? 'rounded-lg bg-brand-maroon/5 p-2 md:col-span-2' : ''}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`whitespace-pre-wrap ${emphasize ? 'text-brand-maroon' : 'text-gray-700'}`}>
        {value}
      </p>
    </div>
  );
}

function ResultEditableRow({
  name,
  entry,
  result,
  canEdit,
  hasDebrief,
  onSaved,
  onError,
}: {
  name: string;
  entry: EntryRow;
  result: ResultRow | null;
  canEdit: boolean;
  hasDebrief?: boolean;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const getSupabase = useSupabase();
  const [mark, setMark] = useState(result?.mark ?? '');
  const [place, setPlace] = useState(result?.place != null ? String(result.place) : '');

  useEffect(() => {
    setMark(result?.mark ?? '');
    setPlace(result?.place != null ? String(result.place) : '');
  }, [result?.mark, result?.place]);

  async function save() {
    if (
      (mark || null) === (result?.mark ?? null) &&
      (place || null) === (result?.place != null ? String(result.place) : null)
    )
      return;
    const sb = await getSupabase();
    const { error } = await sb.rpc('save_meet_result', {
      p_meet_entry_id: entry.id,
      p_mark: mark || null,
      p_place: place ? Number(place) : null,
      p_splits: null,
    });
    if (error) return onError(error.message);
    await onSaved();
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 font-medium text-gray-800">{name}</td>
      <td className="py-2 pr-3 text-gray-500">{entry.event ?? '—'}</td>
      <td className="py-2 pr-3">
        {canEdit ? (
          <input
            className="w-24 rounded border border-gray-300 px-2 py-1"
            value={mark}
            placeholder="26:14"
            onChange={(e) => setMark(e.target.value)}
            onBlur={() => void save()}
          />
        ) : (
          <span>{result?.mark ?? '—'}</span>
        )}
      </td>
      <td className="py-2 pr-3">
        {canEdit ? (
          <input
            className="w-16 rounded border border-gray-300 px-2 py-1"
            value={place}
            placeholder="#"
            inputMode="numeric"
            onChange={(e) => setPlace(e.target.value)}
            onBlur={() => void save()}
          />
        ) : (
          <span>{result?.place ?? '—'}</span>
        )}
      </td>
      {hasDebrief !== undefined ? (
        <td className="py-2">
          {hasDebrief ? (
            <Badge color="#215732">✓</Badge>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
      ) : null}
    </tr>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
