import React from 'react';
import { notFound } from 'next/navigation';
import { dataService } from '@/lib/data/service';
import { getClientSession } from '@/lib/auth/session';
import { PasswordGate } from './PasswordGate';
import { ClientHomeView } from './ClientHomeView';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function ClientSlugPage({ params }: PageProps) {
  const { slug } = await params;

  // 1. Fetch access link details
  const link = await dataService.getAccessLinkBySlug(slug);
  if (!link || !link.enabled) {
    return notFound();
  }

  // 2. Check if this client has an authenticated session cookie, valid session_version, and matching linkId
  const session = await getClientSession(slug);
  if (!session || session.sessionVersion !== link.session_version || session.linkId !== link.id) {
    return <PasswordGate viewerName={link.viewer_name} slug={slug} isPublic={!link.has_password} />;
  }

  // 3. Fetch only the projects assigned to this access link
  const projects = await dataService.getProjectsForClient(link.id);

  return (
    <ClientHomeView
      viewerName={link.viewer_name}
      slug={slug}
      projects={projects}
    />
  );
}
