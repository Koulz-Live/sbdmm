-- ─── Migration 007: Storage RLS Policies ────────────────────────────────────
-- Secures the 'room-photos' bucket so users can only access files within
-- their own tenant's folder.
--
-- Path convention: {tenant_id}/design-sessions/{session_id}/room-photo.{ext}
-- So (storage.foldername(name))[1] = the tenant_id segment.
--
-- NOTE: Run this AFTER deleting the auto-generated "Allow uploads / Allow
-- downloads" policies that Supabase created with "applied to: public".

-- ─── room-photos: INSERT (upload) ────────────────────────────────────────────
-- Authenticated users may only upload into their own tenant's folder.
create policy "room_photos_tenant_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'room-photos'
    and (storage.foldername(name))[1] = (
      select tenant_id::text
      from public.user_profiles
      where id = auth.uid()
    )
  );

-- ─── room-photos: SELECT (download / signed URL generation) ──────────────────
-- Authenticated users may only read files within their own tenant's folder.
create policy "room_photos_tenant_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'room-photos'
    and (storage.foldername(name))[1] = (
      select tenant_id::text
      from public.user_profiles
      where id = auth.uid()
    )
  );

-- ─── room-photos: UPDATE ──────────────────────────────────────────────────────
-- Allow overwriting (re-upload) within own tenant's folder.
create policy "room_photos_tenant_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'room-photos'
    and (storage.foldername(name))[1] = (
      select tenant_id::text
      from public.user_profiles
      where id = auth.uid()
    )
  );

-- ─── room-photos: DELETE ──────────────────────────────────────────────────────
-- Allow deletion within own tenant's folder.
create policy "room_photos_tenant_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'room-photos'
    and (storage.foldername(name))[1] = (
      select tenant_id::text
      from public.user_profiles
      where id = auth.uid()
    )
  );
