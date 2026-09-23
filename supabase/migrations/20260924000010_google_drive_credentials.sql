-- ==============================================================================
-- Migration 010: Google Drive Server-Side Persistent Credentials Store
-- Secure, encrypted credential persistence for Google Drive OAuth refresh tokens.
-- Uses AES-256-GCM server-side encryption. Strictly accessible via service_role.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.google_drive_credentials (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'primary',
    encrypted_refresh_token TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    root_folder_id TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on credentials table
ALTER TABLE public.google_drive_credentials ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke all privileges from public 'anon' and 'authenticated' roles
REVOKE ALL ON TABLE public.google_drive_credentials FROM anon, authenticated;

-- Grant permissions strictly to 'service_role' used by Next.js server operations
GRANT ALL ON TABLE public.google_drive_credentials TO service_role;
