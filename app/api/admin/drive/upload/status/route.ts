import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import { verifyUploadSessionTicket, getUploadResumeStatus } from '@/lib/drive/client';

export async function POST(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin || !adminToken) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const uploadToken = body?.uploadToken || req.headers.get('x-upload-token');

    if (!uploadToken) {
      return NextResponse.json(
        { error: 'رمز جلسة الرفع (uploadToken) مطلوب للاستعلام عن موضع الاستئناف' },
        { status: 400 }
      );
    }

    // 1. Verify upload session ticket
    const ticket = verifyUploadSessionTicket(uploadToken, adminToken);

    // 2. Query Google Drive for the confirmed received bytes and completion status
    const statusResult = await getUploadResumeStatus(ticket.sessionUrl, ticket.fileSize);

    return NextResponse.json({
      success: true,
      complete: statusResult.complete,
      nextByteOffset: statusResult.nextByteOffset,
      fileId: statusResult.fileId || null,
      fileSize: ticket.fileSize,
      filename: ticket.filename,
    });
  } catch (err: any) {
    console.error('Upload resume status query error:', err?.message);
    return NextResponse.json(
      { error: err?.message || 'فشل الاستعلام عن موضع استئناف الرفع من Google Drive' },
      { status: 500 }
    );
  }
}
