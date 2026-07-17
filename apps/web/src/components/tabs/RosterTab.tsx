'use client';

import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useRoster } from '@/lib/useRoster';
import type { Membership, SquadRow } from '@/lib/team-types';
import { Avatar, Button, Card, Empty, ErrorNote, Spinner, inputCls } from '../ui';

/** Roster + squad management (coach) / roster view (athlete). */
export function RosterTab({
  membership,
  onChanged,
}: {
  membership: Membership;
  onChanged: () => void;
}) {
  const getSupabase = useSupabase();
  const isCoach = membership.role === 'coach';
  const teamId = membership.team.id;
  const { roster, squads, loading, error: loadError, reload } = useRoster(teamId);

  const [newSquad, setNewSquad] = useState('');
  const [error, setError] = useState('');
  const myMemberId = membership.id;

  async function createSquad() {
    const name = newSquad.trim();
    if (!name) return;
    const sb = await getSupabase();
    const { error } = await sb.from('squads').insert({ team_id: teamId, name });
    if (error) setError(`Create squad: ${error.message}`);
    setNewSquad('');
    await reload();
  }

  async function renameSquad(squad: SquadRow, name: string) {
    if (!name.trim() || name === squad.name) return;
    const sb = await getSupabase();
    const { error } = await sb.from('squads').update({ name: name.trim() }).eq('id', squad.id);
    if (error) setError(`Rename: ${error.message}`);
    await reload();
  }

  async function deleteSquad(id: string) {
    const sb = await getSupabase();
    const { error } = await sb.from('squads').delete().eq('id', id);
    if (error) setError(`Delete squad: ${error.message}`);
    await reload();
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
    await reload();
  }

  async function removeMember(memberId: string) {
    const sb = await getSupabase();
    const { error } = await sb
      .from('team_members')
      .update({ status: 'removed' })
      .eq('id', memberId);
    if (error) setError(`Remove: ${error.message}`);
    await reload();
  }

  async function leaveTeam() {
    const sb = await getSupabase();
    const { error } = await sb.rpc('leave_team', { p_team_id: teamId });
    if (error) return setError(`Leave: ${error.message}`);
    onChanged();
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-bold text-brand-forest">Roster & squads</h1>
      <ErrorNote>{error || loadError}</ErrorNote>

      <Card
        title={`Roster (${roster.length})`}
        action={
          isCoach ? (
            <div className="flex gap-2">
              <input
                className={`${inputCls} !w-44`}
                placeholder="New squad name"
                value={newSquad}
                onChange={(e) => setNewSquad(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void createSquad()}
              />
              <Button variant="secondary" small onClick={() => void createSquad()}>
                Add squad
              </Button>
            </div>
          ) : undefined
        }
      >
        {roster.length === 0 ? (
          <Empty title="Nobody here yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4">Events</th>
                  {isCoach
                    ? squads.map((s) => (
                        <th key={s.id} className="px-2 py-2 text-center">
                          <input
                            defaultValue={s.name}
                            onBlur={(e) => void renameSquad(s, e.target.value)}
                            className="w-20 rounded border border-transparent bg-transparent text-center text-xs font-semibold hover:border-gray-300"
                            title="Click to rename"
                          />
                          <button
                            onClick={() => void deleteSquad(s.id)}
                            className="ml-0.5 text-xs text-brand-crimson"
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
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-2">
                        <Avatar name={r.user.name} photoUrl={r.user.photo_url} size={26} />
                        <span className="font-medium">{r.user.name}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-4 capitalize text-gray-600">
                      {r.role === 'coach' ? (r.user.title ?? 'Coach') : 'Athlete'}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{r.user.class_year ?? '—'}</td>
                    <td className="max-w-[140px] truncate py-2 pr-4 text-gray-600">
                      {r.user.events ?? '—'}
                    </td>
                    {isCoach
                      ? squads.map((s) => (
                          <td key={s.id} className="px-2 py-2 text-center">
                            {r.role === 'athlete' ? (
                              <input
                                type="checkbox"
                                checked={s.member_ids.includes(r.id)}
                                onChange={(e) => void toggleSquad(s, r.id, e.target.checked)}
                              />
                            ) : null}
                          </td>
                        ))
                      : null}
                    {isCoach ? (
                      <td className="py-2 text-right">
                        {r.id !== myMemberId ? (
                          <Button small variant="danger" onClick={() => void removeMember(r.id)}>
                            Remove
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isCoach ? (
          <p className="mt-2 text-xs text-gray-400">
            Removing a member revokes access immediately; their history stays with the team. They
            can rejoin with a current code.
          </p>
        ) : null}
      </Card>

      {!isCoach ? (
        <button onClick={() => void leaveTeam()} className="text-sm text-brand-crimson underline">
          Leave team
        </button>
      ) : null}
    </div>
  );
}
