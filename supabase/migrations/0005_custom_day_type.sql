-- BearBoard 0005: custom day-type label.
--
-- The day_type enum is fixed (it drives coloring + race-day logic), but coaches
-- want to name their own kind of day (e.g. "Fartlek", "Tempo", "Shakeout")
-- instead of being forced to pick "Other". We store that free-text name in a
-- new column and display it in place of "Other" when set. day_type stays
-- 'other' so nothing downstream needs new enum values.

alter table training_days
  add column custom_type_label text;

-- Recreate set_training_day with the extra (defaulted) param. Drop first — you
-- can't change a function's argument list with create-or-replace.
drop function if exists set_training_day(uuid, date, date, day_type, text);

create or replace function set_training_day(
  p_team_id uuid,
  p_week_start date,
  p_date date,
  p_day_type day_type,
  p_skeleton_label text,
  p_custom_type_label text default null
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

  insert into training_days (team_id, week_id, date, day_type, skeleton_label, custom_type_label, created_by)
  values (p_team_id, v_week_id, p_date, p_day_type,
          nullif(trim(coalesce(p_skeleton_label, '')), ''),
          case when p_day_type = 'other' then nullif(trim(coalesce(p_custom_type_label, '')), '') else null end,
          v_member)
  on conflict (team_id, date) do update
    set day_type = excluded.day_type,
        skeleton_label = excluded.skeleton_label,
        custom_type_label = excluded.custom_type_label,
        week_id = excluded.week_id
  returning id into v_td_id;

  return v_td_id;
end;
$$;
