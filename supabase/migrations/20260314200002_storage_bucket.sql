-- =============================================================
-- SipPing: Storage Bucket for Drink Photos
-- Path convention: drink-photos/{user_id}/{trip_id}/{filename}
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'drink-photos',
  'drink-photos',
  false,
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- Authenticated users can upload to their own folder
CREATE POLICY "drink_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'drink-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Trip members can view photos (second folder segment is trip_id)
CREATE POLICY "drink_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'drink-photos'
    AND public.is_trip_member((storage.foldername(name))[2]::uuid)
  );

-- Users can update their own photos
CREATE POLICY "drink_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'drink-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own photos
CREATE POLICY "drink_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'drink-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
