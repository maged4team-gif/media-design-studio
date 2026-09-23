import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { getRuntimeDriveConfig } from '@/lib/drive/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);

  if (!isAdmin || !adminToken) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const { refreshToken, rootFolderId } = getRuntimeDriveConfig();

  return NextResponse.json({
    configured: Boolean(refreshToken),
    root_folder_id: rootFolderId,
  });
}
