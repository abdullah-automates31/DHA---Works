-- 0001: enums and shared helpers.
-- Source of truth: docs/DB-API-DESIGN.md. Enum values can be added later but not removed,
-- so only values that are decided for MVP 1 appear here.

create type public.user_role as enum ('resident', 'worker', 'admin');

-- 'incomplete' = registered but has not submitted for review yet.
create type public.verification_status as enum (
  'incomplete', 'pending', 'approved', 'needs_changes', 'visit_hq', 'rejected'
);

create type public.account_status as enum ('active', 'suspended');

create type public.gender as enum ('male', 'female', 'other');

create type public.document_type as enum (
  'cnic_front', 'cnic_back', 'utility_bill', 'police_cert', 'profile_photo'
);

create type public.verification_decision as enum (
  'approve', 'ask_for_changes', 'visit_hq', 'reject'
);

-- 'accepted' is kept for the PRD stage list but is unused: accepting a quote goes straight to 'scheduled'.
create type public.job_status as enum (
  'draft', 'open', 'interested', 'quoted', 'accepted', 'scheduled', 'in_progress',
  'completed', 'cash_collected', 'reviewed', 'disputed', 'cancelled', 'expired'
);

create type public.job_urgency as enum ('asap', 'scheduled');

create type public.quote_status as enum (
  'sent', 'accepted', 'rejected', 'not_selected', 'withdrawn', 'expired'
);

create type public.cancellation_status as enum ('pending', 'approved', 'declined', 'withdrawn');

create type public.cancellation_reason as enum (
  'schedule_conflict', 'no_longer_needed', 'price_dispute',
  'safety_concern', 'worker_unavailable', 'other'
);

create type public.report_kind as enum (
  'unsafe', 'cash_price', 'no_show', 'poor_work', 'rude_damage', 'other'
);

create type public.report_status as enum ('new', 'in_review', 'resolved');

create type public.report_action as enum ('no_action', 'warning', 'suspend');

-- Keeps updated_at current on any table that has the column.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
