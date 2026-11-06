-- 0034: the sign-in phone of an account cannot be changed (Shariq, 6 Nov: no change-number feature).
-- Without this, any signed-in user could call updateUser({phone}) on the API and move the account to another number.
-- Blocked here, in the database, so it holds for every client:
--   * a phone that is already set never changes to another value or to empty (GoTrue writes auth.users.phone only
--     after the code on the NEW number is confirmed, so this stops that step), and
--   * a pending change (auth.users.phone_change) cannot be started, so no code is sent to a new number.
-- Still allowed: the first time a phone is set (null to a number: sign-up, or staff linking a phone to an email
-- account, OPEN-QUESTIONS #8). Moving an account to a new number is a database/staff action; see docs/SECURITY.md.
create function public.lock_login_phone()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if nullif(old.phone, '') is not null and new.phone is distinct from old.phone then
    raise exception 'the sign-in number cannot be changed' using errcode = 'P0001';
  end if;
  if nullif(new.phone_change, '') is not null and new.phone_change is distinct from old.phone_change then
    raise exception 'the sign-in number cannot be changed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.lock_login_phone() from public, anon, authenticated;
grant execute on function public.lock_login_phone() to supabase_auth_admin;

create trigger lock_login_phone
  before update of phone, phone_change on auth.users
  for each row execute function public.lock_login_phone();
