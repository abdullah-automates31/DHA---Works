-- Migration 0034: the sign-in phone cannot be changed once set.
begin;
select no_plan();

insert into auth.users (id, aud, role, phone) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', '923001110011');
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'lock@test.dev');

select throws_ok($$ update auth.users set phone = '923001110099' where id = '00000000-0000-0000-0000-0000000000c1' $$,
                 'P0001', 'the sign-in number cannot be changed', 'a set phone cannot be changed');
select throws_ok($$ update auth.users set phone = null where id = '00000000-0000-0000-0000-0000000000c1' $$,
                 'P0001', 'the sign-in number cannot be changed', 'a set phone cannot be cleared');
select throws_ok($$ update auth.users set phone_change = '923001110099', phone_change_token = 'x' where id = '00000000-0000-0000-0000-0000000000c1' $$,
                 'P0001', 'the sign-in number cannot be changed', 'a number change cannot be started');
select is((select phone from auth.users where id = '00000000-0000-0000-0000-0000000000c1'), '923001110011', 'the phone is unchanged');

select lives_ok($$ update auth.users set phone = '923001110012' where id = '00000000-0000-0000-0000-0000000000c2' $$,
                'a phone can be set the first time (staff linking an email account)');
select lives_ok($$ update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000c1' $$,
                'other updates are not affected');

select * from finish();
rollback;
