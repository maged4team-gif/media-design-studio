import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { authorizeClientAsset } from '@/lib/auth/authorize';
import { dataService, getDataMode } from '@/lib/data/service';
import { getServerSupabase } from '@/lib/supabase/server';
import { streamFile, isDriveConfigured, getDriveThumbnailStream } from '@/lib/drive/client';

interface RouteProps {
  params: Promise<{
    assetId: string;
  }>;
}

/**
 * Protected Media Delivery Route
 * 1. Enforces authorization (admin session or verified client token).
 * 2. If asset is stored in Google Drive (drive_file_id):
 *    - Streams directly from Google Drive API with HTTP 206 Range seeking support.
 *    - Handles 200 (Full Content), 206 (Partial Content), and 416 (Range Not Satisfiable).
 *    - Aborts Drive API request when client closes connection (req.signal).
 *    - Enforces Cache-Control: private, no-store.
 * 3. Falls back safely to legacy Supabase Storage or demo URLs for existing assets.
 */
export async function GET(req: Request, { params }: RouteProps) {
  const { assetId } = await params;
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  const isDownload = url.searchParams.get('download') === '1';
  const isThumbnail = url.searchParams.get('type') === 'thumbnail';

  // 1. Authorization Gate
  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);

  let asset = null;

  if (isAdmin) {
    asset = await dataService.getAssetById(assetId);
    if (!asset) {
      return NextResponse.json({ error: 'الملف غير موجود' }, { status: 404 });
    }
  } else if (slug) {
    const clientToken = extractCookieFromRequest(req, `client_session_${slug}`);
    const auth = await authorizeClientAsset(slug, assetId, clientToken);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    asset = auth.data.asset;
  } else {
    return NextResponse.json({ error: 'غير مصرح بالوصول إلى هذا الملف' }, { status: 401 });
  }

  const supabase = getServerSupabase();
  const isDirectWebUrl = (u: string | null | undefined): boolean => {
    if (!u) return false;
    return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/uploads/');
  };

  // 2. Handle Thumbnail Requests strictly: NEVER stream full video file as a thumbnail
  if (isThumbnail) {
    // A. Check Google Drive stored assets (Images & Videos)
    if (asset.drive_file_id && isDriveConfigured()) {
      // 1. Fetch fresh thumbnail via drive_file_id or thumbnail_url with fallback
      try {
        const thumbStream = await getDriveThumbnailStream(asset.drive_file_id, req.signal);
        if (thumbStream && thumbStream.body) {
          const headers = new Headers(thumbStream.headers);
          return new Response(thumbStream.body, { status: thumbStream.status, headers });
        }
      } catch (err: any) {
        console.error('Failed to stream Drive thumbnail via drive_file_id:', err?.message);
      }

      if (asset.thumbnail_url) {
        try {
          const thumbStream = await getDriveThumbnailStream(asset.thumbnail_url, req.signal, asset.drive_file_id);
          if (thumbStream && thumbStream.body) {
            const headers = new Headers(thumbStream.headers);
            return new Response(thumbStream.body, { status: thumbStream.status, headers });
          }
        } catch (err: any) {
          console.error('Failed to stream Drive thumbnail via url fallback:', err?.message);
        }
      }

      // 2. If it's an image, streaming the image file directly is valid
      if (asset.file_type === 'image' || asset.mime_type?.startsWith('image/')) {
        try {
          const streamRes = await streamFile(asset.drive_file_id, null, req.signal);
          const headers = new Headers(streamRes.headers);
          headers.set('Cache-Control', 'public, max-age=86400');
          return new Response(streamRes.body, { status: streamRes.status, headers });
        } catch (err: any) {
          console.error('Failed to stream Drive image thumbnail:', err?.message);
        }
      }
    }

    // B. Check dedicated thumbnail fields in Supabase
    const thumbPath = asset.thumbnail_storage_path || (!isDirectWebUrl(asset.thumbnail_url) ? asset.thumbnail_url : null);

    if (thumbPath && supabase && getDataMode() === 'supabase') {
      const { data: signedThumb } = await supabase.storage
        .from('media-studio-assets')
        .createSignedUrl(thumbPath, 7200);

      if (signedThumb?.signedUrl) {
        return NextResponse.redirect(signedThumb.signedUrl, { status: 307 });
      }
    }

    // C. Non-Google direct web URLs (e.g. Unsplash, external CDN)
    if (isDirectWebUrl(asset.thumbnail_url) && !asset.thumbnail_url?.includes('googleusercontent.com')) {
      return NextResponse.redirect(asset.thumbnail_url!, { status: 307 });
    }

    // D. For videos without dedicated thumbnails, strictly forbid streaming the video file
    if (asset.file_type === 'video' || asset.mime_type?.startsWith('video/')) {
      if (getDataMode() === 'demo') {
        return NextResponse.redirect('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=400&q=80', { status: 307 });
      }
      return NextResponse.json(
        { error: 'لا يتوفر مصغر معتمد لهذا الفيديو. تم حظر بث ملف الفيديو الكامل كمصغر.' },
        { status: 404 }
      );
    }

    if (getDataMode() === 'demo') {
      return NextResponse.redirect('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=400&q=80', { status: 307 });
    }

    return NextResponse.json({ error: 'لا يوجد مصغر معتمد لهذا الملف' }, { status: 404 });
  }

  // 3. Google Drive Delivery (Primary Storage & Archive)
  if (asset.drive_file_id) {
    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: 'الملف محفوظ في Google Drive ولكن اعتمادات الربط غير مهيأة أو منتهية على الخادم.' },
        { status: 503 }
      );
    }

    try {
      const rangeHeader = req.headers.get('range');
      const streamRes = await streamFile(asset.drive_file_id, rangeHeader, req.signal);

      const headers = new Headers(streamRes.headers);
      headers.set('Cache-Control', 'private, no-store');

      if (isDownload) {
        const filename = encodeURIComponent(asset.original_filename || asset.title || 'download');
        headers.set('Content-Disposition', `attachment; filename="${filename}"`);
      }

      return new Response(streamRes.body, {
        status: streamRes.status,
        headers,
      });
    } catch (streamErr: any) {
      console.error('Google Drive streaming error:', streamErr?.message);
      const isGrantError = streamErr?.message?.includes('INVALID_GRANT');
      return NextResponse.json(
        {
          error: isGrantError
            ? 'انتهت صلاحية تفويض Google Drive (وضع الاختبار 7 أيام). يرجى من المدير إعادة التفويض عبر لوحة الإدارة.'
            : 'تعذر الاتصال بـ Google Drive لبث الوسائط: يرجى التحقق من اتصال الخادم بالإنترنت وصلاحية الحساب.',
          details: streamErr?.message,
        },
        { status: isGrantError ? 503 : 502 }
      );
    }
  }

  // 4. Handle Main Asset / Media Video delivery (Legacy Supabase Storage Fallback)
  if (supabase && asset.storage_path && getDataMode() === 'supabase') {
    const downloadOptions = isDownload
      ? { download: asset.original_filename || asset.title }
      : undefined;

    const { data: signedData, error: signError } = await supabase.storage
      .from('media-studio-assets')
      .createSignedUrl(asset.storage_path, 7200, downloadOptions);

    if (signError || !signedData?.signedUrl) {
      console.error('Failed to issue signed URL for private asset:', signError);
      return NextResponse.json({ error: 'فشل استرجاع رابط الملف المحمي' }, { status: 500 });
    }

    return NextResponse.redirect(signedData.signedUrl, { status: 307 });
  }

  // Fallback for legacy external URLs or local development
  let targetUrl = asset.file_url;
  if (targetUrl?.includes('gtv-videos-bucket') || targetUrl?.includes('commondatastorage.googleapis.com')) {
    targetUrl = 'https://vjs.zencdn.net/v/oceans.mp4';
  }
  return NextResponse.redirect(targetUrl, { status: 307 });
}
