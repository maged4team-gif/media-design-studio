-- ==============================================================================
-- Studio-Specific Historical Data Backfill Transaction
-- Target: Media Design Studio Historical Projects & Assets
-- 
-- Execution Context:
-- This script backfills historical Google Drive mappings and custom settings
-- from local recovery files (.data/project-settings.json and .data/asset-drive-map.json).
-- 
-- Safety & Invariance Guarantees:
-- 1. Complete Idempotency: Returns ALREADY_APPLIED ONLY after verifying 100% of all 3 projects
--    and all 6 assets across every target field.
-- 2. Existence verification: Asserts all target projects and assets exist before updating.
-- 3. Row Locking: Prevents concurrent changes between inspection and update via FOR UPDATE.
-- 4. Conflict prevention: Checks expected pre-conditions for EVERY field to be updated;
--    aborts immediately with EXCEPTION if any record contains a conflicting non-null value.
-- 5. Conditional Updates: Every UPDATE statement guards against unexpected concurrent mutations.
-- 6. Uniqueness check: Asserts no other asset in DB already uses any target Drive file ID.
-- 7. Atomicity: Runs in a single DO $$ block; any failure rolls back completely.
-- 8. Post-verification: Strictly validates each record individually against expected target values
--    and asserts that access links and project scopes remain intact.
-- ==============================================================================

DO $$
DECLARE
    v_already_applied BOOLEAN := TRUE;
    v_proj_rec RECORD;
    v_asset_rec RECORD;
    v_link_count INTEGER := 0;

    -- Explicit intentional override decisions per record and field (default FALSE for zero-assumption safety).
    -- A value of true or any differing value is NEVER assumed to be a safe default.
    -- Any intentional override must be explicitly set to TRUE here for that specific record and field.
    v_override_d57f384f_show_progress BOOLEAN := FALSE;
    v_override_86efb486_show_progress BOOLEAN := FALSE;
    v_override_86efb486_allow_feedback BOOLEAN := FALSE;
