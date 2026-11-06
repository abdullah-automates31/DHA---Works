-- Migration 0035: clear_my_notifications deletes only the caller's own notifications.
begin;
select no_plan();

create schema tests;
grant usage on schema tests to authenticated;
create function tests.act(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.back() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;
grant execute on function tests.act(uuid), tests.back() to authenticated;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'n1@test.dev'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'n2@test.dev');
insert into public.profiles (id, role, full_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'worker', 'N One'),
  ('00000000-0000-0000-0000-0000000000d2', 'worker', 'N Two');
insert into public.notifications (user_id, type) values
  ('00000000-0000-0000-0000-0000000000d1', 'job_accepted'),
  ('00000000-0000-0000-0000-0000000000d1', 'job_accepted'),
  ('00000000-0000-0000-0000-0000000000d2', 'job_accepted');

select tests.act('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$ select public.clear_my_notifications() $$, 'a user can clear their notifications');
select is((select count(*)::int from public.notifications), 0, 'their notifications are gone');
select tests.back();
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000d2'), 1, 'another user keeps theirs');

select tests.act('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$ delete from public.notifications $$, '42501', null, 'there is still no direct delete');
select tests.back();

select * from finish();
rollback;
