import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import { dataService } from '@/lib/data/service';
import { getFileMetadata } from '@/lib/drive/client';
import crypto from 'crypto';

export async function POST(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      fileId,
      projectId,
      title,
      mimeType,
      fileSize,
      durationSeconds,
      version,
      sortOrder,
    } = body;

    if (!fileId || !projectId || !title) {
      return NextResponse.json(
        { error: 'معطيات التسجيل غير مكتملة (fileId, projectId, title مطلوبة)' },
        { status: 400 }
      );
    }

    const project = await dataService.getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: 'المشروع المحدد غير موجود' }, { status: 404 });
    }

    // 1. Server-side Pre-registration Verification against Google Drive
    const metadata = await getFileMetadata(fileId);
    if (!metadata) {
      return NextResponse.json(
        { error: 'الملف غير موجود في Google Drive أو تعذر التحقق منه' },
        { status: 404 }
      );
    }

    if (metadata.trashed) {
      return NextResponse.json(
        { error: 'الملف محذوف في سلة محذوفات Google Drive ولا يمكن تسجيله' },
        { status: 400 }
      );
    }

    // Strictly enforce parent folder match: Reject if project folder ID is missing or parent does not match
    if (!project.drive_folder_id) {
      return NextResponse.json(
        { error: 'المشروع المحدد ليس له مجلد مخصص في Google Drive. تعذر إثبات صحة موضع الملف.' },
        { status: 400 }
      );
    }

    if (!metadata.parents || !metadata.parents.includes(project.drive_folder_id)) {
      return NextResponse.json(
        { error: 'مجلد الملف في Google Drive لا يتطابق مع مجلد المشروع المسجل' },
        { status: 400 }
      );
    }

    // 2. Global Idempotent check (including hidden and all-project assets)
    const existingByDriveId = await dataService.getAssetByDriveFileId(fileId);
    if (existingByDriveId) {
      return NextResponse.json({
        success: true,
        asset: existingByDriveId,
        idempotent: true,
      });
    }

    // 3. Extract reliable file size, mime, and file type from trusted Drive metadata
    const verifiedMime = metadata.mimeType || mimeType || 'application/octet-stream';
    const verifiedType = verifiedMime.startsWith('video/')
      ? 'video'
      : verifiedMime.startsWith('image/')
      ? 'image'
      : 'file';
    const verifiedSize = typeof metadata.size === 'number' ? metadata.size : (fileSize ? parseInt(fileSize, 10) : null);
    const verifiedFilename = metadata.name || title.trim();

    // 4. Generate asset UUID and register with real protected route /api/media/${assetId}
    const newAssetId = crypto.randomUUID();

    try {
      const asset = await dataService.createAsset({
        id: newAssetId,
        project_id: projectId,
        title: title.trim(),
        file_url: `/api/media/${newAssetId}`, // Valid protected route, never non-existent /api/media/drive/...
        file_type: verifiedType,
        mime_type: verifiedMime,
        file_size: verifiedSize,
        thumbnail_url: metadata.thumbnailLink || null,
        duration_seconds: metadata.durationSeconds ?? (durationSeconds ? parseInt(durationSeconds, 10) : null),
        version: version?.trim() || 'V1',
        sort_order: typeof sortOrder === 'number' ? sortOrder : 0,
        is_visible: true,
        original_filename: verifiedFilename,
        drive_file_id: fileId,
        drive_folder_id: project.drive_folder_id,
        source: 'drive',
      } as any);

      return NextResponse.json({
        success: true,
        asset,
        idempotent: false,
      });
    } catch (dbErr: any) {
      // In case of concurrent insert hitting unique constraint, recover idempotently
      if (dbErr?.message?.includes('23505') || dbErr?.message?.includes('unique_assets_drive_file_id')) {
        const concurrentAsset = await dataService.getAssetByDriveFileId(fileId);
        if (concurrentAsset) {
          return NextResponse.json({
            success: true,
            asset: concurrentAsset,
            idempotent: true,
          });
        }
      }

      // In case of genuine database failure:
      // PRESERVE the file in Google Drive (NEVER delete automatically). Return actionable error.
      console.error('DB registration failed after successful Drive upload:', dbErr);
      return NextResponse.json(
        {
          error: 'فشل تسجيل الأصل في قاعدة البيانات بعد اكتمال رفعه على Google Drive',
          fileId,
          recoverable: true,
          message: 'الملف محفوظ بأمان في Google Drive ويمكن إعادة محاولة تسجيله بمعرّف الملف.',
          details: dbErr?.message,
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error('Asset Drive registration fatal error:', err);
    return NextResponse.json(
      { error: err?.message || 'حدث خطأ أثناء فحص وتسجيل ملف Google Drive' },
      { status: 500 }
    );
  }
}
