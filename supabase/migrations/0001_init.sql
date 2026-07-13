-- Bearboard schema v1 (PRD Â§6.2).
--
-- Auth model: Clerk is the identity provider, integrated with Supabase via a
-- JWT template named "supabase". The Clerk user id (a TEXT value like
-- `user_2ab...`, never a uuid) arrives in the JWT `sub` claim and IS the user
-- primary key â `users.id` stores it directly and all user-referencing columns
-- are text. RLS compares straight to `auth.jwt() ->> 'sub'`; no id indirection.
-- All authorization is enforced here via RLS keyed on team membership + role â
-- the client is never trusted. (Convention carried over from Polyscope.)
--
-- This migration creates the full schema and enables RLS on every table. The
-- policies below cover the security-critical surfaces (team gating, coach-only
-- race debriefs, private notes / injury / shoes / mileage never leaking to
-- teammates). Policies for feature tables are expanded in later migrations as
-- those features land; RLS-enabled-with-no-policy means deny-all, which is the
-- safe default until a policy is written.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type role as enum ('coach', 'athlete');
create type member_status as enum ('active', 'removed');
create type day_type as enum
  ('easy', 'workout', 'long_run', 'race', 'rest', 'xt', 'double', 'lift', 'other');
create type release_state as enum ('draft', 'scheduled', 'published');
create type activity_type as enum ('run', 'cycle', 'swim', 'hike', 'walk', 'lift', 'xt', 'other');
create type activity_source as enum ('healthkit', 'health_connect', 'manual');
create type activity_status as enum ('pending', 'published', 'discarded');
create type shoe_category as enum ('trainer', 'workout', 'spikes', 'racing');
create type injury_status as enum ('healthy', 'managing', 'modified', 'out');
create type body_area as enum
  ('foot', 'ankle', 'calf', 'shin', 'knee', 'hamstring', 'quad', 'hip', 'back', 'other');
create type meet_type as enum
  ('dual', 'invitational', 'conference', 'regional', 'national', 'time_trial');
create type event_type as enum ('practice', 'lift', 'meeting', 'meet', 'travel', 'other');
create type conversation_kind as enum ('dm', 'group', 'team');
create type push_platform as enum ('ios', 'android');

-- ---------------------------------------------------------------------------
-- Identity, teams, membership
-- ---------------------------------------------------------------------------

-- id IS the Clerk user id (text, `user_...`). No separate clerk_id column.
create table users (
  id text primary key,
  name text not null,
  photo_url text,
  class_year text,
  events text,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text,
  timezone text not null default 'America/Chicago',
  feed_visible_to_athletes boolean not null default true,
  created_at timestamptz not null default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  role role not null,
  status member_status not null default 'active',
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table join_codes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  role role not null,
  code text not null unique,
  active boolean not null default true
);

create table squads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  name text not null
);

create table squad_members (
  squad_id uuid not null references squads (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  primary key (squad_id, team_member_id)
);

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------

create table weeks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  start_date date not null,
  skeleton_published_at timestamptz,
  unique (team_id, start_date)
);

create table training_days (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  week_id uuid not null references weeks (id) on delete cascade,
  date date not null,
  day_type day_type not null,
  skeleton_label text,
  created_by uuid references team_members (id) on delete set null,
  unique (team_id, date)
);

create table workout_details (
  id uuid primary key default gen_random_uuid(),
  training_day_id uuid not null references training_days (id) on delete cascade,
  description_rich text,
  rep_scheme jsonb,
  release_state release_state not null default 'draft',
  release_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_by uuid references team_members (id) on delete set null
);

create table workout_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  name text not null,
  description_rich text,
  rep_scheme jsonb,
  created_by uuid references team_members (id) on delete set null
);

