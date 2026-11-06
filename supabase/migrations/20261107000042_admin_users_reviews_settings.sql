-- Migration 0042: admin users, reviews, settings and staff accounts (portal screens A12, A13, A14, A15).
--
-- Same rules as 0038 and 0041: a VERIFIED admin session for everything (`is_admin()`), plain-English refusals, an audit row
-- for every change, explicit grants. Opening a person's page shows identity data, so it is itself audited (like the
-- verification detail); the CNIC is always masked. Decided here (recorded in docs/OPEN-QUESTIONS.md):
--   * Staff notes are a staff-only table and cannot be edited or deleted.
--   * "Send a message" is a notification (type staff_message) to an active worker or resident.
--   * A staff member hides a review instead of deleting it; a hidden review no longer counts in the worker's average
--     (a trigger recomputes it, so new ratings cannot bring it back) and can be shown again.
--   * Settings are a fixed list of keys with limits; categories and phases can be switched off (never all of them) and
--     categories can be added and renamed, not deleted.
--   * Removing an admin suspends the account (all sessions end); the last active admin cannot be removed.

-- Staff notes ------------------------------------------------------------------------------------------------------
create table public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  note text not null check (char_length(note) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index staff_notes_profile_idx on public.staff_notes (profile_id, created_at desc);
alter table public.staff_notes enable row level security;

-- Hidden reviews --------------------------------------------------------------------------------------------------
alter table public.reviews
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles (id),
  add column hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 500),
  add constraint reviews_hidden_pair check ((hidden_at is null) = (hidden_by is null));

create function private.recompute_worker_rating(p_worker uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.worker_details wd set
    rating_count = s.n,
    rating_avg = coalesce(round(s.avg_score, 2), 0)
  from (select count(*) as n, avg((behaviour + completeness + quality) / 3.0) as avg_score
          from public.reviews where worker_id = p_worker and hidden_at is null) s
  where wd.profile_id = p_worker;
$$;

create function private.reviews_rating_trigger()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.recompute_worker_rating(new.worker_id);
  return new;
end;
$$;

revoke all on function private.recompute_worker_rating(uuid), private.reviews_rating_trigger() from public, anon, authenticated;

create trigger reviews_rating_after_change
  after insert or update of hidden_at on public.reviews
  for each row execute function private.reviews_rating_trigger();

-- ---------------------------------------------------------------------------------------------------------------
-- Users (A12, A13)
-- ---------------------------------------------------------------------------------------------------------------

create function public.admin_users_counts()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'workers', (select count(*) from public.profiles where role = 'worker' and verification_status = 'approved'),
    'residents', (select count(*) from public.profiles where role = 'resident' and verification_status = 'approved'));
end;
$$;

