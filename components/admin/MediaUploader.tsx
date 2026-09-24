'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
  Pause,
  Play,
  Film,
  Image as ImageIcon,
  Music,
  FileText,
  File as FileIcon,
  Clock,
  RotateCcw,
  Eye,
  EyeOff,
  Layers,
} from 'lucide-react';
import { Asset } from '@/lib/supabase/database.types';
import {
  QueueItem,
  QueueSummary,
  RestoredSessionMetadata,
  QUEUE_STATUS_LABELS,
  QUEUE_STATUS_COLORS,
  MAX_CONCURRENT_UPLOADS,
  MAX_FILE_SIZE_BYTES,
  CHUNK_SIZE_BYTES,
  formatBytes,
  formatSpeed,
  formatEta,
  calculateMovingAverageSpeed,
  calculateEtaSeconds,
  isTransientHttpError,
  isAuthOrPermissionError,
  computeQueueSummary,
  matchRestoredFile,
  getFileCategory,
} from '@/lib/drive/upload-queue';

interface MediaUploaderProps {
  projectId: string;
  onUploadSuccess: (newAsset: Asset) => void;
}

interface PendingRegistration {
  fileId: string;
  title: string;
  fileName: string;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({ projectId, onUploadSuccess }) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);

  // Persistent pending DB registrations (for files safely in Drive whose DB insert failed)
  const [pendingRegistrations, setPendingRegistrations] = useState<Record<string, PendingRegistration>>({});
  const [retryingRegIds, setRetryingRegIds] = useState<Record<string, boolean>>({});

  // Session persistence across page reloads
  const [restoredSessions, setRestoredSessions] = useState<RestoredSessionMetadata[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const PENDING_REG_KEY = `media_studio_pending_regs_${projectId}`;
  const RELOAD_QUEUE_KEY = `media_studio_reload_queue_${projectId}`;

  // -------------------------------------------------------------
  // 1. Initial State Restoration & Navigation Guard
  // -------------------------------------------------------------
  useEffect(() => {
    // Restore pending DB registrations
    try {
      const savedRegs = localStorage.getItem(PENDING_REG_KEY);
      if (savedRegs) {
        const parsed = JSON.parse(savedRegs);
        if (parsed && typeof parsed === 'object') {
          setPendingRegistrations(parsed);
        }
      }
    } catch {}

    // Restore unfinished upload session metadata from prior reload
    try {
      const savedReloads = localStorage.getItem(RELOAD_QUEUE_KEY);
      if (savedReloads) {
        const parsed = JSON.parse(savedReloads);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRestoredSessions(parsed);
        }
      }
    } catch {}
  }, [PENDING_REG_KEY, RELOAD_QUEUE_KEY]);

  // Save unfinished upload sessions into localStorage so user can resume after reload
  useEffect(() => {
    const unfinished = queue
      .filter((q) => ['uploading', 'preparing', 'paused', 'verifying', 'registering'].includes(q.status) && q.uploadToken)
      .map((q): RestoredSessionMetadata => ({
        id: q.id,
        name: q.name,
        size: q.size,
        type: q.type,
        lastModified: q.lastModified,
        uploadToken: q.uploadToken!,
        uploadedBytes: q.uploadedBytes,
        driveFileId: q.driveFileId,
        savedAt: Date.now(),
      }));

    try {
      if (unfinished.length > 0) {
        localStorage.setItem(RELOAD_QUEUE_KEY, JSON.stringify(unfinished));
      } else if (restoredSessions.length === 0) {
        localStorage.removeItem(RELOAD_QUEUE_KEY);
      }
    } catch {}
  }, [queue, RELOAD_QUEUE_KEY, restoredSessions.length]);

  // Window beforeunload warning when uploads are in progress
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const isBusy = queueRef.current.some((q) =>
        ['uploading', 'preparing', 'verifying', 'registering'].includes(q.status)
      );
      if (isBusy) {
        e.preventDefault();
        e.returnValue = 'يوجد رفع ملفات جارٍ. مغادرة الصفحة قد توقف الرفع.';
        return 'يوجد رفع ملفات جارٍ. مغادرة الصفحة قد توقف الرفع.';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // -------------------------------------------------------------
  // 2. Pending Registration Helpers
  // -------------------------------------------------------------
  const addPendingRegistration = useCallback((item: PendingRegistration) => {
    setPendingRegistrations((prev) => {
      const next = { ...prev, [item.fileId]: item };
      try {
        localStorage.setItem(PENDING_REG_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [PENDING_REG_KEY]);

  const removePendingRegistration = useCallback((fileId: string) => {
    setPendingRegistrations((prev) => {
      const next = { ...prev };
      delete next[fileId];
      try {
        if (Object.keys(next).length === 0) {
          localStorage.removeItem(PENDING_REG_KEY);
        } else {
          localStorage.setItem(PENDING_REG_KEY, JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  }, [PENDING_REG_KEY]);

  const registerDriveAsset = useCallback(
    async (fileId: string, title: string): Promise<Asset> => {
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
    },
    [projectId]
  );

  const handleRetryRegistration = async (fileId: string) => {
    const item = pendingRegistrations[fileId];
    if (!item || retryingRegIds[fileId]) return;

    setRetryingRegIds((prev) => ({ ...prev, [fileId]: true }));
    try {
      const asset = await registerDriveAsset(item.fileId, item.title);
      removePendingRegistration(fileId);
      onUploadSuccess(asset);
      setNotification({ message: `تم تسجيل ملف "${item.fileName}" بنجاح!`, type: 'success' });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification({ message: err.message || 'تعذر إعادة التسجيل. يرجى المحاولة مرة أخرى.', type: 'warning' });
    } finally {
      setRetryingRegIds((prev) => ({ ...prev, [fileId]: false }));
    }
  };

  const handleRetryAllRegistrations = async () => {
    const items = Object.values(pendingRegistrations);
    for (const item of items) {
      await handleRetryRegistration(item.fileId);
    }
  };

  // -------------------------------------------------------------
  // 3. Queue Item State Mutator Helper
  // -------------------------------------------------------------
  const updateQueueItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, ...patch };
      })
    );
  }, []);

  // -------------------------------------------------------------
  // 4. Query Google Drive Status for Confirmation & Offset
  // -------------------------------------------------------------
  const queryResumeStatus = async (
    uploadToken: string,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; complete: boolean; nextByteOffset: number; fileId: string | null }> => {
    try {
      const res = await fetch('/api/admin/drive/upload/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadToken }),
        signal,
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
    } catch {}
    return { ok: false, complete: false, nextByteOffset: 0, fileId: null };
  };

  // -------------------------------------------------------------
  // 5. Single Item Upload Worker
  // -------------------------------------------------------------
  const processQueueItem = useCallback(
    async (item: QueueItem) => {
      const controller = new AbortController();
      updateQueueItem(item.id, {
        status: 'preparing',
        abortController: controller,
        errorMessage: null,
      });

      try {
        let uploadToken = item.uploadToken;
        let driveFileId = item.driveFileId;
        let offset = item.uploadedBytes;
        const totalSize = item.size;

        // Step A: Initialize upload session or verify existing session
        if (!uploadToken) {
          const initRes = await fetch('/api/admin/drive/upload/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: item.name,
              mimeType: item.type || 'application/octet-stream',
              fileSize: item.size,
              projectId,
            }),
            signal: controller.signal,
          });

          const initData = await initRes.json();
          if (!initRes.ok || !initData.uploadToken) {
            throw new Error(initData.error || 'فشل بدء جلسة الرفع على Google Drive');
          }

          uploadToken = initData.uploadToken;
          updateQueueItem(item.id, { uploadToken });
        } else {
          // If we had an existing token, query confirmed offset first
          const statusRes = await queryResumeStatus(uploadToken, controller.signal);
          if (statusRes.ok) {
            if (statusRes.complete && statusRes.fileId) {
              driveFileId = statusRes.fileId;
              offset = totalSize;
            } else {
              offset = statusRes.nextByteOffset;
              updateQueueItem(item.id, {
                uploadedBytes: offset,
                progress: Math.round((offset / totalSize) * 100),
              });
            }
          }
        }

        // Step B: Chunk Upload Loop
        updateQueueItem(item.id, { status: 'uploading' });

        let lastConfirmedOffset = offset;
        let noProgressCount = 0;
        const MAX_NO_PROGRESS = 5;
        let samples: Array<{ timestamp: number; bytes: number }> = [
          { timestamp: Date.now(), bytes: offset },
        ];

        while (offset < totalSize && !driveFileId) {
          // Check for abort / pause
          if (controller.signal.aborted) {
            return;
          }

          const nextEnd = Math.min(offset + CHUNK_SIZE_BYTES, totalSize);
          const chunkSlice = item.file.slice(offset, nextEnd);
          const contentRange = `bytes ${offset}-${nextEnd - 1}/${totalSize}`;

          try {
            const chunkRes = await fetch('/api/admin/drive/upload/chunk', {
              method: 'PUT',
              headers: {
                'x-upload-token': uploadToken!,
                'content-range': contentRange,
                'Content-Type': 'application/octet-stream',
              },
              body: chunkSlice,
              signal: controller.signal,
            });

            if (chunkRes.ok || chunkRes.status === 308) {
              const chunkData = await chunkRes.json().catch(() => ({}));
              if (chunkData.complete && chunkData.fileId) {
                driveFileId = chunkData.fileId;
                offset = totalSize;
                break;
              }

              const confirmedOffset =
                typeof chunkData.nextByteOffset === 'number' ? chunkData.nextByteOffset : nextEnd;

              if (confirmedOffset > lastConfirmedOffset) {
                offset = confirmedOffset;
                lastConfirmedOffset = offset;
                noProgressCount = 0;

                // Record progress sample
                samples.push({ timestamp: Date.now(), bytes: offset });
                // Keep only samples within the last 4 seconds
                const now = Date.now();
                samples = samples.filter((s) => now - s.timestamp <= 4000);

                const currentSpeed = calculateMovingAverageSpeed(samples);
                const remainingBytes = Math.max(0, totalSize - offset);
                const etaSeconds = calculateEtaSeconds(remainingBytes, currentSpeed);
                const progressPercent = Math.round((offset / totalSize) * 100);

                updateQueueItem(item.id, {
                  uploadedBytes: offset,
                  progress: progressPercent,
                  speedBytesPerSec: currentSpeed,
                  speedFormatted: formatSpeed(currentSpeed),
                  etaSeconds,
                  etaFormatted: formatEta(etaSeconds),
                  samples,
                });
              } else {
                noProgressCount++;
                offset = confirmedOffset;
                if (noProgressCount >= MAX_NO_PROGRESS) {
                  throw new Error(
                    `توقف الرفع بعد ${MAX_NO_PROGRESS} استجابات متتالية دون تقدم في استلام البيانات من Google Drive.`
                  );
                }
                await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, noProgressCount - 1), 6000)));
              }
            } else {
              const errData = await chunkRes.json().catch(() => ({}));
              const status = chunkRes.status;

              // Check if authentication error
              if (isAuthOrPermissionError(status)) {
                throw new Error(errData.error || 'خطأ في المصادقة مع Google Drive (رمز 401/403).');
              }

              // Check if transient error eligible for retry
              if (isTransientHttpError(status) && item.retryCount < 3) {
                updateQueueItem(item.id, { retryCount: item.retryCount + 1 });
                await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, item.retryCount)));
                continue;
              }

              throw new Error(errData.error || `خطأ خادم الرفع (رمز: ${status})`);
            }
          } catch (chunkErr: any) {
            if (controller.signal.aborted) {
              return; // Clean exit on pause/cancel
            }

            // Attempt to query status to recover confirmed offset
            const statusResult = await queryResumeStatus(uploadToken!, controller.signal);
            if (statusResult.ok) {
              if (statusResult.complete && statusResult.fileId) {
                driveFileId = statusResult.fileId;
                offset = totalSize;
                break;
              }

              if (statusResult.nextByteOffset > lastConfirmedOffset) {
                offset = statusResult.nextByteOffset;
                lastConfirmedOffset = offset;
                noProgressCount = 0;
                continue;
              }
            }

            noProgressCount++;
            if (noProgressCount >= MAX_NO_PROGRESS) {
              throw chunkErr;
            }
            await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, noProgressCount - 1), 6000)));
          }
        }

        // Step C: Verification (Google Drive confirmed receipt)
        if (!driveFileId && uploadToken) {
          updateQueueItem(item.id, { status: 'verifying' });
          const finalStatus = await queryResumeStatus(uploadToken, controller.signal);
          if (finalStatus.ok && finalStatus.fileId) {
            driveFileId = finalStatus.fileId;
          }
        }

        if (!driveFileId) {
          throw new Error('اكتمل نقل الملف ولكن تعذر الحصول على معرّف الملف من Google Drive.');
        }

        updateQueueItem(item.id, {
          driveFileId,
          uploadedBytes: totalSize,
          progress: 100,
          status: 'verifying',
        });

        // Step D: Registration into Database
        updateQueueItem(item.id, { status: 'registering' });
        const cleanTitle = item.name.replace(/\.[^/.]+$/, '');

        try {
          const asset = await registerDriveAsset(driveFileId, cleanTitle);
          updateQueueItem(item.id, {
            status: 'completed',
            completedAt: Date.now(),
            speedBytesPerSec: 0,
            speedFormatted: '0 MB/s',
            etaFormatted: 'مكتمل ✓',
          });
          onUploadSuccess(asset);

          // Remove from reload queue if present
          setRestoredSessions((prev) => prev.filter((r) => r.name !== item.name));
        } catch (regErr: any) {
          // If Drive upload succeeded but DB register failed, preserve in persistent pending registrations
          addPendingRegistration({
            fileId: driveFileId,
            title: cleanTitle,
            fileName: item.name,
          });
          updateQueueItem(item.id, {
            status: 'failed',
            errorMessage: `تم حفظ الملف في Google Drive، لكن تعذر قيده في قاعدة البيانات: ${regErr.message}`,
          });
        }
      } catch (err: any) {
        if (controller.signal.aborted) {
          return; // Item was paused or cancelled by user
        }
        console.error('Queue upload error for:', item.name, err);
        updateQueueItem(item.id, {
          status: 'failed',
          errorMessage: err.message || 'حدث خطأ غير متوقع أثناء الرفع',
          speedBytesPerSec: 0,
          speedFormatted: '0 MB/s',
          etaFormatted: 'توقف',
        });
      }
    },
    [projectId, onUploadSuccess, updateQueueItem, addPendingRegistration, registerDriveAsset]
  );

  // -------------------------------------------------------------
  // 6. Concurrency Dispatcher Loop
  // -------------------------------------------------------------
  useEffect(() => {
    const activeCount = queue.filter((q) =>
      ['uploading', 'preparing', 'verifying', 'registering'].includes(q.status)
    ).length;

    if (activeCount < MAX_CONCURRENT_UPLOADS) {
      const nextItem = queue.find((q) => q.status === 'queued');
      if (nextItem) {
        processQueueItem(nextItem);
      }
    }
  }, [queue, processQueueItem]);

  // Overall queue completion notification
  useEffect(() => {
    if (queue.length === 0) return;
    const isAnyBusy = queue.some((q) =>
      ['uploading', 'preparing', 'verifying', 'registering', 'queued'].includes(q.status)
    );
    if (!isAnyBusy) {
      const completedCount = queue.filter((q) => q.status === 'completed').length;
      const failedCount = queue.filter((q) => q.status === 'failed').length;

      if (completedCount > 0 && failedCount === 0) {
        setNotification({
          message: `تم رفع جميع الملفات بنجاح (${completedCount} ملف)`,
          type: 'success',
        });
        const timer = setTimeout(() => setNotification(null), 4500);
        return () => clearTimeout(timer);
      } else if (failedCount > 0) {
        setNotification({
          message: `تم رفع ${completedCount} من أصل ${queue.length} — ${failedCount} ملف بحاجة لإعادة المحاولة`,
          type: 'warning',
        });
      }
    }
  }, [queue]);

  // -------------------------------------------------------------
  // 7. User Actions (Add, Pause, Resume, Cancel, Retry, Clear)
  // -------------------------------------------------------------
  const handleAddFiles = (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const newItems: QueueItem[] = [];
    const oversizedNames: string[] = [];

    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        oversizedNames.push(file.name);
        return;
      }

      // Check if file matches any restored unfinished session
      const matchingRestored = restoredSessions.find((r) =>
        matchRestoredFile(file, {
          name: r.name,
          size: r.size,
          lastModified: r.lastModified,
        })
      );

      const id = matchingRestored?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      newItems.push({
        id,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        status: 'queued',
        uploadedBytes: matchingRestored ? matchingRestored.uploadedBytes : 0,
        progress: matchingRestored ? Math.round((matchingRestored.uploadedBytes / file.size) * 100) : 0,
        speedBytesPerSec: 0,
        speedFormatted: '0 MB/s',
        etaSeconds: null,
        etaFormatted: 'في الانتظار',
        uploadToken: matchingRestored ? matchingRestored.uploadToken : null,
        driveFileId: matchingRestored ? matchingRestored.driveFileId : null,
        errorMessage: null,
        retryCount: 0,
        abortController: null,
        samples: [],
        createdAt: Date.now(),
      });

      // Remove from restored sessions list if attached
      if (matchingRestored) {
        setRestoredSessions((prev) => prev.filter((r) => r.id !== matchingRestored.id));
      }
    });

    if (oversizedNames.length > 0) {
      alert(
        `الملفات التالية تتجاوز الحد الأقصى المسموح به (500 ميغابايت) ولم تتم إضافتها:\n` +
          oversizedNames.join('\n')
      );
    }

    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
    }
  };

  const handlePause = (item: QueueItem) => {
    if (item.abortController) {
      item.abortController.abort();
    }
    updateQueueItem(item.id, {
      status: 'paused',
      speedBytesPerSec: 0,
      speedFormatted: '0 MB/s',
      etaFormatted: 'متوقف مؤقتًا',
    });
  };

  const handleResume = (item: QueueItem) => {
    updateQueueItem(item.id, {
      status: 'queued',
      errorMessage: null,
      etaFormatted: 'في الانتظار',
    });
  };

  const handleCancel = (item: QueueItem) => {
    if (['uploading', 'preparing'].includes(item.status) && item.abortController) {
      item.abortController.abort();
    }
    if (item.status === 'queued') {
      // Remove immediately if queued
      setQueue((prev) => prev.filter((q) => q.id !== item.id));
    } else {
      updateQueueItem(item.id, {
        status: 'cancelled',
        speedBytesPerSec: 0,
        speedFormatted: '0 MB/s',
        etaFormatted: 'ملغي',
      });
    }
  };

  const handleRetry = (item: QueueItem) => {
    updateQueueItem(item.id, {
      status: 'queued',
      errorMessage: null,
      retryCount: 0,
      etaFormatted: 'في الانتظار',
    });
  };

  const handleRemoveFromList = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const handleClearCompleted = () => {
    setQueue((prev) => prev.filter((q) => q.status !== 'completed'));
  };

  const handleCancelAll = () => {
    queue.forEach((item) => {
      if (['uploading', 'preparing'].includes(item.status) && item.abortController) {
        item.abortController.abort();
      }
    });
    setQueue((prev) =>
      prev.map((item) => {
        if (['queued', 'uploading', 'preparing', 'paused'].includes(item.status)) {
          return { ...item, status: 'cancelled', speedBytesPerSec: 0, etaFormatted: 'ملغي' };
        }
        return item;
      })
    );
  };

  // -------------------------------------------------------------
  // 8. Drag & Drop Handlers
  // -------------------------------------------------------------
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
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const summary: QueueSummary = computeQueueSummary(queue);
  const visibleQueue = hideCompleted ? queue.filter((q) => q.status !== 'completed') : queue;

  const renderFileIcon = (name: string, type: string) => {
    const category = getFileCategory(name, type);
    switch (category) {
      case 'video':
        return <Film className="h-5 w-5 text-sky-400" />;
      case 'image':
        return <ImageIcon className="h-5 w-5 text-emerald-400" />;
      case 'audio':
        return <Music className="h-5 w-5 text-amber-400" />;
      case 'document':
        return <FileText className="h-5 w-5 text-indigo-400" />;
      default:
        return <FileIcon className="h-5 w-5 text-studio-text-secondary" />;
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* ------------------------------------------------------- */}
      {/* Restored Session Notice (After Browser Reload)          */}
      {/* ------------------------------------------------------- */}
      {restoredSessions.length > 0 && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-sky-200">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-sky-400 flex-shrink-0" />
              <span className="font-semibold">
                يوجد {restoredSessions.length} ملفات غير مكتملة من جلسة سابقة. اسحب أو اختر الملف نفسه لاستكمال الرفع مباشرة من حيث توقف:
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setRestoredSessions([]);
                try {
                  localStorage.removeItem(RELOAD_QUEUE_KEY);
                } catch {}
              }}
              className="text-white/60 hover:text-white transition"
              title="تجاهل"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5 mt-2">
            {restoredSessions.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-sky-950/40 px-3 py-1.5 rounded-lg border border-sky-500/20">
                <span className="font-mono text-sky-100">{r.name}</span>
                <span className="text-sky-300/80 font-mono text-[11px]">
                  {formatBytes(r.uploadedBytes)} من {formatBytes(r.size)} ({Math.round((r.uploadedBytes / r.size) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- */}
      {/* Persistent Pending DB Registrations Banner              */}
      {/* ------------------------------------------------------- */}
      {Object.values(pendingRegistrations).length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
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
                disabled={Object.values(retryingRegIds).some(Boolean)}
                className="flex items-center gap-1.5 rounded-lg bg-studio-blue px-2.5 py-1 text-xs font-bold text-white hover:bg-studio-blue/90 disabled:opacity-50 transition"
              >
                <RefreshCw className={`h-3 w-3 ${Object.values(retryingRegIds).some(Boolean) ? 'animate-spin' : ''}`} />
                إعادة محاولة قيد الكل
              </button>
            )}
          </div>
          <div className="space-y-2 mt-2 divide-y divide-amber-500/20 pt-1">
            {Object.values(pendingRegistrations).map((item) => {
              const isRetryingThis = Boolean(retryingRegIds[item.fileId]);
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

      {/* ------------------------------------------------------- */}
      {/* Toast Notification Banner                               */}
      {/* ------------------------------------------------------- */}
      {notification && (
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border p-3.5 text-xs font-medium ${
            notification.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-white/40 hover:text-white transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------- */}
      {/* Drop Zone Box                                           */}
      {/* ------------------------------------------------------- */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 cursor-pointer ${
          isDragging
            ? 'border-studio-blue bg-studio-blue/10 scale-[1.01]'
            : 'border-white/15 bg-studio-surface hover:border-studio-blue/50 hover:bg-studio-card'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.pdf,.zip,.rar,.ai,.psd,.aep,.c4d"
          onChange={(e) => {
            if (e.target.files) {
              handleAddFiles(e.target.files);
              e.target.value = '';
            }
          }}
          className="hidden"
        />

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-studio-blue/15 text-studio-blue-glow border border-studio-blue/30 shadow-md group-hover:scale-110 transition">
          <Upload className="h-7 w-7" />
        </div>

        <h3 className="mt-4 text-sm font-bold text-white">
          إضافة ملفات إلى قائمة الرفع (اسحب الملفات هنا أو انقر للاختيار)
        </h3>
        <p className="mt-1 text-xs text-studio-text-secondary max-w-md leading-relaxed">
          يمكنك اختيار عدة ملفات معاً. يتم الرفع بتقنية التجزئة المباشرة والاستئناف التلقائي عبر Google Drive بمعدل ملفين متزامنين.
        </p>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-studio-text-muted">
          <span>الحد الأقصى: 500 ميغابايت لكل ملف</span>
          <span>•</span>
          <span>يدعم الفيديو والصور والتصاميم</span>
        </div>
      </div>

      {/* ------------------------------------------------------- */}
      {/* Upload Queue Section (Appears when queue has items)    */}
      {/* ------------------------------------------------------- */}
      {queue.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-studio-surface overflow-hidden shadow-xl">
          {/* Header & Overall Progress */}
          <div className="border-b border-white/10 p-4 sm:p-5 bg-studio-card/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Layers className="h-5 w-5 text-studio-blue-glow" />
                <h4 className="text-sm font-bold text-white">
                  قائمة رفع الملفات
                </h4>
                <span className="font-mono text-xs font-semibold text-studio-gold bg-studio-gold/10 border border-studio-gold/25 px-2 py-0.5 rounded-md">
                  {summary.completedCount} من {summary.totalCount} مكتمل
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {summary.completedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setHideCompleted(!hideCompleted)}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-studio-text-secondary hover:text-white hover:border-white/20 transition"
                  >
                    {hideCompleted ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    <span>{hideCompleted ? 'إظهار المكتملة' : 'إخفاء المكتملة'}</span>
                  </button>
                )}

                {summary.completedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearCompleted}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-studio-text-secondary hover:text-white hover:border-white/20 transition"
                  >
                    مسح المكتملة
                  </button>
                )}

                {summary.isBusy && (
                  <button
                    type="button"
                    onClick={handleCancelAll}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400 hover:bg-red-500/20 transition"
                  >
                    إلغاء الكل
                  </button>
                )}
              </div>
            </div>

            {/* Overall Progress Bar & Stats */}
            <div className="mt-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text-secondary">
                  {formatBytes(summary.uploadedBytes)} من {formatBytes(summary.totalBytes)}
                </span>
                <div className="flex items-center gap-3">
                  {summary.uploadingCount > 0 && (
                    <>
                      <span className="text-studio-blue-glow font-bold">
                        {summary.overallSpeedFormatted}
                      </span>
                      <span className="text-white/30">•</span>
                      <span className="text-studio-text-secondary">
                        {summary.overallEtaFormatted}
                      </span>
                      <span className="text-white/30">•</span>
                    </>
                  )}
                  <span className="font-bold text-studio-gold">
                    {summary.overallPercent}%
                  </span>
                </div>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-studio-blue via-sky-400 to-studio-gold transition-all duration-200"
                  style={{ width: `${summary.overallPercent}%` }}
                />
              </div>

              {/* Status Pills Summary */}
              <div className="flex items-center gap-2 pt-1 flex-wrap text-[11px]">
                {summary.uploadingCount > 0 && (
                  <span className="flex items-center gap-1 text-sky-400 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-md font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                    {summary.uploadingCount} قيد الرفع
                  </span>
                )}
                {summary.queuedCount > 0 && (
                  <span className="flex items-center gap-1 text-studio-text-secondary bg-white/5 border border-white/10 px-2 py-0.5 rounded-md font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                    {summary.queuedCount} في الانتظار
                  </span>
                )}
                {summary.completedCount > 0 && (
                  <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-md font-semibold">
                    <CheckCircle2 className="h-3 w-3" />
                    {summary.completedCount} مكتمل
                  </span>
                )}
                {summary.failedCount > 0 && (
                  <span className="flex items-center gap-1 text-red-400 bg-red-950/60 border border-red-500/30 px-2 py-0.5 rounded-md font-semibold">
                    <AlertCircle className="h-3 w-3" />
                    {summary.failedCount} فشل
                  </span>
                )}
                {summary.pausedCount > 0 && (
                  <span className="flex items-center gap-1 text-amber-400 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-md font-semibold">
                    <Pause className="h-3 w-3" />
                    {summary.pausedCount} متوقف
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Individual Queue Item Cards */}
          <div className="divide-y divide-white/5 p-3 sm:p-4 space-y-2.5">
            {visibleQueue.map((item) => {
              const colors = QUEUE_STATUS_COLORS[item.status];
              const isUploadingActive = ['uploading', 'preparing', 'verifying', 'registering'].includes(item.status);

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/5 bg-studio-card/80 p-3 sm:p-4 transition-all duration-150 hover:border-white/15"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* File Meta */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10">
                        {renderFileIcon(item.name, item.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h5 className="text-xs sm:text-sm font-bold text-white truncate max-w-sm">
                            {item.name}
                          </h5>
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-md px-2 py-0.5 border shrink-0 ${colors.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                            <span>{QUEUE_STATUS_LABELS[item.status]}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-studio-text-secondary">
                          <span>
                            {formatBytes(item.uploadedBytes)} / {formatBytes(item.size)}
                          </span>
                          {isUploadingActive && item.speedBytesPerSec > 0 && (
                            <>
                              <span className="text-white/20">•</span>
                              <span className="text-studio-blue-glow font-bold">
                                {item.speedFormatted}
                              </span>
                            </>
                          )}
                          {isUploadingActive && (
                            <>
                              <span className="text-white/20">•</span>
                              <span className="text-studio-text-muted flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {item.etaFormatted}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {item.status === 'uploading' && (
                        <button
                          type="button"
                          onClick={() => handlePause(item)}
                          className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
                          title="إيقاف مؤقت للرفع"
                        >
                          <Pause className="h-3 w-3" />
                          <span>إيقاف مؤقت</span>
                        </button>
                      )}

                      {item.status === 'paused' && (
                        <button
                          type="button"
                          onClick={() => handleResume(item)}
                          className="flex items-center gap-1 rounded-lg border border-studio-blue/40 bg-studio-blue/15 px-2.5 py-1 text-xs font-semibold text-studio-blue-glow hover:bg-studio-blue/30 transition"
                          title="متابعة الرفع من حيث توقف"
                        >
                          <Play className="h-3 w-3" />
                          <span>متابعة</span>
                        </button>
                      )}

                      {['queued', 'uploading', 'paused', 'preparing'].includes(item.status) && (
                        <button
                          type="button"
                          onClick={() => handleCancel(item)}
                          className="rounded-lg border border-white/10 bg-white/5 p-1 text-studio-text-secondary hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition"
                          title="إلغاء الرفع"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {item.status === 'failed' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleRetry(item)}
                            className="flex items-center gap-1 rounded-lg border border-studio-blue/40 bg-studio-blue/15 px-2.5 py-1 text-xs font-semibold text-studio-blue-glow hover:bg-studio-blue/30 transition"
                            title="إعادة المحاولة"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>إعادة المحاولة</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromList(item.id)}
                            className="rounded-lg border border-white/10 bg-white/5 p-1 text-studio-text-secondary hover:text-white transition"
                            title="إزالة من القائمة"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}

                      {['completed', 'cancelled'].includes(item.status) && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFromList(item.id)}
                          className="rounded-lg p-1 text-white/40 hover:text-white transition"
                          title="إزالة من القائمة"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-150 ${colors.bar}`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold text-studio-gold shrink-0">
                      {item.progress}%
                    </span>
                  </div>

                  {/* Error Message if failed */}
                  {item.errorMessage && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400 bg-red-950/40 p-2 rounded-lg border border-red-500/20">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="break-all">{item.errorMessage}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
