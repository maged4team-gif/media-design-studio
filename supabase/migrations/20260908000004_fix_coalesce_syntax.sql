-- ==============================================================================
-- Migration 004: Correct COALESCE Syntax and Return Payload in update_access_link_atomic
-- 1. In PostgreSQL, COALESCE is an intrinsic SQL syntax expression (not pg_catalog.coalesce).
-- 2. access_links table has columns (id, viewer_name, slug, password_hash, enabled, session_version, created_at).
-- ==============================================================================

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

    -- Update project associations if project IDs array is provided
    IF p_project_ids IS NOT NULL THEN
        DELETE FROM public.access_link_projects WHERE access_link_id = p_link_id;
        
        IF pg_catalog.array_length(p_project_ids, 1) > 0 THEN
            INSERT INTO public.access_link_projects (access_link_id, project_id)
            SELECT p_link_id, pg_catalog.unnest(p_project_ids);
        END IF;
    END IF;

    -- Return safe JSON representation omitting password_hash
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

REVOKE ALL ON FUNCTION public.update_access_link_atomic(uuid, character varying, text, boolean, boolean, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_access_link_atomic(uuid, character varying, text, boolean, boolean, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_access_link_atomic(uuid, character varying, text, boolean, boolean, uuid[]) TO service_role;