-- Approved people only. p_state: all, active, suspended, open_reports. p_phase: a worker's area or a resident's address.
create function public.admin_users_list(
  p_role public.user_role,
  p_state text default 'all',
  p_phase smallint default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like text;
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_role not in ('worker', 'resident') then
    raise exception 'role must be worker or resident';
  end if;
  if p_state is null or p_state not in ('all', 'active', 'suspended', 'open_reports') then
    raise exception 'state must be all, active, suspended or open_reports';
  end if;
  v_like := private.like_pattern(p_search);

  with m as (
    select p.id, p.full_name, p.phone, p.account_status, p.created_at,
           (select count(*) from public.reports r where r.against_id = p.id and r.status <> 'resolved') as open_reports
      from public.profiles p
     where p.role = p_role and p.verification_status = 'approved'
       and (p_state = 'all' or (p_state = 'active' and p.account_status = 'active')
            or (p_state = 'suspended' and p.account_status = 'suspended')
            or (p_state = 'open_reports' and exists (select 1 from public.reports r where r.against_id = p.id and r.status <> 'resolved')))
       and (v_like is null or p.full_name ilike v_like or p.phone ilike v_like or p.cnic ilike v_like)
       and (p_phase is null
            or (p_role = 'worker' and exists (select 1 from public.worker_areas wa where wa.worker_id = p.id and wa.phase = p_phase))
            or (p_role = 'resident' and exists (select 1 from public.addresses a where a.resident_id = p.id and a.phase = p_phase)))
  ), pg as (
    select * from m order by full_name, id limit v_limit offset v_offset
  )
  select (select count(*) from m),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id, 'full_name', pg.full_name, 'phone', pg.phone, 'account_status', pg.account_status,
           'open_reports', pg.open_reports,
           'categories', (select string_agg(c.name, ', ' order by c.sort) from public.worker_categories wc
                            join public.categories c on c.id = wc.category_id where wc.worker_id = pg.id),
           'phases', case when p_role = 'worker'
                          then (select coalesce(jsonb_agg(wa.phase order by wa.phase), '[]'::jsonb) from public.worker_areas wa where wa.worker_id = pg.id)
                          else (select coalesce(jsonb_agg(distinct a.phase), '[]'::jsonb) from public.addresses a where a.resident_id = pg.id) end,
           'rating_avg', (select wd.rating_avg from public.worker_details wd where wd.profile_id = pg.id),
           'rating_count', (select wd.rating_count from public.worker_details wd where wd.profile_id = pg.id),
           'jobs_count', case when p_role = 'worker'
                              then (select wd.jobs_done from public.worker_details wd where wd.profile_id = pg.id)
                              else (select count(*) from public.jobs j where j.resident_id = pg.id and j.status <> 'draft') end)
           order by pg.full_name, pg.id), '[]'::jsonb)
    into v_total, v_rows
    from pg;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- One person's page. Audited: it shows identity data (masked CNIC) and document paths.
create function public.admin_user_detail(p_profile uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.profiles;
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = p_profile and role in ('worker', 'resident') and verification_status = 'approved';
  if not found then
    raise exception 'no such user';
  end if;

  v_out := jsonb_build_object(
    'id', v_p.id, 'role', v_p.role, 'full_name', v_p.full_name, 'phone', v_p.phone, 'email', v_p.email,
    'cnic_masked', case when v_p.cnic is null then null else left(v_p.cnic, 5) || '-*******-' || right(v_p.cnic, 1) end,
    'created_at', v_p.created_at, 'avatar_path', v_p.avatar_path,
    'account_status', v_p.account_status, 'suspended_at', v_p.suspended_at, 'suspension_reason', v_p.suspension_reason,
    'verified_at', (select max(decided_at) from public.verification_decisions where profile_id = p_profile and decision = 'approve'),
    'open_reports', (select count(*) from public.reports where against_id = p_profile and status <> 'resolved'),
    'past_suspensions', (select count(*) from public.audit_log where action = 'account_suspended' and record_id = p_profile::text),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('type', d.doc_type, 'path', d.storage_path) order by d.doc_type), '[]'::jsonb)
                    from public.verification_documents d where d.profile_id = p_profile),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'note', n.note, 'created_at', n.created_at,
                                                          'author_name', (select full_name from public.profiles where id = n.author_id))
                                        order by n.created_at desc), '[]'::jsonb)
                from public.staff_notes n where n.profile_id = p_profile));

  if v_p.role = 'worker' then
    v_out := v_out || jsonb_build_object(
      'worker', (select jsonb_build_object('experience_years', w.experience_years, 'about', w.about, 'rating_avg', w.rating_avg,
                                           'rating_count', w.rating_count, 'jobs_done', w.jobs_done)
                   from public.worker_details w where w.profile_id = p_profile),
      'categories', (select coalesce(jsonb_agg(c.name order by c.sort), '[]'::jsonb)
                       from public.worker_categories wc join public.categories c on c.id = wc.category_id where wc.worker_id = p_profile),
      'phases', (select coalesce(jsonb_agg(wa.phase order by wa.phase), '[]'::jsonb) from public.worker_areas wa where wa.worker_id = p_profile),
      'recent_jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'title', x.title, 'status', x.status,
                                                                   'other_name', x.other_name, 'quote_total', x.quote_total)
                                                order by x.updated_at desc), '[]'::jsonb)
                        from (select j.id, j.code, j.title, j.status, j.updated_at, rp.full_name as other_name,
                                     (select q.total from public.quotes q where q.id = j.accepted_quote_id) as quote_total
                                from public.jobs j join public.profiles rp on rp.id = j.resident_id
                               where j.accepted_worker_id = p_profile
                               order by j.updated_at desc limit 5) x));
  else
    v_out := v_out || jsonb_build_object(
      'addresses', (select coalesce(jsonb_agg(jsonb_build_object('label', a.label, 'phase', a.phase, 'lane', a.lane, 'plot_no', a.plot_no, 'floor', a.floor)
                                              order by a.is_default desc, a.created_at), '[]'::jsonb)
                      from public.addresses a where a.resident_id = p_profile),
      'jobs_count', (select count(*) from public.jobs where resident_id = p_profile and status <> 'draft'),
      'recent_jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'title', x.title, 'status', x.status,
                                                                   'other_name', x.other_name, 'quote_total', x.quote_total)
                                                order by x.updated_at desc), '[]'::jsonb)
                        from (select j.id, j.code, j.title, j.status, j.updated_at, wp.full_name as other_name,
                                     (select q.total from public.quotes q where q.id = j.accepted_quote_id) as quote_total
                                from public.jobs j left join public.profiles wp on wp.id = j.accepted_worker_id
                               where j.resident_id = p_profile and j.status <> 'draft'
                               order by j.updated_at desc limit 5) x));
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (auth.uid(), 'user_viewed', 'profiles', p_profile::text);
  return v_out;
