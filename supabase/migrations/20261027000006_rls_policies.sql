-- 0006: row-level security helpers, policies and grants (docs/DB-API-DESIGN.md section 5).
--
-- Model: signed-in users get SELECT only, filtered by the policies below. Every write goes through
-- an RPC (security definer, next migration), so no INSERT/UPDATE/DELETE is granted to the apps.
-- Exceptions: staff-editable catalogue tables (admin-only policies).
-- The anon role gets nothing: the apps always sign in first.

-- ---------------------------------------------------------------------------
-- Helpers. security definer so they can read profiles/jobs without recursing into RLS.
-- ---------------------------------------------------------------------------

create function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and account_status = 'active'
  );
$$;

-- True when the caller has this role, is approved by staff and is not suspended.
create function public.is_active_approved(p_role public.user_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = p_role
      and verification_status = 'approved' and account_status = 'active'
  );
$$;

-- An approved, active worker whose trades and phases include this job's category and phase.
create function public.worker_matches_job(p_category smallint, p_phase smallint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_active_approved('worker')
    and exists (select 1 from public.worker_categories
                where worker_id = (select auth.uid()) and category_id = p_category)
    and exists (select 1 from public.worker_areas
                where worker_id = (select auth.uid()) and phase = p_phase);
$$;

-- The worker already has an interest or a quote on the job (keeps it visible after the job leaves the feed).
create function public.worker_has_stake(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.job_interests where job_id = p_job and worker_id = (select auth.uid()))
      or exists (select 1 from public.quotes where job_id = p_job and worker_id = (select auth.uid()));
$$;

create function public.is_job_owner(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.jobs where id = p_job and resident_id = (select auth.uid()));
$$;

create function public.is_accepted_worker(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.jobs where id = p_job and accepted_worker_id = (select auth.uid()));
$$;

-- Same visibility rule as the jobs policy, for child tables (photos).
create function public.can_view_job(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job and (
      j.resident_id = (select auth.uid())
      or j.accepted_worker_id = (select auth.uid())
      or public.is_admin()
      or (j.status in ('open', 'interested', 'quoted') and public.worker_matches_job(j.category_id, j.phase))
      or public.worker_has_stake(j.id)
    )
  );
$$;

revoke execute on function
  public.current_user_role(), public.is_admin(), public.is_active_approved(public.user_role),
  public.worker_matches_job(smallint, smallint), public.worker_has_stake(uuid),
  public.is_job_owner(uuid), public.is_accepted_worker(uuid), public.can_view_job(uuid)
from public, anon;

grant execute on function
  public.current_user_role(), public.is_admin(), public.is_active_approved(public.user_role),
  public.worker_matches_job(smallint, smallint), public.worker_has_stake(uuid),
  public.is_job_owner(uuid), public.is_accepted_worker(uuid), public.can_view_job(uuid)
to authenticated;

-- Internal helper from 0002; apps read settings through the table policy instead.
revoke execute on function public.get_setting(text) from public, anon;
grant execute on function public.get_setting(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants: SELECT only (plus admin writes on the catalogue).
-- ---------------------------------------------------------------------------

grant select on
  public.categories, public.service_areas, public.app_settings,
  public.profiles, public.addresses, public.worker_details, public.worker_categories,
  public.worker_areas, public.worker_references, public.verification_documents,
  public.verification_decisions,
  public.jobs, public.job_private, public.job_photos, public.job_views, public.job_interests,
  public.quotes, public.job_events, public.cash_records, public.cancellation_requests,
  public.reviews, public.reports, public.report_photos, public.report_notes, public.report_calls,
  public.notifications, public.audit_log, public.staff_invites
to authenticated;

grant insert, update, delete on public.categories, public.service_areas, public.app_settings to authenticated;
grant usage, select on sequence public.categories_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Catalogue and settings: everyone signed in reads, only staff write.
-- ---------------------------------------------------------------------------

create policy categories_read on public.categories for select to authenticated using (true);
create policy categories_admin_write on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy service_areas_read on public.service_areas for select to authenticated using (true);
create policy service_areas_admin_write on public.service_areas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy app_settings_read on public.app_settings for select to authenticated using (true);
create policy app_settings_admin_write on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Identity and verification: own rows, plus staff.
-- Other people's names/ratings reach the apps through views (next migration), never these tables.
-- ---------------------------------------------------------------------------

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy addresses_read on public.addresses for select to authenticated
  using (resident_id = (select auth.uid()) or public.is_admin());

create policy worker_details_read on public.worker_details for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

create policy worker_categories_read on public.worker_categories for select to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin());

create policy worker_areas_read on public.worker_areas for select to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin());

create policy worker_references_read on public.worker_references for select to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin());

-- No read-back once submitted: the owner sees files only while they can still change them.
create policy verification_documents_read on public.verification_documents for select to authenticated
  using (
    public.is_admin()
    or (profile_id = (select auth.uid()) and exists (
      select 1 from public.profiles p
      where p.id = profile_id and p.verification_status in ('incomplete', 'needs_changes')))
  );

create policy verification_decisions_read on public.verification_decisions for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Jobs and quotes
-- ---------------------------------------------------------------------------

create policy jobs_read on public.jobs for select to authenticated
  using (
    resident_id = (select auth.uid())
    or accepted_worker_id = (select auth.uid())
    or public.is_admin()
    or (status in ('open', 'interested', 'quoted') and public.worker_matches_job(category_id, phase))
    or public.worker_has_stake(id)
  );

-- Plot, floor and phone: owner, the accepted worker once scheduled, staff. Nobody else, ever.
create policy job_private_read on public.job_private for select to authenticated
  using (public.is_job_owner(job_id) or public.is_accepted_worker(job_id) or public.is_admin());

create policy job_photos_read on public.job_photos for select to authenticated
  using (public.can_view_job(job_id));

-- Workers never read views/interests of others; counts come from views.
create policy job_views_admin_read on public.job_views for select to authenticated
  using (public.is_admin());

create policy job_interests_read on public.job_interests for select to authenticated
  using (worker_id = (select auth.uid()) or public.is_admin());

-- Residents see quotes on their jobs, workers only their own, never competitors'.
create policy quotes_read on public.quotes for select to authenticated
  using (worker_id = (select auth.uid()) or public.is_job_owner(job_id) or public.is_admin());

create policy job_events_read on public.job_events for select to authenticated
  using (
    public.is_job_owner(job_id)
    or (public.is_accepted_worker(job_id) and not resident_only)
    or public.is_admin()
  );

create policy cash_records_read on public.cash_records for select to authenticated
  using (public.is_job_owner(job_id) or public.is_accepted_worker(job_id) or public.is_admin());

create policy cancellation_requests_read on public.cancellation_requests for select to authenticated
  using (public.is_job_owner(job_id) or public.is_accepted_worker(job_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Reviews (anonymous to the worker), reports, platform
-- ---------------------------------------------------------------------------

create policy reviews_read on public.reviews for select to authenticated
  using (resident_id = (select auth.uid()) or public.is_admin());

create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());

create policy report_photos_read on public.report_photos for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.reports r where r.id = report_id and r.reporter_id = (select auth.uid())));

create policy report_notes_admin_read on public.report_notes for select to authenticated
  using (public.is_admin());

create policy report_calls_admin_read on public.report_calls for select to authenticated
  using (public.is_admin());

create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- device_tokens: no policy, no grant. Only register_device_token (RPC) touches it.

create policy audit_log_admin_read on public.audit_log for select to authenticated
  using (public.is_admin());

create policy staff_invites_admin_read on public.staff_invites for select to authenticated
  using (public.is_admin());
