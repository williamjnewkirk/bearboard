import { useAuth, useUser } from '@clerk/clerk-expo';
import { BRAND_COLORS } from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership } from '../lib/team-types';
import { OnboardingScreen } from './OnboardingScreen';
import { MemberTabs } from './MemberTabs';

type GateState = 'loading' | 'error' | 'no-team' | 'member';

/** Reject if the wrapped promise doesn't settle in `ms`, so we never hang. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Timed out after ${ms / 1000}s. Likely causes: the Supabase URL/anon key ` +
                'is wrong, Clerk third-party auth is not configured in Supabase, or no network.',
            ),
          ),
        ms,
      ),
    ),
  ]);
}

/**
 * Post-auth gate: syncs the Clerk profile into `users`, loads the caller's
 * membership, then shows Onboarding (join/create) or the Team screen.
 */
export function HomeScreen() {
  const { user, isLoaded } = useUser();
  const { signOut } = useAuth();
  const getSupabase = useSupabase();
  const [state, setState] = useState<GateState>('loading');
  const [membership, setMembership] = useState<Membership | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setState('loading');
    try {
      await withTimeout(
        (async () => {
          const sb = await getSupabase();

          const { error: syncError } = await sb.rpc('sync_user', {
            p_name: user.fullName ?? user.firstName ?? null,
            p_photo_url: user.imageUrl ?? null,
          });
          if (syncError) throw new Error(`Profile sync failed: ${syncError.message}`);

          const { data, error: memError } = await sb
            .from('team_members')
            .select('id, role, team:teams(id, name, school)')
            .eq('user_id', user.id)
            .eq('status', 'active');
          if (memError) throw new Error(`Could not load your team: ${memError.message}`);

          const rows = (data ?? []) as unknown as Membership[];
          if (rows.length === 0) {
            setMembership(null);
            setState('no-team');
          } else {
            setMembership(rows[0] ?? null);
            setState('member');
          }
        })(),
        12000,
      );
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : String(e)}\n\n` +
          'If this mentions a JWT template, create a Clerk JWT template named ' +
          '"supabase" and add Clerk under Supabase → Third-Party Auth.',
      );
      setState('error');
    }
  }, [user, getSupabase]);

  // Run once when the signed-in user becomes available. Intentionally NOT
  // depending on `load`/`getSupabase` identity: those can change per render
  // (Clerk's getToken), which would re-fire the effect every render and thrash
  // the UI. user?.id is the only input that should re-trigger a fresh load.
  useEffect(() => {
    if (isLoaded && user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user?.id]);

  if (!isLoaded || state === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BRAND_COLORS.maroon} />
        <Text style={styles.hint}>Loading your team…</Text>
        <Pressable onPress={() => void signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retry} onPress={() => void load()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
        <Pressable onPress={() => void signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'no-team') {
    return <OnboardingScreen onJoined={() => void load()} />;
  }

  return membership ? <MemberTabs membership={membership} onChanged={() => void load()} /> : null;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
    backgroundColor: BRAND_COLORS.white,
  },
  hint: { fontSize: 13, color: '#666' },
  errorTitle: { fontSize: 17, fontWeight: '700' },
  errorText: { fontSize: 14, color: BRAND_COLORS.crimson, textAlign: 'center' },
  retry: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: BRAND_COLORS.maroon,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { fontWeight: '600', color: BRAND_COLORS.maroon },
  signOut: { color: '#888', textDecorationLine: 'underline', marginTop: 12 },
});
