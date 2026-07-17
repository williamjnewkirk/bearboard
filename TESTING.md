# BearBoard — Setup & Testing Guide

Everything you need to do to get the full pilot build running on web + mobile,
then a feature-by-feature test script. Written for the current state of the
repo (migrations `0001`–`0004`, full PRD feature set).

---

## Part 1 — One-time setup (your side)

### 1. Supabase

1. In your hosted project (already linked — `supabase/.temp/project-ref`):
   ```bash
   supabase db push
   ```
   This applies `0003_planning.sql` (if not yet pushed), the big
   `0004_full_features.sql`, `0005_custom_day_type.sql` (custom day types), and
   `0006_event_recurrence.sql` (multi-weekday event repeats + recurrence-aware
   reminders), `0007_sync_user_preserve_name.sql` (onboarding name no longer
   clobbered), and `0008_fix_results_rls_and_seen.sql` (fixes coach reading
   submitted splits + robust plan-seen receipts). If `db push` errors, read the
   message — nothing in the app works until migrations apply.
2. **Clerk third-party auth** (skip if already done): Supabase Dashboard →
   Authentication → Sign In / Up → Third Party Auth → add **Clerk**, with your
   Clerk domain.
3. **Storage**: nothing to do — the `images` bucket + policies are created by
   the migration.
4. **Push worker**:
   ```bash
   supabase functions deploy push --no-verify-jwt
   ```
   Then schedule it every minute (Dashboard → Integrations → Cron) — SQL
   snippet in `supabase/README.md`. _Optional for first testing_: everything
   except push delivery works without it, and scheduled releases still fire
   when someone opens the app.

### 2. Clerk

1. JWT template named exactly `supabase` (skip if already done).
2. **Account deletion**: Clerk Dashboard → User & Authentication → enable
   **"Allow users to delete their accounts"** (needed by Settings → Delete
   account on both surfaces).
3. OAuth (Apple + native Google) is still the known remaining Week-1 item —
   email/password works today.

### 3. Env files

- `apps/web/.env.local` — `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Clerk keys (already set if web worked before).
- `apps/mobile/.env` — `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.

### 4. Run it

```bash
npm install          # once, from the repo root (new deps: expo-image-picker, expo-notifications, expo-device, sharp)
npm run web          # http://localhost:3000  (coach console)
npm run mobile:go    # Expo Go (scan QR)      (athlete + coach app)
```

### 5. Known Expo Go limits (by design, until the EAS dev-client build)

- **HealthKit sync**: the `SyncProvider` interface + import pipeline (dedup,
  review tray) is live, but the HealthKit adapter needs a dev-client build
  (`react-native-health` + its config plugin — pre-build action item). In Expo
  Go, use **manual entry** (Feed → + Log) — the whole downstream pipeline
  (feed, mileage dashboard, shoes) works off it.
- **Push delivery**: Expo Go can't receive remote pushes (SDK 53+). Token
  registration is graceful; the queue accumulates server-side. Test delivery on
  a dev-client/TestFlight build.
- **Brand icons**: regenerate any time with `npm run icons`. To use your
  original logo PNG pixel-for-pixel, save it as
  `assets/brand/bearboard-mark.png` (1024×1024) and re-run `npm run icons`.

---

## Part 2 — Feature-by-feature test script

You'll want **two accounts**: a coach (web, Chrome) and an athlete (Expo Go or
a second browser profile). Sign up with two different emails.

### A. Onboarding & teams

1. Web: sign up → you land on the branded join/create screen. Create a team
   ("WashU XC", school optional) → you're the coach, dropped into the console.
2. Settings tab → Join codes: copy the **athlete** code.
3. Mobile: sign up as the athlete → enter the athlete code → you land in the
   tabbed app with a "Get set up 🏁" checklist on Today.
4. Verify role separation: the athlete's Week tab is "This Week" (read),
   the coach's is the plan editor. Rejoin after removal: Roster → Remove the
   athlete → athlete app loses access on next load → athlete re-enters the
   current code → back in.
5. Regenerate the athlete code (Settings) → confirm the old code no longer
   works for a third account.

### B. Planning — the two-layer model (the core)

1. Web → Plan: for each of the 7 columns pick a day type + label (e.g. Wed =
   Workout / "Hills + T"). Nothing is visible to the athlete yet — check the
   mobile Week tab: "This week isn't published yet."
2. **Publish week** → athlete pulls to refresh → all 7 day cards appear
   (skeleton only; workout days say "Details coming"). Grid header shows
   seen-counts as the athlete views it.
