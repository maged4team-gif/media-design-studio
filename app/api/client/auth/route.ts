import { NextResponse } from 'next/server';
import { dataService } from '@/lib/data/service';
import { setClientSession, clearClientSession } from '@/lib/auth/session';
import { checkRateLimit, recordRateLimitAttempt, resetRateLimit } from '@/lib/auth/rate-limit';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  // 1. CSRF Origin Verification
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Origin Mismatch)' }, { status: 403 });
  }

  // 2. Client IP Rate Limiting (5 attempts per 15 minutes)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local_client';
  const rateLimitKey = `client_auth:${ip}`;
  const rateCheck = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: `تم تجاوز الحد المسموح من المحاولات. يرجى المحاولة بعد ${rateCheck.retryAfterSeconds} ثانية.`,
      },
      { status: 429 }
    );
  }

  try {
    let slug = '';
    let password = '';

    const contentType = req.headers.get('content-type') || '';
    const isFormSubmission =
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data');

    if (isFormSubmission) {
      const formData = await req.formData().catch(() => null);
      slug = (formData?.get('slug') as string) || '';
      password = (formData?.get('password') as string) || '';
    } else {
      const body = await req.json().catch(() => ({}));
      slug = body?.slug || '';
      password = body?.password || '';
    }

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json({ error: 'معرّف الرابط غير صالح' }, { status: 400 });
    }

    const link = await dataService.getAccessLinkAuthDataBySlug(slug);
    // Generic safe error message to prevent link enumeration / probing attacks
    if (!link || !link.enabled) {
      recordRateLimitAttempt(rateLimitKey);
      return NextResponse.json({ error: 'رابط الوصول غير صالح أو تم إيقافه' }, { status: 401 });
    }

    // Determine if public link (no password required)
    const isPublicLink = !link.has_password;

    if (!isPublicLink) {
      if (!password || typeof password !== 'string') {
        return NextResponse.json({ error: 'يرجى إدخال كلمة المرور' }, { status: 400 });
      }

      const cleanPassword = password.trim();
      let isMatch = false;

      // Resilient multi-tier password verification
      if (link.password_plain && link.password_plain.trim() === cleanPassword) {
        isMatch = true;
      } else if (link.password_hash && typeof link.password_hash === 'string' && link.password_hash.startsWith('$2')) {
        try {
          isMatch = await bcrypt.compare(cleanPassword, link.password_hash);
        } catch {
          isMatch = false;
        }
      } else if (link.password_hash && link.password_hash === cleanPassword) {
        isMatch = true;
      }

      if (!isMatch) {
        recordRateLimitAttempt(rateLimitKey);
        return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 });
      }
    }

    // Reset rate limiter on successful authentication
    resetRateLimit(rateLimitKey);

    // Set secure HTTP-only session cookie bound to current session_version
    try {
      await setClientSession(link.id, link.slug, link.viewer_name, link.session_version ?? 1);
    } catch (sessionError) {
      console.error('Failed to issue client session cookie:', sessionError);
      return NextResponse.json({ error: 'فشل إصدار جلسة العميل الآمنة' }, { status: 500 });
    }

    if (isFormSubmission) {
      return NextResponse.redirect(new URL(`/p/${encodeURIComponent(link.slug)}`, req.url), 303);
    }

    return NextResponse.json({
      success: true,
      viewerName: link.viewer_name,
    });
  } catch (error) {
    console.error('Client auth error:', error);
    return NextResponse.json({ error: 'حدث خطأ غير متوقع في الخادم' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به' }, { status: 403 });
  }

  try {
    const { slug } = await req.json();
    if (slug && typeof slug === 'string') {
      await clearClientSession(slug);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Client logout error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء الخروج' }, { status: 500 });
  }
}
