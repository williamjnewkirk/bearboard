-- BearBoard 0002: team onboarding (PRD Week 1).
--
-- Adds the RPCs and policies needed for: first-sign-in profile sync, team
-- creation (coach), join-code redemption, code regeneration, leaving a team,
-- and roster visibility (teammates can read each other's user profiles).
--
-- All RPCs are SECURITY DEFINER (they must write across tables the caller
-- can't), self-check identity via the Clerk `sub` claim, and set search_path.

-- ---------------------------------------------------------------------------
-- Internal helpers (NOT callable by clients)
-- ---------------------------------------------------------------------------

-- 8-char code from an unambiguous alphabet (no I/L/O/0/1).
create or replace function generate_join_code()
returns text
language sql
volatile
set search_path = public
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random() * 31) + 1)::int, 1), '')
  from generate_series(1, 8)
$$;

-- Mint a unique active join code for a team+role (retries on collision).
create or replace function mint_join_code(p_team_id uuid, p_role role)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := generate_join_code();
    begin
      insert into join_codes (team_id, role, code) values (p_team_id, p_role, v_code);
      return v_code;
    exception
      when unique_violation then
        -- collision: loop and try another code
    end;
  end loop;
end;
$$;

-- Ensure a users row exists for the current Clerk user (stub name if unknown).
create or replace function ensure_user_row(p_name text default null)
returns text
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
  insert into users (id, name)
  values (v_uid, coalesce(nullif(trim(p_name), ''), 'New member'))
  on conflict (id) do nothing;
  return v_uid;
end;
$$;

-- Internal helpers must not be callable from the API.
revoke execute on function generate_join_code() from public, anon, authenticated;
revoke execute on function mint_join_code(uuid, role) from public, anon, authenticated;
revoke execute on function ensure_user_row(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client-callable RPCs
-- ---------------------------------------------------------------------------

-- Upsert the caller's profile from Clerk data. Called on every app load.
create or replace function sync_user(p_name text default null, p_photo_url text default null)
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
  insert into users (id, name, photo_url)
  values (v_uid, coalesce(nullif(trim(p_name), ''), 'New member'), p_photo_url)
  on conflict (id) do update
    set name      = coalesce(nullif(trim(excluded.name), ''), users.name),
        photo_url = coalesce(excluded.photo_url, users.photo_url);
end;
$$;

-- Create a team; caller becomes its coach. Generates both join codes and the
-- two default squads (Men, Women) per PRD 4.3. Returns ids + codes.
create or replace function create_team(p_name text, p_school text default null, p_user_name text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid text;
  v_team_id uuid;
  v_athlete_code text;
  v_coach_code text;
begin
  v_uid := ensure_user_row(p_user_name);

  if nullif(trim(p_name), '') is null then
    raise exception 'TEAM_NAME_REQUIRED';
  end if;

  insert into teams (name, school)
  values (trim(p_name), nullif(trim(coalesce(p_school, '')), ''))
  returning id into v_team_id;

  insert into team_members (team_id, user_id, role) values (v_team_id, v_uid, 'coach');

  v_athlete_code := mint_join_code(v_team_id, 'athlete');
  v_coach_code := mint_join_code(v_team_id, 'coach');

  insert into squads (team_id, name) values (v_team_id, 'Men'), (v_team_id, 'Women');

  return jsonb_build_object(
    'team_id', v_team_id,
    'athlete_code', v_athlete_code,
    'coach_code', v_coach_code
  );
end;
$$;

-- Redeem a join code. Role comes from the code used. Re-joining reactivates a
-- removed membership (coach controls access by rotating codes).
create or replace function join_team_with_code(p_code text, p_user_name text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid text;
  v_jc join_codes%rowtype;
begin
  v_uid := ensure_user_row(p_user_name);

  select * into v_jc
  from join_codes
  where code = upper(trim(p_code)) and active;

  if not found then
    raise exception 'INVALID_JOIN_CODE';
  end if;

  insert into team_members (team_id, user_id, role)
  values (v_jc.team_id, v_uid, v_jc.role)
  on conflict (team_id, user_id) do update
    set status = 'active', role = excluded.role;

  return jsonb_build_object('team_id', v_jc.team_id, 'role', v_jc.role);
end;
$$;

-- Rotate a join code (coach only). Old code is deactivated immediately.
create or replace function regenerate_join_code(p_team_id uuid, p_role role)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not is_team_coach(p_team_id) then
    raise exception 'FORBIDDEN';
  end if;
  update join_codes set active = false where team_id = p_team_id and role = p_role and active;
  return mint_join_code(p_team_id, p_role);
end;
$$;

-- Athlete leaves a team (PRD 4.2). Coaches are removed by another coach.
create or replace function leave_team(p_team_id uuid)
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
  update team_members
  set status = 'removed'
  where team_id = p_team_id and user_id = v_uid and status = 'active' and role = 'athlete';
  if not found then
    raise exception 'ONLY_ACTIVE_ATHLETES_CAN_LEAVE';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS additions
-- ---------------------------------------------------------------------------

-- Does the current user share an active team with the target user?
create or replace function shares_team_with(target_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from team_members mine
    join team_members theirs on theirs.team_id = mine.team_id
    where mine.user_id = current_user_id() and mine.status = 'active'
      and theirs.user_id = target_user_id and theirs.status = 'active'
  )
$$;

-- Roster display: teammates can read each other's user profile rows.
-- (Sensitive data does not live on users; injury/shoes/etc. have own tables.)
create policy users_teammates_select on users
  for select using (shares_team_with(id));

-- Profile self-insert (first sign-in via sync_user is definer, but allow the
-- direct path too so the client upsert pattern works if ever needed).
create policy users_self_insert on users
  for insert with check (id = current_user_id());
