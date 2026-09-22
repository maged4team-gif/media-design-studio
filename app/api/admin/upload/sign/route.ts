import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { getServerSupabase } from '@/lib/supabase/server';
import { dataService, getDataMode } from '@/lib/data/service';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import { isDriveConfigured } from '@/lib/drive/client';
import crypto from 'crypto';

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB limit

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp',
  'mp4', 'mov', 'm4v', 'webm',
  'pdf', 'zip', 'rar',
  'ai', 'psd', 'aep', 'c4d'
]);

export async function POST(req: Request) {
  // 1. Verify CSRF Origin
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  // 2. Verify Admin Session
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  // Block new uploads to legacy Supabase Storage once Google Drive is active
  if (isDriveConfigured()) {
    return NextResponse.json(
      { error: 'تم تفعيل Google Drive كمخزن وسائط أساسي. تم حظر الرفع الجديد إلى Supabase Storage.' },
      { status: 409 }
    );
  }

  try {
    const { filename, fileSize, projectId } = await req.json();

    if (!filename || !projectId) {
      return NextResponse.json({ error: 'بيانات الملف والمشروع مطلوبة' }, { status: 400 });
    }

    if (typeof fileSize !== 'number' || Number.isNaN(fileSize) || fileSize <= 0) {
      return NextResponse.json(
        { error: 'حجم الملف مطلوب ويجب أن يكون رقماً موجباً بالبايت' },
        { status: 400 }
      );
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'حجم الملف يتجاوز الحد الأقصى المسموح به (500 ميغابايت)' },
        { status: 400 }
      );
    }

    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `امتداد الملف (.${ext}) غير مسموح به في منصة الاستوديو` },
        { status: 400 }
      );
    }

    if (projectId !== 'covers') {
      const project = await dataService.getProjectById(projectId);
      if (!project) {
        return NextResponse.json({ error: 'المشروع المحدد غير موجود' }, { status: 404 });
      }
    }

    const sanitizedBase = filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_')
      .slice(0, 50);
    const uniqueKey = crypto.randomUUID();
    const storagePath = `projects/${projectId}/${uniqueKey}_${sanitizedBase}.${ext}`;

    if (getDataMode() === 'supabase') {
      const supabase = getServerSupabase();
      if (!supabase) {
        return NextResponse.json({ error: 'خدمة التخزين السحابي غير متاحة' }, { status: 500 });
      }

      const { data, error } = await supabase.storage
        .from('media-studio-assets')
        .createSignedUploadUrl(storagePath);

      if (error || !data) {
        console.error('Failed to create signed upload URL:', error);
        return NextResponse.json(
          { error: 'فشل إنشاء رابط رفع مباشر مصرح به من التخزين السحابي' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        directUpload: true,
        signedUrl: data.signedUrl,
        token: data.token,
        storagePath,
        originalFilename: filename,
      });
    }

    // Explicit fallback for Local Demo Mode
    return NextResponse.json({
      directUpload: false,
      storagePath: null,
      originalFilename: filename,
    });
  } catch (err: any) {
    console.error('Sign upload fatal error:', err);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء إعداد رابط الرفع المباشر' },
      { status: 500 }
    );
  }
}
