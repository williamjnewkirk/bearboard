import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useRef } from 'react';
import { getSupabaseWithToken, supabaseAnon } from './supabase';

/**
 * Returns a factory that yields a fresh, token-carrying Supabase client per
 * call (never cached). Usage:
 *
 *   const getSupabase = useSupabase();
 *   const sb = await getSupabase();
 *   const { data, error } = await sb.from('teams').select('*');
 *
 * The returned factory is STABLE across renders: Clerk's `getToken` gets a new
 * identity on many renders, so we read it through a ref instead of depending on
 * it. Without this, every screen's `load` useCallback churns each render and
 * its `useEffect([load])` re-fires continuously — which, on editable forms bound
 * to loaded state (Settings profile), wipes the field on every keystroke.
 */
export function useSupabase() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  return useCallback(async () => {
    const token = await getTokenRef.current({ template: 'supabase' });
    return token ? getSupabaseWithToken(token) : supabaseAnon;
  }, []);
}
