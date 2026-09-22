-- ==============================================================================
-- Migration: 20260908000003_phase1_hardening.sql
-- Security Hardening, Search Path Isolation, RPC Permissions & Storage Limits
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Approvals Migration Safety & Deterministic Deduplication
-- ------------------------------------------------------------------------------
-- AUDIT QUERY FOR PRE-EXISTING DUPLICATES:
-- Run this query manually prior to migration to audit duplicate records:
-- SELECT asset_id, access_link_id, count(*), array_agg(id), array_agg(approved), max(updated_at)
-- FROM public.approvals
-- WHERE access_link_id IS NOT NULL
-- GROUP BY asset_id, access_link_id
-- HAVING count(*) > 1;

-- WARNING: DESTRUCTIVE FOR DUPLICATES:
-- Deletes older duplicate approvals, deterministically retaining the latest state (max updated_at, tie-break by id).
DELETE FROM public.approvals a
USING public.approvals b
WHERE a.asset_id = b.asset_id
  AND a.access_link_id = b.access_link_id
  AND a.access_link_id IS NOT NULL
  AND (
    a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.id < b.id)
  );

-- Ensure the unconditional unique constraint exists on public.approvals
ALTER TABLE public.approvals DROP CONSTRAINT IF EXISTS unique_approvals_asset_link;
ALTER TABLE public.approvals
ADD CONSTRAINT unique_approvals_asset_link UNIQUE (asset_id, access_link_id);

-- ------------------------------------------------------------------------------
-- 2. Harden update_access_link_atomic (Fix SECURITY DEFINER search_path vulnerability)
-- ------------------------------------------------------------------------------
-- Requirements:
-- - SET search_path = '' to prevent malicious search_path shadowing.
-- - Fully qualified object names: public.access_links, public.access_link_projects, etc.
-- - Return limited, non-sensitive JSONB object (NO password_hash).
-- - Revoke execute from PUBLIC, anon, authenticated; Grant execute ONLY to service_role.

CREATE OR REPLACE FUNCTION public.update_access_link_atomic(
    p_link_id uuid,
    p_viewer_name character varying,
    p_password_hash text,
    p_enabled boolean,
    p_increment_session_version boolean,
    p_project_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated_link public.access_links%ROWTYPE;
BEGIN
    UPDATE public.access_links
    SET 
        viewer_name = pg_catalog.coalesce(p_viewer_name, viewer_name),
        password_hash = pg_catalog.coalesce(p_password_hash, password_hash),
        enabled = pg_catalog.coalesce(p_enabled, enabled),
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
        DELETE FROM public.access_link_projects WHERE access_link_id = p_link_id;
        
        IF pg_catalog.array_length(p_project_ids, 1) > 0 THEN
            INSERT INTO public.access_link_projects (access_link_id, project_id)
            SELECT p_link_id, pg_catalog.unnest(p_project_ids);
        END IF;
    END IF;

    -- Return safe payload with NO secrets (never return password_hash)
    RETURN pg_catalog.jsonb_build_object(
        'id', v_updated_link.id,
        'viewer_name', v_updated_link.viewer_name,
        'slug', v_updated_link.slug,
        'enabled', v_updated_link.enabled,
        'session_version', v_updated_link.session_version,
        'created_at', v_updated_link.created_at
    );
END;
$$;

-- Revoke default public execution privileges
REVOKE ALL ON FUNCTION public.update_access_link_atomic(uuid, character varying, text, boolean, boolean, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_access_link_atomic(uuid, character varying, text, boolean, boolean, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_access_link_atomic(uuid, character varying, text, boolean, boolean, uuid[]) TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Resilient Storage Cleanups Table & Procedure
-- ------------------------------------------------------------------------------
ALTER TABLE public.pending_storage_cleanups
ADD COLUMN IF NOT EXISTS bucket_id TEXT NOT NULL DEFAULT 'media-studio-assets',
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Add unique constraint on bucket_id and storage_path to prevent redundant bloat
ALTER TABLE public.pending_storage_cleanups DROP CONSTRAINT IF EXISTS unique_pending_cleanup_bucket_path;
ALTER TABLE public.pending_storage_cleanups
ADD CONSTRAINT unique_pending_cleanup_bucket_path UNIQUE (bucket_id, storage_path);

-- Management procedure to log/retry failed storage cleanups with search_path protection
CREATE OR REPLACE FUNCTION public.record_storage_cleanup_failure(
    p_storage_path text,
    p_reason text,
    p_last_error text DEFAULT NULL,
    p_bucket_id text DEFAULT 'media-studio-assets'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.pending_storage_cleanups (
        storage_path, bucket_id, reason, attempts, last_error, updated_at
    )
    VALUES (
        p_storage_path, p_bucket_id, p_reason, 1, p_last_error, pg_catalog.timezone('utc'::text, pg_catalog.now())
    )
    ON CONFLICT (bucket_id, storage_path)
    DO UPDATE SET
        attempts = public.pending_storage_cleanups.attempts + 1,
        last_error = EXCLUDED.last_error,
        updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now());
END;
$$;

REVOKE ALL ON FUNCTION public.record_storage_cleanup_failure(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_storage_cleanup_failure(text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_storage_cleanup_failure(text, text, text, text) TO service_role;

-- ------------------------------------------------------------------------------
-- 4. Storage Bucket Hard Limits (500 MB & Allowed Mime Types)
-- ------------------------------------------------------------------------------
-- Sets storage-level hard boundary limits.
-- Note: 'application/octet-stream' is explicitly included because broadcast media design
-- assets such as Adobe After Effects (.aep) and Cinema 4D (.c4d) lack standardized MIME
-- registration across client browsers and OS uploaders.
UPDATE storage.buckets
SET file_size_limit = 524288000, -- 500 MB hard limit
    allowed_mime_types = ARRAY[
      'video/mp4', 'video/quicktime', 'video/webm',
      'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif',
      'application/pdf', 'application/zip', 'application/x-zip-compressed',
      'image/vnd.adobe.photoshop', 'application/x-photoshop',
      'application/octet-stream'
    ]
WHERE id = 'media-studio-assets';
