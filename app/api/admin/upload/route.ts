import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { getServerSupabase } from '@/lib/supabase/server';
import { dataService, getDataMode } from '@/lib/data/service';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import { isDriveConfigured, ensureArchiveRootFolder, uploadBufferToDrive } from '@/lib/drive/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

  try {
    const contentType = req.headers.get('content-type') || '';
    let formData: FormData | null = null;
    if (contentType.includes('multipart/form-data')) {
      formData = await req.formData();
    }

    const projectId = formData?.get('projectId') as string | null;

    // 3. Block legacy direct asset uploads once Google Drive is configured.
    // Exception: Project cover images (projectId === 'covers') remain permitted so admins can set project covers.
    if (isDriveConfigured() && projectId !== 'covers') {
      return NextResponse.json(
        {
          error: 'Google Drive هو مخزن الملفات المعتمد حالياً. تم حظر مسار الرفع القديم لمنع تشتت الملفات.',
          code: 'DRIVE_STORAGE_ACTIVE',
        },
        { status: 409 }
      );
    }

    if (!formData) {
      return NextResponse.json({ error: 'لم يتم توفير أي ملف للرفع' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'لم يتم توفير أي ملف للرفع' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'الملف المرفوع فارغ (0 بايت)' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'حجم الملف يتجاوز الحد الأقصى المسموح به (500 ميغابايت)' },
        { status: 400 }
      );
    }

    // 3. Server-side extension and type validation
    const originalName = file.name || 'unnamed_file';
    const ext = originalName.split('.').pop()?.toLowerCase() || '';

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `امتداد الملف (.${ext}) غير مسموح به في منصة الاستوديو` },
        { status: 400 }
      );
    }

    // 4. Validate project existence if not 'covers'
    if (projectId && projectId !== 'covers') {
      const project = await dataService.getProjectById(projectId);
      if (!project) {
        return NextResponse.json({ error: 'المشروع المحدد غير موجود' }, { status: 404 });
      }
    }

    // 5. Generate secure unique storage path
    const sanitizedBase = originalName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_')
      .slice(0, 50);
    const uniqueKey = crypto.randomUUID();
    const storagePath = `projects/${projectId || 'common'}/${uniqueKey}_${sanitizedBase}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // 6. Tier 1: Upload to Google Drive if configured (primary studio storage)
    if (isDriveConfigured()) {
      try {
        const rootFolderId = await ensureArchiveRootFolder();
        const driveResult = await uploadBufferToDrive({
          filename: `cover_${sanitizedBase}_${uniqueKey}.${ext}`,
          mimeType: file.type || 'image/jpeg',
          parentFolderId: rootFolderId,
          buffer,
          makePublic: true,
        });

        return NextResponse.json({
          success: true,
          storagePath: driveResult.viewUrl,
          url: driveResult.viewUrl,
          previewUrl: driveResult.viewUrl,
          name: originalName,
          size: file.size,
          mimeType: file.type,
          driveFileId: driveResult.fileId,
        });
      } catch (driveErr: any) {
        console.warn('Google Drive direct upload failed, attempting storage fallback:', driveErr?.message || driveErr);
      }
    }

    // 7. Tier 2: Upload to Supabase Storage if configured and healthy
    if (getDataMode() === 'supabase') {
      try {
        const supabase = getServerSupabase();
        if (supabase) {
          const { error: uploadError } = await supabase.storage
            .from('media-studio-assets')
            .upload(storagePath, buffer, {
              contentType: file.type || 'application/octet-stream',
              upsert: false,
            });

          if (!uploadError) {
            const { data: signData } = await supabase.storage
              .from('media-studio-assets')
              .createSignedUrl(storagePath, 3600);

            return NextResponse.json({
              success: true,
              storagePath,
              url: storagePath, // Permanent internal reference
              previewUrl: signData?.signedUrl || `/api/admin/preview?path=${encodeURIComponent(storagePath)}`,
              name: originalName,
              size: file.size,
              mimeType: file.type,
            });
          }
          console.warn('Supabase storage upload error:', uploadError);
        }
      } catch (supaErr: any) {
        console.warn('Supabase storage upload exception:', supaErr?.message || supaErr);
      }
    }

    // 8. Tier 3: Resilient Base64 Data URL Fallback for images (<= 4MB)
    // Ensures admin never gets blocked from setting project covers even if cloud network is offline/paused
    const isImage = file.type?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
    if (isImage && file.size <= 4 * 1024 * 1024) {
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${file.type || 'image/jpeg'};base64,${base64}`;
      return NextResponse.json({
        success: true,
        storagePath: dataUrl,
        url: dataUrl,
        previewUrl: dataUrl,
        name: originalName,
        size: file.size,
        mimeType: file.type,
        fallback: true,
      });
    }

    // 9. Tier 4: Explicit Local Demo Storage (Strictly non-production dev fallback)
    if (process.env.NODE_ENV !== 'production') {
      const localUploadsDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(localUploadsDir)) {
        fs.mkdirSync(localUploadsDir, { recursive: true });
      }

      const localFileName = `${uniqueKey}_${sanitizedBase}.${ext}`;
      const filePath = path.join(localUploadsDir, localFileName);
      fs.writeFileSync(filePath, buffer);

      const publicUrl = `/uploads/${localFileName}`;

      return NextResponse.json({
        success: true,
        storagePath: null,
        url: publicUrl,
        previewUrl: publicUrl,
        name: originalName,
        size: file.size,
        mimeType: file.type,
      });
    }

    return NextResponse.json(
      { error: 'تعذر رفع الملف إلى أي وجهة تخزين سحابية متاحة' },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('File upload fatal error:', error);
    return NextResponse.json(
      { error: error?.message || 'تعذر معالجة الملف على الخادم' },
      { status: 500 }
    );
  }
}
