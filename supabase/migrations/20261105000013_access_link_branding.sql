-- Migration 013: per-link page identity (white-label sharing)
--   branding_mode    'studio'  = current studio name & logo (default, existing links unchanged)
--                    'neutral' = no platform name or logo; pages titled by project only
--                    'custom'  = brand_name replaces the studio name
--   brand_name       display name used when branding_mode = 'custom'
--   hide_viewer_name the recipient never sees the link's viewer_name (kept as an admin-only label)

ALTER TABLE public.access_links
    ADD COLUMN IF NOT EXISTS branding_mode VARCHAR(16) NOT NULL DEFAULT 'studio',
    ADD COLUMN IF NOT EXISTS brand_name VARCHAR(80),
    ADD COLUMN IF NOT EXISTS hide_viewer_name BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'access_links_branding_mode_check'
    ) THEN
        ALTER TABLE public.access_links
            ADD CONSTRAINT access_links_branding_mode_check
            CHECK (branding_mode IN ('studio', 'neutral', 'custom'));
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
