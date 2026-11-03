-- Four FAKE open jobs for hosted DEV, to paste by hand into the Supabase dashboard SQL Editor (DEV project only).
-- This is the one exception to "supabase/dev scripts are local only": it only adds jobs, never touches users or auth,
-- and every job is tagged "[FAKE]" in its title so it is easy to find and remove (cleanup at the bottom).
--
-- They belong to the first approved resident that has an address (on DEV that is Shariq's test resident), are in that
-- address's phase, and are 'open' so workers can see them in Open jobs. Open jobs expire after 24 hours
-- (app_settings.job_expiry_hours), so run this shortly before testing. Run it again for a fresh set.

with r as (
  select p.id as resident_id, p.phone, a.id as address_id, a.phase, a.lane
  from public.profiles p
  join public.addresses a on a.resident_id = p.id
  where p.role = 'resident' and p.verification_status = 'approved'
  order by a.is_default desc nulls last, p.created_at
  limit 1
),
new_jobs as (
  insert into public.jobs (resident_id, category_id, address_id, phase, lane, title, description, urgency, status, posted_at)
  select r.resident_id, v.category_id, r.address_id, r.phase, r.lane, v.title, v.description, 'asap', 'open', now()
  from r
  cross join (values
    (1::smallint, '[FAKE] Kitchen tap leaking',        'The mixer tap under the kitchen sink drips all day and the cupboard below is getting wet. Needs a new washer or cartridge.'),
    (2::smallint, '[FAKE] Fan and two lights not working', 'Bedroom ceiling fan stopped and two spotlights in the lounge do not switch on. Breaker looks fine.'),
    (3::smallint, '[FAKE] AC not cooling',             'Split AC runs but blows warm air. Probably needs a gas check and a service.'),
    (8::smallint, '[FAKE] Hang curtains and fix door handle', 'Need three curtain rods fitted in the lounge and the main door handle tightened.')
  ) as v(category_id, title, description)
  returning id, title
)
insert into public.job_private (job_id, plot_no, floor, resident_phone)
select n.id, '12-C', 'Ground', coalesce((select phone from r), '+920000000000')
from new_jobs n;

select code, title, status, phase, posted_at from public.jobs where title like '[FAKE]%' order by created_at desc;

-- To remove all fake jobs later (run by hand):
--   delete from public.job_private where job_id in (select id from public.jobs where title like '[FAKE]%');
--   delete from public.jobs where title like '[FAKE]%';
