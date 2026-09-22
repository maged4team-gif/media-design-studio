-- Migration 007: Add allow_feedback column to projects table
-- Controls whether a project allows client comments, approvals, and versioning (true),
-- or is strictly for presentation, download, and sharing in full-screen mode (false).

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS allow_feedback BOOLEAN NOT NULL DEFAULT true;

-- Index for fast filtering if needed
CREATE INDEX IF NOT EXISTS idx_projects_allow_feedback ON projects(allow_feedback);
