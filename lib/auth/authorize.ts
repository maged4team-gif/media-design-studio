import 'server-only';
import { getClientSession, ClientSessionData } from '@/lib/auth/session';
import { dataService } from '@/lib/data/service';
import { AccessLink, Project, Asset } from '@/lib/supabase/database.types';

export interface AuthorizationSuccess<T = void> {
  ok: true;
  session: ClientSessionData;
  link: AccessLink;
  data: T;
}

export interface AuthorizationFailure {
  ok: false;
  error: string;
  status: number;
}

export type AuthorizationResult<T = void> = AuthorizationSuccess<T> | AuthorizationFailure;

/**
 * Validates that the client has an active, valid session
 * and that the database access link is still enabled with matching session_version
 */
export async function authorizeClientSession(
  slug: string,
  cookieOrTokenOverride?: string
): Promise<AuthorizationResult<void>> {
  if (!slug || typeof slug !== 'string') {
    return { ok: false, error: 'معرّف الرابط غير صالح', status: 400 };
  }

  const session = await getClientSession(slug, cookieOrTokenOverride);
  if (!session) {
    return { ok: false, error: 'جلسة العميل غير صالحة أو منتهية', status: 401 };
  }

  const link = await dataService.getAccessLinkBySlug(slug);
  if (!link || !link.enabled) {
    return { ok: false, error: 'تم تعطيل رابط الوصول أو حذفه', status: 403 };
  }

  // Strict linkId match enforcement
  if (session.linkId !== link.id) {
    return { ok: false, error: 'معرف الرابط في الجلسة غير متطابق مع الرابط المطلوب', status: 401 };
  }

  // Enforce session version (password change invalidates old sessions)
  if (link.session_version !== session.sessionVersion) {
    return {
      ok: false,
      error: 'تم تغيير كلمة مرور الرابط، يرجى تسجيل الدخول بكلمة المرور الجديدة',
      status: 401,
    };
  }

  return { ok: true, session, link, data: undefined };
}

/**
 * Validates that the client is authorized to access a specific project
 */
export async function authorizeClientProject(
  slug: string,
  projectId: string,
  cookieOrTokenOverride?: string
): Promise<AuthorizationResult<{ project: Project }>> {
  const auth = await authorizeClientSession(slug, cookieOrTokenOverride);
  if (!auth.ok) return auth;

  if (!projectId || typeof projectId !== 'string') {
    return { ok: false, error: 'معرّف المشروع غير صالح', status: 400 };
  }

  const project = await dataService.getProjectForClient(auth.link.id, projectId);
  if (!project) {
    return {
      ok: false,
      error: 'المشروع غير مخصص لهذا الرابط أو غير متاح حالياً',
      status: 403,
    };
  }

  return {
    ok: true,
    session: auth.session,
    link: auth.link,
    data: { project },
  };
}

/**
 * Validates that the client is authorized to access, view, or review a specific asset:
 * 1. Session is valid and active.
 * 2. Access link is active and session_version matches.
 * 3. Asset exists and is visible.
 * 4. Asset's project is assigned to this access link.
 * 5. Asset's project is visible and not archived.
 */
export async function authorizeClientAsset(
  slug: string,
  assetId: string,
  cookieOrTokenOverride?: string
): Promise<AuthorizationResult<{ project: Project; asset: Asset }>> {
  const auth = await authorizeClientSession(slug, cookieOrTokenOverride);
  if (!auth.ok) return auth;

  if (!assetId || typeof assetId !== 'string') {
    return { ok: false, error: 'معرّف الملف غير صالح', status: 400 };
  }

  const asset = await dataService.getAssetById(assetId);
  if (!asset || !asset.is_visible) {
    return {
      ok: false,
      error: 'الملف المطلوب غير موجود أو غير مرئي للعميل',
      status: 404,
    };
  }

  // Check project access for this client
  const project = await dataService.getProjectForClient(auth.link.id, asset.project_id);
  if (!project) {
    return {
      ok: false,
      error: 'غير مصرح بالوصول إلى هذا الملف أو مشروعه التابع',
      status: 403,
    };
  }

  return {
    ok: true,
    session: auth.session,
    link: auth.link,
    data: { project, asset },
  };
}
