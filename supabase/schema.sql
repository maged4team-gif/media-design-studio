-- ==============================================================================
-- TV & Media Design Studio Showcase - Database Schema
-- Run this script in the Supabase SQL Editor for new databases
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cover_url TEXT,
    category VARCHAR(100),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    show_progress BOOLEAN NOT NULL DEFAULT true,
    allow_feedback BOOLEAN NOT NULL DEFAULT true,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    cover_storage_path TEXT,
    drive_folder_id TEXT,
    drive_cover_file_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Assets Table
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    thumbnail_storage_path TEXT,
    file_type VARCHAR(50) NOT NULL DEFAULT 'file', -- 'video', 'image', 'file'
    mime_type VARCHAR(100),
    file_size BIGINT,
    duration_seconds INTEGER,
    version VARCHAR(50) DEFAULT 'V1',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    original_filename TEXT,
    storage_path TEXT,
    drive_file_id TEXT,
    drive_folder_id TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'legacy',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_assets_drive_file_id UNIQUE (drive_file_id)
);

-- 3. Access Links Table (Private client links: /p/[slug])
CREATE TABLE IF NOT EXISTS access_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    viewer_name VARCHAR(150) NOT NULL,
    slug VARCHAR(64) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_plain TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Access Link Projects (Many-to-Many relationship)
CREATE TABLE IF NOT EXISTS access_link_projects (
    access_link_id UUID NOT NULL REFERENCES access_links(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (access_link_id, project_id)
);

-- 5. Comments Table (Supports playhead timecode comments)
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    access_link_id UUID REFERENCES access_links(id) ON DELETE SET NULL,
    author_name VARCHAR(150) NOT NULL,
    body TEXT NOT NULL,
    timestamp_seconds INTEGER CHECK (timestamp_seconds >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Approvals Table (Tracking asset approvals bound to link identity)
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    access_link_id UUID REFERENCES access_links(id) ON DELETE SET NULL,
    viewer_name VARCHAR(150) NOT NULL,
    approved BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_approvals_asset_link UNIQUE (asset_id, access_link_id)
);

-- 7. Pending Storage Cleanups Table (Audit and retry mechanism for storage failures)
CREATE TABLE IF NOT EXISTS pending_storage_cleanups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    storage_path TEXT NOT NULL,
    bucket_id TEXT NOT NULL DEFAULT 'media-studio-assets',
    reason TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_pending_cleanup_bucket_path UNIQUE (bucket_id, storage_path)
);

-- 8. Google Drive Credentials Table (Encrypted server-side persistent OAuth refresh token store)
CREATE TABLE IF NOT EXISTS google_drive_credentials (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'primary',
    encrypted_refresh_token TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    root_folder_id TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_projects_is_visible ON projects(is_visible, is_archived);
CREATE INDEX IF NOT EXISTS idx_projects_drive_folder_id ON projects(drive_folder_id);
CREATE INDEX IF NOT EXISTS idx_projects_allow_feedback ON projects(allow_feedback);
CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_assets_drive_file_id ON assets(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_access_links_slug ON access_links(slug);
CREATE INDEX IF NOT EXISTS idx_comments_asset_id ON comments(asset_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approvals_asset_id ON approvals(asset_id);

-- Enable Row Level Security (RLS) on all application tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_link_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_storage_cleanups ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_drive_credentials ENABLE ROW LEVEL SECURITY;

-- Revoke direct access from public 'anon' and 'authenticated' roles
REVOKE ALL ON TABLE projects FROM anon, authenticated;
REVOKE ALL ON TABLE assets FROM anon, authenticated;
REVOKE ALL ON TABLE access_links FROM anon, authenticated;
REVOKE ALL ON TABLE access_link_projects FROM anon, authenticated;
REVOKE ALL ON TABLE comments FROM anon, authenticated;
REVOKE ALL ON TABLE approvals FROM anon, authenticated;
REVOKE ALL ON TABLE pending_storage_cleanups FROM anon, authenticated;
REVOKE ALL ON TABLE google_drive_credentials FROM anon, authenticated;

-- Grant permissions strictly to service_role used by Next.js server operations
GRANT ALL ON TABLE projects TO service_role;
GRANT ALL ON TABLE assets TO service_role;
GRANT ALL ON TABLE access_links TO service_role;
GRANT ALL ON TABLE access_link_projects TO service_role;
GRANT ALL ON TABLE comments TO service_role;
GRANT ALL ON TABLE approvals TO service_role;
GRANT ALL ON TABLE pending_storage_cleanups TO service_role;
GRANT ALL ON TABLE google_drive_credentials TO service_role;

-- Hardened atomic stored procedure for updating access links and project assignments
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

-- Revoke default public execution privileges and grant strictly to service_role
REVOKE ALL ON FUNCTION public.update_access_link_atomic(uuid, character varying, text, boolean, boolean, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_access_link_atomic(uuid, character varying, text, boolean, boolean, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_access_link_atomic(uuid, character varying, text, boolean, boolean, uuid[]) TO service_role;

-- Procedure to log/retry failed storage cleanups with search_path protection
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

-- Storage bucket creation for media studio assets (PRIVATE with 500MB limit and MIME whitelist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'media-studio-assets',
    'media-studio-assets',
    false,
    524288000, -- 500 MB
    ARRAY[
      'video/mp4', 'video/quicktime', 'video/webm',
      'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif',
      'application/pdf', 'application/zip', 'application/x-zip-compressed',
      'image/vnd.adobe.photoshop', 'application/x-photoshop',
      'application/octet-stream'
    ]
)
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 524288000,
    allowed_mime_types = ARRAY[
      'video/mp4', 'video/quicktime', 'video/webm',
      'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif',
      'application/pdf', 'application/zip', 'application/x-zip-compressed',
      'image/vnd.adobe.photoshop', 'application/x-photoshop',
      'application/octet-stream'
    ];

-- Deny anon access to media-studio-assets bucket
CREATE POLICY "Deny anon access to media-studio-assets"
ON storage.objects FOR ALL
TO anon
USING (false);
