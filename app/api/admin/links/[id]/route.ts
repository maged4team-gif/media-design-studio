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
    const success = await dataService.updateAccessLink(id, {
      viewerName: body.viewerName,
      passwordPlain: body.password,
      projectIds: body.projectIds,
      enabled: body.enabled,
      removePassword: body.removePassword,
    });

    return NextResponse.json({ success });
  } catch (error: any) {
    console.error('Update link error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر تعديل رابط الوصول' }, { status: 500 });
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
    const success = await dataService.deleteAccessLink(id);
    return NextResponse.json({ success });
  } catch (error: any) {
    console.error('Delete link error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر حذف الرابط' }, { status: 500 });
  }
}