create table day_assignments (
  id uuid primary key default gen_random_uuid(),
  training_day_id uuid not null references training_days (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  overrides jsonb,
  note text,
  skeleton_seen_at timestamptz,
  detail_seen_at timestamptz,
  confirmed_at timestamptz,
  unique (training_day_id, team_member_id)
);

create table mileage_goals (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members (id) on delete cascade,
  week_id uuid not null references weeks (id) on delete cascade,
  goal_low numeric,
  goal_high numeric,
  qualifier text,
  unique (team_member_id, week_id)
);

-- ---------------------------------------------------------------------------
-- Racing
-- ---------------------------------------------------------------------------

create table meets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  name text not null,
  date date not null,
  location text,
  course text,
  meet_type meet_type,
  departure_at timestamptz,
  notes text,
  is_goal_race boolean not null default false
);

create table meet_entries (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references meets (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  event text,
  entered boolean not null default true,
  unique (meet_id, team_member_id)
);

create table meet_results (
  id uuid primary key default gen_random_uuid(),
  meet_entry_id uuid not null references meet_entries (id) on delete cascade,
  mark text,
  place integer,
  splits jsonb,
  entered_by uuid references team_members (id) on delete set null
);

-- Coach-only reflective debrief. The single most privacy-sensitive table:
-- readable by the authoring athlete + team coaches ONLY, never teammates,
-- under any feed setting (PRD Â§5.9a). Enforced by RLS below.
create table race_debriefs (
  id uuid primary key default gen_random_uuid(),
  meet_entry_id uuid not null references meet_entries (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  went_well text,
  didnt_go_well text,
  prep_done_well text,
  prep_would_change text,
  academic_stress smallint,
  academic_stress_note text,
  fatigue smallint,
  fatigue_note text,
  sleep_fueling_note text,
  note_to_coach text,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (meet_entry_id)
);

-- ---------------------------------------------------------------------------
-- Activities & results
-- ---------------------------------------------------------------------------

create table shoes (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members (id) on delete cascade,
  brand_model text not null,
  nickname text,
  category shoe_category,
  start_miles numeric not null default 0,
  retired boolean not null default false,
  threshold_miles numeric default 400
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members (id) on delete cascade,
  type activity_type not null,
  title text,
  started_at timestamptz not null,
  distance_m numeric,
  duration_s integer,
  avg_hr integer,
  max_hr integer,
  elevation_m numeric,
  description text,
  private_note text, -- always coach-only; never exposed to teammates
  shoe_id uuid references shoes (id) on delete set null,
  source activity_source not null,
  external_id text, -- vendor id for dedup
  status activity_status not null default 'published'
);

create index activities_member_started_idx on activities (team_member_id, started_at desc);
-- Dedup guard: same source can't import the same external activity twice.
create unique index activities_source_external_idx
  on activities (team_member_id, source, external_id)
  where external_id is not null;

create table activity_likes (
  activity_id uuid not null references activities (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  primary key (activity_id, team_member_id)
);

create table workout_results (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references day_assignments (id) on delete cascade,
  activity_id uuid references activities (id) on delete set null,
  splits jsonb,
  rpe smallint,
  comment text,
  submitted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Status
-- ---------------------------------------------------------------------------

-- Append-only history; the latest row per member is the current status.
create table injury_statuses (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members (id) on delete cascade,
  status injury_status not null,
  body_area body_area,
  note text,
  set_by uuid references team_members (id) on delete set null,
  created_at timestamptz not null default now()
);

create index injury_statuses_member_idx on injury_statuses (team_member_id, created_at desc);

create table fatigue_checkins (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members (id) on delete cascade,
  score smallint not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------

create table conversations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  kind conversation_kind not null,
  name text
);

create table conversation_members (
  conversation_id uuid not null references conversations (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  muted boolean not null default false,
  last_read_at timestamptz,
  primary key (conversation_id, team_member_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references team_members (id) on delete cascade,
  body text,
  image_url text,
  created_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index messages_conversation_idx on messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Announcements, schedule, push
-- ---------------------------------------------------------------------------

create table announcements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  author_id uuid references team_members (id) on delete set null,
  body_rich text not null,
  image_url text,
  pinned boolean not null default false,
  squad_id uuid references squads (id) on delete set null,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  title text not null,
  type event_type not null,
  starts_at timestamptz not null,
  location text,
  notes text,
  recurrence text,
  created_by uuid references team_members (id) on delete set null
);

create table event_targets (
  event_id uuid not null references events (id) on delete cascade,
  squad_id uuid references squads (id) on delete cascade,
  team_member_id uuid references team_members (id) on delete cascade
);

create table push_tokens (
  user_id text not null references users (id) on delete cascade,
  expo_token text not null,
  platform push_platform not null,
  primary key (user_id, expo_token)
);

-- ---------------------------------------------------------------------------
-- RLS helper functions
--
-- SECURITY DEFINER so they can read team_members regardless of the caller's
-- own policies. Identity comes straight from the Clerk `sub` claim (text).
-- ---------------------------------------------------------------------------

-- The current Clerk user id (text). Wrapped in a function for readability so
-- policies read `current_user_id()` instead of the raw jwt accessor.
create or replace function current_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select auth.jwt() ->> 'sub'
$$;

-- Is the current user an ACTIVE member of the team (any role)?
create or replace function is_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    where tm.team_id = target_team_id
      and tm.user_id = current_user_id()
      and tm.status = 'active'
  )
$$;

-- Is the current user an ACTIVE coach of the team?
create or replace function is_team_coach(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    where tm.team_id = target_team_id
      and tm.user_id = current_user_id()
      and tm.status = 'active'
      and tm.role = 'coach'
  )
$$;

-- The current user's team_member id for a given team (null if not a member).
create or replace function current_team_member(target_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.id from team_members tm
  where tm.team_id = target_team_id
    and tm.user_id = current_user_id()
    and tm.status = 'active'
$$;

-- Resolve the team that owns a team_member row.
create or replace function team_of_member(target_member_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_id from team_members tm where tm.id = target_member_id
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table (deny-all until a policy grants access).
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table join_codes enable row level security;
alter table squads enable row level security;
alter table squad_members enable row level security;
alter table weeks enable row level security;
alter table training_days enable row level security;
alter table workout_details enable row level security;
alter table workout_templates enable row level security;
alter table day_assignments enable row level security;
alter table mileage_goals enable row level security;
alter table meets enable row level security;
alter table meet_entries enable row level security;
alter table meet_results enable row level security;
alter table race_debriefs enable row level security;
alter table shoes enable row level security;
alter table activities enable row level security;
alter table activity_likes enable row level security;
alter table workout_results enable row level security;
alter table injury_statuses enable row level security;
alter table fatigue_checkins enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table announcements enable row level security;
alter table events enable row level security;
alter table event_targets enable row level security;
alter table push_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- Core policies (starter set â security-critical surfaces).
-- Feature-table policies are added in later migrations as features land.
-- ---------------------------------------------------------------------------

-- users: a user can read/update their own row. (Team-scoped reads of other
-- users go through team_members joins in later, view-based policies.)
create policy users_self_select on users
  for select using (id = current_user_id());
create policy users_self_update on users
  for update using (id = current_user_id());

-- teams: any active member can read; only coaches can update.
create policy teams_member_select on teams
  for select using (is_team_member(id));
create policy teams_coach_update on teams
  for update using (is_team_coach(id));

-- team_members: members can see the roster of their team; coaches manage it.
create policy team_members_select on team_members
  for select using (is_team_member(team_id));
create policy team_members_coach_write on team_members
  for all using (is_team_coach(team_id)) with check (is_team_coach(team_id));

-- squads / squad_members: readable by members, writable by coaches.
create policy squads_select on squads
  for select using (is_team_member(team_id));
create policy squads_coach_write on squads
  for all using (is_team_coach(team_id)) with check (is_team_coach(team_id));
create policy squad_members_select on squad_members
  for select using (is_team_member((select team_id from squads s where s.id = squad_id)));
create policy squad_members_coach_write on squad_members
  for all using (is_team_coach((select team_id from squads s where s.id = squad_id)))
  with check (is_team_coach((select team_id from squads s where s.id = squad_id)));

-- join_codes: coach-only (codes are shared out-of-band, not read by athletes).
create policy join_codes_coach_all on join_codes
  for all using (is_team_coach(team_id)) with check (is_team_coach(team_id));

-- race_debriefs: THE sensitive one. Read = author athlete OR any team coach.
-- Write = author athlete only. Never teammates, under any feed setting.
create policy race_debriefs_select on race_debriefs
  for select using (
    team_member_id = current_team_member(team_of_member(team_member_id))
    or is_team_coach(team_of_member(team_member_id))
  );
create policy race_debriefs_author_write on race_debriefs
  for all using (
    team_member_id = current_team_member(team_of_member(team_member_id))
  ) with check (
    team_member_id = current_team_member(team_of_member(team_member_id))
  );

-- injury_statuses: self + coaches only (never teammates). Coaches may also
-- insert on an athlete's behalf.
create policy injury_select on injury_statuses
  for select using (
    team_member_id = current_team_member(team_of_member(team_member_id))
    or is_team_coach(team_of_member(team_member_id))
  );
create policy injury_insert on injury_statuses
  for insert with check (
    team_member_id = current_team_member(team_of_member(team_member_id))
    or is_team_coach(team_of_member(team_member_id))
  );

-- fatigue_checkins: self + coaches only.
create policy fatigue_select on fatigue_checkins
  for select using (
    team_member_id = current_team_member(team_of_member(team_member_id))
    or is_team_coach(team_of_member(team_member_id))
  );
create policy fatigue_self_insert on fatigue_checkins
  for insert with check (
    team_member_id = current_team_member(team_of_member(team_member_id))
  );

-- shoes: self + coaches only (never teammates).
create policy shoes_select on shoes
  for select using (
    team_member_id = current_team_member(team_of_member(team_member_id))
    or is_team_coach(team_of_member(team_member_id))
  );
create policy shoes_self_write on shoes
  for all using (
    team_member_id = current_team_member(team_of_member(team_member_id))
  ) with check (
    team_member_id = current_team_member(team_of_member(team_member_id))
  );

-- mileage_goals: coach-set, visible to the athlete + coaches.
create policy mileage_goals_select on mileage_goals
  for select using (
    team_member_id = current_team_member(team_of_member(team_member_id))
    or is_team_coach(team_of_member(team_member_id))
  );
create policy mileage_goals_coach_write on mileage_goals
  for all using (is_team_coach(team_of_member(team_member_id)))
  with check (is_team_coach(team_of_member(team_member_id)));

-- activities: own rows (full) + coaches (full). Teammate visibility is gated by
-- the team feed toggle AND must hide `private_note`. Row policies alone can't
-- mask a single column, so the teammate feed reads through a column-omitting
-- view (see below) rather than selecting the base table directly.
create policy activities_owner_all on activities
  for all using (
    team_member_id = current_team_member(team_of_member(team_member_id))
  ) with check (
    team_member_id = current_team_member(team_of_member(team_member_id))
  );
create policy activities_coach_select on activities
  for select using (is_team_coach(team_of_member(team_member_id)));

-- Teammate-safe feed view: excludes private_note, only shows published rows,
-- and only when the team feed is visible to athletes. Athletes query THIS,
-- never the base table, for teammates' activities.
create view feed_activities
with (security_invoker = true)
as
  select
    a.id, a.team_member_id, a.type, a.title, a.started_at, a.distance_m,
    a.duration_s, a.avg_hr, a.max_hr, a.elevation_m, a.description,
    a.shoe_id, a.source, a.status
  from activities a
  join team_members tm on tm.id = a.team_member_id
  join teams t on t.id = tm.team_id
  where a.status = 'published'
    and is_team_member(t.id)
    and (t.feed_visible_to_athletes or is_team_coach(t.id));

-- NOTE: further policies (weeks, training_days, workout_details,
-- day_assignments, meets, messages, announcements, events, likes, results,
-- push_tokens, templates) are intentionally deferred to feature migrations.
-- Those tables have RLS enabled and therefore deny all access until then.
