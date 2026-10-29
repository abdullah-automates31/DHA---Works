-- Test for the PROPOSAL 20261029000018_lock_identity_during_review.sql.
-- Run with: bash supabase/proposals/run_proposal_test.sh (applies the proposal inside a transaction and rolls back).
-- The proposal SQL is placed before this body by the runner; nothing is kept in the database.
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
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'w@test.dev');
insert into public.profiles (id, role, full_name, email, phone, cnic, gender, date_of_birth, verification_status)
values ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Usman Khan', 'w@test.dev', '+923214567890',
        '42101-5678901-3', 'male', date '1994-03-14', 'incomplete');

-- Editable while incomplete and while changes were requested.
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.update_my_profile('Usman Ali Khan')$$, 'incomplete: name can change');
select lives_ok($$select public.update_my_profile(p_cnic => '42101-5678901-4')$$, 'incomplete: CNIC can change');
select tests.back();
update public.profiles set verification_status = 'needs_changes' where id = '00000000-0000-0000-0000-0000000000b1';
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.update_my_profile(p_gender => 'female')$$, 'needs_changes: gender can change');
select lives_ok($$select public.update_my_profile(p_date_of_birth => date '1994-03-15')$$, 'needs_changes: date of birth can change');
select tests.back();

-- Locked in every other status, for each identity field.
do $$
declare s text;
begin
  foreach s in array array['pending', 'visit_hq', 'rejected', 'approved'] loop
    update public.profiles set verification_status = s::public.verification_status
      where id = '00000000-0000-0000-0000-0000000000b1';
    perform tests.act('00000000-0000-0000-0000-0000000000b1');
    begin
      perform public.update_my_profile('Changed Name');
      raise exception 'name update was allowed while %', s;
    exception when others then
      if sqlerrm not like '%cannot be changed%' then raise; end if;
    end;
    begin
      perform public.update_my_profile(p_cnic => '42101-0000000-0');
      raise exception 'cnic update was allowed while %', s;
    exception when others then
      if sqlerrm not like '%cannot be changed%' then raise; end if;
    end;
    begin
      perform public.update_my_profile(p_gender => 'male');
      raise exception 'gender update was allowed while %', s;
    exception when others then
      if sqlerrm not like '%cannot be changed%' then raise; end if;
    end;
    begin
      perform public.update_my_profile(p_date_of_birth => date '1990-01-01');
      raise exception 'date of birth update was allowed while %', s;
    exception when others then
      if sqlerrm not like '%cannot be changed%' then raise; end if;
    end;
    perform tests.back();
  end loop;
end $$;
select pass('name, CNIC, gender and date of birth are locked while pending, visit_hq, rejected and approved');

-- Contact details stay editable, and an empty update is harmless.
update public.profiles set verification_status = 'pending' where id = '00000000-0000-0000-0000-0000000000b1';
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.update_my_profile(p_phone => '+923331234567')$$, 'pending: phone can still change');
select lives_ok($$select public.update_my_profile(p_locale => 'en')$$, 'pending: locale can still change');
select lives_ok($$select public.update_my_profile()$$, 'pending: an update with no values is harmless');
select tests.back();

select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'Usman Ali Khan',
  'the locked name kept its last allowed value');
select is((select cnic from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), '42101-5678901-4',
  'the locked CNIC kept its last allowed value');

select * from finish();
