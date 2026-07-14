-- BearBoard 0003: planning core (PRD Â§5.2 / Week 2).
--
-- The two-layer model:
--   Layer 1 (week skeleton): training_days.day_type + skeleton_label, made
--     visible by weeks.skeleton_published_at. Publishing a week also fans out
--     day_assignments (one per active athlete per day) so athletes can see the
--     week and seen-receipts work.
--   Layer 2 (workout detail): workout_details, released independently per day
--     via release_state (draft -> published), with its own published_at clock.
--
-- Reads are governed by RLS (below); all writes go through SECURITY DEFINER
-- RPCs that check coach/ownership, so clients never mutate these tables directly.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Is the given team_member the current user's own membership?
create or replace function is_my_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    where tm.id = p_member_id and tm.user_id = current_user_id() and tm.status = 'active'
  )
$$;

create or replace function team_of_training_day(p_td_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from training_days where id = p_td_id
$$;

-- ---------------------------------------------------------------------------
-- SELECT policies (writes are via RPCs)
-- ---------------------------------------------------------------------------

create policy weeks_select on weeks
  for select using (is_team_member(team_id));

-- Coaches see every day (incl. unpublished skeletons); athletes only see a
-- day once its week skeleton is published.
create policy training_days_select on training_days
  for select using (
    is_team_member(team_id)
    and (
      is_team_coach(team_id)
      or exists (
        select 1 from weeks w
        where w.id = training_days.week_id and w.skeleton_published_at is not null
      )
    )
  );

-- Coaches see every detail; athletes see a detail only once it is published AND
-- they have an assignment for that day.
create policy workout_details_select on workout_details
  for select using (
    is_team_coach(team_of_training_day(training_day_id))
    or (
      release_state = 'published'
      and exists (
        select 1 from day_assignments da
        join team_members tm on tm.id = da.team_member_id
        where da.training_day_id = workout_details.training_day_id
          and tm.user_id = current_user_id()
      )
    )
  );

-- Coaches see all assignments on their team; athletes see their own.
create policy day_assignments_select on day_assignments
  for select using (
    is_team_coach(team_of_training_day(training_day_id))
    or is_my_member(team_member_id)
  );

create policy workout_templates_coach on workout_templates
  for all using (is_team_coach(team_id)) with check (is_team_coach(team_id));

-- ---------------------------------------------------------------------------
-- Coach RPCs
-- ---------------------------------------------------------------------------

-- Ensure a week row exists for a team + Monday start date; returns its id.
create or replace function ensure_week(p_team_id uuid, p_week_start date)
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
  insert into weeks (team_id, start_date) values (p_team_id, p_week_start)
    on conflict (team_id, start_date) do nothing;
  select id into v_id from weeks where team_id = p_team_id and start_date = p_week_start;
  return v_id;
end;
$$;

-- Upsert a day's skeleton (day_type + label). Ensures the week exists.
create or replace function set_training_day(
  p_team_id uuid,
  p_week_start date,
  p_date date,
  p_day_type day_type,
  p_skeleton_label text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_week_id uuid;
  v_member uuid;
  v_td_id uuid;
begin
  if not is_team_coach(p_team_id) then
    raise exception 'FORBIDDEN';
  end if;
  v_week_id := ensure_week(p_team_id, p_week_start);
  v_member := current_team_member(p_team_id);

  insert into training_days (team_id, week_id, date, day_type, skeleton_label, created_by)
  values (p_team_id, v_week_id, p_date, p_day_type, nullif(trim(coalesce(p_skeleton_label, '')), ''), v_member)
  on conflict (team_id, date) do update
    set day_type = excluded.day_type,
        skeleton_label = excluded.skeleton_label,
        week_id = excluded.week_id
  returning id into v_td_id;

  return v_td_id;
end;
$$;

-- Publish a week's skeleton: mark it visible + fan out assignments to every
-- active athlete for every day in the week.
create or replace function publish_week(p_team_id uuid, p_week_start date)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_week_id uuid;
begin
  if not is_team_coach(p_team_id) then
    raise exception 'FORBIDDEN';
  end if;
  v_week_id := ensure_week(p_team_id, p_week_start);

  update weeks set skeleton_published_at = now() where id = v_week_id;

  insert into day_assignments (training_day_id, team_member_id)
  select td.id, tm.id
  from training_days td
  cross join team_members tm
  where td.week_id = v_week_id
    and tm.team_id = p_team_id
    and tm.role = 'athlete'
    and tm.status = 'active'
  on conflict (training_day_id, team_member_id) do nothing;
end;
$$;

-- Save a day's detail. p_publish=true releases it now (sets published_at).
create or replace function save_workout_detail(
  p_training_day_id uuid,
  p_description_rich text,
  p_rep_scheme jsonb,
  p_publish boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_team uuid := team_of_training_day(p_training_day_id);
  v_member uuid;
  v_id uuid;
  v_state release_state := case when p_publish then 'published' else 'draft' end;
begin
  if not is_team_coach(v_team) then
    raise exception 'FORBIDDEN';
  end if;
  v_member := current_team_member(v_team);

  select id into v_id from workout_details where training_day_id = p_training_day_id limit 1;

  if v_id is null then
    insert into workout_details (training_day_id, description_rich, rep_scheme, release_state,
                                 published_at, created_by)
    values (p_training_day_id, p_description_rich, p_rep_scheme, v_state,
            case when p_publish then now() else null end, v_member)
    returning id into v_id;
  else
    update workout_details
      set description_rich = p_description_rich,
          rep_scheme = p_rep_scheme,
          release_state = v_state,
          published_at = case when p_publish then coalesce(published_at, now()) else published_at end,
          updated_at = now()
      where id = v_id;
  end if;

  return v_id;
end;
$$;

-- Per-athlete override (day_type replacement and/or note and/or param tweaks).
create or replace function set_assignment_override(
  p_assignment_id uuid,
  p_overrides jsonb,
  p_note text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_of_training_day(da.training_day_id) into v_team
  from day_assignments da where da.id = p_assignment_id;
  if v_team is null or not is_team_coach(v_team) then
    raise exception 'FORBIDDEN';
  end if;

  update day_assignments
    set overrides = p_overrides,
        note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_assignment_id;
end;
$$;

create or replace function set_mileage_goal(
  p_team_member_id uuid,
  p_week_id uuid,
  p_goal_low numeric,
  p_goal_high numeric,
  p_qualifier text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_team uuid := team_of_member(p_team_member_id);
begin
  if not is_team_coach(v_team) then
    raise exception 'FORBIDDEN';
  end if;
  insert into mileage_goals (team_member_id, week_id, goal_low, goal_high, qualifier)
  values (p_team_member_id, p_week_id, p_goal_low, p_goal_high,
          nullif(trim(coalesce(p_qualifier, '')), ''))
  on conflict (team_member_id, week_id) do update
    set goal_low = excluded.goal_low,
        goal_high = excluded.goal_high,
        qualifier = excluded.qualifier;
end;
$$;

-- ---------------------------------------------------------------------------
-- Athlete RPCs (seen receipts / acknowledgment)
-- ---------------------------------------------------------------------------

create or replace function mark_skeleton_seen(p_assignment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update day_assignments
    set skeleton_seen_at = coalesce(skeleton_seen_at, now())
    where id = p_assignment_id and is_my_member(team_member_id);
end;
$$;

create or replace function mark_detail_seen(p_assignment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update day_assignments
    set detail_seen_at = coalesce(detail_seen_at, now())
    where id = p_assignment_id and is_my_member(team_member_id);
end;
$$;

create or replace function confirm_assignment(p_assignment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update day_assignments
    set confirmed_at = coalesce(confirmed_at, now()),
        detail_seen_at = coalesce(detail_seen_at, now())
    where id = p_assignment_id and is_my_member(team_member_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile (smaller item): athletes set their own class year + events.
-- ---------------------------------------------------------------------------

create or replace function update_profile(
  p_name text,
  p_class_year text,
  p_events text
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
        events = nullif(trim(coalesce(p_events, '')), '')
    where id = v_uid;
end;
$$;
