/**
 * Expo push registration. Saves the token into `push_tokens` (RLS: self-only).
 *
 * Notes:
 * - Remote push does NOT work in Expo Go (SDK 53+); it needs a dev-client or
 *   store build. Every failure path here is silent-but-logged so Expo Go keeps
 *   working; the queue on the server holds notifications regardless.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export async function registerForPush(sb: SupabaseClient, userId: string): Promise<void> {
  try {
    const Device = await import('expo-device');
    if (!Device.isDevice) return;
    const Notifications = await import('expo-notifications');

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (!token) return;

    const { error } = await sb.from('push_tokens').upsert(
      {
        user_id: userId,
        expo_token: token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      },
      { onConflict: 'user_id,expo_token' },
    );
    if (error) console.warn('push token save failed:', error.message);
  } catch (e) {
    // Expected in Expo Go (no push support) — remote push needs a dev build.
    console.log('push registration skipped:', e instanceof Error ? e.message : e);
  }
}
