import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { dataService } from '@/lib/data/service';
import { verifyRequestOrigin } from '@/lib/auth/csrf';

interface RouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(req: Request, { params }: RouteProps) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.cover_url !== undefined) updateData.cover_url = body.cover_url ? body.cover_url.trim() : null;
    if (body.cover_storage_path !== undefined) updateData.cover_storage_path = body.cover_storage_path ? body.cover_storage_path.trim() : null;
    if (body.category !== undefined) updateData.category = body.category?.trim() || null;
    if (body.progress !== undefined) {
      updateData.progress = Math.min(100, Math.max(0, parseInt(body.progress, 10) || 0));
    }
    if (body.is_visible !== undefined) updateData.is_visible = Boolean(body.is_visible);
    if (body.is_archived !== undefined) updateData.is_archived = Boolean(body.is_archived);
    if (body.show_progress !== undefined) updateData.show_progress = Boolean(body.show_progress);
    if (body.allow_feedback !== undefined) updateData.allow_feedback = Boolean(body.allow_feedback);

    const project = await dataService.updateProject(id, updateData);
    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ success: true, project });
  } catch (error: any) {
    console.error('Update project error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر تعديل المشروع' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteProps) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const success = await dataService.deleteProject(id);
    return NextResponse.json({ success });
  } catch (error: any) {
    console.error('Delete project error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر حذف المشروع' }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: RouteProps) {
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const assets = await dataService.getAssetsForProject(id, false);
    return NextResponse.json({ assets });
  } catch (error: any) {
    console.error('Fetch project assets error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر جلب ملفات المشروع' }, { status: 500 });
  }
}