3. Open Wednesday → **Detail**: write the session, add a structured scheme
   (e.g. 5 × 1000m @ T, 90s rest), **Save draft** → athlete still sees
   "Details coming". Then **Publish now** → athlete sees the full prescription
   with "Got it 👍" and "Log splits".
4. **Scheduled release**: on another day, write a detail, set the datetime
   picker (2 minutes from now), Save → chip shows "⏱". After the time passes,
   reload either app (or wait for the push worker) → it's published. Note the
   picker starts **empty** — no baked-in release rhythm.
5. **Edit-published + notify**: edit Wednesday's published detail → the
   "Notify athletes" checkbox appears (off by default); athlete sees an
   "updated" chip.
6. **Overrides**: click an athlete's Wednesday cell → replace day type with XT
   and add the note "TBD based on your calf" → their cell tints; the athlete's
   Wednesday shows XT + the note, marked "custom".
7. **Mileage goals**: set lo/hi (+ qualifier) in the athlete column → shows on
   the athlete's Week header.
8. **Templates**: in a detail editor, "Save as template" → open another day →
   "Load template…" fills it.
9. **Copy last week**: navigate to next week → "⎘ Copy last week" recreates
   the shape (and "+ details" copies prescriptions as drafts).
10. **Seen receipts / confirm**: athlete taps "Got it 👍" → grid cell shows ✓,
    Dashboard "Plan seen" column shows n/7 👍.
11. **Mobile coach parity**: sign into the coach account in Expo Go → Week tab
    → tap a day → set type/label/detail, publish, override per athlete.

### C. Results & splits

1. Athlete: Today (or Week) → "Log splits" on the workout with the scheme →
   five time inputs (mm:ss.t), auto-advance, per-rep "skip" (felt-based), RPE
   1–10, comment → Submit.
2. Coach web: Plan → Wednesday header → **Results** → the per-workout table:
   rows = athletes, columns = reps, RPE + comment. `~` marks felt-based reps.

### D. Activities, feed, review tray

1. Athlete: Feed → **+ Log** → manual run (distance in miles, duration,
   private note "calf tight on the last rep", shoe auto-selected) → it appears
   in the feed with distance/time/pace.
2. Coach feed (web): shows the run **with the 🔒 private note**; athlete's
   feed never shows teammates' private notes (they're excluded at the database
   level, not the UI).
3. **Likes**: 👏 from both accounts; counts update optimistically.
4. **Feed toggle**: web Settings → uncheck "Team-visible feed" → athlete's
   feed instantly shows only their own runs (server-enforced). Turn it back on.
5. **Review tray**: this is exercised by sync imports (dev build); the tray UI
   appears whenever an activity has status `pending`. Upload mode toggle lives
   in mobile Settings.
6. **Dedup**: log the same run twice (same type/start ±3 min) via the
   `import_activity` path — second import returns the first row. (Manual
   double-entry via the form is allowed on purpose.)

### E. Coach dashboard (Monday-morning screen)

Web → Dashboard: per-athlete run miles vs. goal with status pills
(On track / Behind / Over / No data), squads, last activity, injury badge,
plan-seen. Sort by any column, filter by squad, page weeks with Prev/Next.
Log more runs as the athlete and watch the numbers move.

### F. Shoes

1. Athlete: More → Shoes → add a trainer (first shoe becomes default).
2. Log a run → it auto-assigns the default shoe; the shoe's progress bar
   accrues miles. Set threshold low (e.g. 5 mi) to see the replace nudge.
3. Retire/unretire; "make default" on a second pair.
4. Coach: Feed → click the athlete's name → profile modal shows shoes +
   current mileage. Teammates can never query shoes (RLS).

### G. Injury & fatigue

1. Athlete: More → Injury & fatigue → set "Managing · calf · note" → fatigue
   check-in 1–5 (emoji row).
2. Coach: Injury board (web or mobile More) → the athlete appears grouped
   under Managing with area/note/days-in-status + latest fatigue.
3. Coach "Update" → set Modified → athlete's history shows both entries
   (coach edits are attributed via `set_by`).
4. Injury badge appears on the Plan grid row and the Dashboard.

### H. Meets & race debriefs (headline feature)

1. Web → Meets → Add meet (name/date/type/location/course/departure/notes),
   check **🎯 Goal race** → the countdown chip appears on the coach Dashboard
   and the athlete's Today.
2. Open the meet → Entries: quick-enter a squad or check athletes; set a
   per-athlete event ("8k", "open 800"). The athlete gets a Race day on their
   plan for that date (check their Week — crimson card).
