'use client';

import { useUser, UserButton } from '@clerk/nextjs';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { Logo } from './Logo';

/**
 * First-run: create a team (become its coach) or join with a code (role is
 * determined by the code used — separate athlete and coach codes per team).
 */
export function Onboarding({ onJoined }: { onJoined: () => void }) {
  const { user } = useUser();
  const getSupabase = useSupabase();

  const [step, setStep] = useState<'team' | 'profile'>('team');
  const [role, setRole] = useState<'coach' | 'athlete'>('athlete');
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [school, setSchool] = useState('');
  const [busy, setBusy] = useState<'join' | 'create' | 'profile' | null>(null);
  const [error, setError] = useState<string>('');

  const userName = user?.fullName ?? user?.firstName ?? null;
  const [name, setName] = useState(userName ?? '');
  const [classYear, setClassYear] = useState('');
  const [events, setEvents] = useState('');
  const [title, setTitle] = useState('');

  async function join() {
    setBusy('join');
    setError('');
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('join_team_with_code', {
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
    setRole((data as { role?: 'coach' | 'athlete' } | null)?.role ?? 'athlete');
    setStep('profile');
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
    setRole('coach');
    setStep('profile');
  }

  async function saveProfile() {
    setBusy('profile');
    setError('');
    const sb = await getSupabase();
    const { error } = await sb.rpc('update_profile', {
      p_name: name,
      p_class_year: role === 'athlete' ? classYear : null,
      p_events: role === 'athlete' ? events : null,
      p_title: role === 'coach' ? title : null,
    });
    setBusy(null);
    if (error) {
      setError(`Save failed: ${error.message}`);
      return;
    }
    onJoined();
  }

  if (step === 'profile') {
    return (
      <main className="mx-auto max-w-lg p-6">
        <header className="mb-8 flex items-center justify-between">
          <Logo size={36} />
          <UserButton />
        </header>
        <h2 className="mb-1 text-2xl font-bold text-brand-forest">You&apos;re in! 🎉</h2>
        <p className="mb-6 text-gray-600">
          {role === 'coach'
            ? 'Set up your coach profile so your team knows who’s posting.'
            : 'Fill out your profile so your coach knows who you are.'}
        </p>
        {error ? (
          <div className="mb-4 rounded border border-brand-crimson/30 bg-brand-crimson/5 p-3 text-sm text-brand-crimson">
            {error}
          </div>
        ) : null}
        <label className="mb-1 block text-sm font-medium text-gray-700">Full name</label>
        <input
          className="mb-4 w-full rounded border px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {role === 'athlete' ? (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">Class year</label>
            <input
              className="mb-4 w-full rounded border px-3 py-2"
              placeholder="2028"
              value={classYear}
              onChange={(e) => setClassYear(e.target.value)}
            />
            <label className="mb-1 block text-sm font-medium text-gray-700">Events</label>
            <input
              className="mb-4 w-full rounded border px-3 py-2"
              placeholder="5k / 10k, steeple"
              value={events}
              onChange={(e) => setEvents(e.target.value)}
            />
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
            <input
              className="mb-4 w-full rounded border px-3 py-2"
              placeholder="Head Coach"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={() => void saveProfile()}
            disabled={busy !== null}
            className="rounded bg-brand-maroon px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy === 'profile' ? 'Saving…' : 'Enter BearBoard'}
          </button>
          <button onClick={() => onJoined()} className="text-sm text-gray-500 underline">
            Skip for now
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <Logo size={36} />
        <UserButton />
      </header>

      <p className="mb-1 text-lg font-semibold text-brand-forest">
        Welcome{userName ? `, ${userName}` : ''} 👋
      </p>
      <p className="mb-6 text-gray-600">
        The plan, the runs, and the team — finally in one place. Join your team with a code, or
        create a new team and bring your roster in.
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
