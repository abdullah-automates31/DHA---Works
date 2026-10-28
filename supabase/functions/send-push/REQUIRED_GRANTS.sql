-- NOT a migration and NOT applied anywhere. These are the minimum grants the send-push function needs.
-- Today service_role has no SELECT/UPDATE/DELETE on these tables (found by integration/run.sh), so the
-- deployed function would fail. Turning this into a migration needs the user's go-ahead.
-- Least privilege: it can read unsent notifications and mark them sent (one column), read and delete
-- device tokens, and read just enough of profiles to skip suspended accounts. No INSERT anywhere.
grant select on public.notifications to service_role;
grant update (push_sent_at) on public.notifications to service_role;
grant select, delete on public.device_tokens to service_role;
grant select (id, account_status) on public.profiles to service_role;