3. Athlete: More → Meets → the meet shows "Entered". A non-entered athlete
   sees it flagged "Not entered".
4. For a meet dated today/past: athlete opens it → enters time/place → starts
   the **debrief** — note the 🔒 banner ("Only your coaches can see this"),
   the four reflection prompts, academic-stress + fatigue 1–5 scales,
   sleep/fueling, note to coach.
5. Coach web → Meets → open meet → **Debriefs** tab: the roll-up — mark/place
   - every reflection in one scroll. Athletes can never read each other's
     debriefs (RLS; verify with a second athlete account if you want proof:
     query returns nothing).

### I. Messaging

1. Both surfaces → Chat: **Team chat** exists automatically with everyone in
   it (new joiners are added by trigger).
2. Coach: + New → DM the athlete → send text → athlete's list shows the DM
   with an unread badge (4s polling); opening clears it.
3. Images: 📷 in the composer (web file picker / mobile photo library,
   compressed, 10 MB cap) — renders via short-lived signed URLs from the
   private bucket.
4. Delete own message (web: hover → delete; mobile: long-press) → "Message
   deleted" tombstone.
5. Mute (🔔/🔕) — muted conversations are skipped at push-enqueue time.
6. Groups: athlete + New → Group → only athletes are listed (athlete groups
   are athletes-only; coaches can create any).

### J. Announcements

1. Coach: post one with a URL and 📌 Pin, one targeted to a squad.
2. Athlete: Today shows the pinned one; Announcements shows team + own-squad
   posts only (squad targeting is enforced server-side); links are tappable;
   👍 react.
3. Pinning a second post un-pins the first (single pinned slot).

### K. Schedule & reminders

1. Coach: Schedule → Add event (practice, 4pm, location), one targeted at a
   squad, one at selected individuals (web).
2. Athlete: Schedule shows team + own-squad events; the individual event is
   visible only to its targets. Today screen lists today's events; meets
   appear merged into the schedule.
3. Reminder timing: mobile Settings → Event reminder → 1h / morning-of / off
   (delivery itself needs the push worker + a dev build).

### L. Notifications (server-side queue)

Without a device build you can still verify the pipeline: in the Supabase SQL
editor, `select category, title, body, sent_at from notification_queue order by
created_at desc;` after publishing a week / detail / posting an announcement /
sending a message — rows appear, deduped per event, and are claimed by the
push worker respecting quiet hours (10pm–6am team time) and each user's
per-category prefs (Settings → Notifications, grouped by tier, no
all-or-nothing switch).

### M. Settings & account deletion

1. Both roles: profile fields (athlete: class year/events; coach: title),
   notification toggles, reminder lead; athlete: upload mode + Leave team.
2. Coach web Settings: team name/school/timezone, feed toggle, split-nudge
   toggle, join codes.
3. **Delete account** (use a throwaway third account): personal data
   (activities, shoes, injury, debriefs) is hard-deleted; messages/results
   remain attributed to "Former member"; the Clerk identity is deleted and
   you're signed out.

### N. Security spot-checks (worth 10 minutes)

Using the athlete's session (browser dev tools → network, or the SQL you can
reach via supabase-js):

- `select * from race_debriefs` → only your own rows, ever.
- `select private_note from activities where team_member_id = '<teammate>'` →
  zero rows (coach-only).
- `select * from shoes / injury_statuses / mileage_goals` for a teammate →
  zero rows.
- Turn the feed toggle off (coach) → `feed_activities` returns only your own.
- Try a coach-only RPC as the athlete (e.g. `publish_week`) → `FORBIDDEN`.

---

## Part 3 — Pre-build action items (flagging per house rules)

Before the first EAS dev-client/TestFlight build:

1. **Apple Developer membership** (unchanged Week-1 item).
2. **HealthKit**: `npx expo install react-native-health`, add its config
   plugin + `NSHealthShareUsageDescription` string to `app.json`, implement
   `healthKitProvider` in `apps/mobile/src/lib/sync.ts` (interface + import
   pipeline are ready). This adds a **health-data App Store disclosure**.
3. **Push**: dev builds get remote push automatically via `expo-notifications`
   (already configured); deploy + schedule the `push` edge function with the
   service role key set (never in the client).
4. **OAuth**: Apple Sign-In + native Google ID-token flow (Polyscope pattern),
   each `legalAccepted: true` on sign-up.
5. **Garmin API application** (out-of-band, per PRD §7) if not yet submitted.
