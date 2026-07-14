# BearBoard

Team training dashboard for collegiate cross country / track & field.
_Newkirk Technologies LLC Â· pilot MVP targeting the WashU XC/TF program, Fall 2026._

BearBoard puts the training plan, actual training, injury status, schedules, and
team communication in one place. Its wedge over Strava: it knows what was
_assigned_, so it can show planned vs. actual at both the week level (mileage
goal vs. tally) and the rep level (assigned 5Ã1k vs. submitted splits).

See [`bearboard-prd.md`](bearboard-prd.md) for the full product spec.

## Monorepo layout

```
bearboard/
  apps/
    mobile/          Expo / React Native app (athletes + coaches)      â @bearboard/mobile
    web/             Next.js coach command center (plan grid, roster)  â @bearboard/web
  packages/
    shared/          TypeScript types + enums mirroring the DB schema  â @bearboard/shared
  supabase/
    migrations/      SQL schema + RLS (source of truth for the DB)
    config.toml      local CLI config
    seed.sql         local/demo seed data
```

npm workspaces. Node 20+ (`.nvmrc`).

## Stack

| Layer                         | Choice                                          |
| ----------------------------- | ----------------------------------------------- |
| Mobile                        | React Native 0.81 / Expo SDK 54 / TypeScript    |
| Web                           | Next.js (App Router) + Tailwind, on Vercel      |
| Auth                          | Clerk (third-party auth provider into Supabase) |
| DB / API / Realtime / Storage | Supabase (Postgres + RLS)                       |
| Push                          | Expo Push Notifications                         |
| Health data                   | HealthKit + Health Connect (dev-client builds)  |
| Monitoring                    | Sentry + PostHog                                |

## Getting started

```bash
git clone <this repo>
cd bearboard
npm install                     # installs all workspaces

cp .env.example .env            # then fill in Supabase + Clerk keys
```

Then, per surface:

```bash
npm run web                     # Next.js dev server (apps/web)
npm run mobile                  # Expo dev server (apps/mobile) â needs a dev client
npm run typecheck               # typecheck all workspaces
npm run format                  # Prettier
```

Database (requires Docker for local Postgres):

```bash
supabase start                  # boot local stack
supabase db reset               # apply migrations + seed
```

> **Current state:** this is a foundation scaffold. `packages/shared` is
> complete and typechecks. `apps/web` and `apps/mobile` are minimal placeholders
> with dependencies declared but **not installed** and no native project
> generated yet â run `npm install` (and `expo run:ios/android` for mobile) to
> bring them up. The Supabase migration is written but not yet executed against a
> live Postgres. See each package's README for next steps.

## Key product constraints

- **iOS floor 15.1** (Expo SDK 54); iPhone 6 (iOS 12) is web-only by design.
- **Android floor API 29** (Android 10) for Health Connect.
- **Two-layer planning:** week skeleton and per-day workout detail release on
  independent clocks (PRD Â§5.2.1).
- **Race debriefs are athlete-authored, coach-only** â never teammate-visible,
  enforced by RLS at the row level (PRD Â§5.9a).
- **No default detail-release time** â never nag the coach toward a rhythm.

## Timeline

Solo dev, Jul 13 â Aug 11, 2026 (buffer to Aug 17), first practice **Aug 18**.
Week-by-week plan and cut list in [`bearboard-prd.md`](bearboard-prd.md) Â§7.

## License

Proprietary Â· Newkirk Technologies LLC. All rights reserved.
