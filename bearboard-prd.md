# Bearboard — Product Requirements Document

**Product:** Bearboard — team training dashboard for collegiate cross country / track & field
**Company:** Newkirk Technologies LLC
**Author:** Will Newkirk
**Version:** 1.0 (Pilot MVP)
**Date:** July 13, 2026
**Target ship:** August 11, 2026 (TestFlight + Google Play internal testing)
**Hard deadline:** August 18, 2026 — first official practice

---

## 1. Overview

### 1.1 Problem

College distance coaches manage weekly training through long plain-text emails containing a table of 40+ athletes, each with individually customized workout parameters, mileage goals, and injury notes. Athletes track completed training in a separate, unconnected app (Strava, Garmin Connect) that the coach may or may not check. There is no single place where the plan, the actual training, injury status, schedules, and communication live together. The coach has zero automated visibility into whether athletes read the plan, hit their mileage goals, or completed the assigned workout.

### 1.2 Solution

Bearboard is a team-centric training platform that combines:

1. **Planning** — a coach builds one workout template, then customizes per-athlete parameters in a grid (mirroring the email table he already writes).
2. **Execution capture** — athletes' watch activities flow in automatically via Apple HealthKit / Android Health Connect, plus manual entry and structured split submission against assigned workouts.
3. **Communication** — DMs, group chats, full-team chat, and announcements replace the weekly email thread.
4. **Status** — injury/fatigue tracking, shoe mileage, weekly schedule with reminders.

The wedge vs. Strava: Strava is social-first and plan-blind. Bearboard knows what was _assigned_, so it can show planned vs. actual — at the week level (mileage goal vs. tally) and at the rep level (assigned 5x1k vs. submitted splits).

### 1.3 Pilot strategy

