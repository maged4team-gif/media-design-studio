import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/session';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'طلب غير مصرح به' }, { status: 401 });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get('path');

  if (!path || !path.startsWith('projects/') || path.includes('..')) {
    return NextResponse.json({ error: 'مسار ملف غير صالح' }, { status: 400 });
  }

  const supabase = getServerSupabase();
  if (supabase) {
    const { data, error } = await supabase.storage
      .from('media-studio-assets')
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'تعذر توليد رابط المعاينة' }, { status: 404 });
    }

    return NextResponse.redirect(data.signedUrl, { status: 307 });
  }

  return NextResponse.json({ error: 'خدمة التخزين غير متاحة' }, { status: 500 });
}
