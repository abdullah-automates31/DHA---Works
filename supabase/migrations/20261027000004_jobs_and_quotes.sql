-- 0004: jobs, quotes, interests, events, cash, cancellation requests.
-- Status columns are only changed by SQL functions (added later), never by the apps.
-- Amounts are whole rupees.

create sequence public.job_code_seq start 2001;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('DW-' || nextval('public.job_code_seq')),
  resident_id uuid not null references public.profiles (id),
  category_id smallint not null references public.categories (id),
  address_id uuid references public.addresses (id),
  phase smallint not null references public.service_areas (phase),
  lane text not null,                      -- workers see phase and lane before acceptance
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) <= 1000),
  urgency public.job_urgency not null default 'asap',
  preferred_date date,
  window_from time,
  window_to time,
  voice_note_path text,
  status public.job_status not null default 'draft',
  posted_at timestamptz,                   -- starts the expiry clock
  accepted_quote_id uuid,                  -- foreign key added below (circular with quotes)
  accepted_worker_id uuid references public.profiles (id),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  stuck_since timestamptz,
  stuck_reason text,
  under_review_reason text,                -- e.g. 'worker_suspended'; status is unchanged
  cancelled_by uuid references public.profiles (id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_window_order check (window_from is null or window_to is null or window_from < window_to),
  constraint jobs_schedule_order check (scheduled_start is null or scheduled_end is null or scheduled_start < scheduled_end)
);

create index jobs_resident_idx on public.jobs (resident_id, status);
-- Feed query: open-stage jobs by category and phase, newest first.
create index jobs_feed_idx on public.jobs (category_id, phase, posted_at desc)
  where status in ('open', 'interested', 'quoted');
create index jobs_accepted_worker_idx on public.jobs (accepted_worker_id, status);
create index jobs_expiry_idx on public.jobs (posted_at) where status in ('open', 'interested', 'quoted');

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- Plot, floor and phone are released only after a quote is accepted (RLS in the RLS migration).
create table public.job_private (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  plot_no text not null,
  floor text,
  resident_phone text not null
);

create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  storage_path text not null,
  sort smallint not null default 0 check (sort between 0 and 5),
  unique (job_id, sort)
);

create table public.job_views (
  job_id uuid not null references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (job_id, worker_id)
);

create table public.job_interests (
  job_id uuid not null references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  primary key (job_id, worker_id)
);

create index job_interests_worker_idx on public.job_interests (worker_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id),
  labour integer not null check (labour >= 0),
  materials integer not null default 0 check (materials >= 0),
  materials_note text,
  other_amount integer not null default 0 check (other_amount >= 0),
  other_note text,
  total integer generated always as (labour + materials + other_amount) stored,
  visit_start timestamptz not null,
  visit_end timestamptz not null,
  note text,
  status public.quote_status not null default 'sent',
  reject_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint quotes_total_positive check (labour + materials + other_amount > 0),
  constraint quotes_other_note_required check (other_amount = 0 or char_length(coalesce(other_note, '')) > 0),
  constraint quotes_visit_order check (visit_start < visit_end)
);

create index quotes_job_idx on public.quotes (job_id, status);
create index quotes_worker_idx on public.quotes (worker_id, status);
-- One live quote per worker per job.
create unique index quotes_one_sent_per_worker_idx on public.quotes (job_id, worker_id) where status = 'sent';
-- At most one accepted quote per job.
create unique index quotes_one_accepted_per_job_idx on public.quotes (job_id) where status = 'accepted';

alter table public.jobs
  add constraint jobs_accepted_quote_fk foreign key (accepted_quote_id) references public.quotes (id);

-- Timeline shown in both apps and the admin portal. Append only.
create table public.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles (id),
  payload jsonb not null default '{}'::jsonb,
  -- Events about other workers' interest and quotes stay hidden from the accepted worker.
  resident_only boolean not null default false,
  created_at timestamptz not null default now()
);

create index job_events_job_idx on public.job_events (job_id, created_at);

-- Each side's amount is write-once (trigger below; no UPDATE policy either).
create table public.cash_records (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  agreed_amount integer not null,          -- accepted quote total
  worker_amount integer check (worker_amount >= 0),
  worker_reason text,
  worker_recorded_at timestamptz,
  resident_amount integer check (resident_amount >= 0),
  resident_confirmed_at timestamptz,
  matched boolean,                         -- null until both sides have entered
  quote_difference integer,                -- final amount minus agreed, set when matched
  constraint cash_worker_pair check ((worker_amount is null) = (worker_recorded_at is null)),
  constraint cash_resident_pair check ((resident_amount is null) = (resident_confirmed_at is null))
);

create function public.cash_records_write_once()
returns trigger
language plpgsql
as $$
begin
  if old.worker_amount is not null
     and (new.worker_amount is distinct from old.worker_amount
          or new.worker_reason is distinct from old.worker_reason
          or new.worker_recorded_at is distinct from old.worker_recorded_at) then
    raise exception 'worker cash entry is final';
  end if;
  if old.resident_amount is not null
     and (new.resident_amount is distinct from old.resident_amount
          or new.resident_confirmed_at is distinct from old.resident_confirmed_at) then
    raise exception 'resident cash entry is final';
  end if;
  if new.agreed_amount is distinct from old.agreed_amount then
    raise exception 'agreed amount is final';
  end if;
  return new;
end;
$$;

create trigger cash_records_write_once
  before update on public.cash_records
  for each row execute function public.cash_records_write_once();

-- After acceptance neither side cancels alone: a request is reviewed by staff.
-- The job keeps its status; "cancellation pending" is derived from a pending row.
create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  requester_id uuid not null references public.profiles (id),
  requester_role public.user_role not null check (requester_role in ('resident', 'worker')),
  reason_code public.cancellation_reason not null,
  details text,
  status public.cancellation_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create unique index cancellation_one_pending_idx on public.cancellation_requests (job_id) where status = 'pending';

alter table public.jobs enable row level security;
alter table public.job_private enable row level security;
alter table public.job_photos enable row level security;
alter table public.job_views enable row level security;
alter table public.job_interests enable row level security;
alter table public.quotes enable row level security;
alter table public.job_events enable row level security;
alter table public.cash_records enable row level security;
alter table public.cancellation_requests enable row level security;
-- Policies and grants are added in the RLS migration. No policy means deny.
