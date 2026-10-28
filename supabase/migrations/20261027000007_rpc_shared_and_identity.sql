-- 0007: internal helpers (schema "private", not exposed through the API) and the shared/identity RPCs.
-- Every RPC is security definer with an empty search_path, checks the caller's role itself,
-- and is executable by signed-in users only (grants at the end of each RPC migration).

create schema private;

-- Returns the caller's id after checking role, and (by default) approval and suspension.
create function private.me(p_role public.user_role, p_need_approved boolean default true)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p record;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select role, verification_status, account_status into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> p_role then
    raise exception 'this action is not available for your account type' using errcode = '42501';
  end if;
  if v_p.account_status <> 'active' then
    raise exception 'your account is suspended' using errcode = '42501';
  end if;
  if p_need_approved and v_p.verification_status <> 'approved' then
    raise exception 'your account is not approved yet' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function private.setting_int(p_key text, p_default integer)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::integer from public.app_settings where key = p_key), p_default);
$$;

-- Writes the job timeline entry and the audit entry together.
create function private.record(
  p_job uuid, p_type text, p_actor uuid, p_payload jsonb default '{}'::jsonb, p_resident_only boolean default false
)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.job_events (job_id, event_type, actor_id, payload, resident_only)
  values (p_job, p_type, p_actor, p_payload, p_resident_only);
  insert into public.audit_log (actor_id, action, table_name, record_id, new_data)
  values (p_actor, p_type, 'jobs', p_job::text, p_payload);
$$;

create function private.notify(p_user uuid, p_type text, p_job uuid, p_payload jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, type, job_id, payload) values (p_user, p_type, p_job, p_payload);
$$;

create function private.notify_admins(p_type text, p_job uuid, p_payload jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, type, job_id, payload)
  select id, p_type, p_job, p_payload from public.profiles
  where role = 'admin' and account_status = 'active';
$$;

