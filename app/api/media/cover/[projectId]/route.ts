import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { authorizeClientProject } from '@/lib/auth/authorize';
import { dataService, getDataMode } from '@/lib/data/service';
import { getServerSupabase } from '@/lib/supabase/server';

interface RouteProps {
  params: Promise<{
    projectId: string;
  }>;
}

export async function GET(req: Request, { params }: RouteProps) {
  const { projectId } = await params;
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');

  // 1. Authorization: either valid admin or authorized client
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  let isAuthorized = isAdmin;

  if (!isAuthorized && slug) {
    const clientToken = extractCookieFromRequest(req, `client_session_${slug}`);
    const auth = await authorizeClientProject(slug, projectId, clientToken);
    if (auth.ok) {
      isAuthorized = true;
    } else {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: 'غير مصرح بالوصول إلى هذا الغلاف' }, { status: 401 });
  }

  // 2. Fetch project
  const project = await dataService.getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 });
  }

  // 3. Directly serve Base64 data URLs if saved as project cover
  if (project.cover_url?.startsWith('data:')) {
    const commaIdx = project.cover_url.indexOf(',');
    if (commaIdx !== -1) {
      const mimeMatch = project.cover_url.slice(0, commaIdx).match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = project.cover_url.slice(commaIdx + 1);
      const imgBuffer = Buffer.from(base64Data, 'base64');
      return new Response(imgBuffer, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=86400, immutable',
        },
      });
    }
  }

  const isDirectWebUrl = (u: string | null | undefined): boolean => {
    if (!u) return false;
    return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/uploads/') || u.startsWith('data:');
  };

  const coverPath = project.cover_storage_path || (!isDirectWebUrl(project.cover_url) ? project.cover_url : null);

  // 4. Resolve private Supabase Storage cover
  if (coverPath && getDataMode() === 'supabase') {
    const supabase = getServerSupabase();
    if (supabase) {
      const { data: signedData, error: signError } = await supabase.storage
        .from('media-studio-assets')
        .createSignedUrl(coverPath, 7200);

      if (signError || !signedData?.signedUrl) {
        console.error('Failed to issue signed URL for project cover:', signError);
        return NextResponse.json({ error: 'تعذر إصدار رابط موقّع لغلاف المشروع' }, { status: 500 });
      }

      return NextResponse.redirect(signedData.signedUrl, { status: 307 });
    }
  }

  // 5. External or local fallback (must be a valid web URL, never a raw storage path)
  if (isDirectWebUrl(project.cover_url)) {
    return NextResponse.redirect(project.cover_url!, { status: 307 });
  }

  if (getDataMode() === 'demo') {
    return NextResponse.redirect('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=1200&q=80', { status: 307 });
  }

  return NextResponse.json({ error: 'لا يوجد غلاف معتمد لهذا المشروع' }, { status: 404 });
}
