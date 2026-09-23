import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { isDriveConfigured } from '@/lib/drive/client';
import { getDriveCredentials } from '@/lib/drive/credentials-store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);

  if (!isAdmin || !adminToken) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const configured = await isDriveConfigured();
  const creds = await getDriveCredentials();
  const rootFolderId = creds?.rootFolderId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || null;

  return NextResponse.json({
    configured,
    root_folder_id: rootFolderId,
  });
}