Build-and-pitch: develop against the known workflow of the WashU XC/TF program (Coach Stiles' weekly email is the reference artifact), demo before the season, run a one-season pilot with the WashU team, then use coach network referrals to expand. Design decisions should generalize (nothing hardcoded to WashU), but when in doubt, optimize for the Stiles workflow.

**Branding note:** "Bearboard" is WashU-flavored (Bears). Fine for the pilot; revisit naming before multi-team expansion. Avoid using WashU marks/logos in the app.

---

## 2. Goals & success metrics

### 2.1 Pilot goals (Fall 2026 XC season)

| Goal                | Metric                                                | Target                     |
| ------------------- | ----------------------------------------------------- | -------------------------- |
| Coach adoption      | Coach posts weekly plan in Bearboard instead of email | 100% of weeks after week 2 |
| Athlete adoption    | Roster onboarded with sync connected                  | ≥80% of roster             |
| Activity capture    | Runs appearing in feed (auto or manual)               | ≥70% of athletes' runs     |
| Plan engagement     | Athletes marking weekly plan "seen"                   | ≥75% within 24h of posting |
| Communication shift | Team announcements via Bearboard                      | Replaces weekly email      |
| Retention           | Weekly active athletes, weeks 4–12                    | ≥70% of onboarded roster   |

### 2.2 Non-goals for the pilot

- Public App Store / Play Store listing (TestFlight + internal track only)
- Multi-team support beyond schema readiness (one team is fine operationally)
- Monetization of any kind
- Route maps, segments, GPS trace rendering, or any Strava-style social discovery
- Recruiting, roster compliance, or NCAA reporting features

---

## 3. Users & platforms

### 3.1 Personas

**Coach (primary buyer): "Stiles"**

- Head coach, ~55-athlete combined roster across men's/women's squads
- Plans in a spreadsheet-like mental model: rows = athletes, columns = days
- Prescribes one workout skeleton with per-athlete parameter overrides
- Communicates culture (quotes, mindset, season goal) alongside logistics
- Older iPhone (likely 6s or 7 → iOS 15.8 max); comfortable on desktop web. Web is his primary surface regardless.
- Success = less admin time, more visibility, athletes actually reading the plan

**Assistant coach**

- Same permissions as head coach for the pilot (role differentiation deferred)

**Athlete: "Will"**

- D3 distance runner, 18–23, owns a Garmin/Coros/Apple Watch
- Already logs on Strava; will tolerate one more app only if it's low-friction (auto sync) and it's where the plan + team communication actually live
- Wants: see the plan, submit splits, message team, track shoes, minimal typing

### 3.2 Platforms

| Surface     | Audience                                                | Stack               | MVP?                        |
| ----------- | ------------------------------------------------------- | ------------------- | --------------------------- |
| iOS app     | Athletes + coaches                                      | React Native / Expo | Yes (TestFlight)            |
| Android app | Athletes + coaches                                      | React Native / Expo | Yes (Play internal testing) |
| Web app     | Coaches (command center: plan grid, roster, dashboards) | Next.js             | Yes                         |
| Athlete web | Athletes                                                | —                   | No (deferred indefinitely)  |

**Parity rule:** every coach capability must be usable from the mobile app. The web app is where grid editing is _pleasant_; the app is where it's _possible_ (mobile grid = per-athlete list editing rather than a spreadsheet view).

**Device floor:** iOS **15.1** minimum (Expo SDK 54's floor). This is a hard constraint, not a preference — the stack cannot target lower.

| Coach device             | Max iOS | Bearboard app?              |
| ------------------------ | ------- | --------------------------- |
| iPhone 6s / SE (1st gen) | 15.8    | ✓ Works                     |
| iPhone 7 and newer       | 15.8+   | ✓ Works                     |
| iPhone 6                 | 12.5.7  | ✗ **Cannot run** — web only |

Decision: build for iOS 15.1+ and accept the iPhone-6 edge case. The coach's command center is the **web app** anyway, so a true iPhone 6 degrades him to web-only rather than blocking the pilot. No action item; not a launch risk.

Android minimum: 10 (API 29) — Health Connect requires Android 9+; API 29+ keeps Expo happy.

---

## 4. Roles, teams & permissions

### 4.1 Account types

- **Coach** and **Athlete** roles, set at join time by the join code used (separate coach code and athlete code per team).
- A user belongs to a team with exactly one role. Multiple coaches per team supported. Multiple teams per user supported at the schema level; UI assumes one team for the pilot.

### 4.2 Team lifecycle

- Coach creates a team (name, school, colors optional).
- Team has two rotating join codes: athlete code, coach code. Coach can regenerate either at any time (invalidates old code). Codes are 6–8 characters, shareable by text/email/QR.
- Coach can remove any athlete or (non-self) coach at any time. Removal revokes access immediately; the athlete's historical activities/results remain in team data (attributed, marked inactive) unless the athlete deletes their account.
- Athletes can leave a team themselves.

### 4.3 Squads (sub-groups)

- Coach-defined groups within the team: e.g., Men, Women, Return-to-Run, 800 group.
- An athlete can belong to multiple squads.
- Squads are targeting units for: workout assignments, schedule events, announcements, group chats.
- MVP ships with two default squads (Men, Women) created at team setup; coach can add/rename/delete.

### 4.4 Permissions matrix (MVP)

| Capability                                                                  | Coach                        | Athlete                                                         |
| --------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------- |
| Create team, manage join codes                                              | ✓                            | —                                                               |
| Add/remove members, manage squads                                           | ✓                            | —                                                               |
| View all athlete activities + private notes                                 | ✓                            | —                                                               |
| View teammate activities in feed                                            | ✓                            | Only if coach enables team-visible feed                         |
| Like activities                                                             | ✓                            | ✓ (if feed visible)                                             |
| View athlete profile: injury/fatigue, shoe mileage, weekly mileage vs. goal | ✓                            | — (teammates see profile w/ these hidden)                       |
| Create/edit/assign workouts, set per-athlete overrides                      | ✓                            | —                                                               |
| Submit workout results/splits                                               | —                            | ✓ (own only)                                                    |
| Set weekly mileage goals                                                    | ✓                            | —                                                               |
| Post announcements                                                          | ✓                            | —                                                               |
| Create schedule events                                                      | ✓                            | —                                                               |
| DM anyone on team                                                           | ✓                            | ✓                                                               |
| Create group chats                                                          | ✓                            | ✓ (athlete-created groups: athletes only; coach can create any) |
| Update own injury/fatigue status                                            | ✓ (on behalf of athlete too) | ✓                                                               |
| Injury board (all injured athletes)                                         | ✓                            | —                                                               |
| Edit/delete own account, disconnect sync, delete own activities             | ✓                            | ✓                                                               |

**Feed visibility toggle (team-level, coach-controlled):**

- **Team-visible (default, confirmed for the WashU pilot):** athletes see teammates' activities in the feed and can like them.
- **Coach-only:** athletes see only their own activities; feed is private to coaches.
- Toggle is instant and retroactive (it gates queries, not data).
- Regardless of toggle: activity private notes are always coach-only; injury/fatigue and shoe data are always coach-only.

---

## 5. Feature specifications

### 5.1 Onboarding & auth

- Clerk authentication: email/password + Apple Sign-In + Google Sign-In. (Apple Sign-In required by TestFlight/App Store rules when offering other social logins.)
- First-run flow: sign up → enter join code → land in team with correct role → (athlete) prompted to connect HealthKit/Health Connect and add current shoes → (coach) guided to create squads and first announcement.
- Profile: name, photo, class year (athlete), events (athlete, free text), title (coach).

### 5.2 Workout planning (the core coach feature)

#### 5.2.1 The two-layer model (critical)

Coaches plan and release in two distinct layers, on two different clocks. Bearboard must model both separately.

- **Layer 1 — Day skeleton (the week shape).** Released in advance, usually the whole week at once. Says _what kind of day_ it is: Easy, Workout, Long Run, Race, Rest, XT, Double, Lift. Low detail on purpose ("Wednesday = Workout"). This is what athletes plan their lives around.
- **Layer 2 — Workout detail (the prescription).** The actual session: warm-up, drills, rep scheme, targets, per-athlete parameters. In-season, the coach frequently writes this the night before or the morning of — because it depends on weather, how the team looked at practice, who's banged up, and what's coming on the race schedule.

**Consequence:** a day can exist in a published week with a skeleton and _no detail yet_. Athletes see "Wednesday — Workout · details coming." Detail arrives later as its own release event with its own push notification. During the summer (per the reference email) both layers ship together; in-season they decouple. The product supports both without the coach changing modes.

**Detail release control (per day):**

- `Draft` — coach only. Default state for any new detail.
- `Published` — visible to assigned athletes now. One tap from draft.
- `Scheduled` — _optional_ convenience: detail auto-publishes at a coach-picked datetime.

**No default release time is baked into the product.** Stiles has no fixed release habit — sometimes the week ships together, sometimes a workout drops the night before, sometimes the morning of. The product must never assume a rhythm or nag him toward one. Scheduling is an opt-in convenience with an empty datetime picker, not a default. The primary path is always: write it, hit Publish, done.

Coach can edit a published detail (athletes see an "updated" badge; push fires only if the coach checks "notify"). "Publish now" always overrides a pending schedule.

#### 5.2.2 Concepts

- **Training day:** the atomic unit. One per calendar date per athlete. Fields: `day_type` (Easy / Workout / Long Run / Race / Rest / XT / Double / Lift / Other), skeleton label (short free text: "Rolling hilly route," "Double T," "Meet day"), detail (see below), release state.
- **Workout detail:** rich text description (supports the "WU 2 mi / Drills / 4-5 × 200m hill / 5 min rest / Threshold in HR / CD" style verbatim) + optional **structured rep scheme**.
- **Structured rep scheme:** ordered blocks, each = reps × distance-or-duration (+ optional target pace/effort, rest). Examples: `5 × 1000m @ T, 90s rest`, `4 × 150m hill sprint, walk down`, `20 min @ T`. Powers split submission (§5.5) and per-athlete overrides.
- **Assignment:** the per-athlete instance of a training day. Inherits the team/squad values; any field can be overridden per athlete — the rep parameter ("20 min T" → "25–28 min T"), a free-text note ("TBD based on your calf"), or the entire day_type ("XT" instead of the workout, per Newkirk/Profitt/Wold in the reference email).
- **Templates (reusable):** a coach can save any workout detail as a named template ("Hills + T," "Mile-effort 200s") and drop it onto any day later. Reuse across weeks and seasons.

#### 5.2.3 The grid (web-first)

- Rows = athletes (filterable by squad). Columns = **all seven days** of the selected week, Monday–Sunday. Every day is independently editable and plannable — there is no fixed workout-day pattern. The week's shape (which days are workouts, easy, long, races, doubles, rest) is entirely coach-defined and can differ every week.
- **Two-row header per column:** top = day_type + skeleton label for the day (set once, applies to the column); bottom = detail release status chip (Draft / Scheduled / Published + timestamp).
- Workflow: (1) lay out the week's skeleton across all 7 columns → publish week → athletes see the shape; (2) later, open any day → write the detail → per-athlete overrides in the column → publish or schedule the detail.
- Cell states: inherited (gray), overridden (accent), note badge, XT/injured (distinct), race (distinct).
- Weekly mileage goal is a per-athlete column in the same grid ("50–60 mpw," "Low Efficient" free-text qualifier supported).
- **Copy last week** action copies the skeleton (and optionally details) — coach's weeks are highly repetitive in shape.
- **Publish week** makes skeletons visible + fires push. Details publish independently per §5.2.1.

#### 5.2.4 Mobile coach flow

Full parity, list-based instead of grid: Week screen → tap a day → set day_type + skeleton → write detail → assignee list → tap an athlete to override → publish or schedule. Everything the web grid can do, the coach can do from his phone.

#### 5.2.5 Athlete view

- **This Week:** all seven days, each showing day_type + skeleton. Days with unreleased detail show "Details coming" (and, if scheduled, "expected tonight"). Days with released detail expand to the full personalized prescription (their overrides applied — never teammates').
- **Today:** the app home surfaces today's day_type, detail if released, plus events, plus pending items.
- Push on detail release: "Wednesday's workout is posted."
- **Seen receipts** at both layers: coach's grid shows who has seen the week skeleton and, separately, who has seen each day's detail. Explicit "Got it 👍" confirm doubles as acknowledgment. This is the visibility the coach has never had — the email's "keep me posted if you see any errors" is currently a black hole.

### 5.3 Activity sync & upload

**Auto sync (MVP):**

- **iOS — HealthKit:** read workouts (running, cycling, swimming, hiking/walking, other) with distance, duration, avg/max HR, calories, elevation if present. Garmin, Coros, and Apple Watch all write into Apple Health when the athlete enables it in their vendor app — this is the documented setup path in onboarding (per-vendor setup instructions screen). Use background delivery/anchored queries so new workouts appear without opening the app; fall back to foreground refresh on app open.
- **Android — Health Connect:** equivalent read of exercise sessions. Garmin/Coros sync into Health Connect via their Android apps. Foreground sync on app open + periodic background sync (WorkManager) — Health Connect background access is more restrictive; set expectations that Android may require opening the app.
- **Known limitation (communicate in-app):** HealthKit/Health Connect deliver summary metrics, not lap-by-lap splits. Rep splits come from athlete submission (5.5). Direct Garmin/Coros APIs bring splits in v1.1.

**Upload modes (per-athlete setting):**

1. **Auto:** every detected workout uploads to the team automatically.
2. **Review:** new detected workouts land in a "pending" tray; athlete taps to approve/discard each. Default = Review (respects athlete comfort, matches spec).

**Manual entry:** type, date/time, distance, duration, optional HR/elevation/notes. Covers no-watch athletes, pool/lift sessions, and watch failures.

**Activity record fields:** type, title (auto-generated, editable: "Morning Run"), date/time, distance, moving time, pace (derived), avg/max HR, elevation, shoe (auto-assigned to default shoe, editable), athlete description (team-visible if feed is team-visible), **private note to coach** (always coach-only, e.g., "calf felt tight on the last rep"), source (HealthKit / Health Connect / manual).

- Edit/delete own activities anytime.
- Deduplication: match on type + start time (±3 min) + duration to prevent double import (e.g., manual + later sync).

**Deferred (explicitly not MVP):** tagging teammates on activities (v1.1), GPS route maps (later/never — not the wedge).

### 5.4 Feed

- Reverse-chronological team feed of activities. Coach always sees everything; athletes see it only when the team-visible toggle is on.
- Feed card: athlete, title, type icon, distance/time/pace, HR if present, description, like button + like count.
- Likes only in MVP (no comments — comments invite moderation burden during a pilot; revisit v1.1).
- Coach feed adds: private-note indicator, quick link to the athlete's profile, filter by squad/athlete/type/date.
- Athlete profile (teammate view): name, photo, class year, events, recent activities. Hidden from teammates: injury/fatigue, shoes/mileage, weekly mileage vs. goal, private notes.
- Athlete profile (coach view): all of the above plus injury/fatigue status + history, weekly mileage vs. goal (current + trailing 4 weeks), shoes with current mileage, full activity feed for that athlete, recent workout results.

### 5.5 Workout results & splits (differentiator)

- Any assignment with a structured rep scheme generates a **results form** for the athlete: the scheme's blocks expand into per-rep time inputs (5×1k → five time fields; 4×150 hill → optional, athlete can skip reps or mark "felt-based").
- Fast entry UX: numeric keypad, mm:ss.t format, auto-advance between reps, optional per-rep note, overall RPE (1–10), overall comment.
- For duration-based blocks ("20 min @ T"): inputs = actual duration, avg pace and/or distance covered, RPE.
- Results attach to the assignment and (when matched) link to the synced activity for that day.
- Coach views: per-workout results table (rows = athletes, columns = reps) — the coach's post-practice bird's-eye; and per-athlete history of a repeated workout over the season (progression view, v1.1 for charts, table in MVP).
- Push nudge (optional, coach-configurable): evening of a workout day, athletes with no submitted results get "Log your splits from today's workout."

### 5.6 Messaging

- Supabase Realtime-backed chat. Conversation types: **DM** (any two team members), **group** (custom membership), **team** (auto-created, everyone).
- Coaches can create groups with any members; athletes can create athlete-only groups.
- Message features (MVP): text, **image attachments** (Supabase Storage, client-side compression, 10 MB cap), delete-own-message. Deliberately excluded from MVP: read receipts, typing indicators, reactions, threads, editing.
- Push notification on new message (with per-conversation mute).
- Unread badges per conversation and app-icon badge.

### 5.7 Announcements

- Coach-only posts, targeted to team or squad. Rich text + links (URLs render as tappable link previews) + optional image.
- Pinned announcement slot (one) — natural home for quote of the day / mindset / season goal content.
- Push notification on post. Athletes can react 👍 (lightweight acknowledgment).
- Announcements tab keeps history (replaces digging through email).

### 5.8 Injury & fatigue status

- **Athlete self-report:** status enum — Healthy / Managing (something's off, still training) / Modified (XT or reduced) / Out — plus body area (pick-list: foot, ankle, calf, shin, knee, hamstring, quad, hip, back, other) and free-text note. Timestamped history retained.
- **Fatigue check-in:** simple 1–5 daily-optional slider (fresh → cooked). No streaks/pressure; it's a signal, not a chore.
- **Coach injury board:** all athletes not "Healthy," grouped by status, showing area, note, days in status, last update. Coach can update an athlete's status (e.g., after a training-room conversation) — edits attributed to the coach in history.
- Injury status surfaces as a badge in the plan grid row (planning and injury stay connected — "Profitt — XT, rolled ankle" lives in one place).
- Visibility: athlete's own status → self + coaches only. Never teammates.

### 5.9 Schedule & reminders

- Coach creates events: title, type (practice / lift / meeting / meet / travel / other), date/time, location (free text), target (team / squad / selected individuals), notes, optional recurrence (weekly).
- Individual/private-group meetings = events targeted at selected individuals; only targets (and coaches) see them.
- Athlete views: week list + simple month calendar. Events merge with the athlete's published training plan into one "Today" screen (top of app home): today's workout + today's events + pending items (unsubmitted splits, unseen plan).
- Reminders: push notification default 1 hour before events (athlete-adjustable: off / 1h / morning-of).

### 5.9a Racing & meet schedule

Races are first-class, not just another calendar event — they're what the training is aimed at ("What are we training for? = NCAA's, Saturday, November 21").

**Season race schedule (coach-managed):**

- Meet record: name, date, host/location, course (free text), type (dual / invitational / conference / regional / national / time trial), travel/departure time, notes (course description, uniform, packing).
- **Squad/individual entry list:** coach marks who is racing each meet — whole team, a squad, or a hand-picked list. Athletes not entered still see the meet on the team calendar, flagged "not entered."
- **Race entries can specify an event per athlete** (relevant for track: 800m, 1500m, 5k; for XC: varsity/JV race). Athlete-level field on the entry.
- **Goal race flag:** one or more meets marked as the season's target (NCAA's). Surfaces on the team home screen as a countdown ("131 days to NCAA's") — carries the culture function of the coach's "what are we training for" section.

**Interaction with the plan:**

- A meet auto-creates a `Race` training day for entered athletes on that date; the grid column renders as a race day (distinct styling), and the coach still overrides per athlete (e.g., someone racing an open 800 vs. racing the 5k, or an athlete racing while another does a workout instead).
- Race week shapes are fully coach-defined day-by-day — the seven-day editable grid handles taper/shakeout/pre-meet patterns with no special-casing.

**Race debrief (athlete-authored, coach-only) — a headline feature:**

After every race, the athlete completes a structured debrief. This is the reflective counterpart to split submission, and it's the thing that turns Bearboard from a logging tool into a coaching tool — it captures context that a time and a place never will, and it does it while memory is fresh instead of in a hallway conversation three days later.

_Objective section:_

- Event, official time/mark, place, splits (per-lap or per-mile, athlete-entered)

_Reflective section (the core):_

- **What went well in the race?** (free text)
- **What didn't go well?** (free text)
- **What did you do well in preparation?** (free text)
- **What could you have changed in preparation?** (free text)
- **Academic stress leading into this race** (1–5 scale + optional note)
- **Overall fatigue leading into this race** (1–5 scale + optional note)
- **Sleep and fueling in race week** (optional short text)
- **Anything you want your coach to know** (free text)

_Behavior:_

- Push prompt the evening after a meet: "Log your race debrief." Snoozeable, never nagging — one reminder, then it sits in the athlete's pending items.
- **Visibility: strictly athlete + coaches. Never teammates, under any feed setting.** The honesty of this feature depends entirely on that guarantee, and the UI states it plainly on the form ("Only your coaches can see this"). This is the single most privacy-sensitive surface in the app and RLS must enforce it at the row level, not the client.
- Athlete can edit their own debrief at any time; edit history is not surfaced to the coach (encourage honesty, not performance).

_Coach views:_

- Per-meet debrief roll-up: every entered athlete's mark/place plus their reflection, in one scrollable review — replaces the coach reading 40 emails or catching people one at a time.
- Per-athlete debrief history down the season, with academic-stress and fatigue scores plotted against race performance. Over a season this becomes the most valuable dataset the coach has ever had: it directly connects _life load_ to _race outcome_ per athlete.
- Aggregate signal (v1.1): team-wide academic stress spiking in a given week (midterms, finals) is a real, actionable training-load input.

**Out of scope:** automatic results import from live-timing services (TFRRS/DirectAthletics-style). I have not verified that a supported public API or license path exists, and I'm not going to design around an assumption. Manual entry for the pilot; flagged as a v2 research item, not a commitment.

### 5.10 Shoe tracker

- Athlete adds shoes: brand/model (free text), nickname, starting mileage, category (trainer / workout / spikes / racing).
- One **default shoe** auto-assigned to new run activities; athlete can switch the shoe on any activity. Mileage accumulates automatically from assigned activities.
- Retire shoe action (keeps history). Optional replacement threshold (default 400 mi) with a gentle nudge at threshold.
- Visibility: self + coaches.

### 5.11 Weekly mileage & compliance dashboard (coach)

- Auto-computed per athlete: current-week mileage (from activities), vs. coach-set goal, with a status pill (on track / behind / over / no data).
- Team roll-up screen: sortable table (athlete, squad, week mileage, goal, % of goal, last activity date, injury badge, plan-seen status). This is the coach's Monday-morning screen and the pilot's headline demo moment.
- Week boundary: Monday–Sunday, team-timezone (America/Chicago default, team setting).

### 5.12 Settings & account

- Athlete: profile, sync connection (connect/disconnect, upload mode auto/review), notification preferences (per-category toggles, grouped by tier — see §6.4), leave team, delete account.
- Coach: team settings (name, feed visibility toggle, timezone, join codes, squads), roster management, notification preferences, delete account.
- Delete account: hard-deletes auth identity + personal data; team-facing records (messages, results in coach tables) are anonymized ("Former member"). Comply with Apple's account-deletion requirement even on TestFlight (good hygiene + required at store launch anyway).

---

## 6. Technical architecture

### 6.1 Stack (reuse Polyscope stack)

| Layer                         | Choice                                                                                            | Notes                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Mobile                        | React Native 0.81 / Expo SDK 54 / TypeScript                                                      | Expo Pro already purchased; EAS Build for TestFlight/Play internal                     |
| Web (coach)                   | Next.js + TypeScript + Tailwind                                                                   | Deployed on Vercel free tier                                                           |
| Auth                          | Clerk                                                                                             | Shared across web + mobile; roles/team membership live in Postgres, not Clerk metadata |
| DB / API / Realtime / Storage | Supabase (Postgres, RLS, Realtime, Storage)                                                       | Free tier to start; RLS enforces the permissions matrix server-side                    |
| Background jobs               | Supabase Edge Functions (or Fly.io Deno worker if needed)                                         | Weekly mileage rollups, notification fan-out, reminder scheduling                      |
| Push                          | Expo Push Notifications                                                                           | Free, unified iOS/Android                                                              |
| Health data                   | HealthKit (react-native-health / expo-health APIs) + Health Connect (react-native-health-connect) | Requires dev-client builds (not Expo Go)                                               |
| Monitoring                    | Sentry + PostHog                                                                                  | Same setup as Polyscope                                                                |

### 6.2 Data model (core tables)

```
users(id, clerk_id, name, photo_url, class_year, events, created_at)
teams(id, name, school, timezone, feed_visible_to_athletes bool, created_at)
team_members(id, team_id, user_id, role enum[coach,athlete], status enum[active,removed], joined_at)
join_codes(id, team_id, role, code, active bool)
squads(id, team_id, name)
squad_members(squad_id, team_member_id)

weeks(id, team_id, start_date, skeleton_published_at)

-- one row per calendar date per team (all 7 days, always)
training_days(id, team_id, week_id, date, day_type enum[easy,workout,long_run,race,rest,xt,double,lift,other],
              skeleton_label, created_by)

-- detail is a separate record with its own release clock (may not exist yet)
workout_details(id, training_day_id, description_rich, rep_scheme jsonb,
                release_state enum[draft,scheduled,published], release_at, published_at,
                updated_at, created_by)

-- saved reusable prescriptions, decoupled from any date
workout_templates(id, team_id, name, description_rich, rep_scheme jsonb, created_by)

-- per-athlete instance; overrides may replace day_type and/or any detail field
day_assignments(id, training_day_id, team_member_id, overrides jsonb, note,
                skeleton_seen_at, detail_seen_at, confirmed_at)

mileage_goals(id, team_member_id, week_id, goal_low, goal_high, qualifier)

meets(id, team_id, name, date, location, course, meet_type, departure_at, notes, is_goal_race bool)
meet_entries(id, meet_id, team_member_id, event, entered bool)
meet_results(id, meet_entry_id, mark, place, splits jsonb, entered_by)

-- coach-only. RLS: readable by author + team coaches ONLY. never teammates.
race_debriefs(id, meet_entry_id, team_member_id,
              went_well, didnt_go_well, prep_done_well, prep_would_change,
              academic_stress smallint, academic_stress_note,
              fatigue smallint, fatigue_note,
              sleep_fueling_note, note_to_coach,
              submitted_at, updated_at)

activities(id, team_member_id, type, title, started_at, distance_m, duration_s,
           avg_hr, max_hr, elevation_m, description, private_note, shoe_id,
           source enum[healthkit,health_connect,manual], external_id, status enum[pending,published,discarded])
activity_likes(activity_id, team_member_id)

workout_results(id, assignment_id, activity_id nullable, splits jsonb, rpe, comment, submitted_at)

shoes(id, team_member_id, brand_model, nickname, category, start_miles, retired bool, threshold_miles)

injury_statuses(id, team_member_id, status enum, body_area, note, set_by, created_at)  -- append-only history
fatigue_checkins(id, team_member_id, score, created_at)

conversations(id, team_id, kind enum[dm,group,team], name)
conversation_members(conversation_id, team_member_id, muted bool, last_read_at)
messages(id, conversation_id, sender_id, body, image_url, created_at, deleted bool)

announcements(id, team_id, author_id, body_rich, image_url, pinned bool, squad_id nullable, created_at)
events(id, team_id, title, type, starts_at, location, notes, recurrence, created_by)
event_targets(event_id, squad_id nullable, team_member_id nullable)
push_tokens(user_id, expo_token, platform)
```

`rep_scheme` jsonb shape: `[{reps: 5, distance_m: 1000, target: "T", rest: "90s"}, ...]` or `[{duration_s: 1200, target: "T"}]`. `overrides` jsonb mirrors any template field. `splits` jsonb: `[{rep: 1, time_s: 178.4, note: null}, ...]`.

### 6.3 Security & privacy

- All authorization enforced via Supabase RLS keyed on team membership + role (client is never trusted). Sensitive columns (private_note, injury, shoes, mileage goals) protected by column-level views/policies so athlete queries physically cannot return them for teammates.
- Health data handling: store only derived workout summaries, never raw HealthKit samples beyond what's displayed. Document in a plain-English privacy policy (adapt Polyscope's legal docs; health data warrants explicit language).
- Image uploads: Supabase Storage with signed URLs, per-team bucket paths.
- No minors expected (college roster), but ToS states 17+ to keep COPPA out of scope.

### 6.4 Notifications inventory

**Decision:** every category below fires by default, and **every category is independently toggleable** in athlete settings (plus per-conversation mute for chats). Detail-release pushes are the ones athletes genuinely want — they're the reason to keep notifications on at all — so they must never be buried behind a blanket app-level mute. The settings screen groups them individually rather than offering one all-or-nothing switch, precisely so that a notification-fatigued athlete turns off _announcements_ instead of turning off _everything_.

**Policy (locked):** every category below fires by default, and every category is **individually toggleable by the athlete** in Settings → Notifications. No all-or-nothing switch — an athlete who mutes announcements must not thereby lose workout drops.

Design intent: **workout detail releases are the notification athletes actually want**, and everything else is competing for the same attention budget. If an athlete is going to mute one thing, the settings screen should make it easy for them to mute _that_ thing rather than uninstall or disable notifications wholesale. The categories are therefore listed in the settings UI grouped by tier, with the training tier framed as the reason the app is worth allowing notifications from at all.

| Tier                      | Trigger                                                    | Recipients            | Default                                                   |
| ------------------------- | ---------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| **Training (high value)** | Workout detail released (manual or scheduled)              | Assigned athletes     | On                                                        |
|                           | Week skeleton published                                    | Team / squad          | On                                                        |
|                           | Workout detail updated after release                       | Assigned athletes     | On (coach opts in per edit)                               |
| **Racing**                | Meet entry posted / race day tomorrow                      | Entered athletes      | On                                                        |
|                           | Race debrief prompt (evening after a meet)                 | Entered athletes      | On (single reminder, snoozeable)                          |
| **Communication**         | New message                                                | Conversation members  | On (also mutable per conversation)                        |
|                           | New announcement                                           | Target audience       | On                                                        |
| **Logistics**             | Event reminder                                             | Event targets         | On, 1h before (athlete-adjustable: off / 1h / morning-of) |
|                           | New pending activities to review                           | Athlete (review mode) | On                                                        |
| **Optional nudges**       | Split nudge (evening of workout day, no results submitted) | Assigned athletes     | **Off** (coach-enabled per team)                          |

**Anti-fatigue rules:**

- Never more than one push per trigger event — no re-nags, no escalation. The split nudge and debrief prompt fire once and then live silently in the athlete's pending-items list.
- Coach edits to a published detail only push if the coach explicitly checks "notify" on that edit (typo fixes shouldn't buzz 55 phones).
- Quiet hours: no pushes 10:00 PM–6:00 AM team time; queued notifications deliver at 6:00 AM. Exception: none in MVP.
- Instrument push open-rates and per-category opt-out rates in PostHog from day one. If athletes are muting a category en masse during the pilot, that's the product telling you something.

---

## 7. Release plan & timeline

Solo developer, Claude Code-accelerated, July 13 → August 11 (~4.5 weeks), with **August 12–17 as buffer** before the **August 18 first official practice** — the hard deadline. Sequenced so that every week ends with something demoable.

**Do this in week 1, out-of-band:** submit the **Garmin** Connect Developer Program application (developer.garmin.com/gc-developer-program/, Activity API, as Newkirk Technologies LLC). Approval timeline is unknown and possibly long; it does not block the MVP, but starting the clock in July is what makes a v1.1 Garmin integration possible in the fall.

**COROS is deliberately deferred to post-pilot (Oct+).** Rationale: (a) COROS activities already reach Bearboard via Apple Health / Health Connect, so no athlete is blocked; (b) the only thing the direct API adds is lap splits, which athletes are entering manually via the results form anyway; (c) a partner application is materially stronger when it can cite a live product with ~55 active collegiate users than when it cites a PRD. Apply once the pilot is running.

### Week 1 (Jul 13–19): Foundation

- Monorepo scaffold (Expo app + Next.js web + shared types package), Supabase project, Clerk wired to both surfaces
- Schema migration v1, RLS policies for teams/roles
- Team create/join flows (codes), roster + squads management (web + mobile)
- CI: EAS build profiles, first TestFlight + Play internal builds with placeholder screens
- **Checkpoint:** a coach and an athlete can both be inside the same team on real devices

### Week 2 (Jul 20–26): Planning core

- Training days (all 7, every day_type), workout details with independent release states, rep schemes, saved templates
- Per-athlete overrides (incl. day_type replacement), mileage goals
- Web plan grid (flagship screen) with two-row column headers + mobile coach editing flow
- Scheduled detail release job (night-before / morning-of / custom), publish-week, athlete This Week + Today views, two-layer seen receipts
- Meets: create, entries, goal-race flag, auto-created race days
- **Checkpoint:** recreate Coach Stiles' actual attached summer email inside Bearboard _and_ demo the in-season flow — skeleton published Sunday, Wednesday's workout detail auto-dropping Tuesday at 7 PM. This is the demo script.

### Week 3 (Jul 27–Aug 2): Activities

- HealthKit integration (dev-client build), Health Connect integration, review-tray + auto modes, dedup
- Manual entry, activity editing, private notes, shoe tracker + auto mileage
- Feed (coach + athlete variants), likes, visibility toggle, athlete/coach profile screens
- Weekly mileage rollup job + coach compliance dashboard
- **Checkpoint:** Will's real Garmin runs appear in the feed untouched; dashboard shows mileage vs. goal

### Week 4 (Aug 3–9): Communication & status

- Messaging (DM/group/team, images, unread badges, push)
- Announcements (+pinned), schedule events + reminders, injury/fatigue status + coach board
- Workout results/splits entry + coach results table
- Meet race debriefs (athlete form, coach roll-up) with strict coach-only RLS
- Notification preference center, account deletion
- **Checkpoint:** feature-complete pilot build

### Aug 10–17: Hardening + onboarding prep

- Onboarding polish (vendor sync setup instructions), empty states, Sentry triage, seed demo data, TestFlight external group + Play internal track invites ready
- **Deliverable:** demo-ready build + 5-minute pitch flow for Coach Stiles, in his hands before Aug 18
- Prep a 10-minute roster onboarding for the first team meeting (join code + sync setup walkthrough); adoption lives or dies here

**Slack plan:** if behind by end of Week 3, cut in this order: (1) split nudge notifications, (2) fatigue check-ins, (3) recurrence on events, (4) image attachments in chat, (5) Android background sync (foreground-only). The plan grid, sync, feed, and messaging are never cut.

### v1.1 (Sept–Oct, during pilot)

Direct Garmin API integration (applied for in July; lap splits auto-fill the results form when available). **COROS API application submitted in this window**, once the pilot provides real usage evidence, teammate tagging on activities, recurring habits checklist (core/drills/strides compliance), season goal countdown, comments on activities, results progression charts, availability-based meeting scheduling, athlete data export.

### v2 (post-pilot, if expanding)

Multi-team UX, coach role tiers (head/assistant), team analytics (ACWR-style load flags), public store launch, rebrand evaluation, onboarding for non-WashU teams via coach referrals.

---

## 8. Risks & mitigations

| Risk                                                                      | Likelihood      | Mitigation                                                                                                                                                       |
| ------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coach doesn't adopt (habit inertia)                                       | High            | Grid mirrors his email exactly; copy-last-week; pitch = "same table, but athletes' runs flow back automatically"; web-first coach UX; you onboard him personally |
| Athletes don't connect sync (setup friction: watch → vendor app → Health) | Medium-High     | Per-vendor illustrated setup guides in onboarding; manual entry as pressure valve; captain-led onboarding session at first practice                              |
| HealthKit/Health Connect data gaps (no splits, Android background limits) | Certain (known) | Set expectations in-app; splits via athlete submission; Garmin/Coros direct APIs in v1.1 — **apply for API access now**                                          |
| Coach on an iPhone 6 (iOS 12, below the Expo floor)                       | Low             | Accepted: web app covers 100% of coach features; no engineering work planned                                                                                     |
| Athletes don't trust debrief privacy → dishonest reflections              | Medium          | Row-level RLS, explicit in-UI guarantee, never surfaced in any feed; coach reinforces it verbally at first meeting                                               |
| Garmin developer program suspended / long approval                        | Medium          | Unverified conflicting reports; apply in July, MVP does not depend on it; aggregators (Terra/Spike) as unvetted fallback                                         |
| COROS athletes lack lap splits until v1.2                                 | Low             | Accepted: Health Connect/HealthKit covers summaries; manual split entry covers reps; COROS application deferred to post-pilot by design                          |
| Solo-dev timeline slip                                                    | Medium          | Ordered cut list (§7); deadline is soft into early season; Week 2 checkpoint (grid demo) is the true must-hit for the pitch                                      |
| Apple/Google testing hurdles                                              | Low             | TestFlight internal → external group (external review is light); Play internal track has no review                                                               |
| Data privacy concerns from athletes                                       | Low-Med         | Review-mode default, clear visibility rules (injury/shoes never teammate-visible), plain-English privacy policy, delete anytime                                  |

---

## 9. Open questions

**Resolved:** notification defaults — all categories ON, each independently toggleable (§6.4) · iOS floor 15.1, web fallback for iPhone 6 (§3.2) · hard deadline Aug 18 (§7) · no default detail-release time (§5.2.1) · race debrief is athlete-authored + coach-only (§5.9a) · feed launches team-visible (§4.4) · notifications all-on by default with per-category athlete toggles (§6.4).

1. **Objective race results** (time, place, splits) — athlete-entered by default, with coach able to correct? The _debrief_ is unambiguously athlete-authored; only the objective fields are in question. Recommend athlete-entered + coach-editable.
2. **Squad structure at WashU** beyond Men/Women — does Stiles think in event groups (distance / mid-d / sprints / throws) during track season? Affects whether squads need to be many-to-many from day one (they are in the schema; this is a UI question).
3. **Garmin program status** — unresolved conflicting reports on whether new applications are being accepted. Submitting the application is the only way to find out. No MVP dependency.
