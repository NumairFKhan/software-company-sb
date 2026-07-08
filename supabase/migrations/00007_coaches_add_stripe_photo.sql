-- =========================================================
-- Add Stripe Connect and photo storage fields to coaches
-- =========================================================

-- New columns on the coaches table
ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS photo_url         TEXT;

-- ---- Supabase Storage bucket for coach profile photos ----
-- Public bucket: anyone can read; only the owning coach can write.
INSERT INTO storage.buckets (id, name, public)
VALUES ('coach-photos', 'coach-photos', true)
ON CONFLICT (id) DO NOTHING;

-- INSERT policy: authenticated coach can upload to their own folder
--   Path convention: {user_id}/avatar.<ext>
CREATE POLICY "Coach can insert own photo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE policy: authenticated coach can replace their own photo
CREATE POLICY "Coach can update own photo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT policy: anyone can view coach photos
CREATE POLICY "Public can view coach photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'coach-photos');
