import { NextResponse } from 'next/server';
import { dataService } from '@/lib/data/service';
import { setClientSession, clearClientSession } from '@/lib/auth/session';
import { checkRateLimit, recordRateLimitAttempt, resetRateLimit, getClientIp } from '@/lib/auth/rate-limit';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RATE_WINDOW_MS = 15 * 60 * 1000;
const PER_LINK_MAX_FAILURES = 10;

function rateLimitedResponse(retryAfterSeconds?: number) {
  return NextResponse.json(
    {
      error: `تم تجاوز الحد المسموح من المحاولات. يرجى المحاولة بعد ${retryAfterSeconds} ثانية.`,
    },
    { status: 429, headers: retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined }
  );
}

export async function POST(req: Request) {
  // 1. CSRF Origin Verification
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Origin Mismatch)' }, { status: 403 });
  }

  // 2. Client IP Rate Limiting (5 failed attempts per 15 minutes per IP)
  const ip = getClientIp(req, 'local_client');
  const rateLimitKey = `client_auth:${ip}`;
  const rateCheck = checkRateLimit(rateLimitKey, 5, RATE_WINDOW_MS);

  if (!rateCheck.allowed) {
    return rateLimitedResponse(rateCheck.retryAfterSeconds);
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

    // 3. Per-link cap across ALL IPs. Forwarded IP headers can be spoofed to dodge
    // the per-IP limit, so each link also gets a global failed-attempt budget.
    const slugRateLimitKey = `client_auth_slug:${slug}`;
    const slugRateCheck = checkRateLimit(slugRateLimitKey, PER_LINK_MAX_FAILURES, RATE_WINDOW_MS);
    if (!slugRateCheck.allowed) {
      return rateLimitedResponse(slugRateCheck.retryAfterSeconds);
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

      // Verify strictly against the bcrypt hash. No plain-text comparison paths.
      if (typeof link.password_hash === 'string' && /^\$2[aby]\$/.test(link.password_hash)) {
        try {
          isMatch = await bcrypt.compare(cleanPassword, link.password_hash);
        } catch {
          isMatch = false;
        }
      } else {
        console.error(
          `[Client Auth] Access link ${link.id} has a non-bcrypt password_hash; login refused. Reset the link password from the admin panel.`
        );
      }

      if (!isMatch) {
        recordRateLimitAttempt(rateLimitKey);
        recordRateLimitAttempt(slugRateLimitKey);
        return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 });
      }
    }

    // Reset rate limiters on successful authentication
    resetRateLimit(rateLimitKey);
    resetRateLimit(slugRateLimitKey);

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
