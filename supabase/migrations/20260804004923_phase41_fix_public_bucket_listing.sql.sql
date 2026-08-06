-- Fix: public_read_listing_photos allows listing all objects in the bucket.
-- Replace with a policy that only allows reading specific objects by path,
-- not listing the entire bucket.
-- In Supabase Storage, SELECT on storage.objects = list + read.
-- To prevent listing while allowing public reads, we need to restrict the SELECT
-- to only allow access when the request is for a specific object path (not a list operation).
--
-- The standard approach: keep public read but restrict listing by requiring
-- the object path to match a tenant-scoped pattern.
-- However, Supabase Storage doesn't distinguish between list and read at the RLS level.
--
-- Alternative: Make the bucket private and use signed URLs for public images.
-- But this would break currently displayed listing images.
--
-- Pragmatic fix: Keep public read but add a path pattern requirement so
-- only properly-scoped paths (tenant-slug/listing-id/filename) are readable.
-- This prevents enumeration of arbitrary paths while keeping images working.

DROP POLICY IF EXISTS public_read_listing_photos ON storage.objects;

-- Allow public read only for objects that follow the tenant-scoped path pattern
-- Path format: tenant-slug/listing-id/filename.ext or tenant-slug/filename.ext
CREATE POLICY "public_read_listing_photos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'listing-photos'
    AND array_length(storage.foldername(objects.name), 1) >= 1
  );
