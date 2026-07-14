import { useAuth } from '@clerk/clerk-expo';
import { useCallback } from 'react';
import { getSupabaseWithToken, supabaseAnon } from './supabase';

/**
 * Returns a factory that yields a fresh, token-carrying Supabase client per
 * call (never cached). Usage:
 *
 *   const getSupabase = useSupabase();
 *   const sb = await getSupabase();
 *   const { data, error } = await sb.from('teams').select('*');
 */
export function useSupabase() {
  const { getToken } = useAuth();
  return useCallback(async () => {
    const token = await getToken({ template: 'supabase' });
    return token ? getSupabaseWithToken(token) : supabaseAnon;
  }, [getToken]);
}
