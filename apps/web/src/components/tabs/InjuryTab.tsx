'use client';

import {
  BODY_AREAS,
  BODY_AREA_LABELS,
  INJURY_STATUSES,
  INJURY_STATUS_COLORS,
  INJURY_STATUS_LABELS,
  formatRelative,
  type BodyArea,
  type InjuryStatus,
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
import { HeartPulse } from 'lucide-react';

interface CurrentRow {
  team_member_id: string;
  status: InjuryStatus;
  body_area: BodyArea | null;
  note: string | null;
  created_at: string;
}
interface FatigueRow {
  team_member_id: string;
  score: number;
  created_at: string;
}

/** Coach injury board: everyone not Healthy, grouped by status (PRD §5.8). */
export function InjuryTab({ membership }: { membership: Membership }) {
  const getSupabase = useSupabase();
  const teamId = membership.team.id;
  const { roster, loading: rosterLoading } = useRoster(teamId, { athletesOnly: true });

  const [current, setCurrent] = useState<CurrentRow[]>([]);
  const [fatigue, setFatigue] = useState<Record<string, FatigueRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<RosterRow | null>(null);

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('current_injury')
      .select('team_member_id, status, body_area, note, created_at');
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setCurrent((data ?? []) as unknown as CurrentRow[]);

    // Latest fatigue check-in per member (last 7 days).
    const { data: fat } = await sb
      .from('fatigue_checkins')
      .select('team_member_id, score, created_at')
      .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
      .order('created_at', { ascending: false });
    const fMap: Record<string, FatigueRow> = {};
    for (const f of (fat ?? []) as unknown as FatigueRow[]) {
      if (!fMap[f.team_member_id]) fMap[f.team_member_id] = f;
    }
    setFatigue(fMap);
    setLoading(false);
  }, [getSupabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const byStatus = useMemo(() => {
    const map: Record<string, Array<CurrentRow & { member: RosterRow }>> = {};
    for (const c of current) {
      if (c.status === 'healthy') continue;
      const member = roster.find((r) => r.id === c.team_member_id);
      if (!member) continue;
      (map[c.status] ??= []).push({ ...c, member });
    }
    return map;
  }, [current, roster]);

  if (rosterLoading || loading) return <Spinner />;

  const injuredCount = Object.values(byStatus).reduce((n, list) => n + list.length, 0);
  const order: InjuryStatus[] = ['out', 'modified', 'managing'];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-brand-forest">Injury board</h1>
        <span className="text-sm text-gray-500">
          {injuredCount} of {roster.length} athletes flagged
        </span>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {injuredCount === 0 ? (
        <Empty
          icon={<HeartPulse size={22} />}
          title="Everyone is Healthy"
          hint="Athletes self-report from the app; you can set a status for anyone from the roster below."
        />
      ) : (
        order.map((status) => {
          const list = byStatus[status];
          if (!list?.length) return null;
          return (
            <Card
              key={status}
              title={
                <span className="flex items-center gap-2">
                  <Badge color={INJURY_STATUS_COLORS[status]}>{INJURY_STATUS_LABELS[status]}</Badge>
                  <span className="text-sm font-normal text-gray-500">{list.length}</span>
                </span>
              }
            >
              <ul className="divide-y">
                {list.map((row) => {
                  const days = Math.floor(
                    (Date.now() - new Date(row.created_at).getTime()) / 86_400_000,
                  );
                  const f = fatigue[row.team_member_id];
                  return (
                    <li key={row.team_member_id} className="flex items-center gap-3 py-2.5">
                      <Avatar
                        name={row.member.user.name}
                        photoUrl={row.member.user.photo_url}
                        size={32}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{row.member.user.name}</p>
                        <p className="truncate text-sm text-gray-500">
                          {row.body_area ? `${BODY_AREA_LABELS[row.body_area]} · ` : ''}
                          {row.note ?? 'No note'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-gray-400">
                        <p>
                          {days === 0 ? 'today' : `${days}d in status`} ·{' '}
                          {formatRelative(row.created_at)}
                        </p>
                        {f ? <p>fatigue {f.score}/5</p> : null}
                      </div>
                      <Button small variant="outline" onClick={() => setEditing(row.member)}>
                        Update
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}

      <Card title="Set a status" className="!p-5">
        <p className="mb-3 text-sm text-gray-500">
          After a training-room conversation, update any athlete — the edit is attributed to you in
          their history. Visible to the athlete and coaches only, never teammates.
        </p>
        <div className="flex flex-wrap gap-2">
          {roster.map((r) => (
            <Button key={r.id} small variant="outline" onClick={() => setEditing(r)}>
              {r.user.name}
            </Button>
          ))}
        </div>
      </Card>

      {editing ? (
        <StatusEditor
          member={editing}
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

export function StatusEditor({
  member,
  onClose,
  onSaved,
}: {
  member: RosterRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const getSupabase = useSupabase();
  const [status, setStatus] = useState<InjuryStatus>('managing');
  const [area, setArea] = useState<BodyArea | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('set_injury_status', {
      p_team_member_id: member.id,
      p_status: status,
      p_body_area: area || null,
      p_note: note || null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    await onSaved();
  }

  return (
    <Modal title={`Injury status · ${member.user.name}`} onClose={onClose}>
      <Field label="Status">
        <div className="flex flex-wrap gap-2">
          {INJURY_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                status === s ? 'border-transparent text-white' : 'border-gray-300 text-gray-600'
              }`}
              style={status === s ? { backgroundColor: INJURY_STATUS_COLORS[s] } : undefined}
            >
              {INJURY_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </Field>
      {status !== 'healthy' ? (
        <Field label="Body area">
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as BodyArea | '')}
            className={selectCls}
          >
            <option value="">—</option>
            {BODY_AREAS.map((a) => (
              <option key={a} value={a}>
                {BODY_AREA_LABELS[a]}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Note">
        <input
          className={inputCls}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. rolled ankle at practice, re-eval Friday"
        />
      </Field>
      {error ? <p className="mb-2 text-sm text-brand-crimson">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={busy}>
          Save status
        </Button>
      </div>
    </Modal>
  );
}
