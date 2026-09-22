import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { dataService, isStoragePathReferenced } from '@/lib/data/service';
import { getAssetType } from '@/lib/utils/formatters';
import { getServerSupabase } from '@/lib/supabase/server';
import { verifyRequestOrigin } from '@/lib/auth/csrf';

export async function POST(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const body = await req.json();
  const {
    projectId,
    title,
    fileUrl,
    thumbnailUrl,
    mimeType,
    fileSize,
    durationSeconds,
    version,
    originalFilename,
    storagePath,
  } = body;

  if (!projectId || !fileUrl) {
    return NextResponse.json({ error: 'معرف المشروع ورابط الملف مطلوبان' }, { status: 400 });
  }

  if (fileSize !== undefined && (typeof fileSize !== 'number' || Number.isNaN(fileSize) || fileSize <= 0)) {
    return NextResponse.json({ error: 'حجم الملف يجب أن يكون رقماً موجباً بالبايت' }, { status: 400 });
  }

  // Pre-registration storage object verification
  if (storagePath && typeof storagePath === 'string') {
    if (
      !storagePath.startsWith(`projects/${projectId}/`) ||
      storagePath.includes('..') ||
      storagePath.includes('\\')
    ) {
      return NextResponse.json({ error: 'مسار التخزين غير صالح أو محظور أمنياً' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    if (supabase) {
      const lastSlash = storagePath.lastIndexOf('/');
      const folder = storagePath.substring(0, lastSlash);
      const filename = storagePath.substring(lastSlash + 1);

      const { data: files, error: listErr } = await supabase.storage
        .from('media-studio-assets')
        .list(folder, { search: filename });

      if (listErr || !files || files.length === 0) {
        return NextResponse.json({ error: 'الملف المرفوع غير موجود في مستودع التخزين السحابي' }, { status: 400 });
      }

      const match = files.find((f) => f.name === filename);
      if (match?.metadata?.size && match.metadata.size > 524288000) {
        // Exceeds 500 MB hard limit: remove immediately and abort
        await supabase.storage.from('media-studio-assets').remove([storagePath]);
        return NextResponse.json({ error: 'حجم الملف الفعلي يتجاوز الحد الأقصى المسموح به (500 ميغابايت)' }, { status: 400 });
      }
    }
  }

  const fileType = getAssetType(mimeType, originalFilename || title);

  try {
    const asset = await dataService.createAsset({
      project_id: projectId,
      title: title || originalFilename || 'ملف وسائط جديد',
      file_url: fileUrl,
      thumbnail_url: thumbnailUrl || null,
      file_type: fileType,
      mime_type: mimeType || null,
      file_size: fileSize || null,
      duration_seconds: durationSeconds || null,
      version: version || 'V1',
      is_visible: true,
      original_filename: originalFilename || null,
      storage_path: storagePath || null,
    });

    return NextResponse.json({ success: true, asset });
  } catch (error: any) {
    console.error('Create asset DB error:', error);

    // Orphan Cleanup: If DB record creation failed and a newly uploaded file exists, clean it up safely
    if (
      storagePath &&
      typeof storagePath === 'string' &&
      storagePath.startsWith(`projects/${projectId}/`) &&
      !storagePath.includes('..') &&
      !storagePath.includes('\\')
    ) {
      try {
        const refCheck = await isStoragePathReferenced(storagePath);
        if (!refCheck.referenced) {
          const supabase = getServerSupabase();
          if (supabase) {
            const { error: removeErr } = await supabase.storage
              .from('media-studio-assets')
              .remove([storagePath]);

            if (removeErr) {
              console.error('Storage orphan removal failed:', removeErr);
              await supabase.from('pending_storage_cleanups').upsert([
                {
                  storage_path: storagePath,
                  bucket_id: 'media-studio-assets',
                  reason: 'orphan_cleanup_failure',
                  last_error: removeErr.message,
                  attempts: 1,
                  updated_at: new Date().toISOString(),
                }
              ], { onConflict: 'bucket_id,storage_path' });
            }
          }
        }
      } catch (cleanErr) {
        console.error('Failed to verify or cleanup orphan storage file (aborted):', cleanErr);
      }
    }

    return NextResponse.json({ error: 'تعذر تسجيل الملف في قاعدة البيانات' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  try {
    const { orderedIds } = await req.json();
    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'قائمة المعرفات غير صالحة' }, { status: 400 });
    }

    await dataService.reorderAssets(orderedIds);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Reorder assets error:', error);
    return NextResponse.json({ error: 'تعذر إعادة ترتيب الملفات' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  try {
    const { storagePath, projectId } = await req.json();

    if (!storagePath || !projectId) {
      return NextResponse.json({ error: 'مسار التخزين ومعرف المشروع مطلوبان' }, { status: 400 });
    }

    // Path sanitization defense:
    if (
      typeof storagePath !== 'string' ||
      !storagePath.startsWith(`projects/${projectId}/`) ||
      storagePath.includes('..') ||
      storagePath.includes('\\')
    ) {
      return NextResponse.json({ error: 'مسار غير صالح أو محاولة وصول غير مصرح بها' }, { status: 400 });
    }

    // Deep reference verification across assets (file and thumbnail) and projects (covers)
    try {
      const refCheck = await isStoragePathReferenced(storagePath);
      if (refCheck.referenced) {
        return NextResponse.json(
          { error: `لا يمكن حذف مسار تخزين مستخدم في أصل مسجل أو مصغر أو غلاف مشروع (${refCheck.reason})` },
          { status: 400 }
        );
      }
    } catch (checkErr: any) {
      console.error('Storage path reference check failed, aborting deletion:', checkErr);
      return NextResponse.json(
        { error: 'فشل التحقق من ارتباطات الملف في قاعدة البيانات، تم إلغاء الحذف حمايةً للبيانات' },
        { status: 500 }
      );
    }

    const supabase = getServerSupabase();
    if (supabase) {
      const { error: removeErr } = await supabase.storage
        .from('media-studio-assets')
        .remove([storagePath]);

      if (removeErr) {
        await supabase.from('pending_storage_cleanups').upsert([
          {
            storage_path: storagePath,
            bucket_id: 'media-studio-assets',
            reason: 'manual_orphan_cleanup_failure',
            last_error: removeErr.message,
            attempts: 1,
            updated_at: new Date().toISOString(),
          }
        ], { onConflict: 'bucket_id,storage_path' });

        return NextResponse.json({ error: 'فشل حذف الملف من التخزين وتمت جدولته للتنظيف' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete storage path error:', err);
    return NextResponse.json({ error: 'حدث خطأ أثناء معالجة الحذف' }, { status: 500 });
  }
}
