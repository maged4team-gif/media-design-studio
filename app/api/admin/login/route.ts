import { NextResponse } from 'next/server';
import {
  isAdminPasswordConfigured,
  verifyAdminPassword,
  setAdminSession,
  clearAdminSession,
  getAdminSession,
} from '@/lib/auth/session';
import { revokeAllAdminSessions } from '@/lib/auth/admin-revocation';
import { checkRateLimit, recordRateLimitAttempt, resetRateLimit, getClientIp } from '@/lib/auth/rate-limit';
import { verifyRequestOrigin } from '@/lib/auth/csrf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMIN_GLOBAL_RATE_KEY = 'admin_auth:global';

export async function POST(req: Request) {
  // Safe diagnostic logging as requested by user (never logs password itself)
  console.log('[Admin Auth] ADMIN_PASSWORD configured:', !!process.env.ADMIN_PASSWORD);

  // 1. CSRF Origin Verification
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Origin Mismatch)' }, { status: 403 });
  }

  // 2. Rate Limiting for Admin Login (5 attempts per 15 minutes per IP)
  const ip = getClientIp(req, 'local_admin');
  const rateLimitKey = 'admin_auth:' + ip;
  const ipRateCheck = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
  // Global cap across ALL IPs: spoofed forwarding headers cannot multiply the attempt budget
  const globalRateCheck = checkRateLimit(ADMIN_GLOBAL_RATE_KEY, 20, 15 * 60 * 1000);
  const rateCheck = ipRateCheck.allowed ? globalRateCheck : ipRateCheck;

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: 'تم تجاوز الحد المسموح من محاولات الدخول. يرجى المحاولة بعد ' + rateCheck.retryAfterSeconds + ' ثانية.',
      },
      { status: 429 }
    );
  }

  // 3. Verify ADMIN_PASSWORD configuration on the server
  if (!isAdminPasswordConfigured()) {
    console.error('[Admin Auth] ADMIN_PASSWORD is not configured in server environment.');
    return NextResponse.json(
      { error: 'خطأ إعداد أمني: لم يتم تعيين كلمة مرور الإدارة في بيئة الإنتاج' },
      { status: 500 }
    );
  }

  try {
    let password = '';
    const contentType = req.headers.get('content-type') || '';
    const isFormSubmission =
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data');

    if (isFormSubmission) {
      const formData = await req.formData().catch(() => null);
      password = (formData?.get('password') as string) || '';
    } else {
      const body = await req.json().catch(() => ({}));
      password = body?.password || '';
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'يرجى إدخال كلمة مرور الإدارة' }, { status: 400 });
    }

    // 4. Strict Constant-Time Password Verification
    if (!verifyAdminPassword(password)) {
      recordRateLimitAttempt(rateLimitKey);
      recordRateLimitAttempt(ADMIN_GLOBAL_RATE_KEY);
      return NextResponse.json({ error: 'كلمة مرور الإدارة غير صحيحة' }, { status: 401 });
    }

    // 5. Success: Reset rate limiter & set secure HttpOnly cookie session
    resetRateLimit(rateLimitKey);
    resetRateLimit(ADMIN_GLOBAL_RATE_KEY);
    await setAdminSession();

    if (isFormSubmission) {
      return NextResponse.redirect(new URL('/admin', req.url), 303);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Auth] Unexpected error during login process:', error?.message);
    return NextResponse.json({ error: 'حدث خطأ غير متوقع في الخادم' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به' }, { status: 403 });
  }

  // ?scope=all → revoke every admin session on every device (requires a valid session,
  // so an unauthenticated caller cannot log the admin out everywhere)
  const scope = new URL(req.url).searchParams.get('scope');
  if (scope === 'all') {
    if (!(await getAdminSession())) {
      return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
    }
    try {
      await revokeAllAdminSessions();
    } catch (error: any) {
      console.error('[Admin Auth] Failed to revoke all admin sessions:', error?.message);
      const message = String(error?.message || '').startsWith('MIGRATION_REQUIRED')
        ? error.message.replace(/^MIGRATION_REQUIRED:\s*/, '')
        : 'تعذر تسجيل الخروج من جميع الأجهزة';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  await clearAdminSession();
  return NextResponse.json({ success: true });
}
