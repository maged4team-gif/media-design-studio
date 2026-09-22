'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, AlertCircle, RefreshCw, CheckCircle2, X } from 'lucide-react';
import { Asset } from '@/lib/supabase/database.types';

interface MediaUploaderProps {
  projectId: string;
  onUploadSuccess: (newAsset: Asset) => void;
}

interface PendingRegistration {
  fileId: string;
  title: string;
  fileName: string;
}

interface ResumeStatusResult {
  ok: boolean;
  complete: boolean;
  nextByteOffset: number;
  fileId: string | null;
}

const CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB bounded chunks (strictly fits within Vercel 4.5MB Serverless limit & Google Drive 256KB alignment)

export const MediaUploader: React.FC<MediaUploaderProps> = ({ projectId, onUploadSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingRegistrations, setPendingRegistrations] = useState<Record<string, PendingRegistration>>({});
  const [retryingIds, setRetryingIds] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const STORAGE_KEY = `media_studio_pending_regs_${projectId}`;

  // Restore pending registrations across page refreshes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          setPendingRegistrations(parsed);
        }
      }
    } catch {}
  }, [STORAGE_KEY]);

  const addPendingRegistration = (item: PendingRegistration) => {
    setPendingRegistrations((prev) => {
      const next = { ...prev, [item.fileId]: item };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const removePendingRegistration = (fileId: string) => {
    setPendingRegistrations((prev) => {
      const next = { ...prev };
      delete next[fileId];
      try {
        if (Object.keys(next).length === 0) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  };

  /**
   * Queries Google Drive for the confirmed received byte offset and completion state.
   * Clearly distinguishes query failure (ok: false) from zero bytes received (ok: true, nextByteOffset: 0).
   */
  const queryResumeStatus = async (uploadToken: string): Promise<ResumeStatusResult> => {
    try {
      const res = await fetch('/api/admin/drive/upload/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadToken }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          ok: true,
          complete: Boolean(data.complete),
          nextByteOffset: typeof data.nextByteOffset === 'number' ? data.nextByteOffset : 0,
          fileId: data.fileId || null,
        };
      }
    } catch (e) {
      console.warn('Could not query upload resume status:', e);
    }
    return { ok: false, complete: false, nextByteOffset: 0, fileId: null };
  };

  /**
   * Registers uploaded Drive file into database
   */
  const registerDriveAsset = async (fileId: string, title: string): Promise<Asset> => {
    const regRes = await fetch('/api/admin/drive/upload/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId,
        projectId,
        title,
      }),
    });

    const regData = await regRes.json();
    if (!regRes.ok || !regData.asset) {
      throw new Error(regData.error || 'فشل تسجيل الملف في قاعدة البيانات');
    }

    return regData.asset;
  };

  /**
   * Retries registration for an already uploaded Drive file
   */
  const handleRetryRegistration = async (fileId: string) => {
    const item = pendingRegistrations[fileId];
    if (!item || retryingIds[fileId]) return;

    setRetryingIds((prev) => ({ ...prev, [fileId]: true }));
    setErrorMessage('');
    try {
      const asset = await registerDriveAsset(item.fileId, item.title);
      removePendingRegistration(fileId);
      onUploadSuccess(asset);
      setStatusText(`تم تسجيل ملف "${item.fileName}" بنجاح!`);
      setTimeout(() => setStatusText(''), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'تعذر إعادة التسجيل. يرجى المحاولة مرة أخرى.');
    } finally {
      setRetryingIds((prev) => ({ ...prev, [fileId]: false }));
    }
  };

  const handleRetryAllRegistrations = async () => {
    const items = Object.values(pendingRegistrations);
    for (const item of items) {
      await handleRetryRegistration(item.fileId);
    }
  };

  /**
   * Performs the complete Drive upload pipeline for a single file:
   * 1. init (issue HMAC uploadToken)
   * 2. chunk upload loop with noProgressCount kept outside slice recalculation
   * 3. register (record in DB with decoupled retry support and multi-file preservation)
   */
  const uploadSingleFileToDrive = async (file: File): Promise<Asset> => {
    // 1. Initialize upload session and obtain secure HMAC ticket
    setStatusText(`تهيئة جلسة الرفع لملف ${file.name}...`);
    const initRes = await fetch('/api/admin/drive/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        projectId,
      }),
    });

    const initData = await initRes.json();
    if (!initRes.ok || !initData.uploadToken) {
      throw new Error(initData.error || 'فشل بدء جلسة الرفع على Google Drive');
    }

    const { uploadToken, fileSize } = initData;
    const totalSize = fileSize || file.size;
    let offset = 0;
    let driveFileId: string | null = null;

    // No-progress counter kept strictly OUTSIDE the chunk recalculation loop
    let lastConfirmedOffset = 0;
    let noProgressCount = 0;
    const MAX_NO_PROGRESS_ATTEMPTS = 5;

    // 2. Chunk upload loop with byte progress & interruption resumption
    while (offset < totalSize && !driveFileId) {
      // ALWAYS recalculate chunk bounds, slice, and Content-Range from current confirmed offset
      const nextEnd = Math.min(offset + CHUNK_SIZE_BYTES, totalSize);
      const chunkSlice = file.slice(offset, nextEnd);
      const contentRange = `bytes ${offset}-${nextEnd - 1}/${totalSize}`;

      try {
        const chunkRes = await fetch('/api/admin/drive/upload/chunk', {
          method: 'PUT',
          headers: {
            'x-upload-token': uploadToken,
            'content-range': contentRange,
            'Content-Type': 'application/octet-stream',
          },
          body: chunkSlice,
        });

        if (chunkRes.ok || chunkRes.status === 308) {
          const chunkData = await chunkRes.json().catch(() => ({}));
          if (chunkData.complete && chunkData.fileId) {
            driveFileId = chunkData.fileId;
            offset = totalSize;
            break;
          }

          // Drive returned 308: read confirmed nextByteOffset from Drive's response
          const confirmedOffset = typeof chunkData.nextByteOffset === 'number'
            ? chunkData.nextByteOffset
            : nextEnd;

          if (confirmedOffset > lastConfirmedOffset) {
            // Actual progress made!
            offset = confirmedOffset;
            lastConfirmedOffset = offset;
            noProgressCount = 0; // Reset counter strictly when progress was made
          } else {
            // Repeated 308 without progress!
            noProgressCount++;
            offset = confirmedOffset;
            console.warn(`Drive returned 308 without progress (${noProgressCount}/${MAX_NO_PROGRESS_ATTEMPTS}). Offset: ${offset}`);

            if (noProgressCount >= MAX_NO_PROGRESS_ATTEMPTS) {
              throw new Error(`توقف الرفع بعد ${MAX_NO_PROGRESS_ATTEMPTS} استجابات متتالية دون تقدم في استلام البيانات من Google Drive (الموضع: ${offset} من ${totalSize}). يمكنك إعادة المحاولة.`);
            }

            // Exponential backoff before next attempt
            await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, noProgressCount - 1), 8000)));
          }

          const percent = Math.round((offset / totalSize) * 100);
          setProgress(percent);
          setStatusText(`جارٍ رفع ${file.name} (${percent}%)...`);
        } else {
          const errData = await chunkRes.json().catch(() => ({}));
          throw new Error(errData.error || `خطأ خادم الرفع (رمز: ${chunkRes.status})`);
        }
      } catch (err: any) {
        // If abort threshold was reached, propagate immediately
        if (err?.message?.includes('توقف الرفع بعد')) {
          throw err;
        }

        console.warn('Chunk attempt failed, querying Drive status:', err?.message);

        // Query Google Drive for actual confirmed byte offset
        const statusResult = await queryResumeStatus(uploadToken);
        if (statusResult.ok) {
          if (statusResult.complete && statusResult.fileId) {
            // Final chunk had reached Drive and session completed
            driveFileId = statusResult.fileId;
            offset = totalSize;
            break;
          }

          if (statusResult.nextByteOffset > lastConfirmedOffset) {
            // Forward progress confirmed by Drive!
            offset = statusResult.nextByteOffset;
            lastConfirmedOffset = offset;
            noProgressCount = 0;
            console.log(`Confirmed Drive offset advanced to: ${offset}`);
          } else {
            // Status succeeded with the SAME (or zero) offset -> no progress!
            noProgressCount++;
            offset = statusResult.nextByteOffset;
            console.warn(`Drive status confirmed same offset (${noProgressCount}/${MAX_NO_PROGRESS_ATTEMPTS}): ${offset}`);

            if (noProgressCount >= MAX_NO_PROGRESS_ATTEMPTS) {
              throw new Error(`توقف الرفع بعد ${MAX_NO_PROGRESS_ATTEMPTS} محاولات متتالية دون تقدم في استلام البيانات من Google Drive (الموضع: ${offset} من ${totalSize}). يمكنك إعادة المحاولة.`);
            }

            // Exponential backoff delay
            await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, noProgressCount - 1), 8000)));
          }
        } else {
          // Status query itself failed
          noProgressCount++;
          if (noProgressCount >= MAX_NO_PROGRESS_ATTEMPTS) {
            throw new Error(`تعذر الاتصال بـ Google Drive وتكرر فشل الاستعلام (${noProgressCount} مرات). يمكنك إعادة المحاولة.`);
          }
          await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, noProgressCount - 1), 8000)));
        }
      }
    }

    if (!driveFileId) {
      // Query one last time to ensure fileId is retrieved if completed
      const statusResult = await queryResumeStatus(uploadToken);
      if (statusResult.ok && statusResult.fileId) {
        driveFileId = statusResult.fileId;
      }
    }

    if (!driveFileId) {
      throw new Error('اكتمل نقل الملف لكن تعذر الحصول على معرّف الملف من Google Drive.');
    }

    // 3. Register asset in database (with decoupled retry safety)
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
    setStatusText(`اكتمل الرفع، جارٍ تسجيل "${file.name}" في قاعدة البيانات...`);

    try {
      const asset = await registerDriveAsset(driveFileId, cleanTitle);
      removePendingRegistration(driveFileId);
      return asset;
    } catch (regErr: any) {
      // Save this file into pending registrations without touching any other pending files
      addPendingRegistration({
        fileId: driveFileId,
        title: cleanTitle,
        fileName: file.name,
      });
      throw new Error(`تم حفظ الملف في Google Drive بنجاح، لكن تعذر قيده في قاعدة البيانات: ${regErr.message}`);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0 || uploading) return;

    setUploading(true);
    setErrorMessage('');
    // Notice: pendingRegistration is preserved across new file selections and page reloads

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileName(file.name);
        setProgress(0);
        setStatusText(`بدء معالجة ${file.name}...`);

        const newAsset = await uploadSingleFileToDrive(file);
        onUploadSuccess(newAsset);
      }

      setStatusText('تم رفع وتسجيل جميع الملفات بنجاح!');
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setCurrentFileName('');
        setStatusText('');
      }, 1500);
    } catch (err: any) {
      console.error('Upload flow error:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء معالجة الرفع');
      setUploading(false);
      setProgress(0);
      setStatusText('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="w-full">
      {/* Standalone Persistent Pending Registration Banner */}
      {Object.values(pendingRegistrations).length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-400" />
              <span className="font-semibold">
                ملفات محفوظة في Google Drive وبانتظار قيدها في قاعدة البيانات ({Object.keys(pendingRegistrations).length}):
              </span>
            </div>
            {Object.keys(pendingRegistrations).length > 1 && (
              <button
                type="button"
                onClick={handleRetryAllRegistrations}
                disabled={Object.values(retryingIds).some(Boolean)}
                className="flex items-center gap-1.5 rounded-lg bg-studio-blue px-2.5 py-1 text-xs font-bold text-white hover:bg-studio-blue/90 disabled:opacity-50 transition"
              >
                <RefreshCw className={`h-3 w-3 ${Object.values(retryingIds).some(Boolean) ? 'animate-spin' : ''}`} />
                إعادة محاولة قيد الكل
              </button>
            )}
          </div>
          <div className="space-y-2 mt-2 divide-y divide-amber-500/20 pt-1">
            {Object.values(pendingRegistrations).map((item) => {
              const isRetryingThis = Boolean(retryingIds[item.fileId]);
              return (
                <div key={item.fileId} className="flex items-center justify-between gap-2 pt-2">
                  <span className="truncate max-w-[260px] font-medium text-amber-100">
                    &quot;{item.fileName}&quot;
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRetryRegistration(item.fileId)}
                      disabled={isRetryingThis}
                      className="flex items-center gap-1.5 rounded-lg bg-studio-blue px-2.5 py-1 text-xs font-bold text-white hover:bg-studio-blue/90 disabled:opacity-50 transition"
                    >
                      <RefreshCw className={`h-3 w-3 ${isRetryingThis ? 'animate-spin' : ''}`} />
                      {isRetryingThis ? 'جارٍ القيد...' : 'إعادة القيد'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removePendingRegistration(item.fileId)}
                      disabled={isRetryingThis}
                      title="تجاهل"
                      className="rounded-lg p-1 text-amber-400/60 hover:text-amber-300 hover:bg-amber-400/10 transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        </div>
      )}

      {statusText && !uploading && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{statusText}</span>
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
          uploading
            ? 'border-studio-blue/40 bg-studio-surface cursor-wait'
            : isDragging
            ? 'border-studio-blue bg-studio-blue/10 scale-[1.01] cursor-copy'
            : 'border-white/15 bg-studio-surface hover:border-studio-blue/50 hover:bg-studio-card cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.pdf,.zip,.rar,.ai,.psd,.aep,.c4d"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          disabled={uploading}
          className="hidden"
        />

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-studio-blue/15 text-studio-blue-glow border border-studio-blue/30 shadow-md group-hover:scale-110 transition">
          <Upload className="h-7 w-7" />
        </div>

        <h3 className="mt-4 text-sm font-bold text-white">
          إضافة ملفات (اسحب الملفات هنا أو انقر للاختيار)
        </h3>
        <p className="mt-1 text-xs text-studio-text-secondary max-w-md">
          تُحفظ الملفات بأمان في Google Drive داخل مجلد المشروع. الحجم الأقصى المسموح به 500 ميغابايت لكل ملف.
        </p>

        {uploading && (
          <div className="mt-6 w-full max-w-md bg-studio-card/80 p-4 rounded-xl border border-white/10">
            <div className="flex items-center justify-between text-xs text-studio-text-secondary mb-1.5">
              <span className="truncate max-w-[280px] font-medium text-white">{statusText || currentFileName}</span>
              <span className="font-mono text-studio-gold font-bold">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-studio-blue via-sky-400 to-studio-gold transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
