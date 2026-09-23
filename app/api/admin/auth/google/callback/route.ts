import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import {
  verifyOAuthState,
  exchangeCodeForTokens,
  ensureArchiveRootFolder,
  verifyDriveConnection,
  getOAuthRedirectUri,
  resetAccessTokenCache,
  getValidAccessToken,
} from '@/lib/drive/client';
import {
  saveDriveCredentials,
  updateDriveRootFolder,
  resetCredentialsStoreCache,
} from '@/lib/drive/credentials-store';

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

    // 2. Clear token caches to guarantee testing the stored refresh token directly
    resetAccessTokenCache();
    resetCredentialsStoreCache();

    // 3. Immediately encrypt and save the new refresh_token in Supabase persistent store
    await saveDriveCredentials({
      refreshToken: tokens.refresh_token,
    });

    // 4. Strictly test that the stored refresh_token can mint a fresh access token from Google
    const testAccessToken = await getValidAccessToken({ forceRefresh: true });
    if (!testAccessToken) {
      throw new Error('فشل التحقق من صلاحية Refresh Token المخزن.');
    }

    // 5. Automatically ensure root archive folder exists and persist its ID in Supabase
    const rootFolderId = await ensureArchiveRootFolder();
    await updateDriveRootFolder(rootFolderId);

    // 6. Perform live sanity check before declaring success to admin
    await verifyDriveConnection();

    // Redirect to admin dashboard without exposing tokens in URL or logs
    return NextResponse.redirect(`${urlObj.origin}/admin?drive_connected=true`);
  } catch (err: any) {
    console.error('Google OAuth callback processing error:', err?.message);
    return NextResponse.redirect(
      `${urlObj.origin}/admin?drive_error=${encodeURIComponent(err?.message || 'Exchange failed')}`
    );
  }
}
