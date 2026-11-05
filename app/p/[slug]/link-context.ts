import 'server-only';
import { cache } from 'react';
import type { Metadata } from 'next';
import { dataService } from '@/lib/data/service';
import type { AccessLink, Asset } from '@/lib/supabase/database.types';
import { buildClientPageTitle, HIDDEN_VIEWER_LABEL, resolveLinkBranding } from '@/lib/branding';

/**
 * Request-scoped lookups shared by generateMetadata and the page render,
 * so each request hits the database once per link / project.
 */
export const getClientLink = cache(async (slug: string): Promise<AccessLink | null> => {
  try {
    return await dataService.getAccessLinkBySlug(slug);
  } catch (err) {
    console.error('Failed to get access link:', err);
    return null;
  }
});

export const getClientProject = cache(async (linkId: string, projectId: string) => {
  try {
    return await dataService.getProjectForClient(linkId, projectId);
  } catch (err) {
    console.error('Failed to get project for client:', err);
    return null;
  }
});

const STUDIO_DESCRIPTION = 'منصة استعراض واعتماد مشاريع التصميم والهويات التلفزيونية';

/** Tab title + link-preview metadata that follows the link's page identity. Never indexed. */
export function buildClientMetadata(link: AccessLink | null, pageTitle?: string | null): Metadata {
  const branding = resolveLinkBranding(link);
  const title = buildClientPageTitle(branding, pageTitle);
  const description = branding.mode === 'studio' ? STUDIO_DESCRIPTION : pageTitle?.trim() || 'ملفات مشتركة';
  return {
    title,
    description,
    openGraph: { title, description, siteName: branding.brandName || undefined },
    twitter: { card: 'summary', title, description },
    robots: { index: false, follow: false },
  };
}

/**
 * When the link hides the recipient's name, replace it in the recipient's own
 * comments/approvals before they are serialized to the browser.
 */
export function maskViewerNameInAssets(assets: Asset[], link: AccessLink): Asset[] {
  if (!link.hide_viewer_name) return assets;
  const isOwn = (accessLinkId: string | null | undefined, name: string | undefined) =>
    accessLinkId ? accessLinkId === link.id : name === link.viewer_name;

  return assets.map((asset) => ({
    ...asset,
    comments: asset.comments?.map((c) =>
      isOwn(c.access_link_id, c.author_name) ? { ...c, author_name: HIDDEN_VIEWER_LABEL } : c
    ),
    approvals: asset.approvals?.map((a) =>
      isOwn(a.access_link_id, a.viewer_name) ? { ...a, viewer_name: HIDDEN_VIEWER_LABEL } : a
    ),
  }));
}
