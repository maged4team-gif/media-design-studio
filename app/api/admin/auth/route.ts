import { NextResponse } from 'next/server';
import { verifyAdminPassword, setAdminSession, clearAdminSession } from '@/lib/auth/session';
import { checkRateLimit, recordRateLimitAttempt, resetRateLimit } from '@/lib/auth/rate-limit';
import { verifyRequestOrigin } from '@/lib/auth/csrf';

export async function POST(req: Request) {
  // 1. CSRF Verification
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Origin Mismatch)' }, { status: 403 });
  }

  // 2. Rate Limiting for Admin Login (5 attempts per 15 minutes)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local_admin';
  const rateLimitKey = `admin_auth:${ip}`;
  const rateCheck = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: `تم تجاوز الحد المسموح من محاولات الدخول. يرجى المحاولة بعد ${rateCheck.retryAfterSeconds} ثانية.`,
      },
      { status: 429 }
    );
  }

  try {
    const { password } = await req.json();

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'يرجى إدخال كلمة مرور الإدارة' }, { status: 400 });
    }

    if (!verifyAdminPassword(password)) {
      recordRateLimitAttempt(rateLimitKey);
      return NextResponse.json({ error: 'كلمة مرور الإدارة غير صحيحة' }, { status: 401 });
    }

    // Reset rate limiter on successful authentication
    resetRateLimit(rateLimitKey);

    await setAdminSession();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin auth error:', error);
    if (error?.message?.includes('CONFIG_FATAL')) {
      return NextResponse.json({ error: 'خطأ إعداد أمني: لم يتم تعيين كلمة مرور الإدارة في بيئة الإنتاج' }, { status: 500 });
    }
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به' }, { status: 403 });
  }

  await clearAdminSession();
  return NextResponse.json({ success: true });
}