end;
$$;

create function public.admin_add_staff_note(p_profile uuid, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) > 1000 then
    raise exception 'write a note (1000 characters at most)';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile and role in ('worker', 'resident')) then
    raise exception 'no such user';
  end if;
  insert into public.staff_notes (profile_id, author_id, note) values (p_profile, auth.uid(), v_note);
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (auth.uid(), 'staff_note_added', 'profiles', p_profile::text);
end;
$$;

create function public.admin_send_message(p_profile uuid, p_text text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if v_text is null or char_length(v_text) < 3 or char_length(v_text) > 300 then
    raise exception 'write a message (3 to 300 characters)';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile and role in ('worker', 'resident') and account_status = 'active') then
    raise exception 'that person cannot receive a message';
  end if;
  perform private.notify(p_profile, 'staff_message', null, jsonb_build_object('text', v_text));
  insert into public.audit_log (actor_id, action, table_name, record_id, reason)
  values (auth.uid(), 'staff_message_sent', 'profiles', p_profile::text, v_text);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Reviews (A15)
-- ---------------------------------------------------------------------------------------------------------------

-- p_stars: all, 5, 4, 3, low (2 or less), hidden. The star count is the rounded average of the three scores.
create function public.admin_reviews_list(
  p_stars text default 'all',
  p_category smallint default null,
  p_worker uuid default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like text;
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_stars is null or p_stars not in ('all', '5', '4', '3', 'low', 'hidden') then
    raise exception 'stars must be all, 5, 4, 3, low or hidden';
  end if;
  v_like := private.like_pattern(p_search);

  with m as (
    select r.id, r.created_at, r.comment, r.hire_again, r.behaviour, r.completeness, r.quality, r.hidden_at, r.hidden_reason,
           (r.behaviour + r.completeness + r.quality) / 3.0 as score,
           wp.id as worker_id, wp.full_name as worker_name, rp.full_name as resident_name, j.id as job_id, j.code as job_code,
           (select c.name from public.worker_categories wc join public.categories c on c.id = wc.category_id
             where wc.worker_id = wp.id order by c.sort limit 1) as category
      from public.reviews r
      join public.profiles wp on wp.id = r.worker_id
      join public.profiles rp on rp.id = r.resident_id
      join public.jobs j on j.id = r.job_id
     where (p_worker is null or r.worker_id = p_worker)
       and (p_category is null or exists (select 1 from public.worker_categories wc where wc.worker_id = r.worker_id and wc.category_id = p_category))
       and (v_like is null or wp.full_name ilike v_like or rp.full_name ilike v_like or j.code ilike v_like or r.comment ilike v_like)
       and (p_stars = 'all'
            or (p_stars = 'hidden' and r.hidden_at is not null)
            or (p_stars = '5' and (r.behaviour + r.completeness + r.quality) >= 13.5)
            or (p_stars = '4' and (r.behaviour + r.completeness + r.quality) >= 10.5 and (r.behaviour + r.completeness + r.quality) < 13.5)
            or (p_stars = '3' and (r.behaviour + r.completeness + r.quality) >= 7.5 and (r.behaviour + r.completeness + r.quality) < 10.5)
            or (p_stars = 'low' and (r.behaviour + r.completeness + r.quality) < 7.5))
  ), pg as (
    select * from m order by created_at desc, id limit v_limit offset v_offset
  )
  select (select count(*) from m),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id, 'created_at', pg.created_at, 'comment', pg.comment, 'hire_again', pg.hire_again,
           'behaviour', pg.behaviour, 'completeness', pg.completeness, 'quality', pg.quality, 'score', round(pg.score, 2),
           'hidden_at', pg.hidden_at, 'hidden_reason', pg.hidden_reason, 'worker_id', pg.worker_id, 'worker_name', pg.worker_name,
           'category', pg.category, 'resident_name', pg.resident_name, 'job_id', pg.job_id, 'job_code', pg.job_code)
           order by pg.created_at desc, pg.id), '[]'::jsonb)
    into v_total, v_rows
    from pg;

  return jsonb_build_object('total', v_total, 'rows', v_rows,
                            'hidden', (select count(*) from public.reviews where hidden_at is not null),
                            'all', (select count(*) from public.reviews));
