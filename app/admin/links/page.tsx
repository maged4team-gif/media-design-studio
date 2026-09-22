import React from 'react';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/session';
import { dataService } from '@/lib/data/service';
import { LinksManagerView } from './LinksManagerView';

export default async function AdminLinksPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    redirect('/admin/login');
  }

  const [links, projects] = await Promise.all([
    dataService.getAllAccessLinks(),
    dataService.getAllProjects(),
  ]);

  return <LinksManagerView initialLinks={links} projects={projects} />;
}
