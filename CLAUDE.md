# CLAUDE.md

Guidance for Claude Code working in this repo. Read alongside `bearboard-prd.md`
(the product spec and source of truth for _what_ to build).

## What this is

Bearboard â a team training dashboard for collegiate XC/TF. npm-workspaces
monorepo: `apps/web` (Next.js coach console), `apps/mobile` (Expo app),
`packages/shared` (TS types), `supabase/` (Postgres schema + RLS).

Solo-dev pilot on a hard deadline (first practice **Aug 18, 2026**). Bias toward
shipping the PRD's Week-by-week plan (Â§7); when behind, follow the ordered cut
list in Â§7, never cutting the plan grid, sync, feed, or messaging.

## Architecture conventions

- **The DB schema is the source of truth.** `supabase/migrations/` defines
  tables, enums, and RLS. `packages/shared/src` mirrors them in TypeScript â
  when you change one, change the other in the same commit. Enum string values
  in `packages/shared/src/enums.ts` must exactly match the Postgres enums.
- **Never trust the client for authorization.** Every permission in the PRD
  Â§4.4 matrix is enforced by Supabase RLS, not app code. Add/adjust policies in
  a migration; app-side checks are UX only.
- **Auth:** Clerk is the IdP, shared across mobile + web. Clerk issues a JWT
  from a template named `supabase`; app code sends it as
  `Authorization: Bearer <token>` and RLS reads `auth.jwt() ->> 'sub'`.
  **Clerk user ids are `text` (`user_...`), never uuid** â `users.id` stores the
  Clerk id directly and every user-referencing column is text. Team
  role/membership live in Postgres (`team_members`), never in Clerk metadata.
- **Shared types import path:** `@bearboard/shared` (raw TS from `src`,
  transpiled by consumers â `transpilePackages` in Next, Metro resolves it for
  Expo). Don't build the package to consume it.

## Conventions carried from Polyscope (the shipped predecessor app)

Bearboard reuses the exact stack and process proven on Polyscope. Follow these
as defaults unless told otherwise.

**Stack baseline (proven versions):** Expo SDK 54 (`expo ~54`), React Native
0.81.x, React 19.1, TypeScript ~5.9. Always check the SDK 54 docs
(https://docs.expo.dev/versions/v54.0.0/) before writing Expo-specific code.
Monitoring: Sentry (`@sentry/react-native`) + PostHog (`posthog-react-native`).
Animations if needed: Reanimated ~4.1 + react-native-worklets + Gesture Handler
v2. (Bearboard adds HealthKit / Health Connect, which Polyscope did not have.)

**Clerk auth gotchas (learned the hard way):**

- Google Sign-In uses the **native ID-token** flow (`@react-native-google-signin`,
  `google_one_tap`), **not** browser OAuth (browser OAuth failed on Polyscope).
- Apple Sign-In via `expo-apple-authentication` (required by App Store when other
  social logins are offered).
- **Every sign-up path must send `legalAccepted: true`** or Clerk stalls silently
  in `missing_requirements`.

**Supabase client pattern:**

- Anon client for public data; a **fresh per-call** `getSupabaseWithToken(token)`
  for authed/user data â **never cache the authed client**.
- `supabase-js` v2 **never throws** â always check `{ data, error }` on every call.
- Optimistic UI with rollback for mutations.

**Secrets discipline (hard rule):** never put API keys/tokens in committed files
(`eas.json`, `app.json`, source). Client-safe values via `EXPO_PUBLIC_*` /
`NEXT_PUBLIC_*`; everything else via EAS Secrets / server env. When a change
needs a secret set before a build works, **flag it as a pre-build action item**.

**EAS build/release:** `eas.json` uses `appVersionSource: "remote"` with three
profiles â three update channels: `development` (dev client, internal),
`preview` (internal), `production` (autoIncrement, submit). Any native module
(HealthKit / Health Connect) requires a **dev-client build**, never Expo Go.
On Windows, iOS builds run in the cloud via EAS (no local Mac/Xcode); Android
dev-client APKs from EAS sideload directly.

**Config-plugin env vars that throw at build time** (e.g. a missing Google URL
scheme) must be flagged as pre-build action items, not discovered at build.

**App Store / Play privacy disclosures:** flag whenever a change adds an SDK,
shares data with a new third party, or uses existing data for a new purpose.
HealthKit / Health Connect additions in particular trigger new health-data
disclosures.

## Non-negotiable privacy rules (enforce in RLS, not just UI)

- `race_debriefs`: readable by the authoring athlete + team coaches **only**.
  Never teammates, under any feed setting. Most sensitive surface in the app.
- `injury_statuses`, `fatigue_checkins`, `shoes`, `mileage_goals`,
  `activities.private_note`: self + coaches only, never teammates.
- Teammate activity feed is gated by `teams.feed_visible_to_athletes` and must
  omit `private_note` â athletes read the `feed_activities` view, never the
  `activities` base table, for teammates' data.

## Product invariants easy to get wrong

- **Two-layer planning (Â§5.2.1):** the week _skeleton_ (day_type + label) and
  each day's _workout detail_ release on separate clocks with separate seen
  receipts and separate push. A published day can have no detail yet.
- **No baked-in detail-release time.** The scheduler is opt-in with an empty
  datetime picker. Never assume or nudge a release rhythm.
- **All 7 days are independently plannable** â there is no fixed workout-day
  pattern. Week shape is entirely coach-defined and varies weekly.
- **Overrides can replace the whole `day_type`** per athlete (e.g. XT instead of
  the workout), not just parameters.
- **Notifications:** every category on by default, each independently
  toggleable; no all-or-nothing switch. Quiet hours 10pmâ6am team time. One
  push per trigger, no re-nags.

## Working here

- **Package manager:** npm workspaces. Run installs from the repo root.
- **Env:** copy `.env.example`; per-app examples in `apps/*/.env*.example`.
  `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` reach the client bundle â no secrets there.
- **DB changes:** `supabase db diff -f <name>` to generate a migration; never
  edit an applied migration. Local stack needs Docker (`supabase start`).
- **Mobile health data needs a dev-client build** (`expo run:ios|android`), not
  Expo Go.
- **Before committing nontrivial changes:** `npm run typecheck` and, for schema
  changes, apply against a local DB (`supabase db reset`) to catch SQL errors â
  CI here can't (no Docker in some envs).

## Status (as of scaffold)

`packages/shared` complete + typechecks. Dependencies installed. `apps/web` and
`apps/mobile` are placeholder entry points (no real screens yet); `eas init` has
run (projectId + updates URL in `app.json`). `supabase/0001_init.sql` written but
not yet run against a live Postgres. Next up per PRD Â§7 Week 1: Clerk+Supabase
wiring, team create/join flows, roster + squads, first EAS dev-client build.
