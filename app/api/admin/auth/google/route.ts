import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { getAuthorizationUrl } from '@/lib/drive/client';

export async function GET(req: Request) {
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);

  if (!isAdmin || !adminToken) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  try {
    const urlObj = new URL(req.url);
    const redirectUri = `${urlObj.origin}/api/admin/auth/google/callback`;
    const authUrl = getAuthorizationUrl(redirectUri, adminToken);

    // If client requested JSON
    if (req.headers.get('accept')?.includes('application/json')) {
      return NextResponse.json({ url: authUrl });
    }

    // Direct browser navigation redirects to Google consent
    return NextResponse.redirect(authUrl);
  } catch (err: any) {
    console.error('Google OAuth init error:', err?.message);
    return NextResponse.json(
      { error: err?.message || 'فشل بدء عملية ربط حساب Google Drive' },
      { status: 500 }
    );
  }
}
