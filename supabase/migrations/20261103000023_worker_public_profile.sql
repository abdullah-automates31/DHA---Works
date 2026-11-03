-- 0023: worker_public_profile (from Shariq Bhai's draft 0019_worker_public_profile.sql, 3 Nov). A resident can read only
-- their own rows of profiles, worker_details, worker_categories, worker_areas and reviews, so this function returns the
-- extras for a worker who has quoted one of THE CALLER'S jobs (the same set resident_quotes exposes) and nothing else.
-- Changes from the draft, checked against the real schema: 'bio' is the worker's 'about' (migration 0021) and
-- worker_details is keyed by profile_id; the completion rate no longer filters on a status that does not exist
-- ('cancelled_before_start' is not in job_status), it ignores cancelled jobs; grants also revoke anon.

create or replace function public.worker_public_profile(p_worker_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := private.me('resident', false);
begin
  -- Only workers who quoted a job of this resident.
  if not exists (
    select 1 from public.quotes q
    join public.jobs j on j.id = q.job_id
    where q.worker_id = p_worker_id and j.resident_id = v_uid
  ) then
    raise exception 'worker not found';
  end if;

  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(c.name order by c.name)
      from public.worker_categories wc join public.categories c on c.id = wc.category_id
      where wc.worker_id = p_worker_id), '[]'::jsonb),
    'phases', coalesce((
      select jsonb_agg(wa.phase order by wa.phase)
      from public.worker_areas wa where wa.worker_id = p_worker_id), '[]'::jsonb),
    -- about: the worker's free-text introduction (worker_details.about, max 500 characters).
    'about', (select wd.about from public.worker_details wd where wd.profile_id = p_worker_id),
    -- completion_rate: whole percent of jobs the worker accepted that they finished (null until they have one).
    'completion_rate', (
      select round(100.0 * count(*) filter (where j.status in ('completed', 'cash_collected', 'reviewed')) / nullif(count(*), 0))
      from public.jobs j where j.accepted_worker_id = p_worker_id and j.status <> 'cancelled'),
    'verified_at', (select p.verification_updated_at from public.profiles p
                    where p.id = p_worker_id and p.verification_status = 'approved'),
    -- Latest reviews, anonymised: scores, comment, date and the phase of the job. No names or phones.
    'reviews', coalesce((
      select jsonb_agg(r order by r.created_at desc)
      from (
        select rv.behaviour, rv.completeness, rv.quality, rv.comment, rv.created_at, j.phase
        from public.reviews rv join public.jobs j on j.id = rv.job_id
        where rv.worker_id = p_worker_id
        order by rv.created_at desc
        limit 10
      ) r), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.worker_public_profile(uuid) from public, anon;
grant execute on function public.worker_public_profile(uuid) to authenticated;
