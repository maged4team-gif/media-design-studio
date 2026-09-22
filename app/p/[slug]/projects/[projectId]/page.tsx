import React from 'react';
import { notFound } from 'next/navigation';
import { dataService } from '@/lib/data/service';
import { getClientSession } from '@/lib/auth/session';
import { ProjectDetailView } from './ProjectDetailView';
import { PasswordGate } from '../../PasswordGate';

interface PageProps {
  params: Promise<{
    slug: string;
    projectId: string;
  }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ClientProjectPage({ params, searchParams }: PageProps) {
  const { slug, projectId } = await params;
  const sp = searchParams ? await searchParams : {};
  const isDirect = sp.direct === 'true' || sp.direct === '1';

  // 1. Verify access link
  const link = await dataService.getAccessLinkBySlug(slug);
  if (!link || !link.enabled) {
    return notFound();
  }

  // 2. Strict Server-Side Authorization: Ensure project is assigned to this client
  const project = await dataService.getProjectForClient(link.id, projectId);
  if (!project) {
    return notFound();
  }

  // 3. Verify client session, session_version, and matching linkId
  const session = await getClientSession(slug);
  if (!session || session.sessionVersion !== link.session_version || session.linkId !== link.id) {
    return (
      <PasswordGate
        viewerName={link.viewer_name}
        slug={slug}
        redirectTo={`/p/${slug}/projects/${projectId}${isDirect ? '?direct=true' : ''}`}
        projectTitle={project.title}
        isPublic={!link.has_password}
      />
    );
  }

  // 4. Fetch visible assets for this project with client slug context
  const assets = await dataService.getAssetsForProject(projectId, true, slug);

  return (
    <ProjectDetailView
      viewerName={link.viewer_name}
      linkId={link.id}
      slug={slug}
      project={project}
      initialAssets={assets}
      isDirect={isDirect}
    />
  );
}
