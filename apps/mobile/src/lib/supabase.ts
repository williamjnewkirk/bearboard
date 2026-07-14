import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. See .env.example.',
  );
}

// We do not use Supabase Auth (Clerk is the IdP), so no session persistence is
// needed and none of RN's AsyncStorage plumbing is required.
const noAuth = { persistSession: false, autoRefreshToken: false } as const;

/** Anon client for public data only (no user context). Safe to reuse. */
export const supabaseAnon: SupabaseClient = createClient(url, anonKey, { auth: noAuth });

/**
 * A Supabase client carrying a Clerk token (JWT template `supabase`) so RLS
 * sees the user via `auth.jwt() ->> 'sub'`. Create one per call and never cache
 * it â the token is short-lived.
 */
export function getSupabaseWithToken(token: string): SupabaseClient {
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: noAuth,
  });
}
