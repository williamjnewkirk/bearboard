'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useRef } from 'react';
import { getSupabaseWithToken, supabaseAnon } from './supabase';

/**
 * Client-component hook. Returns a factory that yields a fresh, token-carrying
 * Supabase client per call (never cached). Usage:
 *
 *   const getSupabase = useSupabase();
 *   const sb = await getSupabase();
 *   const { data, error } = await sb.from('teams').select('*');
 *
 * Stable across renders (Clerk's getToken identity churns) via a ref, so
 * consumer `load` callbacks and their effects don't re-fire every render.
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
