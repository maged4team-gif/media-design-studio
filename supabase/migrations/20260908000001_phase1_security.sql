-- ==============================================================================
-- Migration: 20260908000001_phase1_security.sql
-- Phase 1: Security Hardening, RLS, Approval Identity & Session Invalidation
-- ==============================================================================

-- 1. Add session_version to access_links for immediate session revocation
ALTER TABLE access_links
ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;

-- 2. Add original_filename and storage_path to assets
ALTER TABLE assets
ADD COLUMN IF NOT EXISTS original_filename TEXT,
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Populate storage_path for existing records where file_url is a storage relative path or contains storage key
UPDATE assets
SET original_filename = COALESCE(original_filename, title),
    storage_path = COALESCE(storage_path, CASE 
        WHEN file_url LIKE '%/media-studio-assets/%' THEN substring(file_url from '%/media-studio-assets/(.*)')
        WHEN file_url NOT LIKE 'http%' THEN file_url
        ELSE NULL
    END)
WHERE storage_path IS NULL;

-- 3. Fix Approval Identity:
-- Remove old unique constraint that collided on viewer_name
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS unique_asset_viewer;
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS unique_asset_link;

-- Add unique partial index for (asset_id, access_link_id)
-- This ensures distinct approvals per client access link even if viewer names match
CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_asset_link 
ON approvals (asset_id, access_link_id) 
WHERE access_link_id IS NOT NULL;

-- 4. Enable Row Level Security (RLS) on all application tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_link_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

-- 5. Revoke direct public API access from 'anon' and 'authenticated' roles
-- All operations must be routed through Next.js server actions / API endpoints using service_role
REVOKE ALL ON TABLE projects FROM anon, authenticated;
REVOKE ALL ON TABLE assets FROM anon, authenticated;
REVOKE ALL ON TABLE access_links FROM anon, authenticated;
REVOKE ALL ON TABLE access_link_projects FROM anon, authenticated;
REVOKE ALL ON TABLE comments FROM anon, authenticated;
REVOKE ALL ON TABLE approvals FROM anon, authenticated;

-- Grant all permissions strictly to service_role
GRANT ALL ON TABLE projects TO service_role;
GRANT ALL ON TABLE assets TO service_role;
GRANT ALL ON TABLE access_links TO service_role;
GRANT ALL ON TABLE access_link_projects TO service_role;
GRANT ALL ON TABLE comments TO service_role;
GRANT ALL ON TABLE approvals TO service_role;

-- 6. Storage Security: Make 'media-studio-assets' bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'media-studio-assets';

-- Drop any previous permissive storage policies
DROP POLICY IF EXISTS "Public media asset read policy" ON storage.objects;
DROP POLICY IF EXISTS "Service and auth insert policy" ON storage.objects;
DROP POLICY IF EXISTS "Service and auth update policy" ON storage.objects;
DROP POLICY IF EXISTS "Service and auth delete policy" ON storage.objects;

-- Ensure anon cannot access objects in media-studio-assets directly
CREATE POLICY "Deny anon access to media-studio-assets"
ON storage.objects FOR ALL
TO anon
USING (false);
