import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { getSupabaseWithToken, supabaseAnon } from './supabase';

/**
 * Supabase client for use in Server Components / route handlers, authed as the
 * current Clerk user. Falls back to the anon client when signed out. Never
 * cache the result across requests.
 */
export async function getServerSupabase() {
  const { getToken } = await auth();
  const token = await getToken({ template: 'supabase' });
  return token ? getSupabaseWithToken(token) : supabaseAnon;
}
