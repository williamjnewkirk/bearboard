-- BearBoard 0006: multi-weekday event recurrence.
--
-- The old `events.recurrence text` ('weekly' | null) stored intent but nothing
-- ever generated the repeat occurrences, so a "repeats weekly" event only ever
-- showed on its original date. We keep `recurrence` = 'weekly' as the frequency
-- flag and add `recurrence_days` — the ISO weekdays it repeats on (1=Mon .. 7=
-- Sun). Occurrences are expanded client-side within the visible calendar range
-- (and per-day for reminders), so no fan-out rows are stored.
--
-- Backward compatible: an event with recurrence='weekly' and a null/empty
-- recurrence_days repeats on the weekday of its own start date.

alter table events
  add column recurrence_days smallint[];

-- ---------------------------------------------------------------------------
-- Recurrence-aware event reminders.
--
-- The 0004 reminder loop keyed off events.starts_at, so a recurring event
-- (anchor in the past) never re-fired. This replacement computes today's
-- occurrence timestamp for one-time AND recurring events and dedups per
-- occurrence day (ref_id = md5(event_id:date)), so a Mon/Wed/Fri event reminds
-- on each of those days. All other notification categories are unchanged.
-- ---------------------------------------------------------------------------

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
  -- Event reminders (recurrence-aware). '1h': within the hour before the
  -- occurrence. 'morning_of': after 6am team time on a day it occurs.
  for r in
    select e.id as event_id, e.team_id, e.title, e.location,
           tm.user_id, u.reminder_lead, t.timezone,
           occ.occ_ts, d.today_date
    from events e
    join teams t on t.id = e.team_id
    join team_members tm on tm.team_id = e.team_id and tm.status = 'active'
    join users u on u.id = tm.user_id
    cross join lateral (select (now() at time zone t.timezone)::date as today_date) d
    cross join lateral (
      select (d.today_date + (e.starts_at at time zone t.timezone)::time) at time zone t.timezone as occ_ts
    ) occ
    where u.reminder_lead <> 'off'
      and (e.starts_at at time zone t.timezone)::date <= d.today_date
      and (
        (e.recurrence is null and (e.starts_at at time zone t.timezone)::date = d.today_date)
        or (e.recurrence is not null and (
              (array_length(e.recurrence_days, 1) is not null
               and extract(isodow from d.today_date)::smallint = any (e.recurrence_days))
              or (array_length(e.recurrence_days, 1) is null
                  and extract(isodow from d.today_date)
                      = extract(isodow from (e.starts_at at time zone t.timezone)::date))
            ))
      )
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
        (u.reminder_lead = '1h'
         and occ.occ_ts between now() - interval '15 minutes' and now() + interval '1 hour')
        or (u.reminder_lead = 'morning_of'
            and extract(hour from (now() at time zone t.timezone)) >= 6)
      )
  loop
    perform enqueue_notification(
      r.team_id, r.user_id, 'event_reminder',
      r.title,
      to_char(r.occ_ts at time zone r.timezone, 'FMHH12:MI AM')
        || coalesce(' · ' || nullif(r.location, ''), ''),
      jsonb_build_object('kind', 'event', 'event_id', r.event_id, 'date', r.today_date),
      md5(r.event_id::text || ':' || r.today_date::text)::uuid
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
  -- haven't submitted.
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

  -- Split nudge (coach-enabled per team): evening of a workout day, athletes
  -- with a published detail and no submitted result.
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

revoke execute on function enqueue_due_notifications() from public, anon, authenticated;
grant execute on function enqueue_due_notifications() to service_role;
