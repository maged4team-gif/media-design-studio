import { NextResponse } from 'next/server';
import { dataService } from '@/lib/data/service';
import { authorizeClientAsset } from '@/lib/auth/authorize';
import { extractCookieFromRequest } from '@/lib/auth/session';
import { verifyRequestOrigin } from '@/lib/auth/csrf';

export async function POST(req: Request) {
  // 1. CSRF Verification
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  try {
    const { assetId, slug, body, timestampSeconds } = await req.json();

    if (!assetId || !slug || !body || typeof body !== 'string' || !body.trim()) {
      return NextResponse.json({ error: 'بيانات الملاحظة غير مكتملة' }, { status: 400 });
    }

    // 2. Strict Unified Server-Side Authorization Check:
    // - Validates session & session_version
    // - Checks access link is enabled
    // - Verifies asset exists and is visible
    // - Verifies asset's project is assigned to this client, visible, and not archived
    const token = extractCookieFromRequest(req, `client_session_${slug}`);
    const auth = await authorizeClientAsset(slug, assetId, token);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // 2b. Disallow comments if project is configured in showcase mode (allow_feedback === false)
    if (auth.data.project.allow_feedback === false) {
      return NextResponse.json(
        { error: 'المشروع مضبوط في وضع العرض فقط ولا يقبل الملاحظات' },
        { status: 403 }
      );
    }

    // 3. Add comment attributed strictly to authorized viewer identity
    const comment = await dataService.addComment(
      assetId,
      auth.link.id,
      auth.link.viewer_name, // Trusted server-side viewer name
      body.trim(),
      typeof timestampSeconds === 'number' && timestampSeconds >= 0 ? timestampSeconds : null
    );

    return NextResponse.json({ success: true, comment });
  } catch (error: any) {
    console.error('Comment submission error:', error);
    return NextResponse.json(
      { error: error?.message || 'تعذر حفظ الملاحظة على الخادم' },
      { status: 500 }
    );
  }
}
