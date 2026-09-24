export type QueueItemStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'verifying'
  | 'registering'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const QUEUE_STATUS_LABELS: Record<QueueItemStatus, string> = {
  queued: 'في الانتظار',
  preparing: 'جارٍ التجهيز',
  uploading: 'جارٍ الرفع',
  paused: 'متوقف مؤقتًا',
  verifying: 'جارٍ التحقق',
  registering: 'جارٍ حفظ الملف',
  completed: 'مكتمل',
  failed: 'فشل',
  cancelled: 'ملغي',
};

export const QUEUE_STATUS_COLORS: Record<
  QueueItemStatus,
  {
    bg: string;
    text: string;
    border: string;
    badge: string;
    bar: string;
    dot: string;
  }
> = {
  queued: {
    bg: 'bg-white/5',
    text: 'text-studio-text-secondary',
    border: 'border-white/10',
    badge: 'bg-white/5 text-studio-text-secondary border-white/10',
    bar: 'bg-white/20',
    dot: 'bg-studio-text-muted',
  },
  preparing: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    badge: 'bg-sky-950/80 text-sky-300 border-sky-500/40',
    bar: 'bg-sky-500',
    dot: 'bg-sky-400',
  },
  uploading: {
    bg: 'bg-blue-500/10',
    text: 'text-studio-blue-glow',
    border: 'border-studio-blue/30',
    badge: 'bg-blue-950/80 text-studio-blue-glow border-studio-blue/40',
    bar: 'bg-gradient-to-r from-studio-blue via-sky-400 to-studio-gold',
    dot: 'bg-studio-blue-glow animate-pulse',
  },
  paused: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    badge: 'bg-amber-950/80 text-amber-300 border-amber-500/40',
    bar: 'bg-amber-500/70',
    dot: 'bg-amber-400',
  },
  verifying: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    badge: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40',
    bar: 'bg-indigo-500',
    dot: 'bg-indigo-400',
  },
  registering: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    badge: 'bg-purple-950/80 text-purple-300 border-purple-500/40',
    bar: 'bg-purple-500',
    dot: 'bg-purple-400',
  },
  completed: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-400',
  },
  failed: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    badge: 'bg-red-950/80 text-red-300 border-red-500/40',
    bar: 'bg-red-500',
    dot: 'bg-red-400',
  },
  cancelled: {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
    badge: 'bg-zinc-900/90 text-zinc-400 border-zinc-700/40',
    bar: 'bg-zinc-600',
    dot: 'bg-zinc-500',
  },
};

export interface ProgressSample {
  timestamp: number;
  bytes: number;
}

export interface QueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  status: QueueItemStatus;
  uploadedBytes: number;
  progress: number; // 0 to 100
  speedBytesPerSec: number;
  speedFormatted: string;
  etaSeconds: number | null;
  etaFormatted: string;
  uploadToken: string | null;
  driveFileId: string | null;
  errorMessage: string | null;
  retryCount: number;
  abortController: AbortController | null;
  samples: ProgressSample[];
  createdAt: number;
  completedAt?: number;
}

export interface RestoredSessionMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  uploadToken: string;
  uploadedBytes: number;
  driveFileId: string | null;
  savedAt: number;
}

export interface QueueSummary {
  totalCount: number;
  uploadingCount: number;
  queuedCount: number;
  completedCount: number;
  failedCount: number;
  pausedCount: number;
  cancelledCount: number;
  totalBytes: number;
  uploadedBytes: number;
  overallPercent: number;
  overallSpeedBytesPerSec: number;
  overallSpeedFormatted: string;
  overallEtaFormatted: string;
  isBusy: boolean;
}

export const MAX_CONCURRENT_UPLOADS = 2;
export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
export const CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB bounded chunk
export const SPEED_WINDOW_MS = 4000; // 4 seconds sliding window
export const MAX_AUTO_RETRIES = 3;

