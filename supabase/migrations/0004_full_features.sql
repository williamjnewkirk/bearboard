-- BearBoard 0004: full pilot feature set (PRD §5.3–§5.12, §6.3, §6.4).
--
-- Covers: activities (import w/ dedup + review mode), feed + likes, shoes
-- (default shoe + auto mileage), workout results/splits, meets + entries +
-- results + race-day auto-creation, race debrief RPC, messaging (DM/group/team
-- + team-chat auto-membership), announcements + 👍 reactions, schedule events +
-- targets, injury/fatigue write paths, user settings (upload mode, notification
-- prefs, reminder lead), scheduled detail release, the push notification queue
-- (triggers enqueue; the `push` edge function drains it respecting per-category
-- prefs, per-conversation mutes, and 10pm–6am team-time quiet hours), account
-- deletion, storage bucket + policies, and the remaining RLS policies.
--
-- Conventions: all writes that cross privilege lines go through SECURITY
-- DEFINER RPCs that self-check identity/role; simple owner-scoped writes use
-- plain RLS policies. Internal helpers are revoked from client roles.

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

create type upload_mode as enum ('auto', 'review');
create type reminder_lead as enum ('off', '1h', 'morning_of');

alter table users
  add column title text,
  add column upload_mode upload_mode not null default 'review',
  add column notification_prefs jsonb not null default '{}'::jsonb,
  add column reminder_lead reminder_lead not null default '1h';

alter table teams
  add column split_nudge_enabled boolean not null default false;

-- One default shoe per athlete, auto-assigned to new runs (PRD §5.10).
alter table shoes
  add column is_default boolean not null default false;
create unique index shoes_one_default_idx
  on shoes (team_member_id)
  where is_default and not retired;

create table announcement_reactions (
  announcement_id uuid not null references announcements (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, team_member_id)
);
alter table announcement_reactions enable row level security;

-- Push queue. Deny-all to clients (service role + definer triggers only).
create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  category text not null,
  title text not null,
  body text,
  data jsonb,
  ref_id uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table notification_queue enable row level security;
-- One push per trigger event, ever (anti-fatigue rule, PRD §6.4).
create unique index notification_queue_dedup_idx
  on notification_queue (user_id, category, ref_id)
  where ref_id is not null;
create index notification_queue_unsent_idx on notification_queue (created_at) where sent_at is null;

-- Hot-path indexes.
create index day_assignments_member_idx on day_assignments (team_member_id);
create index announcements_team_idx on announcements (team_id, created_at desc);
create index events_team_idx on events (team_id, starts_at);
create index meets_team_idx on meets (team_id, date);
create index activities_shoe_idx on activities (shoe_id) where shoe_id is not null;
create index workout_results_assignment_idx on workout_results (assignment_id);
create index fatigue_member_idx on fatigue_checkins (team_member_id, created_at desc);
create index training_days_week_idx on training_days (week_id);
create index conversations_team_idx on conversations (team_id);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- Safe uuid cast (used by storage policies where the path may be arbitrary).
create or replace function try_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

create or replace function team_of_conversation(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from conversations where id = p_conversation_id
$$;

-- Active member of the conversation (removed members lose access immediately).
create or replace function is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from conversation_members cm
    join team_members tm on tm.id = cm.team_member_id
    where cm.conversation_id = p_conversation_id
      and tm.user_id = current_user_id()
      and tm.status = 'active'
  )
$$;

