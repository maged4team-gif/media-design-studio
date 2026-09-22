import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import {
  verifyOAuthState,
  exchangeCodeForTokens,
  ensureArchiveRootFolder,
  saveStoredDriveConfig,
  verifyDriveConnection,
  getOAuthRedirectUri,
} from '@/lib/drive/client';

export async function GET(req: Request) {
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);

  if (!isAdmin || !adminToken) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const urlObj = new URL(req.url);
  const code = urlObj.searchParams.get('code');
  const state = urlObj.searchParams.get('state');
  const oauthError = urlObj.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(`${urlObj.origin}/admin?drive_error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'معطيات الرد غير مكتملة (Missing code or state)' }, { status: 400 });
  }

  // 1. Strictly verify OAuth state against admin session (Anti-CSRF)
  const isStateValid = verifyOAuthState(state, adminToken);
  if (!isStateValid) {
    return NextResponse.json(
      { error: 'فشل التحقق الأمني من الجلسة (OAuth State Mismatch or Expired)' },
      { status: 403 }
    );
  }

  try {
    const redirectUri = getOAuthRedirectUri(req);
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens.refresh_token) {
      throw new Error('لم يقم Google بإرجاع refresh_token صالح. يرجى إلغاء إذن التطبيق وإعادة المحاولة مع تفعيل prompt: consent.');
    }

    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = tokens.refresh_token;
    delete process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

    // 2. Automatically ensure root archive folder exists and verify usability
    const rootFolderId = await ensureArchiveRootFolder();
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = rootFolderId;

    // 3. Perform live sanity check before declaring success to admin
    await verifyDriveConnection();

    // 4. Safely persist credentials to server-side storage across restarts
    saveStoredDriveConfig({
      refresh_token: tokens.refresh_token,
      root_folder_id: rootFolderId,
    });

    // Redirect to admin dashboard without exposing tokens in URL or logs
    return NextResponse.redirect(`${urlObj.origin}/admin?drive_connected=true`);
  } catch (err: any) {
    console.error('Google OAuth callback processing error:', err?.message);
    return NextResponse.redirect(
      `${urlObj.origin}/admin?drive_error=${encodeURIComponent(err?.message || 'Exchange failed')}`
    );
  }
}
