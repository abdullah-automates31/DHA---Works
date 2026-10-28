-- Pins the privileges migration 0014 gives service_role for the send-push function, and checks that
-- nothing leaked to app users. If a grant is widened or narrowed by accident, this file fails.
begin;
select no_plan();

-- notifications: read the push columns, change only push_sent_at, never create or delete.
select ok(has_column_privilege('service_role', 'public.notifications', c, 'SELECT'), 'service_role reads notifications.' || c)
from unnest(array['id', 'user_id', 'type', 'job_id', 'payload', 'push_sent_at', 'created_at']) c;
select ok(not has_column_privilege('service_role', 'public.notifications', 'read_at', 'SELECT'), 'service_role cannot read read_at');
select ok(has_column_privilege('service_role', 'public.notifications', 'push_sent_at', 'UPDATE'), 'service_role updates push_sent_at');
select ok(not has_column_privilege('service_role', 'public.notifications', c, 'UPDATE'), 'service_role cannot update notifications.' || c)
from unnest(array['id', 'user_id', 'type', 'job_id', 'payload', 'read_at', 'created_at']) c;
select ok(not has_table_privilege('service_role', 'public.notifications', 'INSERT'), 'service_role cannot create notifications');
select ok(not has_table_privilege('service_role', 'public.notifications', 'DELETE'), 'service_role cannot delete notifications');

-- device_tokens: read owner and token, delete dead tokens, nothing else.
select ok(has_column_privilege('service_role', 'public.device_tokens', 'user_id', 'SELECT'), 'service_role reads device_tokens.user_id');
select ok(has_column_privilege('service_role', 'public.device_tokens', 'push_token', 'SELECT'), 'service_role reads device_tokens.push_token');
select ok(not has_column_privilege('service_role', 'public.device_tokens', 'platform', 'SELECT'), 'service_role cannot read platform');
select ok(not has_column_privilege('service_role', 'public.device_tokens', 'updated_at', 'SELECT'), 'service_role cannot read updated_at');
select ok(has_table_privilege('service_role', 'public.device_tokens', 'DELETE'), 'service_role deletes dead tokens');
select ok(not has_table_privilege('service_role', 'public.device_tokens', 'INSERT'), 'service_role cannot add tokens');
select ok(not has_table_privilege('service_role', 'public.device_tokens', 'UPDATE'), 'service_role cannot move tokens between users');

-- profiles: only the key and the account status.
select ok(has_column_privilege('service_role', 'public.profiles', 'id', 'SELECT'), 'service_role reads profiles.id');
select ok(has_column_privilege('service_role', 'public.profiles', 'account_status', 'SELECT'), 'service_role reads profiles.account_status');
select ok(not has_column_privilege('service_role', 'public.profiles', c, 'SELECT'), 'service_role cannot read profiles.' || c)
from unnest(array['full_name', 'email', 'phone', 'role', 'verification_status']) c;
select ok(not has_table_privilege('service_role', 'public.profiles', 'UPDATE'), 'service_role cannot change profiles');

-- App users gained nothing.
select ok(not has_table_privilege(r, 'public.device_tokens', p), r || ' has no ' || p || ' on device_tokens')
from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;
select ok(not has_table_privilege(r, 'public.notifications', p), r || ' has no ' || p || ' on notifications')
from unnest(array['anon', 'authenticated']) r, unnest(array['INSERT', 'UPDATE', 'DELETE']) p;
select ok(not has_table_privilege('anon', 'public.notifications', 'SELECT'), 'anon cannot read notifications');
select ok(not has_column_privilege('anon', 'public.profiles', 'account_status', 'SELECT'), 'anon cannot read account status');

-- RLS is still on for both tables.
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'RLS still enabled on notifications');
select ok((select relrowsecurity from pg_class where oid = 'public.device_tokens'::regclass), 'RLS still enabled on device_tokens');

select * from finish();
rollback;
