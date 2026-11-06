-- 0035: "Clear all" in the notifications screen. A user deletes only their own notifications; there is no table
-- delete grant, so this definer function is the only way, and it is scoped to auth.uid().
create function public.clear_my_notifications()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.notifications where user_id = auth.uid();
$$;
revoke all on function public.clear_my_notifications() from public, anon;
grant execute on function public.clear_my_notifications() to authenticated;
