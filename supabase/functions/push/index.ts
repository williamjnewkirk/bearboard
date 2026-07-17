// BearBoard push worker (Supabase Edge Function).
//
// Runs on a schedule (every minute — see supabase/README.md for setup) and:
//   1. publishes any scheduled workout details whose release time has passed
//   2. enqueues time-derived notifications (event reminders, race-day-tomorrow,
//      debrief prompts, split nudges)
//   3. claims due queue rows (per-category prefs + 10pm–6am team-time quiet
//      hours are enforced in SQL) and fans them out to Expo Push.
//
// Security: requires the service-role key as the bearer token, so only the
// scheduler (or you, with the key) can invoke it. It never trusts caller input.
//
// Deploy:  supabase functions deploy push --no-verify-jwt
// (JWT verification is off because we do our own service-key check; the
//  function is useless to anyone without the service key.)

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface PushRow {
  queue_id: string;
  expo_token: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!serviceKey || !url) {
    return json({ error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${serviceKey}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Scheduled detail releases (the publish trigger enqueues the pushes).
  const released = await sb.rpc('release_due_details');
  if (released.error) return json({ step: 'release', error: released.error.message }, 500);

  // 2. Time-derived notifications.
  const enqueued = await sb.rpc('enqueue_due_notifications');
  if (enqueued.error) return json({ step: 'enqueue', error: enqueued.error.message }, 500);

  // 3. Claim + send.
  const claimed = await sb.rpc('claim_due_pushes', { p_limit: 500 });
  if (claimed.error) return json({ step: 'claim', error: claimed.error.message }, 500);

  const rows = (claimed.data ?? []) as PushRow[];
  let sent = 0;
  const errors: string[] = [];

  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => ({
      to: r.expo_token,
      title: r.title,
      body: r.body ?? undefined,
      data: r.data ?? undefined,
      sound: 'default' as const,
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(Deno.env.get('EXPO_ACCESS_TOKEN')
            ? { authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` }
            : {}),
        },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        errors.push(`expo ${res.status}: ${await res.text()}`);
      } else {
        sent += chunk.length;
      }
    } catch (e) {
      errors.push(String(e));
    }
  }

  return json({
    releasedDetails: released.data ?? 0,
    claimed: rows.length,
    sent,
    errors: errors.length ? errors : undefined,
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
