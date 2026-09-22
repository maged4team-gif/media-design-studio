import React from 'react';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/session';
import { dataService } from '@/lib/data/service';
import { AdminProjectsView } from './AdminProjectsView';

export default async function AdminPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    redirect('/admin/login');
  }

  const [projects, links] = await Promise.all([
    dataService.getAllProjects(),
    dataService.getAllAccessLinks(),
  ]);

  return <AdminProjectsView initialProjects={projects} initialLinks={links} />;
}
