import { AssetType } from '@/lib/supabase/database.types';

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return '0 ب';
  const k = 1024;
  const sizes = ['بايت', 'ك.ب', 'م.ب', 'ج.ب', 'ت.ب'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${val} ${sizes[i]}`;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatArabicDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateStr;
  }
}

export function getAssetType(mimeType?: string | null, fileName?: string): AssetType {
  if (mimeType) {
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('image/')) return 'image';
  }
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(ext)) return 'video';
    if (['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'].includes(ext)) return 'image';
  }
  return 'file';
}

export function getAssetTypeLabel(type: AssetType): string {
  switch (type) {
    case 'video':
      return 'فيديو';
    case 'image':
      return 'صورة';
    case 'file':
    default:
      return 'ملف تصميم';
  }
}

/**
 * Formats media URLs specifically for client context:
 * - Preserves external URLs (Supabase signed URLs, CDN, local uploads) untouched.
 * - Enforces client slug attachment on internal protected media routes (/api/media/...)
 * - Preserves any existing query parameters (e.g. type=thumbnail) and merges additional ones.
 */
export function formatClientMediaUrl(
  rawUrl: string | null | undefined,
  assetId: string,
  slug: string,
  extraParams?: Record<string, string>
): string {
  let base = (rawUrl && rawUrl.trim()) ? rawUrl.trim() : `/api/media/${assetId}`;

  // Replace defunct Google Cloud Storage sample videos that return XML AccessDenied
  if (base.includes('gtv-videos-bucket') || base.includes('commondatastorage.googleapis.com')) {
    base = 'https://vjs.zencdn.net/v/oceans.mp4';
  }

  // Preserve external URLs (e.g. Supabase signed URLs, external CDN)
  if (base.startsWith('http://') || base.startsWith('https://') || base.startsWith('/uploads/')) {
    return base;
  }

  // Handle internal relative paths (/api/media/{id}...)
  const [pathname, queryString] = base.split('?');
  const params = new URLSearchParams(queryString || '');

  // Attach client slug if not already present
  if (slug && !params.has('slug')) {
    params.set('slug', slug);
  }

  // Attach any extra params if provided and not already set
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    }
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Formats file count according to standard Arabic grammatical rules (العدد والمعدود للمذكر: ملف):
 * - 0: "لا توجد ملفات"
 * - 1: "ملف واحد"
 * - 2: "ملفان"
 * - 3-10: "N ملفات"
 * - 11-99: "N ملفاً"
 * - 100+: Follows the rule of the last two digits (e.g. 100 ملف, 105 ملفات, 120 ملفاً)
 */
export function formatArabicFileCount(count: number | null | undefined): string {
  const n = Math.max(0, Math.floor(count ?? 0));
  if (n === 0) return 'لا توجد ملفات';
  if (n === 1) return 'ملف واحد';
  if (n === 2) return 'ملفان';

  const rem100 = n % 100;
  if (rem100 >= 3 && rem100 <= 10) {
    return `${n} ملفات`;
  }
  if (rem100 >= 11 && rem100 <= 99) {
    return `${n} ملفاً`;
  }
  return `${n} ملف`;
}

/**
 * Formats comment count according to standard Arabic grammatical rules (العدد والمعدود للمؤنث: ملاحظة):
 * - 0: "لا توجد ملاحظات"
 * - 1: "ملاحظة واحدة"
 * - 2: "ملاحظتان"
 * - 3-10: "N ملاحظات"
 * - 11-99: "N ملاحظة"
 */
export function formatArabicCommentCount(count: number | null | undefined): string {
  const n = Math.max(0, Math.floor(count ?? 0));
  if (n === 0) return 'لا توجد ملاحظات';
  if (n === 1) return 'ملاحظة واحدة';
  if (n === 2) return 'ملاحظتان';

  const rem100 = n % 100;
  if (rem100 >= 3 && rem100 <= 10) {
    return `${n} ملاحظات`;
  }
  return `${n} ملاحظة`;
}

