-- 0005: reviews, reports, notifications, device tokens, audit log, staff invites.

-- Resident -> worker only, anonymous to the worker (workers get no read access, see RLS migration).
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id),
  resident_id uuid not null references public.profiles (id),
  worker_id uuid not null references public.profiles (id),
  behaviour smallint not null check (behaviour between 1 and 5),
  completeness smallint not null check (completeness between 1 and 5),
  quality smallint not null check (quality between 1 and 5),
  hire_again boolean not null,
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);

create index reviews_worker_idx on public.reviews (worker_id);

create sequence public.report_code_seq start 401;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('RP-' || lpad(nextval('public.report_code_seq')::text, 4, '0')),
  job_id uuid not null references public.jobs (id),
  reporter_id uuid not null references public.profiles (id),
  against_id uuid not null references public.profiles (id),
  reporter_role public.user_role not null check (reporter_role in ('resident', 'worker')),
  kind public.report_kind not null,
  reason_text text,                        -- also keeps the raw choice from the app's reason list
  status public.report_status not null default 'new',
  assigned_to uuid references public.profiles (id),
  action public.report_action,
  action_reason text,
  system_generated boolean not null default false,   -- e.g. cash mismatch
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_resolved_has_action check (status <> 'resolved' or action is not null)
);

create index reports_job_idx on public.reports (job_id);
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_status_idx on public.reports (status, created_at);

create table public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  storage_path text not null
);

create table public.report_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  note text not null,
  created_at timestamptz not null default now()
);

-- Staff call tracking for unsafe reports.
create table public.report_calls (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  called_id uuid not null references public.profiles (id),
  called_by uuid not null references public.profiles (id),
  outcome text,
  called_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  job_id uuid references public.jobs (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  push_sent_at timestamptz,                -- set by the push Edge Function
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unsent_idx on public.notifications (created_at) where push_sent_at is null;

create table public.device_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  push_token text not null,
  platform text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now(),
  primary key (user_id, push_token)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (table_name, record_id);

-- Append only: blocked for everyone, including the service role.
create function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append only';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- Admin phase; table exists now so the role model is complete.
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.report_photos enable row level security;
alter table public.report_notes enable row level security;
alter table public.report_calls enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.audit_log enable row level security;
alter table public.staff_invites enable row level security;
-- Policies and grants are added in the RLS migration. No policy means deny.
