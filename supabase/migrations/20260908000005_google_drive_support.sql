-- ==============================================================================
-- Migration 005: Google Drive Media Storage Support & Duplicate Constraint
-- 1. Adds drive_folder_id and drive_cover_file_id to projects.
-- 2. Adds drive_file_id, drive_folder_id, and source to assets.
-- 3. Adds UNIQUE constraint on assets(drive_file_id) to prevent duplicate concurrent registrations.
--    In PostgreSQL, standard UNIQUE constraints permit multiple NULL values, safely preserving legacy rows.
-- ==============================================================================

-- 1. Upgrade Projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS drive_cover_file_id TEXT;

-- 2. Upgrade Assets table
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'legacy';

-- 3. Enforce Unique constraint on drive_file_id across assets
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_assets_drive_file_id' AND conrelid = 'public.assets'::regclass
    ) THEN
        ALTER TABLE public.assets ADD CONSTRAINT unique_assets_drive_file_id UNIQUE (drive_file_id);
    END IF;
END $$;

-- 4. Index for fast lookup by Drive File / Folder ID
CREATE INDEX IF NOT EXISTS idx_assets_drive_file_id ON public.assets(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_projects_drive_folder_id ON public.projects(drive_folder_id);
