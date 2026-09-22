-- ==============================================================================
-- Migration 008: Generic Schema Parity & Hardening
-- Ensures all columns, constraints, and indexes exist across environments.
-- Pure generic DDL: NO hardcoded project IDs, NO data updates, NO tenant coupling.
-- Safe to execute idempotently on any fresh or upgraded Supabase instance.
-- ==============================================================================

-- 1. Projects table schema parity
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS show_progress BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS allow_feedback BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS drive_cover_file_id TEXT;

-- 2. Assets table schema parity
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

-- 4. Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_projects_show_progress ON public.projects(show_progress);
CREATE INDEX IF NOT EXISTS idx_projects_allow_feedback ON public.projects(allow_feedback);
CREATE INDEX IF NOT EXISTS idx_projects_drive_folder_id ON public.projects(drive_folder_id);
CREATE INDEX IF NOT EXISTS idx_assets_drive_file_id ON public.assets(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_assets_drive_folder_id ON public.assets(drive_folder_id);
CREATE INDEX IF NOT EXISTS idx_assets_source ON public.assets(source);
