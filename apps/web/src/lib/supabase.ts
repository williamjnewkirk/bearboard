import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.local.example.',
  );
}

/**
 * Anon client for public data only (no user context). Safe to reuse.
 */
export const supabaseAnon: SupabaseClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * A Supabase client that carries a Clerk-issued token (JWT template `supabase`)
 * as the Authorization header, so RLS sees the user via `auth.jwt() ->> 'sub'`.
 *
 * Create one per request and DO NOT cache it â the token is short-lived (60s).
 * Callers fetch a fresh token (`getToken({ template: 'supabase' })`) each time.
 */
export function getSupabaseWithToken(token: string): SupabaseClient {
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
