-- Migration 0039: suspend and reactivate an account (portal screen A13).
--
-- Suspending ends every session and push token at once (trigger from 0036). A suspended worker's live jobs are
-- flagged "under review: worker_suspended" so staff can resume, replace or cancel them (phase 2 screens); the job
-- status itself is not changed here. Admin accounts cannot be suspended or reactivated through this function, and
-- nobody can suspend themselves.

create function public.admin_set_account_status(p_profile uuid, p_suspend boolean, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_job uuid;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_profile = v_uid then
    raise exception 'you cannot change your own account';
  end if;
  select * into v_p from public.profiles where id = p_profile for update;
  if not found or v_p.role not in ('worker', 'resident') then
    raise exception 'no such user';
  end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'write a reason (3 to 500 characters)';
  end if;

  if p_suspend then
    if v_p.account_status = 'suspended' then
      raise exception 'this account is already suspended';
    end if;
    update public.profiles
       set account_status = 'suspended', suspended_at = now(), suspension_reason = v_reason
     where id = p_profile;
    if v_p.role = 'worker' then
      for v_job in
        select j.id from public.jobs j
         where j.status in ('scheduled', 'in_progress')
           and exists (select 1 from public.quotes q where q.job_id = j.id and q.worker_id = p_profile and q.status = 'accepted')
           and j.under_review_reason is null
         for update
      loop
        update public.jobs set under_review_reason = 'worker_suspended' where id = v_job;
        perform private.record(v_job, 'under_review', v_uid, jsonb_build_object('reason', 'worker_suspended'));
      end loop;
    end if;
  else
    if v_p.account_status <> 'suspended' then
      raise exception 'this account is not suspended';
    end if;
    update public.profiles
       set account_status = 'active', suspended_at = null, suspended_until = null, suspension_reason = null
     where id = p_profile;
    perform private.notify(p_profile, 'account_reactivated', null, '{}'::jsonb);
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data, reason)
  values (v_uid, case when p_suspend then 'account_suspended' else 'account_reactivated' end, 'profiles', p_profile::text,
          jsonb_build_object('account_status', v_p.account_status),
          jsonb_build_object('account_status', case when p_suspend then 'suspended' else 'active' end), v_reason);
end;
$$;

revoke all on function public.admin_set_account_status(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_account_status(uuid, boolean, text) to authenticated;
