-- =============================================================
-- SipPing: Storage Bucket for User Avatars
-- Path convention: avatars/{user_id}/avatar_{timestamp}.jpg
-- Public bucket — avatars are visible to all authenticated users
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- Authenticated users can view all avatars (public bucket)
CREATE POLICY "avatars_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- Users can upload their own avatar (first folder segment is user_id)
CREATE POLICY "avatars_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update (overwrite) their own avatar
CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own avatar
CREATE POLICY "avatars_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
