# Supabase

Postgres schema, RLS, Realtime, and Storage for Bearboard. Migrations are the
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

Clerk is the identity provider, wired to Supabase as a **third-party auth
provider**. The Clerk user id arrives in the JWT `sub` claim; `users.clerk_id`
maps it to a Bearboard user. RLS helper functions (`current_user_id`,
`is_team_member`, `is_team_coach`, `current_team_member`) resolve authorization
from that claim. Configure the Clerk domain under `[auth.third_party.clerk]` in
`config.toml` and in the hosted dashboard.

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

Policies for the remaining feature tables (planning, messaging, announcements,
events, results) are added in later migrations as those features land.

> The migration has not been executed against a live Postgres in this
> environment (no Docker). Run `supabase db reset` locally to validate before
> relying on it.
