import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import { dataService } from '@/lib/data/service';
import {
  isDriveConfigured,
  ensureArchiveRootFolder,
  ensureProjectFolder,
  initiateResumableUpload,
  createUploadSessionTicket,
} from '@/lib/drive/client';

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB limit
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

export async function POST(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin || !adminToken) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  if (!isDriveConfigured()) {
    return NextResponse.json(
      { error: 'حساب Google Drive غير مربوط بعد. يرجى ربط الحساب أولاً عبر لوحة الإدارة.' },
      { status: 503 }
    );
  }

  try {
    const { filename, mimeType, projectId, fileSize } = await req.json();

    if (!filename || !mimeType || !projectId) {
      return NextResponse.json({ error: 'معطيات الرفع غير مكتملة (filename, mimeType, projectId مطلوبة)' }, { status: 400 });
    }

    const parsedSize = parseInt(fileSize, 10);
    if (isNaN(parsedSize) || parsedSize <= 0) {
      return NextResponse.json({ error: 'حجم الملف غير صالح أو مفقود' }, { status: 400 });
    }

    if (parsedSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'حجم الملف يتجاوز الحد الأقصى المسموح به (500 ميغابايت)' },
        { status: 400 }
      );
    }

    const project = await dataService.getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: 'المشروع المحدد غير موجود' }, { status: 404 });
    }

    // 1. Ensure root studio archive folder exists
    const rootFolderId = await ensureArchiveRootFolder();

    // 2. Ensure project subfolder exists inside root archive
    let projectFolderId = project.drive_folder_id;
    if (!projectFolderId) {
      projectFolderId = await ensureProjectFolder(project.title, project.id, rootFolderId);
      await dataService.updateProject(project.id, { drive_folder_id: projectFolderId });
    }

    // 3. Initiate resumable upload with Google Drive API
    const sessionUrl = await initiateResumableUpload({
      filename,
      mimeType,
      parentFolderId: projectFolderId,
      fileSize: parsedSize,
    });

    // 4. Create cryptographically signed ticket bound to admin session & project
    const uploadToken = createUploadSessionTicket({
      projectId: project.id,
      filename,
      fileSize: parsedSize,
      mimeType,
      sessionUrl,
      adminSessionToken: adminToken,
      projectFolderId,
    });

    return NextResponse.json({
      success: true,
      uploadToken,
      filename,
      fileSize: parsedSize,
      chunkSize: DEFAULT_CHUNK_SIZE,
      projectFolderId,
    });
  } catch (err: any) {
    console.error('Drive upload init error:', err?.message);
    return NextResponse.json(
      { error: err?.message || 'فشل بدء جلسة الرفع على Google Drive' },
      { status: 500 }
    );
  }
}
