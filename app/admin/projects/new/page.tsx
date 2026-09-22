import React from 'react';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/session';
import { NewProjectView } from './NewProjectView';

export default async function NewProjectPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    redirect('/admin/login');
  }

  return <NewProjectView />;
}
