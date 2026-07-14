'use client';

import { useUser, UserButton } from '@clerk/nextjs';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';

/**
 * First-run: create a team (become its coach) or join with a code (role is
 * determined by the code used — separate athlete and coach codes per team).
 */
export function Onboarding({ onJoined }: { onJoined: () => void }) {
  const { user } = useUser();
  const getSupabase = useSupabase();

  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [school, setSchool] = useState('');
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  const [error, setError] = useState<string>('');

  const userName = user?.fullName ?? user?.firstName ?? null;

  async function join() {
    setBusy('join');
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('join_team_with_code', {
      p_code: code,
      p_user_name: userName,
    });
    setBusy(null);
    if (error) {
      setError(
        error.message.includes('INVALID_JOIN_CODE')
          ? 'That code is not valid. Check with your coach for the current code.'
          : `Join failed: ${error.message}`,
      );
      return;
    }
    onJoined();
  }

  async function create() {
    setBusy('create');
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('create_team', {
      p_name: teamName,
      p_school: school || null,
      p_user_name: userName,
    });
    setBusy(null);
    if (error) {
      setError(`Create failed: ${error.message}`);
      return;
    }
    onJoined();
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-maroon">BearBoard</h1>
        <UserButton />
      </header>

      <p className="mb-6 text-gray-600">
        Welcome{userName ? `, ${userName}` : ''}. Join your team with a code, or create a new team.
      </p>

      {error ? (
        <div className="mb-4 rounded border border-brand-crimson/30 bg-brand-crimson/5 p-3 text-sm text-brand-crimson">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border p-5">
          <h2 className="mb-1 text-lg font-semibold">Join a team</h2>
          <p className="mb-4 text-sm text-gray-500">
            Enter the code your coach shared. Athlete and coach codes are different.
          </p>
          <input
            className="mb-3 w-full rounded border px-3 py-2 uppercase tracking-widest"
            placeholder="JOIN CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
          />
          <button
            onClick={() => void join()}
            disabled={busy !== null || code.trim().length < 6}
            className="w-full rounded bg-brand-maroon px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy === 'join' ? 'Joining…' : 'Join team'}
          </button>
        </section>

        <section className="rounded-lg border p-5">
          <h2 className="mb-1 text-lg font-semibold">Create a team</h2>
          <p className="mb-4 text-sm text-gray-500">You&apos;ll be the coach of the new team.</p>
          <input
            className="mb-3 w-full rounded border px-3 py-2"
            placeholder="Team name (e.g. WashU XC)"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
          <input
            className="mb-3 w-full rounded border px-3 py-2"
            placeholder="School (optional)"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
          />
          <button
            onClick={() => void create()}
            disabled={busy !== null || teamName.trim().length === 0}
            className="w-full rounded bg-brand-forest px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy === 'create' ? 'Creating…' : 'Create team'}
          </button>
        </section>
      </div>
    </main>
  );
}
