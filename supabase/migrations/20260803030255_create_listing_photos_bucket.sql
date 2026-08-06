-- Create a public bucket for listing photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload photos to their own tenant folder
CREATE POLICY "auth_upload_listing_photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'listing-photos');

-- Allow anyone to read listing photos (public bucket)
CREATE POLICY "public_read_listing_photos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'listing-photos');

-- Allow authenticated users to update their own photos
CREATE POLICY "auth_update_listing_photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'listing-photos')
  WITH CHECK (bucket_id = 'listing-photos');

-- Allow authenticated users to delete their own photos
CREATE POLICY "auth_delete_listing_photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'listing-photos');
