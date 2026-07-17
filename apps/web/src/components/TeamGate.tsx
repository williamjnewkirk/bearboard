'use client';

import { useUser, UserButton } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import type { Membership } from '@/lib/team-types';
import { Onboarding } from './Onboarding';
import { Dashboard } from './Dashboard';
import { LogoMark } from './Logo';

type GateState = 'loading' | 'error' | 'no-team' | 'member';

/**
 * Post-auth gate: syncs the Clerk profile into `users`, loads the caller's
 * team membership, and routes to Onboarding (no team) or the Dashboard.
 */
export function TeamGate() {
  const { user, isLoaded } = useUser();
  const getSupabase = useSupabase();
  const [state, setState] = useState<GateState>('loading');
  const [membership, setMembership] = useState<Membership | null>(null);
  const [error, setError] = useState<string>('');

  const load = useCallback(async () => {
    if (!user) return;
    setState('loading');
    try {
      const sb = await getSupabase();

      const { error: syncError } = await sb.rpc('sync_user', {
        p_name: user.fullName ?? user.firstName ?? null,
        p_photo_url: user.imageUrl ?? null,
      });
      if (syncError) {
        setError(
          `Profile sync failed: ${syncError.message}. ` +
            'Check that migrations are pushed and Clerk third-party auth is configured in Supabase.',
        );
        setState('error');
        return;
      }

      const { data, error: memError } = await sb
        .from('team_members')
        .select(
          'id, role, team:teams(id, name, school, timezone, feed_visible_to_athletes, split_nudge_enabled)',
        )
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (memError) {
        setError(`Could not load your team: ${memError.message}`);
        setState('error');
        return;
      }

      const rows = (data ?? []) as unknown as Membership[];
      if (rows.length === 0) {
        setMembership(null);
        setState('no-team');
      } else {
        setMembership(rows[0] ?? null);
        setState('member');
      }
    } catch (e) {
      // Most likely: the Clerk `supabase` JWT template doesn't exist yet, so
      // getToken throws. Surface it instead of hanging on the loader.
      setError(
        `${e instanceof Error ? e.message : String(e)}. ` +
          'If this mentions a JWT template, create a Clerk JWT template named ' +
          '"supabase" and add Clerk under Supabase → Third-Party Auth.',
      );
      setState('error');
    }
  }, [user, getSupabase]);

  // Run once when the signed-in user becomes available. Intentionally NOT
  // depending on `load`/`getSupabase` identity (Clerk's getToken can change per
  // render), which would re-fire the effect every render and thrash the UI.
  useEffect(() => {
    if (isLoaded && user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user?.id]);

  if (!isLoaded || state === 'loading') {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <LogoMark size={56} className="animate-pulse" />
          <p className="text-sm text-gray-500">Loading your team…</p>
        </div>
      </Centered>
    );
  }

  if (state === 'error') {
    return (
      <Centered>
        <div className="max-w-lg rounded-lg border border-brand-crimson/30 bg-brand-crimson/5 p-4 text-brand-crimson">
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-3 rounded bg-brand-crimson px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </Centered>
    );
  }

  if (state === 'no-team') {
    return <Onboarding onJoined={() => void load()} />;
  }

  return membership ? <Dashboard membership={membership} onChanged={() => void load()} /> : null;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="absolute right-4 top-4">
        <UserButton />
      </div>
      {children}
    </main>
  );
}
