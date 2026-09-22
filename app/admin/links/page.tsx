import React from 'react';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/session';
import { dataService } from '@/lib/data/service';
import { LinksManagerView } from './LinksManagerView';
import { Project, AccessLink } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export default async function AdminLinksPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    redirect('/admin/login');
  }

  let links: (AccessLink & { project_ids: string[] })[] = [];
  let projects: Project[] = [];

  try {
    const [fetchedLinks, fetchedProjects] = await Promise.all([
      dataService.getAllAccessLinks(),
      dataService.getAllProjects(),
    ]);
    links = fetchedLinks;
    projects = fetchedProjects;
  } catch (err) {
    console.error('[Admin Links SSR Error]:', err);
  }

  return <LinksManagerView initialLinks={links} projects={projects} />;
}