end;
$$;

create function public.admin_set_review_hidden(p_review uuid, p_hidden boolean, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.reviews;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_hidden is null then
    raise exception 'choose hide or show';
  end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'write a reason (3 to 500 characters)';
  end if;
  select * into v_r from public.reviews where id = p_review for update;
  if not found then
    raise exception 'no such review';
  end if;
  if p_hidden and v_r.hidden_at is not null then
    raise exception 'this review is already hidden';
  end if;
  if not p_hidden and v_r.hidden_at is null then
    raise exception 'this review is not hidden';
  end if;
  update public.reviews
     set hidden_at = case when p_hidden then now() end, hidden_by = case when p_hidden then v_uid end,
         hidden_reason = case when p_hidden then v_reason end
   where id = p_review;
  insert into public.audit_log (actor_id, action, table_name, record_id, reason)
  values (v_uid, case when p_hidden then 'review_hidden' else 'review_shown' end, 'reviews', p_review::text, v_reason);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Settings (A14)
-- ---------------------------------------------------------------------------------------------------------------

create function public.admin_settings_get()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'subtitle', c.subtitle, 'active', c.active,
                                                               'workers', (select count(*) from public.worker_categories wc where wc.category_id = c.id))
                                             order by c.sort, c.id), '[]'::jsonb)
                     from public.categories c),
    'phases', (select coalesce(jsonb_agg(jsonb_build_object('phase', phase, 'active', active) order by phase), '[]'::jsonb) from public.service_areas),
    'helpline_number', coalesce((select value #>> '{}' from public.app_settings where key = 'helpline_number'), ''),
    'helpline_enabled', coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'helpline_enabled'), false),
    'report_window_days', private.setting_int('report_window_days', 7),
    'review_window_days', private.setting_int('review_window_days', 7));
end;
$$;

