-- ==============================================================================
-- Migration 006: Add show_progress customizable toggle to projects table
-- Enables studio administrators to customize or disable the progress bar per project.
-- ==============================================================================

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS show_progress BOOLEAN NOT NULL DEFAULT true;
