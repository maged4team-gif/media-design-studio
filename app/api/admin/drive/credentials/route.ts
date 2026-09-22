import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { loadStoredDriveConfig } from '@/lib/drive/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);

  if (!isAdmin || !adminToken) {
    return NextResponse.json({ error: '??? ???? ?????? ???? ???????' }, { status: 401 });
  }

  loadStoredDriveConfig();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '';
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '';

  return NextResponse.json({
    configured: Boolean(refreshToken),
    refresh_token: refreshToken,
    root_folder_id: rootFolderId,
  });
}
