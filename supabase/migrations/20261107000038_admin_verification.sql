-- Migration 0038: admin verification queue and decisions (portal screens A03 to A06).
--
-- Every function here needs a VERIFIED admin session (`is_admin()`, migration 0037). Opening an applicant's
-- detail is itself written to the audit log, because it shows identity data. The queue never returns a CNIC;
-- the detail returns it masked (first 5 digits and the last digit) so staff can compare it with the card.
-- Documents are opened by the portal with short-lived signed URLs (the `identity` and `worker-media` storage
-- policies already let a verified admin read them); this migration returns only the storage paths.

-- Counts for the tabs. Workers: pending, visit_hq, approved, rejected. Residents: pending, needs_changes, approved, rejected.
create function public.admin_verification_counts(p_role public.user_role)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_role not in ('worker', 'resident') then
    raise exception 'role must be worker or resident';
  end if;
  return (
    select coalesce(jsonb_object_agg(verification_status, n), '{}'::jsonb)
    from (
      select verification_status::text, count(*) as n
      from public.profiles
      where role = p_role and verification_status <> 'incomplete'
      group by verification_status
    ) c
  );
end;
$$;

-- One page of the queue, oldest first. p_filter is a category id for workers and a phase for residents.
create function public.admin_verification_queue(
  p_role public.user_role,
  p_status public.verification_status,
  p_search text default null,
  p_filter smallint default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like text := null;
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_role not in ('worker', 'resident') then
    raise exception 'role must be worker or resident';
  end if;
  if nullif(btrim(coalesce(p_search, '')), '') is not null then
    if char_length(p_search) > 80 then
      raise exception 'search is too long';
    end if;
    v_like := '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with m as (
    select p.id, p.full_name, p.phone, p.email, p.cnic, coalesce(p.verification_updated_at, p.created_at) as waiting_since
    from public.profiles p
    where p.role = p_role and p.verification_status = p_status
      and (v_like is null or p.full_name ilike v_like or p.cnic ilike v_like or p.phone ilike v_like
           or (p_role = 'resident' and exists (select 1 from public.addresses a where a.resident_id = p.id
                                               and (a.lane ilike v_like or a.plot_no ilike v_like))))
      and (p_filter is null
           or (p_role = 'worker' and exists (select 1 from public.worker_categories wc where wc.worker_id = p.id and wc.category_id = p_filter))
           or (p_role = 'resident' and exists (select 1 from public.addresses a where a.resident_id = p.id and a.phase = p_filter)))
  ), pg as (
    select * from m order by waiting_since, id limit v_limit offset v_offset
  )
  select (select count(*) from m),
         coalesce(jsonb_agg(
           jsonb_build_object(
             'id', pg.id, 'full_name', pg.full_name, 'phone', pg.phone, 'email', pg.email, 'waiting_since', pg.waiting_since,
             'documents', (select coalesce(jsonb_agg(d.doc_type order by d.doc_type), '[]'::jsonb)
                             from public.verification_documents d where d.profile_id = pg.id),
             'extra', case when p_role = 'worker' then
               jsonb_build_object(
                 'categories', (select coalesce(jsonb_agg(c.name order by c.sort), '[]'::jsonb)
                                  from public.worker_categories wc join public.categories c on c.id = wc.category_id
                                 where wc.worker_id = pg.id),
                 'phases', (select coalesce(jsonb_agg(wa.phase order by wa.phase), '[]'::jsonb)
                              from public.worker_areas wa where wa.worker_id = pg.id),
                 'references', (select count(*) from public.worker_references r2 where r2.worker_id = pg.id),
                 'has_voice', exists (select 1 from public.worker_details w where w.profile_id = pg.id and w.voice_intro_path is not null))
             else
               jsonb_build_object(
                 'address', (select jsonb_build_object('phase', a.phase, 'lane', a.lane, 'plot_no', a.plot_no)
                               from public.addresses a where a.resident_id = pg.id
                              order by a.is_default desc, a.created_at limit 1))
             end)
           order by pg.waiting_since, pg.id), '[]'::jsonb)
    into v_total, v_rows
  from pg;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- The review screen. Writes an audit row: opening identity data is itself an audited act.
