-- Migration 0036: new sign-in notice and sessions ended on suspension.
begin;
select no_plan();

insert into auth.users (id, aud, role, phone) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', '923001110021'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', '923001110022');
insert into public.profiles (id, role, full_name, phone) values
  ('00000000-0000-0000-0000-0000000000d1', 'worker', 'Guard One', '+923001110021');

-- First session: nothing announced.
insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000d1' and type = 'new_sign_in'),
          0, 'the first sign-in is not announced');

-- Second session (another device): announced once, with no personal data in the payload.
insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000d1' and type = 'new_sign_in'),
          1, 'a new sign-in on an account with a session is announced');
select is((select payload from public.notifications where user_id = '00000000-0000-0000-0000-0000000000d1' and type = 'new_sign_in'),
          '{}'::jsonb, 'the notice carries no data');

-- An account without a profile (staff email account, half-registered) must still be able to sign in.
insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000d2');
select lives_ok($$ insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-00000000bb02', '00000000-0000-0000-0000-0000000000d2') $$,
                'a second session for an account without a profile is not blocked');

-- A broken notice cannot block a sign-in: make the insert fail and sign in anyway.
alter table public.notifications add constraint force_fail check (type <> 'new_sign_in') not valid;
select lives_ok($$ insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-0000000000d1') $$,
                'a failing notice does not block the sign-in');
alter table public.notifications drop constraint force_fail;

-- Suspension ends every session and push token.
insert into public.device_tokens (user_id, push_token, platform) values
  ('00000000-0000-0000-0000-0000000000d1', 'ExponentPushToken[abcdefghijklmnopqrstuv]', 'android');
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000d1'), 3, 'three sessions before suspension');
update public.profiles set account_status = 'suspended' where id = '00000000-0000-0000-0000-0000000000d1';
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000d1'), 0, 'suspension ends all sessions');
select is((select count(*)::int from public.device_tokens where user_id = '00000000-0000-0000-0000-0000000000d1'), 0, 'suspension removes the push tokens');
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000d2'), 2, 'other accounts keep their sessions');

-- Not callable by the app roles.
select is((select has_function_privilege('authenticated', 'public.notify_new_sign_in()', 'execute')), false, 'authenticated cannot run the sign-in trigger function');
select is((select has_function_privilege('anon', 'public.end_sessions_on_suspend()', 'execute')), false, 'anon cannot run the suspend trigger function');

select * from finish();
rollback;