create function public.admin_save_settings(
  p_helpline_number text, p_helpline_enabled boolean, p_report_window_days integer, p_review_window_days integer
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_number text := btrim(coalesce(p_helpline_number, ''));
  v_old jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if v_number <> '' and v_number !~ '^[0-9+ -]{3,20}$' then
    raise exception 'the helpline number can only have digits, spaces, + and - (3 to 20 characters)';
  end if;
  if p_helpline_enabled is null then
    raise exception 'choose whether to show the helpline';
  end if;
  if p_helpline_enabled and v_number = '' then
    raise exception 'enter the helpline number before showing it in the apps';
  end if;
  if p_report_window_days is null or p_report_window_days not between 1 and 30 then
    raise exception 'the report window must be 1 to 30 days';
  end if;
  if p_review_window_days is null or p_review_window_days not between 1 and 30 then
    raise exception 'the review window must be 1 to 30 days';
  end if;

  v_old := public.admin_settings_get() - 'categories' - 'phases';
  update public.app_settings set value = to_jsonb(v_number), updated_by = v_uid where key = 'helpline_number';
  update public.app_settings set value = to_jsonb(p_helpline_enabled), updated_by = v_uid where key = 'helpline_enabled';
  update public.app_settings set value = to_jsonb(p_report_window_days), updated_by = v_uid where key = 'report_window_days';
  update public.app_settings set value = to_jsonb(p_review_window_days), updated_by = v_uid where key = 'review_window_days';
  insert into public.audit_log (actor_id, action, table_name, old_data, new_data)
  values (v_uid, 'settings_saved', 'app_settings', v_old,
          jsonb_build_object('helpline_number', v_number, 'helpline_enabled', p_helpline_enabled,
                             'report_window_days', p_report_window_days, 'review_window_days', p_review_window_days));
end;
$$;

create function public.admin_add_category(p_name text, p_subtitle text)
returns smallint
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_sub text := nullif(btrim(coalesce(p_subtitle, '')), '');
  v_slug text;
  v_id smallint;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if char_length(v_name) not between 2 and 40 then
    raise exception 'the category name must be 2 to 40 characters';
  end if;
  if v_sub is not null and char_length(v_sub) > 80 then
    raise exception 'the description is too long (80 characters at most)';
  end if;
  v_slug := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  if v_slug = '' then
    raise exception 'the category name needs letters or numbers';
  end if;
  if exists (select 1 from public.categories where slug = v_slug or lower(name) = lower(v_name)) then
    raise exception 'a category with that name already exists';
  end if;
  if (select count(*) from public.categories) >= 30 then
    raise exception 'there are already 30 categories';
  end if;
  insert into public.categories (slug, name, subtitle, sort)
  values (v_slug, v_name, v_sub, coalesce((select max(sort) from public.categories), 0) + 1)
  returning id into v_id;
  insert into public.audit_log (actor_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'category_added', 'categories', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

create function public.admin_update_category(p_id smallint, p_name text, p_subtitle text, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.categories;
  v_name text := btrim(coalesce(p_name, ''));
  v_sub text := nullif(btrim(coalesce(p_subtitle, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  select * into v_c from public.categories where id = p_id for update;
  if not found then
    raise exception 'no such category';
  end if;
  if char_length(v_name) not between 2 and 40 then
    raise exception 'the category name must be 2 to 40 characters';
  end if;
  if v_sub is not null and char_length(v_sub) > 80 then
    raise exception 'the description is too long (80 characters at most)';
  end if;
  if p_active is null then
    raise exception 'choose on or off';
  end if;
  if exists (select 1 from public.categories where id <> p_id and lower(name) = lower(v_name)) then
    raise exception 'a category with that name already exists';
  end if;
  if not p_active and v_c.active and (select count(*) from public.categories where active and id <> p_id) = 0 then
    raise exception 'at least one category must stay on';
  end if;
  update public.categories set name = v_name, subtitle = v_sub, active = p_active where id = p_id;
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), 'category_updated', 'categories', p_id::text,
          jsonb_build_object('name', v_c.name, 'subtitle', v_c.subtitle, 'active', v_c.active),
          jsonb_build_object('name', v_name, 'subtitle', v_sub, 'active', p_active));
end;
$$;

create function public.admin_set_phase_active(p_phase smallint, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old boolean;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'choose on or off';
  end if;
  select active into v_old from public.service_areas where phase = p_phase for update;
  if not found then
    raise exception 'no such phase';
  end if;
  if not p_active and v_old and (select count(*) from public.service_areas where active and phase <> p_phase) = 0 then
    raise exception 'at least one phase must stay on';
  end if;
  update public.service_areas set active = p_active where phase = p_phase;
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), 'phase_updated', 'service_areas', p_phase::text, jsonb_build_object('active', v_old), jsonb_build_object('active', p_active));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Staff accounts (A14). Inviting and revoking invites already exist (0037).
-- ---------------------------------------------------------------------------------------------------------------

create function public.admin_staff_list()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'created_at', p.created_at,
                                                           'account_status', p.account_status, 'is_me', p.id = auth.uid())
                                         order by p.created_at, p.id), '[]'::jsonb)
                 from public.profiles p where p.role = 'admin'),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'created_at', i.created_at,
                                                            'expires_at', i.expires_at, 'expired', i.expires_at <= now())
                                          order by i.created_at desc), '[]'::jsonb)
                  from public.staff_invites i where i.status = 'pending'));
