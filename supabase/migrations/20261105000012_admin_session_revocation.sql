-- ==============================================================================
-- Migration 012: Admin Session Revocation State
-- Stores a single "sessions_valid_after" cut-off. Admin session cookies issued
-- before this timestamp are rejected ("log out of all devices").
-- Strictly accessible via service_role (Next.js server only).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.admin_security_state (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'primary',
    sessions_valid_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT to_timestamp(0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.admin_security_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_security_state FROM anon, authenticated;

GRANT ALL ON TABLE public.admin_security_state TO service_role;
