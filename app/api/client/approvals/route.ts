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
    const { assetId, slug, approved } = await req.json();

    if (!assetId || !slug || typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'بيانات الاعتماد غير مكتملة' }, { status: 400 });
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

    // 2b. Disallow approvals if project is configured in showcase mode (allow_feedback === false)
    if (auth.data.project.allow_feedback === false) {
      return NextResponse.json(
        { error: 'المشروع مضبوط في وضع العرض فقط ولا يقبل الاعتماد' },
        { status: 403 }
      );
    }

    // 3. Toggle approval bound strictly to client access link ID
    const approval = await dataService.toggleApproval(
      assetId,
      auth.link.id,
      auth.link.viewer_name,
      approved
    );

    return NextResponse.json({ success: true, approval });
  } catch (error: any) {
    console.error('Approval toggle error:', error);
    return NextResponse.json(
      { error: error?.message || 'تعذر تعديل حالة الاعتماد على الخادم' },
      { status: 500 }
    );
  }
}
