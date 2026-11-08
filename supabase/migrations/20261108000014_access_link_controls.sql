-- Migration 014: per-link access controls and wider upload types
--   expires_at     the link stops working after this moment (NULL = never)
--   allow_download false = view inside the page only: no download button or attachment delivery
-- Existing links are unchanged: they never expire and downloads stay allowed.

ALTER TABLE public.access_links
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS allow_download BOOLEAN NOT NULL DEFAULT true;

-- Office documents, text and audio for legacy Supabase Storage uploads.
-- Appends to the current whitelist; a bucket with no whitelist (NULL = allow all) is left alone.
UPDATE storage.buckets
SET allowed_mime_types = (
    SELECT array_agg(DISTINCT mime)
    FROM unnest(
        allowed_mime_types || ARRAY[
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain', 'text/csv',
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
            'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg'
        ]::text[]
    ) AS mime
)
WHERE id = 'media-studio-assets' AND allowed_mime_types IS NOT NULL;

NOTIFY pgrst, 'reload schema';
