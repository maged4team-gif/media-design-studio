import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/session';
import { dataService } from '@/lib/data/service';
import { verifyRequestOrigin } from '@/lib/auth/csrf';

interface RouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(req: Request, { params }: RouteProps) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.version !== undefined) updateData.version = body.version?.trim() || null;
    if (body.thumbnail_url !== undefined) updateData.thumbnail_url = body.thumbnail_url?.trim() || null;
    if (body.duration_seconds !== undefined) {
      updateData.duration_seconds = body.duration_seconds ? parseInt(body.duration_seconds, 10) : null;
    }
    if (body.is_visible !== undefined) updateData.is_visible = Boolean(body.is_visible);

    const asset = await dataService.updateAsset(id, updateData);
    if (!asset) {
      return NextResponse.json({ error: 'الملف غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ success: true, asset });
  } catch (error: any) {
    console.error('Update asset error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر تعديل الملف' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteProps) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const success = await dataService.deleteAsset(id);
    return NextResponse.json({ success });
  } catch (error: any) {
    console.error('Delete asset error:', error);
    return NextResponse.json({ error: error?.message || 'تعذر حذف الملف' }, { status: 500 });
  }
}