end;
$$;

create function public.admin_remove_staff(p_profile uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_profile = v_uid then
    raise exception 'you cannot remove your own account';
  end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'write a reason (3 to 500 characters)';
  end if;
  select * into v_p from public.profiles where id = p_profile and role = 'admin' for update;
  if not found then
    raise exception 'no such admin';
  end if;
  if v_p.account_status <> 'active' then
    raise exception 'this admin is already removed';
  end if;
  if (select count(*) from public.profiles where role = 'admin' and account_status = 'active' and id <> p_profile) = 0 then
    raise exception 'the last active admin cannot be removed';
  end if;
  update public.profiles set account_status = 'suspended', suspended_at = now(), suspension_reason = v_reason where id = p_profile;
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data, reason)
  values (v_uid, 'staff_removed', 'profiles', p_profile::text, jsonb_build_object('account_status', 'active'),
          jsonb_build_object('account_status', 'suspended'), v_reason);
end;
$$;

-- Grants ----------------------------------------------------------------------------------------------------------
revoke all on function
  public.admin_users_counts(),
  public.admin_users_list(public.user_role, text, smallint, text, integer, integer),
  public.admin_user_detail(uuid),
  public.admin_add_staff_note(uuid, text),
  public.admin_send_message(uuid, text),
  public.admin_reviews_list(text, smallint, uuid, text, integer, integer),
  public.admin_set_review_hidden(uuid, boolean, text),
  public.admin_settings_get(),
  public.admin_save_settings(text, boolean, integer, integer),
  public.admin_add_category(text, text),
  public.admin_update_category(smallint, text, text, boolean),
  public.admin_set_phase_active(smallint, boolean),
  public.admin_staff_list(),
  public.admin_remove_staff(uuid, text)
from public, anon;
grant execute on function
  public.admin_users_counts(),
  public.admin_users_list(public.user_role, text, smallint, text, integer, integer),
  public.admin_user_detail(uuid),
  public.admin_add_staff_note(uuid, text),
  public.admin_send_message(uuid, text),
  public.admin_reviews_list(text, smallint, uuid, text, integer, integer),
  public.admin_set_review_hidden(uuid, boolean, text),
  public.admin_settings_get(),
  public.admin_save_settings(text, boolean, integer, integer),
  public.admin_add_category(text, text),
  public.admin_update_category(smallint, text, text, boolean),
  public.admin_set_phase_active(smallint, boolean),
  public.admin_staff_list(),
  public.admin_remove_staff(uuid, text)
to authenticated;
