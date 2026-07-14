import { useUser } from '@clerk/clerk-expo';
import { BRAND_COLORS } from '@bearboard/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSupabase } from '../lib/useSupabase';
import type { Membership } from '../lib/team-types';
import { OnboardingScreen } from './OnboardingScreen';
import { TeamScreen } from './TeamScreen';

type GateState = 'loading' | 'error' | 'no-team' | 'member';

/**
 * Post-auth gate: syncs the Clerk profile into `users`, loads the caller's
 * membership, then shows Onboarding (join/create) or the Team screen.
 */
export function HomeScreen() {
  const { user, isLoaded } = useUser();
  const getSupabase = useSupabase();
  const [state, setState] = useState<GateState>('loading');
  const [membership, setMembership] = useState<Membership | null>(null);
  const [error, setError] = useState('');

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
        setError(`Profile sync failed: ${syncError.message}`);
        setState('error');
        return;
      }

      const { data, error: memError } = await sb
        .from('team_members')
        .select('id, role, team:teams(id, name, school)')
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
        `${e instanceof Error ? e.message : String(e)}\n\n` +
          'If this mentions a JWT template, create a Clerk JWT template named ' +
          '"supabase" and add Clerk under Supabase → Third-Party Auth.',
      );
      setState('error');
    }
  }, [user, getSupabase]);

  useEffect(() => {
    if (isLoaded && user) void load();
  }, [isLoaded, user, load]);

  if (!isLoaded || state === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
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
      </View>
    );
  }

  if (state === 'no-team') {
    return <OnboardingScreen onJoined={() => void load()} />;
  }

  return membership ? <TeamScreen membership={membership} onChanged={() => void load()} /> : null;
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
});
