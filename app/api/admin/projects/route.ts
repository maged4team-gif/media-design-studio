import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { dataService } from '@/lib/data/service';
import { verifyRequestOrigin } from '@/lib/auth/csrf';

export async function GET(req: Request) {
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  try {
    const projects = await dataService.getAllProjects();
    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error('Fetch projects error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر جلب المشاريع' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'اسم المشروع مطلوب' }, { status: 400 });
    }

    const project = await dataService.createProject({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      cover_url: body.cover_url?.trim() || null,
      cover_storage_path: body.cover_storage_path?.trim() || null,
      category: body.category?.trim() || null,
      progress: Math.min(100, Math.max(0, parseInt(body.progress, 10) || 0)),
      show_progress: body.show_progress !== undefined ? Boolean(body.show_progress) : true,
      allow_feedback: body.allow_feedback !== undefined ? Boolean(body.allow_feedback) : true,
      is_visible: body.is_visible ?? true,
      is_archived: false,
    });

    return NextResponse.json({ success: true, project });
  } catch (error: any) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر إنشاء المشروع' }, { status: 500 });
  }
}
