-- 0003: accounts, addresses, worker details, verification.
-- One auth user = one role (resident, worker or admin). Role and status columns are only
-- changed by SQL functions (added later); direct updates are blocked by column grants.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text,
  email text,
  phone text,
  gender public.gender,
  date_of_birth date,
  cnic text,
  verification_status public.verification_status not null default 'incomplete',
  verification_reason text,       -- shown to the user after a staff decision
  verification_updated_at timestamptz,
  account_status public.account_status not null default 'active',
  suspended_at timestamptz,
  suspended_until timestamptz,
  suspension_reason text,
  avatar_path text,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_cnic_format check (cnic is null or cnic ~ '^[0-9]{5}-[0-9]{7}-[0-9]$'),
  constraint profiles_phone_length check (phone is null or char_length(phone) between 7 and 20),
  -- The same person may hold a resident account and a worker account, but not two of the same role.
  constraint profiles_cnic_role_unique unique (cnic, role)
);

create index profiles_role_status_idx on public.profiles (role, verification_status, account_status);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles (id) on delete cascade,
  label text,
  phase smallint not null references public.service_areas (phase),
  lane text not null,
  plot_no text not null,
  floor text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index addresses_resident_idx on public.addresses (resident_id);
create unique index addresses_one_default_idx on public.addresses (resident_id) where is_default;

create table public.worker_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  experience_years smallint check (experience_years between 0 and 70),
  visit_fee integer not null default 0 check (visit_fee >= 0),   -- rupees
  available_today boolean not null default true,
  voice_intro_path text,           -- worker-media bucket, 14 to 30 s clip
  -- Maintained by triggers/functions, never written by the app.
  rating_avg numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  jobs_done integer not null default 0
);

-- A worker can have several trades (decided 26 Oct).
create table public.worker_categories (
  worker_id uuid not null references public.profiles (id) on delete cascade,
  category_id smallint not null references public.categories (id),
  primary key (worker_id, category_id)
);

create table public.worker_areas (
  worker_id uuid not null references public.profiles (id) on delete cascade,
  phase smallint not null references public.service_areas (phase),
  primary key (worker_id, phase)
);

create index worker_areas_phase_idx on public.worker_areas (phase);

-- Alternative to the police certificate: two references from DHA residents.
create table public.worker_references (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  phone text not null,
  address text
);

create index worker_references_worker_idx on public.worker_references (worker_id);

-- One current file per document type. Re-uploading replaces the row.
-- The files live in the private 'identity' and 'worker-media' storage buckets.
create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  doc_type public.document_type not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  unique (profile_id, doc_type)
);

-- Every staff decision is kept (history), including the checklist that was ticked.
create table public.verification_decisions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  decision public.verification_decision not null,
  reason text,
  checklist jsonb not null default '{}'::jsonb,
  decided_by uuid not null references public.profiles (id),
  decided_at timestamptz not null default now()
);

create index verification_decisions_profile_idx on public.verification_decisions (profile_id, decided_at desc);

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.worker_details enable row level security;
alter table public.worker_categories enable row level security;
alter table public.worker_areas enable row level security;
alter table public.worker_references enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_decisions enable row level security;
-- Policies and grants are added in the RLS migration. No policy means deny.
