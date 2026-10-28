-- 0014: minimum privileges for the send-push Edge Function (supabase/functions/send-push).
--
-- The function connects as service_role. service_role bypasses RLS, so these column-level grants are
-- the only limit on what it can touch; they match the function's queries exactly (index.ts):
--   listUnsent   select id, user_id, type, job_id, payload where push_sent_at is null and created_at >= ...
--   claim        update push_sent_at where id = ... and push_sent_at is null returning id
--   release      update push_sent_at = null where id in (...)
--   tokensFor    select user_id, push_token from device_tokens join profiles (account_status = 'active')
--   deleteTokens delete from device_tokens where push_token in (...)
-- Nothing is granted to anon or authenticated, and no RLS policy changes.
-- No INSERT anywhere, no sequences (no rows are created) and no function EXECUTE (it calls none).

-- Read unsent notifications. read_at is left out: the function never needs to know what a user has read.
grant select (id, user_id, type, job_id, payload, push_sent_at, created_at) on public.notifications to service_role;

-- Mark a notification as pushed, or put it back for retry. Only this one column can be changed.
grant update (push_sent_at) on public.notifications to service_role;

-- Look up the recipient's push tokens. platform and updated_at are left out.
grant select (user_id, push_token) on public.device_tokens to service_role;

-- Remove tokens Expo reports as DeviceNotRegistered.
grant delete on public.device_tokens to service_role;

-- Skip suspended accounts. Only the key and the status: no name, phone, email, CNIC or role.
grant select (id, account_status) on public.profiles to service_role;
