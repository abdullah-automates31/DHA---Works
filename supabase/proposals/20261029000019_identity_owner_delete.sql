-- PROPOSAL (not applied, not in supabase/migrations). Review, then move to supabase/migrations to adopt.
--
-- Problem: a worker can upload identity files (CNIC, police certificate) but can never remove one. When they
-- replace a photo, the app uploads a new file (the owner may not overwrite) and the old one stays in the private
-- identity bucket for good: an orphaned CNIC image that nobody uses, that the owner cannot delete, and that
-- counts against the free storage quota.
--
-- Change, in two parts, both limited to the window in which the application is still editable
-- ('incomplete' or 'needs_changes'), the same window in which the owner may already upload:
--   1. the owner may DELETE their own objects in the identity bucket;
--   2. the owner may READ their own objects in the identity bucket.
--
-- DECISION NEEDED (privacy): part 2 is required for part 1. Postgres only lets a DELETE ... WHERE touch rows the
-- caller is also allowed to read, so without a read rule the Storage API would delete nothing (tested). It reverses
-- the 0012 rule "owner uploads but never reads back" for this window only. It matches what the verification_documents
-- table already allows (the owner reads their own rows while editable) and would also let the app show a thumbnail
-- of a file that was just added. After submission the owner can neither read nor delete; only staff can read.
-- If you prefer to keep identity files write-only, do not adopt this; orphaned files then need a staff-side clean-up.
--
-- Not covered: files already orphaned before this exists, and cleaning up files no verification_documents row
-- points to (a staff or scheduled job; separate decision). worker-media profile photos are already owner-deletable.

create policy identity_owner_read on storage.objects for select to authenticated
  using (
    bucket_id = 'identity'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.verification_status in ('incomplete', 'needs_changes'))
  );

create policy identity_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'identity'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.verification_status in ('incomplete', 'needs_changes'))
  );
