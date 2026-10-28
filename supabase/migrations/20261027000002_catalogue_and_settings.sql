-- 0002: reference data managed by staff: categories, DHA phases, app settings.
-- These rows are reference data needed in every environment, so they are seeded here,
-- not in supabase/seed.sql (which is for development test data only).

create table public.categories (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  subtitle text,
  active boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.service_areas (
  phase smallint primary key check (phase between 1 and 8),
  active boolean not null default true
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.service_areas enable row level security;
alter table public.app_settings enable row level security;
-- Policies and grants are added in the RLS migration. No policy means deny.

insert into public.categories (slug, name, subtitle, sort) values
  ('plumbing',          'Plumbing',            'Leaks, taps, drains, geysers',     1),
  ('electrical',        'Electrical',          'Wiring, switches, fans, lights',   2),
  ('ac-refrigeration',  'AC & Refrigeration',  'AC repair, gas, fridges',          3),
  ('carpentry',         'Carpentry',           'Doors, cabinets, furniture',       4),
  ('painting',          'Painting',            'Walls, ceilings, polish',          5),
  ('cleaning',          'Cleaning',            'Deep and regular cleaning',        6),
  ('welding-ironwork',  'Welding & Ironwork',  'Gates, grills, metal repairs',     7),
  ('general-handyman',  'General Handyman',    'Small jobs and odd repairs',       8);

insert into public.service_areas (phase) select generate_series(1, 8);

-- Thresholds and windows are settings, not code. Retention periods are deliberately absent:
-- no period is committed until the legal review (docs/DECISIONS.md).
insert into public.app_settings (key, value, description) values
  ('helpline_number',         '""'::jsonb,  'DHA helpline shown in the apps. Empty until DHA confirms it.'),
  ('helpline_enabled',        'false'::jsonb, 'Show helpline buttons and FAQ lines. Off until DHA approves.'),
  ('job_expiry_hours',        '24'::jsonb,  'Open jobs with no accepted quote expire after this many hours.'),
  ('job_expiry_reminder_hours','20'::jsonb, 'Remind the resident this many hours after posting.'),
  ('max_job_photos',          '6'::jsonb,   'Maximum photos per job.'),
  ('report_window_days',      '7'::jsonb,   'Reports allowed from Scheduled until this many days after completion.'),
  ('review_window_days',      '7'::jsonb,   'Resident can review within this many days after completion.'),
  ('top_rated_min_jobs',      '10'::jsonb,  'Minimum completed jobs for Top rated.'),
  ('top_rated_min_rating',    '4.5'::jsonb, 'Minimum average rating for Top rated.'),
  ('stuck_scheduled_hours',   '24'::jsonb,  'Scheduled job not started this many hours after its start time is stuck.'),
  ('stuck_in_progress_hours', '48'::jsonb,  'In-progress job not completed this many hours after starting is stuck.'),
  ('stuck_cash_hours',        '48'::jsonb,  'Completed job without both cash entries after this many hours is stuck.');

-- Reads a setting with a typed fallback so callers never fail on a missing key.
create function public.get_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.app_settings where key = p_key;
$$;
