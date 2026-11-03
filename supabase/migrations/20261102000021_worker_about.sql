-- Shariq, 2 Nov: a worker profile needs an Introduction section with the voice introduction AND a written
-- "about" text the worker fills in.
--
-- The voice file already exists (worker_details.voice_intro_path). This adds the written part:
--   * worker_details.about: free text, up to 500 characters, optional.
--   * update_worker_details gets a fourth argument p_about. Null leaves it unchanged (same rule as the other
--     arguments); an empty or blank string clears it. The 3-argument calls keep working (default null).
--   * resident_quotes shows the about text next to the voice intro, as part of the worker's public profile.
--     Added as the LAST column so nothing that reads the view changes.
-- Same privacy rules as before: no phone, CNIC or address is involved.

alter table public.worker_details
  add column about text check (char_length(about) <= 500);

-- A new argument means a new function signature: drop the old one, then recreate with the same grants.
drop function public.update_worker_details(smallint, integer, text);

create function public.update_worker_details(
  p_experience_years smallint default null,
  p_visit_fee integer default null,
  p_voice_intro_path text default null,
  p_about text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
begin
  if p_voice_intro_path is not null and p_voice_intro_path not like v_uid::text || '/%' then
    raise exception 'invalid file path';
  end if;
  update public.worker_details set
    experience_years = coalesce(p_experience_years, experience_years),
    visit_fee = coalesce(p_visit_fee, visit_fee),
    voice_intro_path = coalesce(p_voice_intro_path, voice_intro_path),
    about = case when p_about is null then about else nullif(btrim(p_about), '') end
  where profile_id = v_uid;
end;
$$;

revoke execute on function public.update_worker_details(smallint, integer, text, text) from public, anon;
grant execute on function public.update_worker_details(smallint, integer, text, text) to authenticated;

-- Table-level select on worker_details already covers the new column (RLS limits who sees which row).
create or replace view public.resident_quotes with (security_invoker = false) as
select q.id, q.job_id, q.status, q.labour, q.materials, q.materials_note, q.other_amount, q.other_note,
  q.total, q.visit_start, q.visit_end, q.note, q.created_at,
  q.worker_id, p.full_name as worker_name, p.avatar_path,
  wd.rating_avg, wd.rating_count, wd.jobs_done, wd.experience_years, wd.visit_fee, wd.voice_intro_path,
  (wd.jobs_done >= private.setting_int('top_rated_min_jobs', 10)
   and wd.rating_avg >= (public.get_setting('top_rated_min_rating') #>> '{}')::numeric) as is_top_rated,
  case when q.status = 'accepted' then p.phone end as worker_phone,
  wd.about as worker_about
from public.quotes q
join public.jobs j on j.id = q.job_id
join public.profiles p on p.id = q.worker_id
join public.worker_details wd on wd.profile_id = q.worker_id
where j.resident_id = (select auth.uid())
  and q.status in ('sent', 'accepted', 'rejected', 'not_selected');
