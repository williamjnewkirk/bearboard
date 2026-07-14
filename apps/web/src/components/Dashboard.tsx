'use client';

import { UserButton, useUser } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import type { JoinCodeRow, Membership, RosterRow, SquadRow } from '@/lib/team-types';
import { PlanGrid } from './plan/PlanGrid';

export function Dashboard({
  membership,
  onChanged,
}: {
  membership: Membership;
  onChanged: () => void;
}) {
  const { user } = useUser();
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [codes, setCodes] = useState<JoinCodeRow[]>([]);
  const [newSquad, setNewSquad] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [view, setView] = useState<'plan' | 'roster'>(isCoach ? 'plan' : 'roster');

  const load = useCallback(async () => {
    setError('');
    const sb = await getSupabase();

    const { data: rosterData, error: rosterErr } = await sb
      .from('team_members')
      .select('id, role, user:users(id, name, photo_url, class_year)')
      .eq('team_id', teamId)
      .eq('status', 'active');
    if (rosterErr) {
      setError(`Roster: ${rosterErr.message}`);
      return;
    }
    const rows = (rosterData ?? []) as unknown as RosterRow[];
    rows.sort((a, b) =>
      a.role === b.role ? a.user.name.localeCompare(b.user.name) : a.role === 'coach' ? -1 : 1,
    );
    setRoster(rows);

    const { data: squadData, error: squadErr } = await sb
      .from('squads')
      .select('id, name, squad_members(team_member_id)')
      .eq('team_id', teamId)
      .order('name');
    if (squadErr) {
      setError(`Squads: ${squadErr.message}`);
      return;
    }
    setSquads(
      (
        (squadData ?? []) as unknown as Array<{
          id: string;
          name: string;
          squad_members: Array<{ team_member_id: string }>;
        }>
      ).map((s) => ({
        id: s.id,
        name: s.name,
        member_ids: s.squad_members.map((m) => m.team_member_id),
      })),
    );

    if (isCoach) {
      const { data: codeData, error: codeErr } = await sb
        .from('join_codes')
        .select('role, code')
        .eq('team_id', teamId)
        .eq('active', true);
      if (codeErr) {
        setError(`Join codes: ${codeErr.message}`);
        return;
      }
      setCodes((codeData ?? []) as JoinCodeRow[]);
    }
  }, [getSupabase, teamId, isCoach]);

  useEffect(() => {
    void load();
  }, [load]);

  async function regenerate(role: 'athlete' | 'coach') {
    const sb = await getSupabase();
    const { error } = await sb.rpc('regenerate_join_code', {
      p_team_id: teamId,
      p_role: role,
    });
    if (error) setError(`Regenerate: ${error.message}`);
    await load();
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  async function createSquad() {
    const name = newSquad.trim();
    if (!name) return;
    const sb = await getSupabase();
    const { error } = await sb.from('squads').insert({ team_id: teamId, name });
    if (error) setError(`Create squad: ${error.message}`);
    setNewSquad('');
    await load();
  }

  async function deleteSquad(id: string) {
    const sb = await getSupabase();
    const { error } = await sb.from('squads').delete().eq('id', id);
    if (error) setError(`Delete squad: ${error.message}`);
    await load();
  }

  async function toggleSquad(squad: SquadRow, memberId: string, on: boolean) {
    const sb = await getSupabase();
    const { error } = on
      ? await sb.from('squad_members').insert({ squad_id: squad.id, team_member_id: memberId })
      : await sb
          .from('squad_members')
          .delete()
          .eq('squad_id', squad.id)
          .eq('team_member_id', memberId);
    if (error) setError(`Squad update: ${error.message}`);
    await load();
  }

  async function removeMember(memberId: string) {
    const sb = await getSupabase();
    const { error } = await sb
      .from('team_members')
      .update({ status: 'removed' })
      .eq('id', memberId);
    if (error) setError(`Remove: ${error.message}`);
    await load();
  }

  async function leaveTeam() {
    const sb = await getSupabase();
    const { error } = await sb.rpc('leave_team', { p_team_id: teamId });
    if (error) {
      setError(`Leave: ${error.message}`);
      return;
    }
    onChanged();
  }

  const myMemberId = roster.find((r) => r.user.id === user?.id)?.id;

  return (
    <main className={`mx-auto p-6 ${isCoach && view === 'plan' ? 'max-w-[1400px]' : 'max-w-5xl'}`}>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-maroon">{membership.team.name}</h1>
          <p className="text-sm text-gray-500">
            {membership.team.school ? `${membership.team.school} · ` : ''}
            You are a {membership.role}.
          </p>
        </div>
        <UserButton />
      </header>

      {error ? (
        <div className="mb-4 rounded border border-brand-crimson/30 bg-brand-crimson/5 p-3 text-sm text-brand-crimson">
          {error}
        </div>
      ) : null}

      {isCoach ? (
        <div className="mb-6 flex gap-2 border-b">
          {(['plan', 'roster'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                view === v
                  ? 'border-brand-maroon text-brand-maroon'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {v === 'plan' ? 'Plan' : 'Roster & Squads'}
            </button>
          ))}
        </div>
      ) : null}

      {isCoach && view === 'plan' ? <PlanGrid teamId={teamId} /> : null}

      {!isCoach || view === 'roster' ? (
        <>
          {isCoach ? (
            <section className="mb-8 rounded-lg border p-5">
              <h2 className="mb-3 text-lg font-semibold">Join codes</h2>
              <div className="flex flex-wrap gap-6">
                {(['athlete', 'coach'] as const).map((role) => {
                  const jc = codes.find((c) => c.role === role);
                  return (
                    <div key={role} className="flex items-center gap-3">
                      <span className="w-16 text-sm capitalize text-gray-600">{role}</span>
                      <code className="rounded bg-gray-100 px-3 py-1.5 text-lg font-semibold tracking-widest text-brand-forest">
                        {jc?.code ?? '—'}
                      </code>
                      {jc ? (
                        <button
                          onClick={() => void copyCode(jc.code)}
                          className={`rounded border px-2 py-1 text-xs ${
                            copied === jc.code
                              ? 'border-brand-green/40 text-brand-green'
                              : 'border-gray-300 text-gray-700'
                          }`}
                        >
                          {copied === jc.code ? 'Copied!' : 'Copy'}
                        </button>
                      ) : null}
                      <button
                        onClick={() => void regenerate(role)}
                        className="rounded border border-brand-crimson/30 px-2 py-1 text-xs text-brand-crimson"
                        title="Invalidates the current code immediately"
                      >
                        Regenerate
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Share the athlete code with your roster. Regenerating invalidates the old code.
              </p>
            </section>
          ) : null}

          <section className="mb-8 rounded-lg border p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Roster ({roster.length})</h2>
              {isCoach ? (
                <div className="flex gap-2">
                  <input
                    className="rounded border px-2 py-1 text-sm"
                    placeholder="New squad name"
                    value={newSquad}
                    onChange={(e) => setNewSquad(e.target.value)}
                  />
                  <button
                    onClick={() => void createSquad()}
                    className="rounded bg-brand-green px-3 py-1 text-sm text-white"
                  >
                    Add squad
                  </button>
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Class</th>
                    {isCoach
                      ? squads.map((s) => (
                          <th key={s.id} className="py-2 pr-2 text-center">
                            <span className="mr-1">{s.name}</span>
                            <button
                              onClick={() => void deleteSquad(s.id)}
                              className="text-xs text-brand-crimson"
                              title={`Delete squad ${s.name}`}
                            >
                              ×
                            </button>
                          </th>
                        ))
                      : null}
                    {isCoach ? <th className="py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.user.name}</td>
                      <td className="py-2 pr-4 capitalize">{r.role}</td>
                      <td className="py-2 pr-4">{r.user.class_year ?? '—'}</td>
                      {isCoach
                        ? squads.map((s) => (
                            <td key={s.id} className="py-2 pr-2 text-center">
                              <input
                                type="checkbox"
                                checked={s.member_ids.includes(r.id)}
                                onChange={(e) => void toggleSquad(s, r.id, e.target.checked)}
                              />
                            </td>
                          ))
                        : null}
                      {isCoach ? (
                        <td className="py-2 text-right">
                          {r.id !== myMemberId ? (
                            <button
                              onClick={() => void removeMember(r.id)}
                              className="rounded border border-brand-crimson/30 px-2 py-0.5 text-xs text-brand-crimson"
                            >
                              Remove
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {!isCoach ? (
            <button
              onClick={() => void leaveTeam()}
              className="text-sm text-brand-crimson underline"
            >
              Leave team
            </button>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