create function public.admin_verification_detail(p_profile uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.profiles;
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = p_profile and role in ('worker', 'resident');
  if not found or v_p.verification_status = 'incomplete' then
    raise exception 'no such application';
  end if;

  v_out := jsonb_build_object(
    'id', v_p.id, 'role', v_p.role, 'full_name', v_p.full_name, 'phone', v_p.phone, 'email', v_p.email,
    'gender', v_p.gender, 'date_of_birth', v_p.date_of_birth,
    'cnic_masked', case when v_p.cnic is null then null else left(v_p.cnic, 5) || '-*******-' || right(v_p.cnic, 1) end,
    'status', v_p.verification_status, 'reason', v_p.verification_reason,
    'submitted_at', v_p.verification_updated_at, 'created_at', v_p.created_at, 'avatar_path', v_p.avatar_path,
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('type', d.doc_type, 'path', d.storage_path, 'uploaded_at', d.uploaded_at)
                                            order by d.doc_type), '[]'::jsonb)
                    from public.verification_documents d where d.profile_id = p_profile),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('decision', x.decision, 'reason', x.reason, 'decided_at', x.decided_at,
                                                            'decided_by_name', (select full_name from public.profiles where id = x.decided_by))
                                          order by x.decided_at desc), '[]'::jsonb)
                  from public.verification_decisions x where x.profile_id = p_profile));

  if v_p.role = 'worker' then
    v_out := v_out || jsonb_build_object(
      'worker', (select jsonb_build_object('experience_years', w.experience_years, 'about', w.about, 'voice_intro_path', w.voice_intro_path)
                   from public.worker_details w where w.profile_id = p_profile),
      'categories', (select coalesce(jsonb_agg(c.name order by c.sort), '[]'::jsonb)
                       from public.worker_categories wc join public.categories c on c.id = wc.category_id where wc.worker_id = p_profile),
      'phases', (select coalesce(jsonb_agg(wa.phase order by wa.phase), '[]'::jsonb) from public.worker_areas wa where wa.worker_id = p_profile),
      'references', (select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'phone', r.phone, 'address', r.address)), '[]'::jsonb)
                       from public.worker_references r where r.worker_id = p_profile));
  else
    v_out := v_out || jsonb_build_object(
      'addresses', (select coalesce(jsonb_agg(jsonb_build_object('label', a.label, 'phase', a.phase, 'lane', a.lane, 'plot_no', a.plot_no, 'floor', a.floor)
                                              order by a.is_default desc, a.created_at), '[]'::jsonb)
                      from public.addresses a where a.resident_id = p_profile));
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (auth.uid(), 'verification_viewed', 'profiles', p_profile::text);
  return v_out;
end;
$$;

-- The decision. Approve needs every checklist item ticked; every other decision needs a reason the applicant will see.
create function public.admin_decide_verification(
  p_profile uuid,
  p_decision public.verification_decision,
  p_reason text,
  p_checklist jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status public.verification_status;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_profile = v_uid then
    raise exception 'you cannot decide on your own account';
  end if;
  select * into v_p from public.profiles where id = p_profile and role in ('worker', 'resident') for update;
  if not found then
    raise exception 'no such application';
  end if;
  if v_p.verification_status not in ('pending', 'visit_hq') then
    raise exception 'this application is not waiting for a decision';
  end if;
  if v_p.account_status <> 'active' then
    raise exception 'this account is suspended';
  end if;
  if p_checklist is null or jsonb_typeof(p_checklist) <> 'object' then
    raise exception 'the checklist is required';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'the reason is too long (500 characters at most)';
  end if;

  if p_decision = 'approve' then
    if not (select bool_and(value = 'true'::jsonb) from jsonb_each(p_checklist)) or p_checklist = '{}'::jsonb then
      raise exception 'tick every checklist item before approving';
    end if;
    v_status := 'approved';
  else
    if v_reason is null or char_length(v_reason) < 3 then
      raise exception 'write a reason the applicant will see';
    end if;
    v_status := (case p_decision when 'ask_for_changes' then 'needs_changes' when 'visit_hq' then 'visit_hq' else 'rejected' end)::public.verification_status;
  end if;

  insert into public.verification_decisions (profile_id, decision, reason, checklist, decided_by)
  values (p_profile, p_decision, v_reason, p_checklist, v_uid);
  update public.profiles
     set verification_status = v_status, verification_reason = v_reason, verification_updated_at = now()
   where id = p_profile;
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data, reason)
  values (v_uid, 'verification_' || p_decision::text, 'profiles', p_profile::text,
          jsonb_build_object('status', v_p.verification_status), jsonb_build_object('status', v_status), v_reason);
  perform private.notify(p_profile, 'verification_decided', null, jsonb_build_object('decision', p_decision));
end;
$$;

revoke all on function
  public.admin_verification_counts(public.user_role),
  public.admin_verification_queue(public.user_role, public.verification_status, text, smallint, integer, integer),
  public.admin_verification_detail(uuid),
  public.admin_decide_verification(uuid, public.verification_decision, text, jsonb)
from public, anon;
grant execute on function
  public.admin_verification_counts(public.user_role),
  public.admin_verification_queue(public.user_role, public.verification_status, text, smallint, integer, integer),
  public.admin_verification_detail(uuid),
  public.admin_decide_verification(uuid, public.verification_decision, text, jsonb)
to authenticated;