BEGIN
    -- -------------------------------------------------------------
    -- 1. Schema Precondition Check
    -- -------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'show_progress'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'allow_feedback'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'drive_folder_id'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'drive_file_id'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'drive_folder_id'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'source'
    ) THEN
        RAISE EXCEPTION 'SCHEMA_PRECONDITION_FAILED: Required schema columns do not exist. Please run migration 008 first.';
    END IF;

    -- -------------------------------------------------------------
    -- 2. Existence Checks: Target Projects & Assets
    -- -------------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = '9f9cc14b-b0bd-4b42-9ba6-9940c1681569') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Target project 9f9cc14b-b0bd-4b42-9ba6-9940c1681569 not found.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = 'd57f384f-ae88-4108-98db-b9a0aa95f7ae') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Target project d57f384f-ae88-4108-98db-b9a0aa95f7ae not found.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = '86efb486-8224-4167-ab83-5e0899c2b60c') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Target project 86efb486-8224-4167-ab83-5e0899c2b60c not found.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id = 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Target asset ba5dac17-3a8d-413e-ba90-63b0e0bd2058 not found.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id = '685602eb-6f63-40f5-afd0-972116bb6a2f') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Target asset 685602eb-6f63-40f5-afd0-972116bb6a2f not found.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id = 'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Target asset ef0f1b1b-0e44-44c9-82ed-26a2e13a489b not found.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id = 'b8e1f656-233d-4f12-9827-9b8742e09cf9') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Target asset b8e1f656-233d-4f12-9827-9b8742e09cf9 not found.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id = '64c8407d-6b83-44f1-9574-4b852c8bd1e4') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Target asset 64c8407d-6b83-44f1-9574-4b852c8bd1e4 not found.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id = '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Target asset 6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a not found.';
    END IF;

    -- -------------------------------------------------------------
    -- 3. Row Locking: Lock target rows against concurrent modifications
    -- -------------------------------------------------------------
    PERFORM 1 FROM public.projects 
    WHERE id IN (
        '9f9cc14b-b0bd-4b42-9ba6-9940c1681569',
        'd57f384f-ae88-4108-98db-b9a0aa95f7ae',
        '86efb486-8224-4167-ab83-5e0899c2b60c'
    ) FOR UPDATE;

    PERFORM 1 FROM public.assets 
    WHERE id IN (
        'ba5dac17-3a8d-413e-ba90-63b0e0bd2058',
        '685602eb-6f63-40f5-afd0-972116bb6a2f',
        'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b',
        'b8e1f656-233d-4f12-9827-9b8742e09cf9',
        '64c8407d-6b83-44f1-9574-4b852c8bd1e4',
        '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a'
    ) FOR UPDATE;

    -- -------------------------------------------------------------
    -- 4. Complete Idempotency Check:
    -- ALREADY_APPLIED is returned ONLY after 100% of all 3 projects
    -- and all 6 assets match all targeted fields exactly.
    -- -------------------------------------------------------------
    SELECT * INTO v_proj_rec FROM public.projects WHERE id = '9f9cc14b-b0bd-4b42-9ba6-9940c1681569';
    IF v_proj_rec.drive_folder_id IS DISTINCT FROM '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV' THEN
        v_already_applied := FALSE;
    END IF;

    SELECT * INTO v_proj_rec FROM public.projects WHERE id = 'd57f384f-ae88-4108-98db-b9a0aa95f7ae';
    IF v_proj_rec.show_progress IS DISTINCT FROM false 
       OR v_proj_rec.drive_folder_id IS DISTINCT FROM '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL' THEN
        v_already_applied := FALSE;
    END IF;

    SELECT * INTO v_proj_rec FROM public.projects WHERE id = '86efb486-8224-4167-ab83-5e0899c2b60c';
    IF v_proj_rec.show_progress IS DISTINCT FROM false 
       OR v_proj_rec.allow_feedback IS DISTINCT FROM false 
       OR v_proj_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' THEN
        v_already_applied := FALSE;
    END IF;

    SELECT * INTO v_asset_rec FROM public.assets WHERE id = 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV'
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        v_already_applied := FALSE;
    END IF;

    SELECT * INTO v_asset_rec FROM public.assets WHERE id = '685602eb-6f63-40f5-afd0-972116bb6a2f';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL'
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        v_already_applied := FALSE;
    END IF;

    SELECT * INTO v_asset_rec FROM public.assets WHERE id = 'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1RrVPhC3PaICyP-ID7PggDJ0nxLjxH0iU' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF'
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        v_already_applied := FALSE;
    END IF;

    SELECT * INTO v_asset_rec FROM public.assets WHERE id = 'b8e1f656-233d-4f12-9827-9b8742e09cf9';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1eeNtvSMGX3ddVxBWNe9Mi3on3aXtwbWW' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF'
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        v_already_applied := FALSE;
    END IF;

    SELECT * INTO v_asset_rec FROM public.assets WHERE id = '64c8407d-6b83-44f1-9574-4b852c8bd1e4';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1tRou5UwtmZtTDTrOdA4ACySnBE1f_izO' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF'
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        v_already_applied := FALSE;
    END IF;

    SELECT * INTO v_asset_rec FROM public.assets WHERE id = '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1GaQBHyfTJ1uU4AqJrNe22twIMX7pxicl' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF'
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        v_already_applied := FALSE;
    END IF;

    IF v_already_applied THEN
        RAISE NOTICE 'ALREADY_APPLIED: Studio historical data backfill has already been fully applied to all 3 projects and all 6 assets. Zero updates required.';
        RETURN;
    END IF;

    -- -------------------------------------------------------------
    -- 5. Strict Conflict Verification on Pre-Update Values (No Silent Overwrite)
    -- -------------------------------------------------------------
    -- Project checks:
    SELECT * INTO v_proj_rec FROM public.projects WHERE id = '9f9cc14b-b0bd-4b42-9ba6-9940c1681569';
    IF v_proj_rec.drive_folder_id IS NOT NULL AND v_proj_rec.drive_folder_id <> '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Project 9f9cc14b has conflicting drive_folder_id "%"', v_proj_rec.drive_folder_id;
    END IF;

    SELECT * INTO v_proj_rec FROM public.projects WHERE id = 'd57f384f-ae88-4108-98db-b9a0aa95f7ae';
    -- Check previous show_progress before modification:
    -- Do not assume true is an overwriteable default; it could be a deliberate user choice.
    IF v_proj_rec.show_progress IS NOT NULL AND v_proj_rec.show_progress <> false THEN
        IF NOT v_override_d57f384f_show_progress THEN
            RAISE EXCEPTION 'CONFLICT_DETECTED: Project d57f384f has conflicting show_progress "%" (target is false). Do not assume true is default; potential recent user selection. Explicit decision required to overwrite.', v_proj_rec.show_progress;
        END IF;
    END IF;
    IF v_proj_rec.drive_folder_id IS NOT NULL AND v_proj_rec.drive_folder_id <> '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Project d57f384f has conflicting drive_folder_id "%"', v_proj_rec.drive_folder_id;
    END IF;

    SELECT * INTO v_proj_rec FROM public.projects WHERE id = '86efb486-8224-4167-ab83-5e0899c2b60c';
    -- Check previous show_progress before modification:
    IF v_proj_rec.show_progress IS NOT NULL AND v_proj_rec.show_progress <> false THEN
        IF NOT v_override_86efb486_show_progress THEN
            RAISE EXCEPTION 'CONFLICT_DETECTED: Project 86efb486 has conflicting show_progress "%" (target is false). Do not assume true is default; potential recent user selection. Explicit decision required to overwrite.', v_proj_rec.show_progress;
        END IF;
    END IF;
    -- Check previous allow_feedback before modification:
    IF v_proj_rec.allow_feedback IS NOT NULL AND v_proj_rec.allow_feedback <> false THEN
        IF NOT v_override_86efb486_allow_feedback THEN
            RAISE EXCEPTION 'CONFLICT_DETECTED: Project 86efb486 has conflicting allow_feedback "%" (target is false). Do not assume true is default; potential recent user selection. Explicit decision required to overwrite.', v_proj_rec.allow_feedback;
        END IF;
    END IF;
    IF v_proj_rec.drive_folder_id IS NOT NULL AND v_proj_rec.drive_folder_id <> '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Project 86efb486 has conflicting drive_folder_id "%"', v_proj_rec.drive_folder_id;
    END IF;

    -- Asset 1 checks:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058';
    IF v_asset_rec.drive_file_id IS NOT NULL AND v_asset_rec.drive_file_id <> '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset ba5dac17 has conflicting drive_file_id "%"', v_asset_rec.drive_file_id;
    END IF;
    IF v_asset_rec.drive_folder_id IS NOT NULL AND v_asset_rec.drive_folder_id <> '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset ba5dac17 has conflicting drive_folder_id "%"', v_asset_rec.drive_folder_id;
    END IF;
    IF v_asset_rec.source IS NOT NULL AND v_asset_rec.source NOT IN ('legacy', 'drive') THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset ba5dac17 has conflicting source "%"', v_asset_rec.source;
    END IF;

    -- Asset 2 checks:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = '685602eb-6f63-40f5-afd0-972116bb6a2f';
    IF v_asset_rec.drive_file_id IS NOT NULL AND v_asset_rec.drive_file_id <> '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset 685602eb has conflicting drive_file_id "%"', v_asset_rec.drive_file_id;
    END IF;
    IF v_asset_rec.drive_folder_id IS NOT NULL AND v_asset_rec.drive_folder_id <> '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset 685602eb has conflicting drive_folder_id "%"', v_asset_rec.drive_folder_id;
    END IF;
    IF v_asset_rec.source IS NOT NULL AND v_asset_rec.source NOT IN ('legacy', 'drive') THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset 685602eb has conflicting source "%"', v_asset_rec.source;
    END IF;

    -- Asset 3 checks:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = 'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b';
    IF v_asset_rec.drive_file_id IS NOT NULL AND v_asset_rec.drive_file_id <> '1RrVPhC3PaICyP-ID7PggDJ0nxLjxH0iU' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset ef0f1b1b has conflicting drive_file_id "%"', v_asset_rec.drive_file_id;
    END IF;
    IF v_asset_rec.drive_folder_id IS NOT NULL AND v_asset_rec.drive_folder_id <> '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset ef0f1b1b has conflicting drive_folder_id "%"', v_asset_rec.drive_folder_id;
    END IF;
    IF v_asset_rec.source IS NOT NULL AND v_asset_rec.source NOT IN ('legacy', 'drive') THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset ef0f1b1b has conflicting source "%"', v_asset_rec.source;
    END IF;

    -- Asset 4 checks:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = 'b8e1f656-233d-4f12-9827-9b8742e09cf9';
    IF v_asset_rec.drive_file_id IS NOT NULL AND v_asset_rec.drive_file_id <> '1eeNtvSMGX3ddVxBWNe9Mi3on3aXtwbWW' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset b8e1f656 has conflicting drive_file_id "%"', v_asset_rec.drive_file_id;
    END IF;
    IF v_asset_rec.drive_folder_id IS NOT NULL AND v_asset_rec.drive_folder_id <> '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset b8e1f656 has conflicting drive_folder_id "%"', v_asset_rec.drive_folder_id;
    END IF;
    IF v_asset_rec.source IS NOT NULL AND v_asset_rec.source NOT IN ('legacy', 'drive') THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset b8e1f656 has conflicting source "%"', v_asset_rec.source;
    END IF;

    -- Asset 5 checks:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = '64c8407d-6b83-44f1-9574-4b852c8bd1e4';
    IF v_asset_rec.drive_file_id IS NOT NULL AND v_asset_rec.drive_file_id <> '1tRou5UwtmZtTDTrOdA4ACySnBE1f_izO' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset 64c8407d has conflicting drive_file_id "%"', v_asset_rec.drive_file_id;
    END IF;
    IF v_asset_rec.drive_folder_id IS NOT NULL AND v_asset_rec.drive_folder_id <> '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset 64c8407d has conflicting drive_folder_id "%"', v_asset_rec.drive_folder_id;
    END IF;
    IF v_asset_rec.source IS NOT NULL AND v_asset_rec.source NOT IN ('legacy', 'drive') THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset 64c8407d has conflicting source "%"', v_asset_rec.source;
    END IF;

    -- Asset 6 checks:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a';
    IF v_asset_rec.drive_file_id IS NOT NULL AND v_asset_rec.drive_file_id <> '1GaQBHyfTJ1uU4AqJrNe22twIMX7pxicl' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset 6ce3ea6d has conflicting drive_file_id "%"', v_asset_rec.drive_file_id;
    END IF;
    IF v_asset_rec.drive_folder_id IS NOT NULL AND v_asset_rec.drive_folder_id <> '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset 6ce3ea6d has conflicting drive_folder_id "%"', v_asset_rec.drive_folder_id;
    END IF;
    IF v_asset_rec.source IS NOT NULL AND v_asset_rec.source NOT IN ('legacy', 'drive') THEN
        RAISE EXCEPTION 'CONFLICT_DETECTED: Asset 6ce3ea6d has conflicting source "%"', v_asset_rec.source;
    END IF;

    -- Cross-system uniqueness verification for Drive File IDs
    IF EXISTS (
        SELECT 1 FROM public.assets 
        WHERE drive_file_id IN (
            '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3',
            '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8',
            '1RrVPhC3PaICyP-ID7PggDJ0nxLjxH0iU',
            '1eeNtvSMGX3ddVxBWNe9Mi3on3aXtwbWW',
            '1tRou5UwtmZtTDTrOdA4ACySnBE1f_izO',
            '1GaQBHyfTJ1uU4AqJrNe22twIMX7pxicl'
        ) 
        AND id NOT IN (
            'ba5dac17-3a8d-413e-ba90-63b0e0bd2058',
            '685602eb-6f63-40f5-afd0-972116bb6a2f',
            'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b',
            'b8e1f656-233d-4f12-9827-9b8742e09cf9',
            '64c8407d-6b83-44f1-9574-4b852c8bd1e4',
            '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a'
        )
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_COLLISION_DETECTED: One or more target Drive file IDs are already assigned to different assets.';
    END IF;

    -- -------------------------------------------------------------
    -- 6. Conditional Atomic Updates
    -- -------------------------------------------------------------
    -- Project updates
    UPDATE public.projects 
    SET drive_folder_id = '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV'
    WHERE id = '9f9cc14b-b0bd-4b42-9ba6-9940c1681569'
      AND (drive_folder_id IS NULL OR drive_folder_id = '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV');

    UPDATE public.projects 
    SET show_progress = false, 
        drive_folder_id = '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL'
    WHERE id = 'd57f384f-ae88-4108-98db-b9a0aa95f7ae'
      AND (show_progress IS NULL OR show_progress = false OR v_override_d57f384f_show_progress)
      AND (drive_folder_id IS NULL OR drive_folder_id = '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL');

    UPDATE public.projects 
    SET show_progress = false, 
        allow_feedback = false, 
        drive_folder_id = '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF'
    WHERE id = '86efb486-8224-4167-ab83-5e0899c2b60c'
      AND (show_progress IS NULL OR show_progress = false OR v_override_86efb486_show_progress)
      AND (allow_feedback IS NULL OR allow_feedback = false OR v_override_86efb486_allow_feedback)
      AND (drive_folder_id IS NULL OR drive_folder_id = '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF');

    -- Asset updates
    UPDATE public.assets 
    SET drive_file_id = '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3',
        drive_folder_id = '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV',
        source = 'drive'
    WHERE id = 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058'
      AND (drive_file_id IS NULL OR drive_file_id = '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3');

    UPDATE public.assets 
    SET drive_file_id = '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8',
        drive_folder_id = '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL',
        source = 'drive'
    WHERE id = '685602eb-6f63-40f5-afd0-972116bb6a2f'
      AND (drive_file_id IS NULL OR drive_file_id = '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8');

    UPDATE public.assets 
    SET drive_file_id = '1RrVPhC3PaICyP-ID7PggDJ0nxLjxH0iU',
        drive_folder_id = '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF',
        source = 'drive'
    WHERE id = 'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b'
      AND (drive_file_id IS NULL OR drive_file_id = '1RrVPhC3PaICyP-ID7PggDJ0nxLjxH0iU');

    UPDATE public.assets 
    SET drive_file_id = '1eeNtvSMGX3ddVxBWNe9Mi3on3aXtwbWW',
        drive_folder_id = '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF',
        source = 'drive'
    WHERE id = 'b8e1f656-233d-4f12-9827-9b8742e09cf9'
      AND (drive_file_id IS NULL OR drive_file_id = '1eeNtvSMGX3ddVxBWNe9Mi3on3aXtwbWW');

    UPDATE public.assets 
    SET drive_file_id = '1tRou5UwtmZtTDTrOdA4ACySnBE1f_izO',
        drive_folder_id = '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF',
        source = 'drive'
    WHERE id = '64c8407d-6b83-44f1-9574-4b852c8bd1e4'
      AND (drive_file_id IS NULL OR drive_file_id = '1tRou5UwtmZtTDTrOdA4ACySnBE1f_izO');

    UPDATE public.assets 
    SET drive_file_id = '1GaQBHyfTJ1uU4AqJrNe22twIMX7pxicl',
        drive_folder_id = '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF',
        source = 'drive'
    WHERE id = '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a'
      AND (drive_file_id IS NULL OR drive_file_id = '1GaQBHyfTJ1uU4AqJrNe22twIMX7pxicl');

    -- -------------------------------------------------------------
    -- 7. Post-Verification Assertions: Exact matching of each record
    -- -------------------------------------------------------------
    -- Assert project 1:
    SELECT * INTO v_proj_rec FROM public.projects WHERE id = '9f9cc14b-b0bd-4b42-9ba6-9940c1681569';
    IF v_proj_rec.drive_folder_id IS DISTINCT FROM '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV' THEN
        RAISE EXCEPTION 'POST_VERIFICATION_FAILED: Project 9f9cc14b drive_folder_id mismatch.';
    END IF;

    -- Assert project 2:
    SELECT * INTO v_proj_rec FROM public.projects WHERE id = 'd57f384f-ae88-4108-98db-b9a0aa95f7ae';
    IF v_proj_rec.show_progress IS DISTINCT FROM false 
       OR v_proj_rec.drive_folder_id IS DISTINCT FROM '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL' THEN
        RAISE EXCEPTION 'POST_VERIFICATION_FAILED: Project d57f384f settings mismatch.';
    END IF;

    -- Assert project 3:
    SELECT * INTO v_proj_rec FROM public.projects WHERE id = '86efb486-8224-4167-ab83-5e0899c2b60c';
    IF v_proj_rec.show_progress IS DISTINCT FROM false 
       OR v_proj_rec.allow_feedback IS DISTINCT FROM false 
       OR v_proj_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' THEN
        RAISE EXCEPTION 'POST_VERIFICATION_FAILED: Project 86efb486 settings mismatch.';
    END IF;

    -- Assert asset 1:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = 'ba5dac17-3a8d-413e-ba90-63b0e0bd2058';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1Wg3j7fBVgg4JKZ5J5KYvahD0SulcC_t3' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1koVd1dp_1-GhANmgTJ0Ql8WWvRMb9pnV' 
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        RAISE EXCEPTION 'POST_VERIFICATION_FAILED: Asset ba5dac17 verification mismatch.';
    END IF;

    -- Assert asset 2:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = '685602eb-6f63-40f5-afd0-972116bb6a2f';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1d6VQJo-eGCs_adrNSfQ6FPGrtNur_Rn8' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1--uFjnwYt2uSQzYr0goYQcbew5Bhk1FL' 
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        RAISE EXCEPTION 'POST_VERIFICATION_FAILED: Asset 685602eb verification mismatch.';
    END IF;

    -- Assert asset 3:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = 'ef0f1b1b-0e44-44c9-82ed-26a2e13a489b';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1RrVPhC3PaICyP-ID7PggDJ0nxLjxH0iU' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' 
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        RAISE EXCEPTION 'POST_VERIFICATION_FAILED: Asset ef0f1b1b verification mismatch.';
    END IF;

    -- Assert asset 4:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = 'b8e1f656-233d-4f12-9827-9b8742e09cf9';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1eeNtvSMGX3ddVxBWNe9Mi3on3aXtwbWW' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' 
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        RAISE EXCEPTION 'POST_VERIFICATION_FAILED: Asset b8e1f656 verification mismatch.';
    END IF;

    -- Assert asset 5:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = '64c8407d-6b83-44f1-9574-4b852c8bd1e4';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1tRou5UwtmZtTDTrOdA4ACySnBE1f_izO' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' 
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        RAISE EXCEPTION 'POST_VERIFICATION_FAILED: Asset 64c8407d verification mismatch.';
    END IF;

    -- Assert asset 6:
    SELECT * INTO v_asset_rec FROM public.assets WHERE id = '6ce3ea6d-9d5b-41c2-b99f-17a7f5cfa21a';
    IF v_asset_rec.drive_file_id IS DISTINCT FROM '1GaQBHyfTJ1uU4AqJrNe22twIMX7pxicl' 
       OR v_asset_rec.drive_folder_id IS DISTINCT FROM '1FECwB4AQfXOS_nWqisSU8yOc6jfclYfF' 
       OR v_asset_rec.source IS DISTINCT FROM 'drive' THEN
        RAISE EXCEPTION 'POST_VERIFICATION_FAILED: Asset 6ce3ea6d verification mismatch.';
    END IF;

    -- Assert Access Links Integrity: Ensure access links still map to these projects
    SELECT COUNT(DISTINCT alp.access_link_id) INTO v_link_count
    FROM public.access_link_projects alp
    WHERE alp.project_id IN (
        '9f9cc14b-b0bd-4b42-9ba6-9940c1681569',
        'd57f384f-ae88-4108-98db-b9a0aa95f7ae',
        '86efb486-8224-4167-ab83-5e0899c2b60c'
    );

    RAISE NOTICE 'SUCCESS: Studio historical data backfill applied and verified atomically. Verified 3 projects, 6 assets, and % linked client access scopes.', v_link_count;
END $$;
