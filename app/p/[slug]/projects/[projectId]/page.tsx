import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { dataService } from '@/lib/data/service';
import { getClientSession } from '@/lib/auth/session';
import { resolveLinkBranding, visibleViewerName } from '@/lib/branding';
import { ProjectDetailView } from './ProjectDetailView';
import { PasswordGate } from '../../PasswordGate';
import { buildClientMetadata, getClientLink, getClientProject, maskViewerNameInAssets } from '../../link-context';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{
    slug: string;
    projectId: string;
  }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, projectId } = await params;
  const link = await getClientLink(slug);
  if (!link || !link.enabled) return buildClientMetadata(null);
  const project = await getClientProject(link.id, projectId);
  return buildClientMetadata(link, project?.title);
}

export default async function ClientProjectPage({ params, searchParams }: PageProps) {
  const { slug, projectId } = await params;
  const sp = searchParams ? await searchParams : {};
  const isDirect = sp.direct === 'true' || sp.direct === '1';

  // 1. Verify access link safely
  const link = await getClientLink(slug);
  if (!link || !link.enabled) {
    return notFound();
  }

  // 2. Strict Server-Side Authorization: Ensure project is assigned to this client
  const project = await getClientProject(link.id, projectId);
  if (!project) {
    return notFound();
  }

  const branding = resolveLinkBranding(link);
  const viewerName = visibleViewerName(link);

  // 3. Verify client session, session_version, and matching linkId
  const session = await getClientSession(slug);
  if (!session || session.sessionVersion !== link.session_version || session.linkId !== link.id) {
    return (
      <PasswordGate
        viewerName={viewerName}
        slug={slug}
        redirectTo={`/p/${slug}/projects/${projectId}${isDirect ? '?direct=true' : ''}`}
        projectTitle={project.title}
        isPublic={!link.has_password}
        branding={branding}
      />
    );
  }

  // 4. Fetch visible assets for this project with client slug context
  const assets = maskViewerNameInAssets(await dataService.getAssetsForProject(projectId, true, slug), link);

  return (
    <ProjectDetailView
      viewerName={viewerName}
      linkId={link.id}
      slug={slug}
      project={project}
      initialAssets={assets}
      isDirect={isDirect}
      branding={branding}
    />
  );
}