-- Before acceptance the stage follows the live interest and quotes.
create function private.recompute_job_stage(p_job uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.job_status;
  v_new public.job_status;
begin
  select status into v_status from public.jobs where id = p_job;
  if v_status not in ('open', 'interested', 'quoted') then
    return;
  end if;
  if exists (select 1 from public.quotes where job_id = p_job and status = 'sent') then
    v_new := 'quoted';
  elsif exists (select 1 from public.job_interests where job_id = p_job and withdrawn_at is null) then
    v_new := 'interested';
  else
    v_new := 'open';
  end if;
  if v_new <> v_status then
    update public.jobs set status = v_new where id = p_job;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create function public.register_profile(
  p_role public.user_role,
  p_full_name text,
  p_phone text,
  p_gender public.gender default null,
  p_date_of_birth date default null,
  p_cnic text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_role not in ('resident', 'worker') then
    raise exception 'only resident and worker accounts can be registered here';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile already exists';
  end if;
  insert into public.profiles (id, role, full_name, email, phone, gender, date_of_birth, cnic)
  values (v_uid, p_role, nullif(trim(p_full_name), ''), (select email from auth.users where id = v_uid),
          nullif(trim(p_phone), ''), p_gender, p_date_of_birth, nullif(trim(p_cnic), ''));
  if p_role = 'worker' then
    insert into public.worker_details (profile_id) values (v_uid);
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (v_uid, 'register_profile', 'profiles', v_uid::text);
end;
$$;

-- Null means "leave unchanged". Identity fields are locked once staff approved them.
create function public.update_my_profile(
  p_full_name text default null,
  p_phone text default null,
  p_gender public.gender default null,
  p_date_of_birth date default null,
  p_cnic text default null,
  p_avatar_path text default null,
  p_locale text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
begin
  select * into v_p from public.profiles where id = v_uid;
  if not found then
    raise exception 'no profile';
  end if;
  if v_p.verification_status = 'approved'
     and (p_full_name is not null or p_gender is not null or p_date_of_birth is not null or p_cnic is not null) then
    raise exception 'name, gender, date of birth and CNIC are locked after approval; contact DHA staff';
  end if;
  if p_avatar_path is not null and p_avatar_path not like v_uid::text || '/%' then
    raise exception 'invalid file path';
  end if;
  update public.profiles set
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    gender = coalesce(p_gender, gender),
    date_of_birth = coalesce(p_date_of_birth, date_of_birth),
    cnic = coalesce(nullif(trim(p_cnic), ''), cnic),
    avatar_path = coalesce(p_avatar_path, avatar_path),
    locale = coalesce(p_locale, locale)
  where id = v_uid;
end;
$$;

create function public.upsert_address(
  p_id uuid default null,
  p_label text default null,
  p_phase smallint default null,
  p_lane text default null,
  p_plot_no text default null,
  p_floor text default null,
  p_is_default boolean default false
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident', false);
  v_id uuid;
  v_first boolean;
begin
  if p_phase is null or coalesce(trim(p_lane), '') = '' or coalesce(trim(p_plot_no), '') = '' then
    raise exception 'phase, lane and plot number are required';
  end if;
  v_first := not exists (select 1 from public.addresses where resident_id = v_uid);
  if p_is_default or v_first then
    update public.addresses set is_default = false where resident_id = v_uid and is_default;
  end if;
  if p_id is null then
    insert into public.addresses (resident_id, label, phase, lane, plot_no, floor, is_default)
    values (v_uid, p_label, p_phase, trim(p_lane), trim(p_plot_no), p_floor, p_is_default or v_first)
    returning id into v_id;
  else
    update public.addresses set label = p_label, phase = p_phase, lane = trim(p_lane),
      plot_no = trim(p_plot_no), floor = p_floor, is_default = (p_is_default or v_first)
    where id = p_id and resident_id = v_uid
    returning id into v_id;
    if v_id is null then
      raise exception 'address not found';
    end if;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verification submission
-- ---------------------------------------------------------------------------

-- Records an uploaded file. The caller uploads to storage first, under "<user id>/...".
create function public.add_verification_document(p_type public.document_type, p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.verification_status;
begin
  select verification_status into v_status from public.profiles where id = v_uid;
  if v_status is null then
    raise exception 'no profile';
  end if;
  if v_status not in ('incomplete', 'needs_changes') then
    raise exception 'documents can only be changed before submission or when staff ask for changes';
  end if;
  if p_path not like v_uid::text || '/%' then
    raise exception 'invalid file path';
  end if;
  insert into public.verification_documents (profile_id, doc_type, storage_path)
  values (v_uid, p_type, p_path)
  on conflict (profile_id, doc_type) do update set storage_path = excluded.storage_path, uploaded_at = now();
  if p_type = 'profile_photo' then
    update public.profiles set avatar_path = p_path where id = v_uid;
  end if;
end;
$$;

-- Replaces the worker's references (alternative to the police certificate).
create function public.set_my_references(p_refs jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
  v_status public.verification_status;
begin
  select verification_status into v_status from public.profiles where id = v_uid;
  if v_status not in ('incomplete', 'needs_changes') then
    raise exception 'references can only be changed before submission or when staff ask for changes';
  end if;
  delete from public.worker_references where worker_id = v_uid;
  insert into public.worker_references (worker_id, name, phone, address)
  select v_uid, r->>'name', r->>'phone', r->>'address'
  from jsonb_array_elements(coalesce(p_refs, '[]'::jsonb)) r
  where coalesce(r->>'name', '') <> '' and coalesce(r->>'phone', '') <> '';
end;
$$;

create function public.submit_for_review()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_docs public.document_type[];
begin
  select * into v_p from public.profiles where id = v_uid;
  if not found then
    raise exception 'no profile';
  end if;
  if v_p.verification_status not in ('incomplete', 'needs_changes') then
    raise exception 'already submitted';
  end if;
  if v_p.role not in ('resident', 'worker') then
    raise exception 'not applicable';
  end if;
  if coalesce(v_p.full_name, '') = '' or coalesce(v_p.phone, '') = '' or v_p.cnic is null then
    raise exception 'name, phone and CNIC are required';
  end if;
  select array_agg(doc_type) into v_docs from public.verification_documents where profile_id = v_uid;
  v_docs := coalesce(v_docs, '{}');
  if not (v_docs @> array['cnic_front', 'cnic_back']::public.document_type[]) then
    raise exception 'upload both sides of your CNIC';
  end if;
  if v_p.role = 'resident' then
    if not ('utility_bill' = any (v_docs)) then
      raise exception 'upload a recent utility bill';
    end if;
    if not exists (select 1 from public.addresses where resident_id = v_uid) then
      raise exception 'add your address';
    end if;
  else
    if not ('profile_photo' = any (v_docs)) then
      raise exception 'upload a profile photo';
    end if;
    if not ('police_cert' = any (v_docs))
       and (select count(*) from public.worker_references where worker_id = v_uid) < 2 then
      raise exception 'upload a police certificate or give two references';
    end if;
    if not exists (select 1 from public.worker_categories where worker_id = v_uid) then
      raise exception 'choose at least one trade';
    end if;
    if not exists (select 1 from public.worker_areas where worker_id = v_uid) then
      raise exception 'choose at least one phase';
    end if;
  end if;
  update public.profiles set verification_status = 'pending', verification_reason = null,
    verification_updated_at = now() where id = v_uid;
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (v_uid, 'submit_for_review', 'profiles', v_uid::text);
  perform private.notify_admins('verification_submitted', null, jsonb_build_object('profile_id', v_uid, 'role', v_p.role));
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications and devices
-- ---------------------------------------------------------------------------

create function public.register_device_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- A phone belongs to one account at a time.
  delete from public.device_tokens where push_token = p_token and user_id <> v_uid;
  insert into public.device_tokens (user_id, push_token, platform) values (v_uid, p_token, p_platform)
  on conflict (user_id, push_token) do update set updated_at = now(), platform = excluded.platform;
end;
$$;

-- p_ids null = mark everything read.
create function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql security definer set search_path = ''
as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------------------
-- Reports (both apps)
-- ---------------------------------------------------------------------------

create function public.file_report(
  p_job_id uuid, p_kind public.report_kind, p_text text default null, p_photo_paths text[] default '{}'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
  v_role public.user_role;
  v_against uuid;
  v_id uuid;
  v_window integer := private.setting_int('report_window_days', 7);
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'job not found';
  end if;
  if v_job.resident_id = v_uid then
    v_role := 'resident';
    v_against := v_job.accepted_worker_id;
  elsif v_job.accepted_worker_id = v_uid then
    v_role := 'worker';
    v_against := v_job.resident_id;
  else
    raise exception 'job not found';
  end if;
  if v_job.status not in ('scheduled', 'in_progress', 'completed', 'cash_collected', 'reviewed', 'disputed') then
    raise exception 'reports are possible once the job is scheduled';
  end if;
  if v_job.completed_at is not null and now() > v_job.completed_at + make_interval(days => v_window) then
    raise exception 'the reporting period for this job has ended';
  end if;
  if (select account_status from public.profiles where id = v_uid) <> 'active' then
    raise exception 'your account is suspended';
  end if;

  insert into public.reports (job_id, reporter_id, against_id, reporter_role, kind, reason_text)
  values (p_job_id, v_uid, v_against, v_role, p_kind, p_text)
  returning id into v_id;
  insert into public.report_photos (report_id, storage_path)
  select v_id, path from unnest(p_photo_paths) path where path like v_uid::text || '/%';

  -- Safety and price reports flag the job for staff without changing its status.
  if p_kind in ('unsafe', 'cash_price') and v_job.under_review_reason is null then
    update public.jobs set under_review_reason = 'report_' || p_kind::text where id = p_job_id;
  end if;
  perform private.record(p_job_id, 'report_filed', v_uid, jsonb_build_object('kind', p_kind, 'report_id', v_id));
  perform private.notify_admins(case when p_kind = 'unsafe' then 'unsafe_report' else 'report_received' end,
    p_job_id, jsonb_build_object('report_id', v_id, 'kind', p_kind));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.register_profile(public.user_role, text, text, public.gender, date, text),
  public.update_my_profile(text, text, public.gender, date, text, text, text),
  public.upsert_address(uuid, text, smallint, text, text, text, boolean),
  public.add_verification_document(public.document_type, text),
  public.set_my_references(jsonb),
  public.submit_for_review(),
  public.register_device_token(text, text),
  public.mark_notifications_read(uuid[]),
  public.file_report(uuid, public.report_kind, text, text[])
from public, anon;

grant execute on function
  public.register_profile(public.user_role, text, text, public.gender, date, text),
  public.update_my_profile(text, text, public.gender, date, text, text, text),
  public.upsert_address(uuid, text, smallint, text, text, text, boolean),
  public.add_verification_document(public.document_type, text),
  public.set_my_references(jsonb),
  public.submit_for_review(),
  public.register_device_token(text, text),
  public.mark_notifications_read(uuid[]),
  public.file_report(uuid, public.report_kind, text, text[])
to authenticated;
