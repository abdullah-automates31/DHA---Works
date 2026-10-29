-- PROPOSAL (not applied, not in supabase/migrations). Review, then move to supabase/migrations to adopt.
--
-- Problem: update_my_profile locks name, gender, date of birth and CNIC only once the account is 'approved'.
-- While the application is under review ('pending'), or after staff answered 'visit_hq' or 'rejected', the
-- applicant can still rewrite those fields. Staff could be comparing the CNIC photos against the typed CNIC
-- while the typed value changes underneath them, and a rejected applicant could re-label the same account.
--
-- Change: identity fields can be edited only while the status is 'incomplete' or 'needs_changes'
-- (the two statuses from which submit_for_review is allowed). Contact details (phone, avatar, locale) stay
-- editable at any time, as today. To change a locked field the person contacts DHA staff (unchanged copy).
--
-- Behaviour change for apps: an update that touches a locked field now fails with the message below
-- for 'pending', 'visit_hq', 'rejected' and 'approved' (the message now says "cannot be changed", which the app already maps). W02 hides the edit path in those states anyway.
-- Nothing else changes; create or replace keeps owner and grants.

create or replace function public.update_my_profile(
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
  if v_p.verification_status not in ('incomplete', 'needs_changes')
     and (p_full_name is not null or p_gender is not null or p_date_of_birth is not null or p_cnic is not null) then
    raise exception 'name, gender, date of birth and CNIC cannot be changed while your application is under review or after a decision; contact DHA staff';
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