create or replace function member_of_assignment(p_assignment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_member_id from day_assignments where id = p_assignment_id
$$;

create or replace function team_of_meet(p_meet_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from meets where id = p_meet_id
$$;

create or replace function team_of_entry(p_entry_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.team_id from meet_entries e join meets m on m.id = e.meet_id where e.id = p_entry_id
$$;

-- Can the current user see this activity? Owner and coaches always; teammates
-- only when the team feed toggle is on AND the row is published. Note this
-- governs likes/visibility joins — the private_note column is still only
-- reachable through the base table (owner/coach policies), never here.
create or replace function can_see_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from activities a
    join team_members tm on tm.id = a.team_member_id
    join teams t on t.id = tm.team_id
    where a.id = p_activity_id
      and (
        is_team_coach(t.id)
        or tm.user_id = current_user_id()
        or (is_team_member(t.id) and t.feed_visible_to_athletes and a.status = 'published')
      )
  )
$$;

-- Can the current user see this event? Coaches always; members when the event
-- has no targets (whole team) or targets them directly or via a squad.
create or replace function can_see_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from events e
    where e.id = p_event_id
      and (
        is_team_coach(e.team_id)
        or (
          is_team_member(e.team_id)
          and (
            not exists (select 1 from event_targets et where et.event_id = e.id)
            or exists (
              select 1 from event_targets et
              where et.event_id = e.id
                and (
                  et.team_member_id = current_team_member(e.team_id)
                  or et.squad_id in (
                    select sm.squad_id from squad_members sm
                    where sm.team_member_id = current_team_member(e.team_id)
                  )
                )
            )
          )
        )
      )
  )
$$;

-- Quiet hours: no pushes 10pm–6am team time (PRD §6.4).
create or replace function is_quiet_hours(p_timezone text)
returns boolean
language sql
stable
as $$
  select extract(hour from (now() at time zone coalesce(p_timezone, 'America/Chicago'))) < 6
      or extract(hour from (now() at time zone coalesce(p_timezone, 'America/Chicago'))) >= 22
$$;

revoke execute on function team_of_conversation(uuid) from public, anon, authenticated;
revoke execute on function member_of_assignment(uuid) from public, anon, authenticated;
revoke execute on function team_of_meet(uuid) from public, anon, authenticated;
revoke execute on function team_of_entry(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notification enqueue (internal)
-- ---------------------------------------------------------------------------

create or replace function enqueue_notification(
  p_team_id uuid,
  p_user_id text,
  p_category text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_ref_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into notification_queue (team_id, user_id, category, title, body, data, ref_id)
  values (p_team_id, p_user_id, p_category, p_title, left(coalesce(p_body, ''), 240), p_data, p_ref_id)
  on conflict do nothing;
end;
$$;

revoke execute on function enqueue_notification(uuid, text, text, text, text, jsonb, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notification triggers
-- ---------------------------------------------------------------------------

-- Week skeleton published -> push to every active athlete (once per week).
create or replace function trg_week_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.skeleton_published_at is not null
     and (tg_op = 'INSERT' or old.skeleton_published_at is null) then
    for r in
      select tm.user_id from team_members tm
      where tm.team_id = new.team_id and tm.role = 'athlete' and tm.status = 'active'
    loop
      perform enqueue_notification(
        new.team_id, r.user_id, 'skeleton_publish',
        'This week''s plan is up',
        'Your coach published the week of ' || to_char(new.start_date, 'Mon FMDD') || '.',
        jsonb_build_object('kind', 'week', 'week_start', new.start_date),
        new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger week_published_notify
  after insert or update of skeleton_published_at on weeks
  for each row execute function trg_week_published();

-- Workout detail released (manual or scheduled) -> push to assigned athletes.
create or replace function trg_detail_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day training_days%rowtype;
  r record;
begin
  if new.release_state = 'published' and new.published_at is not null
     and (tg_op = 'INSERT' or old.published_at is null) then
    select * into v_day from training_days where id = new.training_day_id;
    for r in
      select tm.user_id
      from day_assignments da
      join team_members tm on tm.id = da.team_member_id
      where da.training_day_id = new.training_day_id and tm.status = 'active'
    loop
      perform enqueue_notification(
        v_day.team_id, r.user_id, 'detail_release',
        trim(to_char(v_day.date, 'FMDay')) || '''s workout is posted',
        coalesce(v_day.skeleton_label, left(coalesce(new.description_rich, ''), 120)),
        jsonb_build_object('kind', 'detail', 'date', v_day.date),
        new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger detail_published_notify
  after insert or update on workout_details
  for each row execute function trg_detail_published();

-- New message -> push to conversation members except sender + muted.
create or replace function trg_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_sender text;
  v_conv_name text;
  r record;
begin
  select c.team_id, c.name into v_team, v_conv_name from conversations c where c.id = new.conversation_id;
  select u.name into v_sender
  from team_members tm join users u on u.id = tm.user_id
  where tm.id = new.sender_id;

  for r in
    select tm.user_id
    from conversation_members cm
    join team_members tm on tm.id = cm.team_member_id
    where cm.conversation_id = new.conversation_id
      and cm.team_member_id <> new.sender_id
      and not cm.muted
      and tm.status = 'active'
  loop
    perform enqueue_notification(
      v_team, r.user_id, 'message',
      coalesce(v_conv_name, coalesce(v_sender, 'New message')),
      coalesce(v_sender, 'Someone') || ': ' ||
        coalesce(nullif(new.body, ''), case when new.image_url is not null then '📷 Photo' else '' end),
      jsonb_build_object('kind', 'message', 'conversation_id', new.conversation_id),
      new.id
    );
  end loop;
  return new;
end;
$$;

create trigger message_notify
  after insert on messages
  for each row execute function trg_message_notify();

-- New announcement -> push to team or squad (minus the author).
create or replace function trg_announcement_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select tm.user_id
    from team_members tm
    where tm.team_id = new.team_id
      and tm.status = 'active'
      and tm.id is distinct from new.author_id
      and (
        new.squad_id is null
        or tm.role = 'coach'
        or exists (
          select 1 from squad_members sm
          where sm.squad_id = new.squad_id and sm.team_member_id = tm.id
        )
      )
  loop
    perform enqueue_notification(
      new.team_id, r.user_id, 'announcement',
      'New announcement',
      left(new.body_rich, 160),
      jsonb_build_object('kind', 'announcement', 'announcement_id', new.id),
      new.id
    );
  end loop;
  return new;
end;
$$;

create trigger announcement_notify
  after insert on announcements
  for each row execute function trg_announcement_notify();

-- Entered in a meet -> push to the athlete.
create or replace function trg_meet_entry_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meet meets%rowtype;
  v_user text;
begin
  if new.entered then
    select * into v_meet from meets where id = new.meet_id;
    select tm.user_id into v_user from team_members tm where tm.id = new.team_member_id;
    perform enqueue_notification(
      v_meet.team_id, v_user, 'meet_entry',
      'You''re entered: ' || v_meet.name,
      to_char(v_meet.date, 'FMDay, Mon FMDD') ||
        coalesce(' · ' || nullif(new.event, ''), ''),
      jsonb_build_object('kind', 'meet', 'meet_id', v_meet.id),
      new.id
    );
  end if;
  return new;
end;
$$;

create trigger meet_entry_notify
  after insert on meet_entries
  for each row execute function trg_meet_entry_notify();

-- New member joins (or rejoins) -> ensure they're in the team chat.
create or replace function trg_member_team_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
begin
  select id into v_conv from conversations where team_id = new.team_id and kind = 'team' limit 1;
  if v_conv is null then
    insert into conversations (team_id, kind, name)
    values (new.team_id, 'team', 'Team chat')
    returning id into v_conv;
  end if;
  if new.status = 'active' then
    insert into conversation_members (conversation_id, team_member_id)
    values (v_conv, new.id)
    on conflict do nothing;
  else
    delete from conversation_members where conversation_id = v_conv and team_member_id = new.id;
  end if;
  return new;
end;
$$;

create trigger member_team_chat
  after insert or update of status on team_members
  for each row execute function trg_member_team_chat();

-- Backfill: team chat for teams that existed before this migration.
do $$
declare
  t record;
  v_conv uuid;
begin
  for t in select id from teams loop
    select id into v_conv from conversations where team_id = t.id and kind = 'team' limit 1;
    if v_conv is null then
      insert into conversations (team_id, kind, name) values (t.id, 'team', 'Team chat')
      returning id into v_conv;
    end if;
    insert into conversation_members (conversation_id, team_member_id)
    select v_conv, tm.id from team_members tm where tm.team_id = t.id and tm.status = 'active'
    on conflict do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS policies: racing
-- ---------------------------------------------------------------------------

create policy meets_member_select on meets
  for select using (is_team_member(team_id));
create policy meets_coach_write on meets
  for all using (is_team_coach(team_id)) with check (is_team_coach(team_id));

create policy meet_entries_member_select on meet_entries
  for select using (is_team_member(team_of_meet(meet_id)));
create policy meet_entries_coach_write on meet_entries
  for all using (is_team_coach(team_of_meet(meet_id)))
  with check (is_team_coach(team_of_meet(meet_id)));

-- Objective results are team-visible (times/places are public info); the
-- reflective debrief is NOT (coach-only, policy in 0001).
create policy meet_results_member_select on meet_results
  for select using (is_team_member(team_of_entry(meet_entry_id)));
create policy meet_results_write on meet_results
  for all using (
    is_team_coach(team_of_entry(meet_entry_id))
    or is_my_member((select team_member_id from meet_entries e where e.id = meet_entry_id))
  ) with check (
    is_team_coach(team_of_entry(meet_entry_id))
    or is_my_member((select team_member_id from meet_entries e where e.id = meet_entry_id))
  );

-- ---------------------------------------------------------------------------
-- RLS policies: results, likes, push tokens
-- ---------------------------------------------------------------------------

create policy workout_results_select on workout_results
  for select using (
    is_my_member(member_of_assignment(assignment_id))
    or is_team_coach(team_of_member(member_of_assignment(assignment_id)))
  );
create policy workout_results_owner_write on workout_results
  for all using (is_my_member(member_of_assignment(assignment_id)))
  with check (is_my_member(member_of_assignment(assignment_id)));

create policy activity_likes_select on activity_likes
  for select using (can_see_activity(activity_id));
create policy activity_likes_insert on activity_likes
  for insert with check (is_my_member(team_member_id) and can_see_activity(activity_id));
create policy activity_likes_delete on activity_likes
  for delete using (is_my_member(team_member_id));

create policy push_tokens_self on push_tokens
  for all using (user_id = current_user_id()) with check (user_id = current_user_id());

-- ---------------------------------------------------------------------------
-- RLS policies: messaging
-- ---------------------------------------------------------------------------

create policy conversations_member_select on conversations
  for select using (is_conversation_member(id));

create policy conversation_members_select on conversation_members
  for select using (is_conversation_member(conversation_id));
-- Own row only: mute + read cursor.
create policy conversation_members_self_update on conversation_members
  for update using (is_my_member(team_member_id)) with check (is_my_member(team_member_id));

create policy messages_member_select on messages
  for select using (is_conversation_member(conversation_id));
create policy messages_sender_insert on messages
  for insert with check (
    is_my_member(sender_id)
    and exists (
      select 1 from conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.team_member_id = messages.sender_id
    )
  );
-- Delete-own-message = soft delete (set deleted = true).
create policy messages_sender_update on messages
  for update using (is_my_member(sender_id)) with check (is_my_member(sender_id));

-- ---------------------------------------------------------------------------
-- RLS policies: announcements + reactions
-- ---------------------------------------------------------------------------

create policy announcements_select on announcements
  for select using (
    is_team_member(team_id)
    and (
      squad_id is null
      or is_team_coach(team_id)
      or exists (
        select 1 from squad_members sm
        where sm.squad_id = announcements.squad_id
          and sm.team_member_id = current_team_member(announcements.team_id)
      )
    )
  );
create policy announcements_coach_write on announcements
  for all using (is_team_coach(team_id)) with check (is_team_coach(team_id));

create policy announcement_reactions_select on announcement_reactions
  for select using (
    exists (select 1 from announcements a where a.id = announcement_id)
  );
create policy announcement_reactions_self_write on announcement_reactions
  for all using (is_my_member(team_member_id))
  with check (
    is_my_member(team_member_id)
    and exists (select 1 from announcements a where a.id = announcement_id)
  );

-- ---------------------------------------------------------------------------
-- RLS policies: schedule
-- ---------------------------------------------------------------------------

create policy events_select on events
  for select using (can_see_event(id));
create policy events_coach_write on events
  for all using (is_team_coach(team_id)) with check (is_team_coach(team_id));

create policy event_targets_select on event_targets
  for select using (can_see_event(event_id));
create policy event_targets_coach_write on event_targets
  for all using (is_team_coach((select team_id from events e where e.id = event_id)))
  with check (is_team_coach((select team_id from events e where e.id = event_id)));

-- ---------------------------------------------------------------------------
-- Views: shoe mileage + weekly mileage rollup
-- ---------------------------------------------------------------------------

-- Current mileage per shoe = starting miles + miles of assigned activities.
-- security_invoker: RLS on shoes/activities applies (self + coaches only).
create view shoe_mileage
with (security_invoker = true)
as
  select
    s.id as shoe_id,
    s.team_member_id,
    s.start_miles
      + coalesce(sum(a.distance_m) filter (where a.status <> 'discarded'), 0) / 1609.344
      as current_miles
  from shoes s
  left join activities a on a.shoe_id = s.id
  group by s.id;

-- Monday-based weekly totals per member (published activities only).
-- security_invoker: athletes see their own weeks; coaches see the team's.
create view weekly_mileage
with (security_invoker = true)
as
  select
    a.team_member_id,
    (date_trunc('week', a.started_at at time zone t.timezone))::date as week_start,
    sum(a.distance_m) filter (where a.type = 'run') as run_m,
    sum(a.distance_m) as total_m,
    count(*) as activity_count,
    max(a.started_at) as last_activity_at
  from activities a
  join team_members tm on tm.id = a.team_member_id
  join teams t on t.id = tm.team_id
  where a.status = 'published'
  group by a.team_member_id, (date_trunc('week', a.started_at at time zone t.timezone))::date;

-- Latest injury status per member (append-only history -> current row).
create view current_injury
with (security_invoker = true)
as
  select distinct on (team_member_id)
    id, team_member_id, status, body_area, note, set_by, created_at
  from injury_statuses
  order by team_member_id, created_at desc;

-- ---------------------------------------------------------------------------
-- RPCs: activities (sync import w/ dedup + upload mode)
-- ---------------------------------------------------------------------------

-- Import a detected workout (HealthKit / Health Connect adapters call this).
-- Dedup: same source external id, OR same type starting within ±3 minutes
-- (manual + later sync double-import guard, PRD §5.3). Respects the athlete's
-- upload mode: 'review' lands in the pending tray, 'auto' publishes.
create or replace function import_activity(
  p_team_member_id uuid,
  p_type activity_type,
  p_title text,
  p_started_at timestamptz,
  p_distance_m numeric,
  p_duration_s integer,
  p_avg_hr integer default null,
  p_max_hr integer default null,
  p_elevation_m numeric default null,
  p_source activity_source default 'manual',
  p_external_id text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid text := auth.jwt() ->> 'sub';
  v_team uuid;
  v_mode upload_mode;
  v_status activity_status;
  v_shoe uuid;
  v_id uuid;
begin
  if not is_my_member(p_team_member_id) then
    raise exception 'FORBIDDEN';
  end if;
  v_team := team_of_member(p_team_member_id);

  -- Dedup on vendor id.
  if p_external_id is not null then
    select id into v_id from activities
    where team_member_id = p_team_member_id and source = p_source and external_id = p_external_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  -- Dedup on type + start ±3 min (+ similar duration when both present).
  select id into v_id from activities
  where team_member_id = p_team_member_id
    and type = p_type
    and started_at between p_started_at - interval '3 minutes' and p_started_at + interval '3 minutes'
    and (duration_s is null or p_duration_s is null or abs(duration_s - p_duration_s) <= 120)
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select upload_mode into v_mode from users where id = v_uid;
  v_status := case when v_mode = 'auto' or p_source = 'manual' then 'published' else 'pending' end;

  if p_type = 'run' then
    select id into v_shoe from shoes
    where team_member_id = p_team_member_id and is_default and not retired
    limit 1;
  end if;

  insert into activities (team_member_id, type, title, started_at, distance_m, duration_s,
                          avg_hr, max_hr, elevation_m, shoe_id, source, external_id, status)
  values (p_team_member_id, p_type,
          coalesce(nullif(trim(coalesce(p_title, '')), ''), initcap(p_type::text)),
          p_started_at, p_distance_m, p_duration_s, p_avg_hr, p_max_hr, p_elevation_m,
          v_shoe, p_source, p_external_id, v_status)
  returning id into v_id;

  if v_status = 'pending' then
    perform enqueue_notification(
      v_team, v_uid, 'pending_review',
      'New activity to review',
      coalesce(p_title, initcap(p_type::text)) || ' is waiting in your review tray.',
      jsonb_build_object('kind', 'pending_activity', 'activity_id', v_id),
      v_id
    );
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: workout results (splits)
-- ---------------------------------------------------------------------------

create or replace function submit_workout_result(
  p_assignment_id uuid,
  p_splits jsonb,
  p_rpe smallint,
  p_comment text,
  p_activity_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_my_member(member_of_assignment(p_assignment_id)) then
    raise exception 'FORBIDDEN';
  end if;

  select id into v_id from workout_results where assignment_id = p_assignment_id limit 1;
  if v_id is null then
    insert into workout_results (assignment_id, activity_id, splits, rpe, comment)
    values (p_assignment_id, p_activity_id, p_splits, p_rpe, nullif(trim(coalesce(p_comment, '')), ''))
    returning id into v_id;
  else
    update workout_results
      set splits = p_splits,
          rpe = p_rpe,
          comment = nullif(trim(coalesce(p_comment, '')), ''),
          activity_id = coalesce(p_activity_id, activity_id),
          submitted_at = now()
      where id = v_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: meets, entries, results, debriefs
-- ---------------------------------------------------------------------------

create or replace function save_meet(
  p_team_id uuid,
  p_meet_id uuid,
  p_name text,
  p_date date,
  p_location text default null,
  p_course text default null,
  p_meet_type meet_type default null,
  p_departure_at timestamptz default null,
  p_notes text default null,
  p_is_goal_race boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := p_meet_id;
begin
  if not is_team_coach(p_team_id) then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null or p_date is null then
    raise exception 'MEET_NAME_AND_DATE_REQUIRED';
  end if;

  if v_id is null then
    insert into meets (team_id, name, date, location, course, meet_type, departure_at, notes, is_goal_race)
    values (p_team_id, trim(p_name), p_date, p_location, p_course, p_meet_type, p_departure_at, p_notes,
            coalesce(p_is_goal_race, false))
    returning id into v_id;
  else
    update meets
      set name = trim(p_name), date = p_date, location = p_location, course = p_course,
          meet_type = p_meet_type, departure_at = p_departure_at, notes = p_notes,
          is_goal_race = coalesce(p_is_goal_race, false)
      where id = v_id and team_id = p_team_id;
  end if;
  return v_id;
end;
$$;

-- Enter/withdraw an athlete (with optional per-athlete event). Entering
-- auto-creates the Race training day + the athlete's assignment (PRD §5.9a).
create or replace function set_meet_entry(
  p_meet_id uuid,
  p_team_member_id uuid,
  p_entered boolean,
  p_event text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_meet meets%rowtype;
  v_week_start date;
  v_week_id uuid;
  v_td training_days%rowtype;
  v_asg_id uuid;
begin
  select * into v_meet from meets where id = p_meet_id;
  if v_meet.id is null or not is_team_coach(v_meet.team_id) then
    raise exception 'FORBIDDEN';
  end if;
  if team_of_member(p_team_member_id) is distinct from v_meet.team_id then
    raise exception 'NOT_ON_TEAM';
  end if;

  insert into meet_entries (meet_id, team_member_id, event, entered)
  values (p_meet_id, p_team_member_id, nullif(trim(coalesce(p_event, '')), ''), p_entered)
  on conflict (meet_id, team_member_id) do update
    set entered = excluded.entered, event = excluded.event;

  -- Ensure the calendar day exists (Monday-based week).
  v_week_start := (v_meet.date - ((extract(isodow from v_meet.date))::int - 1));
  insert into weeks (team_id, start_date) values (v_meet.team_id, v_week_start)
    on conflict (team_id, start_date) do nothing;
  select id into v_week_id from weeks where team_id = v_meet.team_id and start_date = v_week_start;

  select * into v_td from training_days where team_id = v_meet.team_id and date = v_meet.date;
  if v_td.id is null then
    insert into training_days (team_id, week_id, date, day_type, skeleton_label, created_by)
    values (v_meet.team_id, v_week_id, v_meet.date, 'race', v_meet.name,
            current_team_member(v_meet.team_id))
    returning * into v_td;
  end if;

  insert into day_assignments (training_day_id, team_member_id)
  values (v_td.id, p_team_member_id)
  on conflict (training_day_id, team_member_id) do nothing;

  if p_entered then
    -- If the team day isn't a race day, mark THIS athlete's day as a race.
    if v_td.day_type <> 'race' then
      update day_assignments
        set overrides = coalesce(overrides, '{}'::jsonb)
              || jsonb_build_object('day_type', 'race', 'skeleton_label', v_meet.name)
        where training_day_id = v_td.id and team_member_id = p_team_member_id;
    end if;
  else
    -- Withdrawn: clear a race override we may have set.
    update day_assignments
      set overrides = (coalesce(overrides, '{}'::jsonb) - 'day_type') - 'skeleton_label'
      where training_day_id = v_td.id
        and team_member_id = p_team_member_id
        and coalesce(overrides ->> 'day_type', '') = 'race'
        and v_td.day_type <> 'race';
  end if;
end;
$$;

-- Objective result: athlete-entered by default, coach-correctable (PRD §9.1).
create or replace function save_meet_result(
  p_meet_entry_id uuid,
  p_mark text,
  p_place integer,
  p_splits jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_team uuid := team_of_entry(p_meet_entry_id);
  v_owner uuid;
  v_id uuid;
begin
  select team_member_id into v_owner from meet_entries where id = p_meet_entry_id;
  if not (is_team_coach(v_team) or is_my_member(v_owner)) then
    raise exception 'FORBIDDEN';
  end if;

  select id into v_id from meet_results where meet_entry_id = p_meet_entry_id limit 1;
  if v_id is null then
    insert into meet_results (meet_entry_id, mark, place, splits, entered_by)
    values (p_meet_entry_id, nullif(trim(coalesce(p_mark, '')), ''), p_place, p_splits,
            current_team_member(v_team))
    returning id into v_id;
  else
    update meet_results
      set mark = nullif(trim(coalesce(p_mark, '')), ''), place = p_place, splits = p_splits,
          entered_by = current_team_member(v_team)
      where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Race debrief upsert. Author-only write; reads are locked down in 0001
-- (athlete + coaches, never teammates). Edit history is not surfaced.
create or replace function save_race_debrief(
  p_meet_entry_id uuid,
  p_went_well text,
  p_didnt_go_well text,
  p_prep_done_well text,
  p_prep_would_change text,
  p_academic_stress smallint,
  p_academic_stress_note text,
  p_fatigue smallint,
  p_fatigue_note text,
  p_sleep_fueling_note text,
  p_note_to_coach text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_id uuid;
begin
  select team_member_id into v_owner from meet_entries where id = p_meet_entry_id;
  if v_owner is null or not is_my_member(v_owner) then
    raise exception 'FORBIDDEN';
  end if;

  insert into race_debriefs (meet_entry_id, team_member_id, went_well, didnt_go_well,
                             prep_done_well, prep_would_change, academic_stress,
                             academic_stress_note, fatigue, fatigue_note,
                             sleep_fueling_note, note_to_coach, submitted_at)
  values (p_meet_entry_id, v_owner, p_went_well, p_didnt_go_well, p_prep_done_well,
          p_prep_would_change, p_academic_stress, p_academic_stress_note, p_fatigue,
          p_fatigue_note, p_sleep_fueling_note, p_note_to_coach, now())
  on conflict (meet_entry_id) do update
    set went_well = excluded.went_well,
        didnt_go_well = excluded.didnt_go_well,
        prep_done_well = excluded.prep_done_well,
        prep_would_change = excluded.prep_would_change,
        academic_stress = excluded.academic_stress,
        academic_stress_note = excluded.academic_stress_note,
        fatigue = excluded.fatigue,
        fatigue_note = excluded.fatigue_note,
        sleep_fueling_note = excluded.sleep_fueling_note,
        note_to_coach = excluded.note_to_coach,
        submitted_at = coalesce(race_debriefs.submitted_at, now()),
        updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function delete_meet(p_meet_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not is_team_coach(team_of_meet(p_meet_id)) then
    raise exception 'FORBIDDEN';
  end if;
  delete from meets where id = p_meet_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: messaging
-- ---------------------------------------------------------------------------

-- Find-or-create the DM between me and another member of the same team.
create or replace function create_dm(p_team_id uuid, p_other_member_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := current_team_member(p_team_id);
  v_conv uuid;
begin
  if v_me is null then
    raise exception 'FORBIDDEN';
  end if;
  if team_of_member(p_other_member_id) is distinct from p_team_id or p_other_member_id = v_me then
    raise exception 'INVALID_MEMBER';
  end if;

  select c.id into v_conv
  from conversations c
  where c.team_id = p_team_id and c.kind = 'dm'
    and exists (select 1 from conversation_members m1
                where m1.conversation_id = c.id and m1.team_member_id = v_me)
    and exists (select 1 from conversation_members m2
                where m2.conversation_id = c.id and m2.team_member_id = p_other_member_id)
  limit 1;
  if v_conv is not null then
    return v_conv;
  end if;

  insert into conversations (team_id, kind) values (p_team_id, 'dm') returning id into v_conv;
  insert into conversation_members (conversation_id, team_member_id)
  values (v_conv, v_me), (v_conv, p_other_member_id);
  return v_conv;
end;
$$;

-- Group chat. Athlete-created groups may contain athletes only (PRD §4.4);
-- coaches can create groups with anyone.
create or replace function create_group(p_team_id uuid, p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := current_team_member(p_team_id);
  v_is_coach boolean := is_team_coach(p_team_id);
  v_conv uuid;
  v_mid uuid;
begin
  if v_me is null then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'GROUP_NAME_REQUIRED';
  end if;

  foreach v_mid in array p_member_ids loop
    if team_of_member(v_mid) is distinct from p_team_id then
      raise exception 'INVALID_MEMBER';
    end if;
    if not v_is_coach then
      if exists (select 1 from team_members tm where tm.id = v_mid and tm.role = 'coach') then
        raise exception 'ATHLETE_GROUPS_ARE_ATHLETES_ONLY';
      end if;
    end if;
  end loop;

  insert into conversations (team_id, kind, name)
  values (p_team_id, 'group', trim(p_name))
  returning id into v_conv;

  insert into conversation_members (conversation_id, team_member_id)
  select v_conv, m from unnest(p_member_ids || v_me) as m
  on conflict do nothing;
  return v_conv;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: planning additions (scheduled release, notify-on-edit, copy week)
-- ---------------------------------------------------------------------------

-- Replaces 0003's save_workout_detail with release scheduling + opt-in edit
-- notifications. Old 4-arg calls still work (new params have defaults).
drop function if exists save_workout_detail(uuid, text, jsonb, boolean);

create or replace function save_workout_detail(
  p_training_day_id uuid,
  p_description_rich text,
  p_rep_scheme jsonb,
  p_publish boolean,
  p_release_at timestamptz default null,
  p_notify boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_team uuid := team_of_training_day(p_training_day_id);
  v_day training_days%rowtype;
  v_member uuid;
  v_id uuid;
  v_was_published boolean := false;
  v_state release_state;
  r record;
begin
  if not is_team_coach(v_team) then
    raise exception 'FORBIDDEN';
  end if;
  v_member := current_team_member(v_team);
  select * into v_day from training_days where id = p_training_day_id;

  select id, (release_state = 'published') into v_id, v_was_published
  from workout_details where training_day_id = p_training_day_id limit 1;

  -- Publish now beats a pending schedule; a published detail stays published.
  v_state := case
    when p_publish or coalesce(v_was_published, false) then 'published'
    when p_release_at is not null then 'scheduled'
    else 'draft'
  end;

  if v_id is null then
    insert into workout_details (training_day_id, description_rich, rep_scheme, release_state,
                                 release_at, published_at, created_by)
    values (p_training_day_id, p_description_rich, p_rep_scheme, v_state,
            case when v_state = 'scheduled' then p_release_at else null end,
            case when v_state = 'published' then now() else null end, v_member)
    returning id into v_id;
  else
    update workout_details
      set description_rich = p_description_rich,
          rep_scheme = p_rep_scheme,
          release_state = v_state,
          release_at = case when v_state = 'scheduled' then p_release_at else null end,
          published_at = case when v_state = 'published' then coalesce(published_at, now()) else published_at end,
          updated_at = now()
      where id = v_id;

    -- Edits to an already-published detail only push when the coach opts in
    -- ("typo fixes shouldn't buzz 55 phones", PRD §6.4).
    if v_was_published and p_notify then
      for r in
        select tm.user_id
        from day_assignments da
        join team_members tm on tm.id = da.team_member_id
        where da.training_day_id = p_training_day_id and tm.status = 'active'
      loop
        perform enqueue_notification(
          v_team, r.user_id, 'detail_update',
          trim(to_char(v_day.date, 'FMDay')) || '''s workout was updated',
          coalesce(v_day.skeleton_label, left(coalesce(p_description_rich, ''), 120)),
          jsonb_build_object('kind', 'detail', 'date', v_day.date),
          null
        );
      end loop;
    end if;
  end if;

  return v_id;
end;
$$;

-- Publish any scheduled details whose time has come. Idempotent and safe for
-- any caller (it only does what a coach already scheduled); also run by the
-- push edge function every minute.
create or replace function release_due_details()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update workout_details
    set release_state = 'published',
        published_at = now(),
        updated_at = now()
    where release_state = 'scheduled'
      and release_at is not null
      and release_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Copy a week's skeleton (and optionally details, as drafts) to another week.
-- The coach's weeks are highly repetitive in shape (PRD §5.2.3).
create or replace function copy_week(
  p_team_id uuid,
  p_from_start date,
  p_to_start date,
  p_include_details boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_to_week uuid;
  d record;
  v_new_td uuid;
begin
  if not is_team_coach(p_team_id) then
    raise exception 'FORBIDDEN';
  end if;
  v_member := current_team_member(p_team_id);

  insert into weeks (team_id, start_date) values (p_team_id, p_to_start)
    on conflict (team_id, start_date) do nothing;
  select id into v_to_week from weeks where team_id = p_team_id and start_date = p_to_start;

  for d in
    select td.*, wd.description_rich as d_desc, wd.rep_scheme as d_scheme
    from training_days td
    left join workout_details wd on wd.training_day_id = td.id
    join weeks w on w.id = td.week_id
    where td.team_id = p_team_id and w.start_date = p_from_start
  loop
    insert into training_days (team_id, week_id, date, day_type, skeleton_label, created_by)
    values (p_team_id, v_to_week, p_to_start + (d.date - p_from_start), d.day_type,
            d.skeleton_label, v_member)
    on conflict (team_id, date) do update
      set day_type = excluded.day_type,
          skeleton_label = excluded.skeleton_label,
          week_id = excluded.week_id
    returning id into v_new_td;

    if p_include_details and (d.d_desc is not null or d.d_scheme is not null)
       and not exists (select 1 from workout_details where training_day_id = v_new_td) then
      insert into workout_details (training_day_id, description_rich, rep_scheme, release_state, created_by)
      values (v_new_td, d.d_desc, d.d_scheme, 'draft', v_member);
    end if;
  end loop;
end;
$$;

-- Save/overwrite a reusable workout template (PRD §5.2.2).
create or replace function save_template(
  p_team_id uuid,
  p_name text,
  p_description_rich text,
  p_rep_scheme jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_team_coach(p_team_id) then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'TEMPLATE_NAME_REQUIRED';
  end if;

  select id into v_id from workout_templates where team_id = p_team_id and name = trim(p_name) limit 1;
  if v_id is null then
    insert into workout_templates (team_id, name, description_rich, rep_scheme, created_by)
    values (p_team_id, trim(p_name), p_description_rich, p_rep_scheme, current_team_member(p_team_id))
    returning id into v_id;
  else
    update workout_templates
      set description_rich = p_description_rich, rep_scheme = p_rep_scheme
      where id = v_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: injury status (coach-attributed edits)
-- ---------------------------------------------------------------------------

create or replace function set_injury_status(
  p_team_member_id uuid,
  p_status injury_status,
  p_body_area body_area default null,
  p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_team uuid := team_of_member(p_team_member_id);
  v_id uuid;
begin
  if not (is_my_member(p_team_member_id) or is_team_coach(v_team)) then
    raise exception 'FORBIDDEN';
  end if;
  insert into injury_statuses (team_member_id, status, body_area, note, set_by)
  values (p_team_member_id, p_status,
          case when p_status = 'healthy' then null else p_body_area end,
          nullif(trim(coalesce(p_note, '')), ''), current_team_member(v_team))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: profile + account deletion
-- ---------------------------------------------------------------------------

-- Adds coach title to 0003's update_profile (drop first: same name, new args).
drop function if exists update_profile(text, text, text);

create or replace function update_profile(
  p_name text,
  p_class_year text,
  p_events text,
  p_title text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid text := auth.jwt() ->> 'sub';
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update users
    set name = coalesce(nullif(trim(p_name), ''), name),
        class_year = nullif(trim(coalesce(p_class_year, '')), ''),
        events = nullif(trim(coalesce(p_events, '')), ''),
        title = nullif(trim(coalesce(p_title, '')), '')
    where id = v_uid;
end;
$$;

-- Account deletion (PRD §5.12): hard-delete personal data; anonymize
-- team-facing records ("Former member"). The client then deletes the Clerk
-- identity and signs out.
create or replace function delete_account()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid text := auth.jwt() ->> 'sub';
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Personal data: gone.
  delete from race_debriefs rd using team_members tm
    where rd.team_member_id = tm.id and tm.user_id = v_uid;
  delete from injury_statuses i using team_members tm
    where i.team_member_id = tm.id and tm.user_id = v_uid;
  delete from fatigue_checkins f using team_members tm
    where f.team_member_id = tm.id and tm.user_id = v_uid;
  delete from activities a using team_members tm
    where a.team_member_id = tm.id and tm.user_id = v_uid;
  delete from shoes s using team_members tm
    where s.team_member_id = tm.id and tm.user_id = v_uid;
  delete from push_tokens where user_id = v_uid;
  delete from notification_queue where user_id = v_uid;

  -- Team-facing records stay but render as "Former member".
  update users
    set name = 'Former member', photo_url = null, class_year = null, events = null,
        title = null, notification_prefs = '{}'::jsonb
    where id = v_uid;

  update team_members set status = 'removed' where user_id = v_uid and status = 'active';
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled/derived notifications (run by the push edge function)
-- ---------------------------------------------------------------------------

-- Enqueue time-derived notifications: event reminders (per-athlete lead),
-- race-day-tomorrow, the single evening debrief prompt, and the optional
-- coach-enabled split nudge. Idempotent via the queue's dedup index.
create or replace function enqueue_due_notifications()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Event reminders. '1h': within the hour before start. 'morning_of': after
  -- 6am team time on the event day. 'off': never.
  for r in
    select e.id as event_id, e.team_id, e.title, e.starts_at, e.location,
           tm.user_id, u.reminder_lead, t.timezone
    from events e
    join teams t on t.id = e.team_id
    join team_members tm on tm.team_id = e.team_id and tm.status = 'active'
    join users u on u.id = tm.user_id
    where e.starts_at between now() - interval '15 minutes' and now() + interval '25 hours'
      and u.reminder_lead <> 'off'
      and (
        not exists (select 1 from event_targets et where et.event_id = e.id)
        or exists (
          select 1 from event_targets et
          where et.event_id = e.id
            and (et.team_member_id = tm.id
                 or et.squad_id in (select sm.squad_id from squad_members sm
                                    where sm.team_member_id = tm.id))
        )
      )
      and (
        (u.reminder_lead = '1h' and e.starts_at <= now() + interval '1 hour')
        or (u.reminder_lead = 'morning_of'
            and (e.starts_at at time zone t.timezone)::date = (now() at time zone t.timezone)::date
            and extract(hour from (now() at time zone t.timezone)) >= 6)
      )
  loop
    perform enqueue_notification(
      r.team_id, r.user_id, 'event_reminder',
      r.title,
      to_char(r.starts_at at time zone r.timezone, 'FMHH12:MI AM')
        || coalesce(' · ' || nullif(r.location, ''), ''),
      jsonb_build_object('kind', 'event', 'event_id', r.event_id),
      r.event_id
    );
  end loop;

  -- Race day tomorrow (entered athletes).
  for r in
    select m.id as meet_id, m.team_id, m.name, tm.user_id
    from meets m
    join teams t on t.id = m.team_id
    join meet_entries me on me.meet_id = m.id and me.entered
    join team_members tm on tm.id = me.team_member_id and tm.status = 'active'
    where m.date = ((now() at time zone t.timezone)::date + 1)
  loop
    perform enqueue_notification(
      r.team_id, r.user_id, 'race_reminder',
      'Race day tomorrow',
      r.name,
      jsonb_build_object('kind', 'meet', 'meet_id', r.meet_id),
      r.meet_id
    );
  end loop;

  -- Debrief prompt: the evening after a meet, once, for entered athletes who
  -- haven't submitted (single reminder, then it lives in pending items).
  for r in
    select me.id as entry_id, m.team_id, m.name, tm.user_id
    from meets m
    join teams t on t.id = m.team_id
    join meet_entries me on me.meet_id = m.id and me.entered
    join team_members tm on tm.id = me.team_member_id and tm.status = 'active'
    where m.date = (now() at time zone t.timezone)::date
      and extract(hour from (now() at time zone t.timezone)) >= 18
      and not exists (
        select 1 from race_debriefs rd
        where rd.meet_entry_id = me.id and rd.submitted_at is not null
      )
  loop
    perform enqueue_notification(
      r.team_id, r.user_id, 'debrief_prompt',
      'Log your race debrief',
      r.name || ' — while it''s fresh. Only your coaches can see it.',
      jsonb_build_object('kind', 'debrief', 'meet_entry_id', r.entry_id),
      r.entry_id
    );
  end loop;

  -- Split nudge (coach-enabled per team, off by default): evening of a workout
  -- day, athletes with a published detail and no submitted result.
  for r in
    select da.id as assignment_id, td.team_id, tm.user_id
    from training_days td
    join teams t on t.id = td.team_id and t.split_nudge_enabled
    join day_assignments da on da.training_day_id = td.id
    join team_members tm on tm.id = da.team_member_id and tm.status = 'active'
    join workout_details wd on wd.training_day_id = td.id and wd.release_state = 'published'
    where td.date = (now() at time zone t.timezone)::date
      and coalesce(da.overrides ->> 'day_type', td.day_type::text) = 'workout'
      and extract(hour from (now() at time zone t.timezone)) >= 19
      and not exists (select 1 from workout_results wr where wr.assignment_id = da.id)
  loop
    perform enqueue_notification(
      r.team_id, r.user_id, 'split_nudge',
      'Log your splits',
      'How did today''s workout go?',
      jsonb_build_object('kind', 'splits', 'assignment_id', r.assignment_id),
      r.assignment_id
    );
  end loop;

  -- Housekeeping: drop sent rows after 30 days.
  delete from notification_queue where sent_at is not null and sent_at < now() - interval '30 days';
end;
$$;

-- Claim unsent queue rows (skipping quiet hours) and return one row per push
-- token, filtered by per-category user prefs. Rows are marked sent whether or
-- not the user has tokens/prefs, so the queue never grows unbounded.
create or replace function claim_due_pushes(p_limit integer default 500)
returns table (queue_id uuid, expo_token text, title text, body text, data jsonb)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select q.id, q.user_id, q.category, q.title as q_title, q.body as q_body, q.data as q_data
    from notification_queue q
    join teams t on t.id = q.team_id
    where q.sent_at is null
      and not is_quiet_hours(t.timezone)
    order by q.created_at
    limit p_limit
    for update of q skip locked
  ),
  claimed as (
    update notification_queue nq set sent_at = now()
    where nq.id in (select id from due)
  )
  select d.id, pt.expo_token, d.q_title, d.q_body, d.q_data
  from due d
  join users u on u.id = d.user_id
  join push_tokens pt on pt.user_id = d.user_id
  where coalesce((u.notification_prefs ->> d.category)::boolean, true);
end;
$$;

revoke execute on function enqueue_due_notifications() from public, anon, authenticated;
revoke execute on function claim_due_pushes(integer) from public, anon, authenticated;
grant execute on function enqueue_due_notifications() to service_role;
grant execute on function claim_due_pushes(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: chat/announcement images (per-team paths, team-member access only;
-- clients render via short-lived signed URLs — PRD §6.3)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

create policy images_team_select on storage.objects
  for select using (
    bucket_id = 'images'
    and try_uuid((storage.foldername(name))[1]) is not null
    and is_team_member(try_uuid((storage.foldername(name))[1]))
  );

create policy images_team_insert on storage.objects
  for insert with check (
    bucket_id = 'images'
    and try_uuid((storage.foldername(name))[1]) is not null
    and is_team_member(try_uuid((storage.foldername(name))[1]))
  );
