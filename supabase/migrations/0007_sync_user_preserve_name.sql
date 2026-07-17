-- BearBoard 0007: stop sync_user from clobbering a user-chosen name.
--
-- sync_user runs on every app load with the caller's Clerk name to keep the
-- profile in sync. But its on-conflict overwrote users.name unconditionally, so
-- a name set during onboarding (or in Settings) was reverted to the Clerk value
-- on the very next load — while class_year / events / title survived because
-- sync_user never touches them. (Reported: onboarding name doesn't save.)
--
-- Fix: only backfill the name from Clerk while it's still the stub ('New
-- member') or empty. Once the user has a real name, sync_user leaves it alone.
-- Photo continues to follow Clerk.

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
    set name = case
                 when users.name is null or users.name = '' or users.name = 'New member'
                   then coalesce(nullif(trim(excluded.name), ''), users.name)
                 else users.name
               end,
        photo_url = coalesce(excluded.photo_url, users.photo_url);
end;
$$;
