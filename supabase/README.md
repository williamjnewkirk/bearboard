# Supabase

Postgres schema, RLS, Realtime, and Storage for BearBoard. Migrations are the
source of truth for the database; `packages/shared` mirrors them in TypeScript.

## Layout

- `config.toml` â local CLI config (ports, storage limits, auth provider).
- `migrations/` â ordered SQL migrations. `0001_init.sql` is schema v1.
- `seed.sql` â local/demo seed data (loaded by `db reset`).

## Local development

Requires Docker Desktop (not installed in the current environment).

```bash
supabase start          # boots local Postgres + Studio + APIs
supabase db reset       # applies all migrations + seed.sql from scratch
supabase db diff -f my_change   # generate a new migration from schema drift
```

## Deploying to the hosted project

```bash
supabase link --project-ref <SUPABASE_PROJECT_REF>
supabase db push        # apply pending migrations to the linked project
```

## Auth model

Clerk is the identity provider, wired to Supabase via a JWT template named
`supabase` (app code attaches the token as `Authorization: Bearer <token>`).
The Clerk user id is **text** (`user_...`, never a uuid) and is used directly as
`users.id`; all user-referencing columns are text. RLS helper functions
(`current_user_id`, `is_team_member`, `is_team_coach`, `current_team_member`)
compare straight to `auth.jwt() ->> 'sub'`. Configure the Clerk integration in
the hosted dashboard (and `[auth.third_party.clerk]` in `config.toml` for local).

## RLS status (0001_init)

RLS is **enabled on every table** â a table with no policy denies all access,
which is the safe default. Policies in `0001_init.sql` cover the
security-critical surfaces:

- Team gating (members read team-scoped data; coaches manage it).
- `race_debriefs`, `injury_statuses`, `fatigue_checkins`, `shoes`,
  `mileage_goals`: self + coaches only, **never teammates**.
- `activities`: owner + coaches on the base table; teammates read the
  `feed_activities` view, which omits `private_note` and respects the team feed
  toggle.

`0003_planning.sql` adds the planning read policies + write RPCs.
`0004_full_features.sql` completes the pilot surface: policies + RPCs for
meets/entries/results/debriefs, workout results, likes, messaging (DM/group/
team chat with auto-membership), announcements + reactions, events + targets,
push tokens, user settings columns, storage bucket + per-team path policies,
the notification queue, and account deletion.

## Push notifications (edge function `push`)

Triggers in `0004` enqueue rows into `notification_queue` (deduped — one push
per trigger event, ever). The `push` edge function drains the queue:

1. publishes due scheduled workout details (`release_due_details`)
2. enqueues time-derived pushes (event reminders per athlete lead, race-day-
   tomorrow, the single evening debrief prompt, the optional split nudge)
3. claims due rows — **quiet hours (10pm–6am team time) and per-category user
   prefs are enforced in SQL** — and POSTs to the Expo Push API.

Deploy + schedule (one-time):

```bash
supabase functions deploy push --no-verify-jwt
```

Then schedule it every minute. Easiest path: Supabase Dashboard → Integrations →
Cron (enables pg_cron + pg_net), and add a job that calls the function with the
**service role key** as the bearer token:

```sql
select cron.schedule(
  'bearboard-push', '* * * * *',
  $$ select net.http_post(
       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/push',
       headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
     ) $$
);
```

The function rejects any caller that doesn't present the service role key.
Until the schedule exists, scheduled detail releases still work — both apps
call `release_due_details()` opportunistically on load — but pushes queue up
unsent.

> Migrations have not been executed against a live Postgres in this
> environment (no Docker). Run `supabase db reset` locally (or `db push` to a
> throwaway project) to validate before relying on them.