/**
 * Formats byte size into human readable string (e.g. 245 MB, 1.2 GB, 500 KB)
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  const formatted = val >= 100 ? Math.round(val) : Number(val.toFixed(1));
  return `${formatted} ${units[i]}`;
}

/**
 * Formats transfer speed in MB/s or KB/s
 */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || isNaN(bytesPerSec)) return '0 MB/s';
  if (bytesPerSec < 1024 * 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * Formats remaining time in Arabic (e.g. "باقي 1د 42ث" or "جارٍ حساب الوقت…")
 */
export function formatEta(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds <= 0 || !isFinite(seconds)) {
    return 'جارٍ حساب الوقت…';
  }
  if (seconds > 86400) {
    return 'باقي أكثر من يوم';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (hours > 0) {
    return `باقي ${hours}س ${minutes}د`;
  }
  if (minutes > 0) {
    return `باقي ${minutes}د ${remainingSeconds}ث`;
  }
  return `باقي ${Math.max(1, remainingSeconds)}ث`;
}

/**
 * Calculates accurate moving average transfer speed over a sliding time window.
 * Eliminates sudden spikes and avoids misleading initial jumps.
 */
export function calculateMovingAverageSpeed(
  samples: ProgressSample[],
  windowMs: number = SPEED_WINDOW_MS
): number {
  if (!samples || samples.length < 2) return 0;

  const now = Date.now();
  const validSamples = samples.filter((s) => now - s.timestamp <= windowMs);

  if (validSamples.length < 2) {
    // If not enough samples in window, take the last 2 available
    const last = samples[samples.length - 1];
    const prev = samples[samples.length - 2];
    const timeDelta = (last.timestamp - prev.timestamp) / 1000;
    if (timeDelta <= 0.1) return 0;
    const bytesDelta = last.bytes - prev.bytes;
    return bytesDelta > 0 ? bytesDelta / timeDelta : 0;
  }

  const oldest = validSamples[0];
  const newest = validSamples[validSamples.length - 1];
  const timeDelta = (newest.timestamp - oldest.timestamp) / 1000;

  if (timeDelta < 0.5) return 0; // Require at least 500ms of data for stable estimate
  const bytesDelta = newest.bytes - oldest.bytes;
  return bytesDelta > 0 ? bytesDelta / timeDelta : 0;
}

/**
 * Computes remaining seconds from remaining bytes and current moving speed.
 */
export function calculateEtaSeconds(
  remainingBytes: number,
  speedBytesPerSec: number
): number | null {
  if (remainingBytes <= 0) return 0;
  if (speedBytesPerSec <= 1024) return null; // Speed too slow or just starting
  return remainingBytes / speedBytesPerSec;
}

/**
 * Determines if an HTTP error code or network error is transient and eligible for retry.
 */
export function isTransientHttpError(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

/**
 * Determines if an error is an authentication / authorization rejection that should NOT be retried.
 */
export function isAuthOrPermissionError(status: number): boolean {
  return [401, 403].includes(status);
}

/**
 * Calculates aggregate summary across the entire queue.
 */
export function computeQueueSummary(items: QueueItem[]): QueueSummary {
  const totalCount = items.length;
  let uploadingCount = 0;
  let queuedCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  let pausedCount = 0;
  let cancelledCount = 0;

  let totalBytes = 0;
  let uploadedBytes = 0;
  let totalSpeed = 0;

  for (const item of items) {
    totalBytes += item.size;
    uploadedBytes += Math.min(item.uploadedBytes, item.size);

    switch (item.status) {
      case 'uploading':
      case 'preparing':
      case 'verifying':
      case 'registering':
        uploadingCount++;
        totalSpeed += item.speedBytesPerSec;
        break;
      case 'queued':
        queuedCount++;
        break;
      case 'completed':
        completedCount++;
        break;
      case 'failed':
        failedCount++;
        break;
      case 'paused':
        pausedCount++;
        break;
      case 'cancelled':
        cancelledCount++;
        break;
    }
  }

  const overallPercent = totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0;
  const remainingTotalBytes = Math.max(0, totalBytes - uploadedBytes);
  const overallEtaSeconds = calculateEtaSeconds(remainingTotalBytes, totalSpeed);

  return {
    totalCount,
    uploadingCount,
    queuedCount,
    completedCount,
    failedCount,
    pausedCount,
    cancelledCount,
    totalBytes,
    uploadedBytes,
    overallPercent,
    overallSpeedBytesPerSec: totalSpeed,
    overallSpeedFormatted: formatSpeed(totalSpeed),
    overallEtaFormatted: formatEta(overallEtaSeconds),
    isBusy: uploadingCount > 0 || queuedCount > 0,
  };
}

/**
 * Checks if a candidate File matches saved session metadata for resuming after page reload.
 */
export function matchRestoredFile(
  candidate: File,
  saved: { name: string; size: number; lastModified: number }
): boolean {
  if (candidate.name !== saved.name) return false;
  if (candidate.size !== saved.size) return false;
  // Allow up to 2 seconds drift in file modification timestamp
  if (Math.abs(candidate.lastModified - saved.lastModified) > 2000) return false;
  return true;
}

/**
 * Determines file category icon / classification from MIME type or file extension.
 */
export function getFileCategory(name: string, mimeType?: string): 'video' | 'image' | 'audio' | 'document' | 'other' {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const type = (mimeType || '').toLowerCase();

  if (type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm', 'aep'].includes(ext)) {
    return 'video';
  }
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ai', 'psd'].includes(ext)) {
    return 'image';
  }
  if (type.startsWith('audio/') || ['mp3', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return 'audio';
  }
  if (['pdf', 'doc', 'docx', 'txt', 'zip', 'rar', '7z'].includes(ext)) {
    return 'document';
  }
  return 'other';
}
