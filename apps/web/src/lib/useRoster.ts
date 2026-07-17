'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from './useSupabase';
import type { RosterRow, SquadRow } from './team-types';

/** Load the active roster (+ squads) for a team. Used by most coach tabs. */
export function useRoster(teamId: string, opts?: { athletesOnly?: boolean }) {
  const getSupabase = useSupabase();
  const athletesOnly = opts?.athletesOnly ?? false;
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    const sb = await getSupabase();
    let q = sb
      .from('team_members')
      .select('id, role, user:users(id, name, photo_url, class_year, events, title)')
      .eq('team_id', teamId)
      .eq('status', 'active');
    if (athletesOnly) q = q.eq('role', 'athlete');
    const { data, error } = await q;
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as RosterRow[];
    rows.sort((a, b) =>
      a.role === b.role ? a.user.name.localeCompare(b.user.name) : a.role === 'coach' ? -1 : 1,
    );
    setRoster(rows);

    const { data: squadData, error: sErr } = await sb
      .from('squads')
      .select('id, name, squad_members(team_member_id)')
      .eq('team_id', teamId)
      .order('name');
    if (sErr) {
      setError(sErr.message);
    } else {
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
    }
    setLoading(false);
  }, [getSupabase, teamId, athletesOnly]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { roster, squads, loading, error, reload };
}
