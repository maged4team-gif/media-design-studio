import React from 'react';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/session';
import { dataService } from '@/lib/data/service';
import { isServerSupabaseConfigured } from '@/lib/supabase/server';
import { AdminProjectsView } from './AdminProjectsView';
import { Project, AccessLink } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    redirect('/admin/login');
  }

  let projects: Project[] = [];
  let links: (AccessLink & { project_ids: string[] })[] = [];
  const systemStatus: {
    supabaseConfigured: boolean;
    dataMode: string;
    warning?: string;
  } = {
    supabaseConfigured: isServerSupabaseConfigured(),
    dataMode: process.env.DATA_MODE || 'demo',
  };

  try {
    const [fetchedProjects, fetchedLinks] = await Promise.all([
      dataService.getAllProjects(),
      dataService.getAllAccessLinks(),
    ]);
    projects = fetchedProjects;
    links = fetchedLinks;
  } catch (err: any) {
    console.error('[Admin Page SSR Error]:', err?.message || err);
    systemStatus.warning = 'تعذر الاتصال بقاعدة البيانات. تعمل لوحة التحكم حالياً في وضع العرض التجريبي.';
    try {
      projects = await dataService.getAllProjects();
      links = await dataService.getAllAccessLinks();
    } catch {
      projects = [];
      links = [];
    }
  }

  return (
    <AdminProjectsView
      initialProjects={projects}
      initialLinks={links}
      systemStatus={systemStatus}
    />
  );
}
