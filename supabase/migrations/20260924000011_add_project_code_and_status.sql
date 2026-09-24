-- ==============================================================================
-- Migration: 20260924000011_add_project_code_and_status.sql
-- Description: Adds atomic unique project_code (format MDS-YYYY-NNN) and
--              project status lifecycle field with full constraint validation,
--              concurrency-safe sequence tracking, and idempotent backfill.
-- ==============================================================================

-- 1. Create table for year-based sequential numbering (concurrency and race-condition safe)
CREATE TABLE IF NOT EXISTS public.project_code_sequences (
    year INT PRIMARY KEY,
    last_value INT NOT NULL DEFAULT 0
);

-- Grant access on sequence table to service_role
ALTER TABLE public.project_code_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_code_sequences FROM anon, authenticated;
GRANT ALL ON TABLE public.project_code_sequences TO service_role;

-- 2. Function to atomically generate the next unique project code for a given year
CREATE OR REPLACE FUNCTION public.generate_project_code(p_year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT)
RETURNS TEXT AS $$
DECLARE
    next_val INT;
    result_code TEXT;
BEGIN
    INSERT INTO public.project_code_sequences (year, last_value)
    VALUES (p_year, 1)
    ON CONFLICT (year) DO UPDATE
    SET last_value = public.project_code_sequences.last_value + 1
    RETURNING last_value INTO next_val;

    result_code := 'MDS-' || p_year::TEXT || '-' || LPAD(next_val::TEXT, 3, '0');
    RETURN result_code;
END;
$$ LANGUAGE plpgsql;

-- 3. Add status column to projects with default 'new' and CHECK constraint
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'new';

ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (status IN (
    'new',
    'in_progress',
    'ready_for_review',
    'changes_requested',
    'approved',
    'final',
    'archived'
));

-- 4. Add project_code column if not exists (initially nullable for backfilling)
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS project_code TEXT;

-- 5. Backfill existing projects:
-- 5a. Set status: if is_archived = true then 'archived', else 'new' (if current status is 'new' or null)
UPDATE public.projects
SET status = CASE
    WHEN is_archived = TRUE THEN 'archived'
    ELSE 'new'
END
WHERE status IS NULL OR (status = 'new' AND is_archived = TRUE);

-- 5b. Backfill project_code for existing projects in chronological order (created_at ASC)
DO $$
DECLARE
    r RECORD;
    proj_year INT;
    proj_code TEXT;
BEGIN
    FOR r IN
        SELECT id, created_at
        FROM public.projects
        WHERE project_code IS NULL OR TRIM(project_code) = ''
        ORDER BY created_at ASC
    LOOP
        proj_year := EXTRACT(YEAR FROM COALESCE(r.created_at, CURRENT_TIMESTAMP))::INT;
        proj_code := public.generate_project_code(proj_year);
        UPDATE public.projects SET project_code = proj_code WHERE id = r.id;
    END LOOP;
END;
$$;

-- 6. Enforce NOT NULL and UNIQUE constraint on project_code
ALTER TABLE public.projects
ALTER COLUMN project_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'projects_project_code_key'
    ) THEN
        ALTER TABLE public.projects ADD CONSTRAINT projects_project_code_key UNIQUE (project_code);
    END IF;
END;
$$;

-- 7. Trigger on BEFORE INSERT to automatically assign project_code if not supplied
CREATE OR REPLACE FUNCTION public.trg_set_project_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.project_code IS NULL OR TRIM(NEW.project_code) = '' THEN
        NEW.project_code := public.generate_project_code(EXTRACT(YEAR FROM COALESCE(NEW.created_at, CURRENT_TIMESTAMP))::INT);
    END IF;

    -- Sync is_archived and status if needed
    IF NEW.status = 'archived' THEN
        NEW.is_archived := TRUE;
    ELSIF NEW.is_archived = TRUE AND NEW.status = 'new' THEN
        NEW.status := 'archived';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_set_project_code ON public.projects;
CREATE TRIGGER trg_projects_set_project_code
    BEFORE INSERT ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_set_project_code();

-- 8. Add performance indexes for project_code and status
CREATE INDEX IF NOT EXISTS idx_projects_project_code ON public.projects (project_code);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_status_created_at ON public.projects (status, created_at DESC);
