-- ==============================================================================
-- Migration: Add password_plain to access_links
-- Description:
-- Adds a nullable plaintext/readable password column for administrators
-- to view, copy, and send credentials to clients directly from the admin cards.
-- Public links have NULL password_plain.
-- Legacy links have NULL until updated by an administrator.
-- ==============================================================================

ALTER TABLE public.access_links 
ADD COLUMN IF NOT EXISTS password_plain TEXT DEFAULT NULL;
