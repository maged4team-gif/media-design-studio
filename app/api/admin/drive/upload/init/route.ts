import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import { dataService } from '@/lib/data/service';
import {
  isDriveConfigured,
  ensureArchiveRootFolder,
  ensureProjectFolder,
  deleteDriveFileOrFolder,
  initiateResumableUpload,
  createUploadSessionTicket,
} from '@/lib/drive/client';

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB limit
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

// In-process mutex map to deduplicate concurrent folder creation for the same project
const inFlightFolderPromises = new Map<string, Promise<string>>();

/**
 * Concurrency-safe resolution of project subfolder.
 * 1. Deduplicates concurrent requests in the same Node process via an in-memory Promise.
 * 2. Uses atomic Compare-And-Set (CAS) in Supabase/store to ensure only ONE candidate folder wins.
 * 3. Safely cleans up any redundant orphan folder created during the race.
 */
async function resolveProjectFolderAtomic(
  projectTitle: string,
  projectId: string,
  rootFolderId: string
): Promise<string> {
  const pending = inFlightFolderPromises.get(projectId);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      // Re-fetch project to ensure another concurrent request or process didn't just assign it
      const current = await dataService.getProjectById(projectId);
      if (current?.drive_folder_id && current.drive_folder_id.trim() !== '') {
        return current.drive_folder_id.trim();
      }

      // Create candidate folder in Google Drive
      const candidateFolderId = await ensureProjectFolder(projectTitle, projectId, rootFolderId);

      // Perform atomic Compare-And-Set in database
      const claimResult = await dataService.claimProjectDriveFolder(projectId, candidateFolderId);

      if (claimResult.claimed) {
        return candidateFolderId;
      }

      // Another concurrent request won the race! Use the winner's folder
      const officialFolderId = claimResult.folderId;

      // Safely delete the redundant candidate folder if it wasn't claimed
      if (candidateFolderId && candidateFolderId !== officialFolderId) {
        console.warn(`[Drive CAS] Cleaning up redundant candidate folder ${candidateFolderId} in favor of ${officialFolderId}`);
        deleteDriveFileOrFolder(candidateFolderId, { isFolder: true, safeRootFolderId: rootFolderId }).catch((err) => {
          console.warn('[Drive CAS] Redundant folder cleanup notice:', err?.message);
        });
      }

      return officialFolderId;
    } finally {
      inFlightFolderPromises.delete(projectId);
    }
  })();

  inFlightFolderPromises.set(projectId, promise);
  return promise;
}

export async function POST(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin || !adminToken) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  // Safe diagnostic logging (strictly Boolean, zero secret logging)
  console.log("Drive refresh token configured:", Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN));
  console.log("Drive root folder configured:", Boolean(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID));

  if (!(await isDriveConfigured())) {
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

    // 2. Concurrency-safe resolution of project subfolder
    let projectFolderId = project.drive_folder_id?.trim();
    if (!projectFolderId) {
      projectFolderId = await resolveProjectFolderAtomic(project.title, project.id, rootFolderId);
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
