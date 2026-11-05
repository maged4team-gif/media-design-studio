import type { AccessLink, BrandingMode } from '@/lib/supabase/database.types';

/**
 * Per-link page identity (white-label sharing).
 * Shared by server pages, API routes and client components — no server-only imports.
 */

export const STUDIO_BRAND = {
  name: 'استوديو التصميم',
  fullName: 'استوديو التصميم التلفزيوني والإعلامي',
  badge: 'PORTFOLIO',
  tagline: 'Broadcast & Motion Design Showcase',
  metaTitle: 'استوديو التصميم | Media Design Studio',
} as const;

export const BRANDING_MODES: BrandingMode[] = ['studio', 'neutral', 'custom'];
export const BRAND_NAME_MAX_LENGTH = 80;

/** Label used for the recipient's own comments when their name is hidden. */
export const HIDDEN_VIEWER_LABEL = 'أنت';

export interface LinkBranding {
  mode: BrandingMode;
  /** true only for the studio identity (logo, badge, tagline). */
  showStudioIdentity: boolean;
  /** Name shown in the header/footer/tab title; null in neutral mode (nothing shown). */
  brandName: string | null;
  hideViewerName: boolean;
}

export function isBrandingMode(value: unknown): value is BrandingMode {
  return typeof value === 'string' && (BRANDING_MODES as string[]).includes(value);
}

export function resolveLinkBranding(
  link: Pick<AccessLink, 'branding_mode' | 'brand_name' | 'hide_viewer_name'> | null | undefined
): LinkBranding {
  const hideViewerName = Boolean(link?.hide_viewer_name);
  const customName = (link?.brand_name || '').trim();

  // A custom identity with no name degrades to neutral: never fall back to the studio name
  if (link?.branding_mode === 'custom') {
    return customName
      ? { mode: 'custom', showStudioIdentity: false, brandName: customName, hideViewerName }
      : { mode: 'neutral', showStudioIdentity: false, brandName: null, hideViewerName };
  }
  if (link?.branding_mode === 'neutral') {
    return { mode: 'neutral', showStudioIdentity: false, brandName: null, hideViewerName };
  }
  return { mode: 'studio', showStudioIdentity: true, brandName: STUDIO_BRAND.name, hideViewerName };
}

/** The name the recipient may see, or null when it must stay hidden. */
export function visibleViewerName(link: Pick<AccessLink, 'viewer_name' | 'hide_viewer_name'>): string | null {
  return link.hide_viewer_name ? null : link.viewer_name;
}

/** Browser-tab / link-preview title for a client page. */
export function buildClientPageTitle(branding: LinkBranding, pageTitle?: string | null): string {
  const page = (pageTitle || '').trim();
  if (branding.mode === 'studio') {
    return page ? `${page} | ${STUDIO_BRAND.name}` : STUDIO_BRAND.metaTitle;
  }
  if (branding.brandName) {
    return page ? `${page} | ${branding.brandName}` : branding.brandName;
  }
  return page || 'ملفات مشتركة';
}

/**
 * Footer line for client pages. `studioText` is the existing studio footer;
 * custom identities show their own name, neutral shows nothing (null).
 */
export function buildClientFooterText(branding: LinkBranding, studioText: string): string | null {
  if (branding.mode === 'studio') return studioText;
  if (branding.brandName) return `${branding.brandName} • جميع الحقوق محفوظة`;
  return null;
}

export interface BrandingInput {
  brandingMode?: BrandingMode;
  brandName?: string | null;
  hideViewerName?: boolean;
}

/**
 * Validates admin-supplied branding fields. Fields left undefined are "no change".
 * Throws a user-facing Arabic message on invalid input.
 */
export function normalizeBrandingInput(raw: {
  brandingMode?: unknown;
  brandName?: unknown;
  hideViewerName?: unknown;
}): BrandingInput {
  const out: BrandingInput = {};

  if (raw.brandingMode !== undefined) {
    if (!isBrandingMode(raw.brandingMode)) {
      throw new Error('VALIDATION: وضع هوية الصفحة غير صالح');
    }
    out.brandingMode = raw.brandingMode;
  }

  if (raw.brandName !== undefined) {
    if (raw.brandName !== null && typeof raw.brandName !== 'string') {
      throw new Error('VALIDATION: الاسم المخصص غير صالح');
    }
    const name = (raw.brandName || '').trim().replace(/\s+/g, ' ');
    if (name.length > BRAND_NAME_MAX_LENGTH) {
      throw new Error(`VALIDATION: الاسم المخصص يجب ألا يتجاوز ${BRAND_NAME_MAX_LENGTH} حرفاً`);
    }
    out.brandName = name || null;
  }

  if (raw.hideViewerName !== undefined) {
    if (typeof raw.hideViewerName !== 'boolean') {
      throw new Error('VALIDATION: قيمة إخفاء الاسم غير صالحة');
    }
    out.hideViewerName = raw.hideViewerName;
  }

  if (out.brandingMode === 'custom' && raw.brandName !== undefined && !out.brandName) {
    throw new Error('VALIDATION: يرجى كتابة الاسم المخصص الذي سيظهر للمستلم');
  }

  return out;
}
