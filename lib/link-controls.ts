/**
 * Per-link access controls (migration 014): expiry date and download permission.
 * Client-safe: used by server authorization, admin forms and client pages.
 */

export interface LinkControlFields {
  enabled?: boolean;
  expires_at?: string | null;
  allow_download?: boolean;
}

/** A link past this moment behaves as closed everywhere, including existing sessions. */
export function isLinkExpired(link: Pick<LinkControlFields, 'expires_at'>, now: number = Date.now()): boolean {
  if (!link.expires_at) return false;
  const expiresAt = new Date(link.expires_at).getTime();
  return !Number.isNaN(expiresAt) && expiresAt <= now;
}

export function isLinkActive(link: LinkControlFields, now: number = Date.now()): boolean {
  return Boolean(link.enabled) && !isLinkExpired(link, now);
}

/** Links created before migration 014 have no value: downloads stay allowed. */
export function linkAllowsDownload(link: Pick<LinkControlFields, 'allow_download'>): boolean {
  return link.allow_download !== false;
}

export interface LinkControlsInput {
  expiresAt?: string | null;
  allowDownload?: boolean;
}

/**
 * Validates link controls from an admin request. Omitted fields mean "no change".
 * Throws a VALIDATION error with an Arabic message.
 */
export function normalizeLinkControlsInput(
  raw: { expiresAt?: unknown; allowDownload?: unknown },
  now: number = Date.now()
): LinkControlsInput {
  const out: LinkControlsInput = {};

  if (raw.expiresAt !== undefined) {
    if (raw.expiresAt === null || raw.expiresAt === '') {
      out.expiresAt = null;
    } else {
      const parsed = typeof raw.expiresAt === 'string' ? new Date(raw.expiresAt).getTime() : NaN;
      if (Number.isNaN(parsed)) {
        throw new Error('VALIDATION: تاريخ انتهاء الرابط غير صالح');
      }
      if (parsed <= now) {
        throw new Error('VALIDATION: يجب أن يكون تاريخ انتهاء الرابط في المستقبل');
      }
      out.expiresAt = new Date(parsed).toISOString();
    }
  }

  if (raw.allowDownload !== undefined) {
    if (typeof raw.allowDownload !== 'boolean') {
      throw new Error('VALIDATION: قيمة السماح بالتحميل غير صالحة');
    }
    out.allowDownload = raw.allowDownload;
  }

  return out;
}

export type AssetPreviewKind = 'video' | 'image' | 'audio' | 'pdf';

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg']);

/** How a file can be shown inside the page, or null when it can only be downloaded. */
export function getAssetPreviewKind(asset: {
  file_type?: string | null;
  mime_type?: string | null;
  original_filename?: string | null;
  title?: string | null;
}): AssetPreviewKind | null {
  if (asset.file_type === 'video') return 'video';
  if (asset.file_type === 'image') return 'image';

  const mime = (asset.mime_type || '').toLowerCase();
  const name = asset.original_filename || asset.title || '';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';

  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  return null;
}
