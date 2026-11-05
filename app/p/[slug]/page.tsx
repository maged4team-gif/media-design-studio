import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { dataService } from '@/lib/data/service';
import { getClientSession } from '@/lib/auth/session';
import { resolveLinkBranding, visibleViewerName } from '@/lib/branding';
import { PasswordGate } from './PasswordGate';
import { ClientHomeView } from './ClientHomeView';
import { buildClientMetadata, getClientLink } from './link-context';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const link = await getClientLink(slug);
  return buildClientMetadata(link && link.enabled ? link : null);
}

export default async function ClientSlugPage({ params }: PageProps) {
  const { slug } = await params;

  // 1. Fetch access link details safely
  const link = await getClientLink(slug);

  if (!link || !link.enabled) {
    return notFound();
  }

  const branding = resolveLinkBranding(link);
  const viewerName = visibleViewerName(link);

  // 2. Check if this client has an authenticated session cookie, valid session_version, and matching linkId
  const session = await getClientSession(slug);
  if (!session || session.sessionVersion !== link.session_version || session.linkId !== link.id) {
    return <PasswordGate viewerName={viewerName} slug={slug} isPublic={!link.has_password} branding={branding} />;
  }

  // 3. Fetch only the projects assigned to this access link safely
  let projects: any[] = [];
  try {
    projects = await dataService.getProjectsForClient(link.id);
  } catch (err) {
    console.error('Failed to get projects for client:', err);
  }

  return (
    <ClientHomeView
      viewerName={viewerName}
      slug={slug}
      projects={projects}
      branding={branding}
    />
  );
}
