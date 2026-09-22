import React, { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/session';
import { dataService } from '@/lib/data/service';
import { ProjectAssetsManager } from './ProjectAssetsManager';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminProjectDetailPage({ params }: PageProps) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    redirect('/admin/login');
  }

  const { id } = await params;
  const project = await dataService.getProjectById(id);
  if (!project) {
    return notFound();
  }

  const assets = await dataService.getAssetsForProject(id, false);

  return (
    <Suspense fallback={<div className="min-h-screen bg-studio-bg flex items-center justify-center text-studio-text-muted">جارٍ التحميل...</div>}>
      <ProjectAssetsManager project={project} initialAssets={assets} />
    </Suspense>
  );
}
