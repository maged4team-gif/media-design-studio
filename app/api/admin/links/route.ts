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
    const links = await dataService.getAllAccessLinks();
    return NextResponse.json({ links });
  } catch (error: any) {
    console.error('Fetch links error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر جلب روابط الوصول' }, { status: 500 });
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
    const { viewerName, password, projectIds } = await req.json();

    if (!viewerName || !viewerName.trim()) {
      return NextResponse.json({ error: 'اسم العميل مطلوب' }, { status: 400 });
    }

    const passwordStr = typeof password === 'string' ? password.trim() : '';

    const link = await dataService.createAccessLink(
      viewerName.trim(),
      passwordStr,
      Array.isArray(projectIds) ? projectIds : []
    );

    return NextResponse.json({ success: true, link });
  } catch (error: any) {
    console.error('Create link error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر إنشاء رابط الوصول' }, { status: 500 });
  }
}
