-- ==============================================================================
-- Migration: 20260908000002_phase1_corrections.sql
-- Corrective updates for Phase 1:
-- 1. Unconditional UNIQUE constraint on approvals(asset_id, access_link_id)
-- 2. Correct POSIX regex for storage path migration without falsifying external or /uploads/ paths
-- 3. Dedicated cover_storage_path and thumbnail_storage_path columns
-- 4. Atomic RPC function for access link updates and session_version increments
-- 5. Cleanup queue table for resilient storage removal
-- ==============================================================================

-- 1. Fix Approvals Constraint for PostgreSQL upsert compatibility
DROP INDEX IF EXISTS idx_approvals_asset_link;

DELETE FROM approvals a
USING approvals b
WHERE a.id < b.id
  AND a.asset_id = b.asset_id
  AND a.access_link_id = b.access_link_id
  AND a.access_link_id IS NOT NULL;

ALTER TABLE approvals DROP CONSTRAINT IF EXISTS unique_asset_viewer;
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS unique_asset_link;
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS unique_approvals_asset_link;

ALTER TABLE approvals
ADD CONSTRAINT unique_approvals_asset_link UNIQUE (asset_id, access_link_id);

-- 2. Add cover_storage_path and thumbnail_storage_path
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS cover_storage_path TEXT;

ALTER TABLE assets
ADD COLUMN IF NOT EXISTS thumbnail_storage_path TEXT;

-- 3. Fix Legacy Path Migration: Use POSIX regex to match Supabase storage URLs only
UPDATE assets
SET storage_path = substring(file_url from '/media-studio-assets/([^?#]+)')
WHERE file_url ~ '/media-studio-assets/'
  AND (storage_path IS NULL OR storage_path LIKE '%/media-studio-assets/%');

UPDATE assets
SET storage_path = NULL
WHERE storage_path LIKE '/uploads/%'
   OR storage_path LIKE 'http://%'
   OR storage_path LIKE 'https://%';

UPDATE assets
SET thumbnail_storage_path = substring(thumbnail_url from '/media-studio-assets/([^?#]+)')
WHERE thumbnail_url IS NOT NULL
  AND thumbnail_url ~ '/media-studio-assets/'
  AND thumbnail_storage_path IS NULL;

UPDATE projects
SET cover_storage_path = substring(cover_url from '/media-studio-assets/([^?#]+)')
WHERE cover_url IS NOT NULL
  AND cover_url ~ '/media-studio-assets/'
  AND cover_storage_path IS NULL;

-- 4. Storage cleanup resilience table
CREATE TABLE IF NOT EXISTS pending_storage_cleanups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    storage_path TEXT NOT NULL,
    reason TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE pending_storage_cleanups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pending_storage_cleanups FROM anon, authenticated;
GRANT ALL ON TABLE pending_storage_cleanups TO service_role;

-- 5. Atomic RPC function for updating access link and project assignments
CREATE OR REPLACE FUNCTION update_access_link_atomic(
    p_link_id UUID,
    p_viewer_name VARCHAR(150),
    p_password_hash TEXT,
    p_enabled BOOLEAN,
    p_increment_session_version BOOLEAN,
    p_project_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_link access_links%ROWTYPE;
BEGIN
    UPDATE access_links
    SET 
        viewer_name = COALESCE(p_viewer_name, viewer_name),
        password_hash = COALESCE(p_password_hash, password_hash),
        enabled = COALESCE(p_enabled, enabled),
        session_version = CASE 
            WHEN p_increment_session_version THEN session_version + 1 
            ELSE session_version 
        END
    WHERE id = p_link_id
    RETURNING * INTO v_updated_link;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACCESS_LINK_NOT_FOUND: %', p_link_id;
    END IF;

    IF p_project_ids IS NOT NULL THEN
        DELETE FROM access_link_projects WHERE access_link_id = p_link_id;
        
        IF array_length(p_project_ids, 1) > 0 THEN
            INSERT INTO access_link_projects (access_link_id, project_id)
            SELECT p_link_id, unnest(p_project_ids);
        END IF;
    END IF;

    RETURN to_jsonb(v_updated_link);
END;
$$;

GRANT EXECUTE ON FUNCTION update_access_link_atomic TO service_role;
