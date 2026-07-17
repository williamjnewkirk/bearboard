-- BearBoard 0008: fix workout-results visibility + robust plan-seen receipts.
--
-- Two reported bugs:
--
-- 1. Submitted splits never showed on the coach dashboard. Root cause: 0004
--    revoked EXECUTE on the SECURITY DEFINER lookups member_of_assignment /
--    team_of_meet / team_of_entry from `authenticated`, but those functions are
--    used INSIDE RLS policies (workout_results, meet_entries, meet_results).
--    A policy's functions run as the querying role, so the coach's read of
--    workout_results (and meet entries/results) failed the permission check and
--    returned nothing. Re-grant EXECUTE — they're safe id→id lookups whose only
--    job is to feed the surrounding is_team_coach / is_team_member gate.
--
-- 2. "Seen" never reflected that an athlete viewed the plan. Seen timestamps
--    live on day_assignments, which are fanned out by publish_week. An athlete
--    who joins AFTER the week was published has no assignment row, so there is
--    nothing to mark seen. ensure_my_assignments lets the athlete's This Week /
--    Today view lazily create its own assignment rows for a published week.

-- --- Fix 1: re-grant the policy helper functions ---------------------------

grant execute on function member_of_assignment(uuid) to authenticated;
grant execute on function team_of_meet(uuid) to authenticated;
grant execute on function team_of_entry(uuid) to authenticated;
grant execute on function team_of_conversation(uuid) to authenticated;

-- --- Fix 2: lazy assignment creation for the current athlete ---------------

-- Ensure the caller has a day_assignment for every day of a PUBLISHED week, so
-- seen/confirm receipts always have a row to write to (idempotent).
create or replace function ensure_my_assignments(p_team_id uuid, p_week_start date)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_member uuid := current_team_member(p_team_id);
begin
  if v_member is null then
    return;
  end if;
  insert into day_assignments (training_day_id, team_member_id)
  select td.id, v_member
  from training_days td
  join weeks w on w.id = td.week_id
  where td.team_id = p_team_id
    and w.start_date = p_week_start
    and w.skeleton_published_at is not null
  on conflict (training_day_id, team_member_id) do nothing;
end;
$$;
