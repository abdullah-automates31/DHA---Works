-- Worker onboarding: areas are chosen after approval (UI W04 -> W05), so submit_for_review
-- no longer requires at least one phase. Everything else it checks is unchanged.
--
-- The job feed still requires areas: worker_matches_job() needs a matching worker_areas row, so an
-- approved worker with no phases sees no jobs and cannot express interest until set_my_areas() is called.
-- set_my_areas() is unchanged and works before and after approval.
--
-- create or replace keeps the existing owner and execute grants of the function.

create or replace function public.submit_for_review()
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
    -- Phases (service areas) are chosen after approval, not before submission.
  end if;
  update public.profiles set verification_status = 'pending', verification_reason = null,
    verification_updated_at = now() where id = v_uid;
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (v_uid, 'submit_for_review', 'profiles', v_uid::text);
  perform private.notify_admins('verification_submitted', null, jsonb_build_object('profile_id', v_uid, 'role', v_p.role));
end;
$$;
