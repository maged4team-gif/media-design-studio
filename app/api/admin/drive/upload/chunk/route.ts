import { NextResponse } from 'next/server';
import { getAdminSession, extractCookieFromRequest } from '@/lib/auth/session';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import { uploadChunk, verifyUploadSessionTicket } from '@/lib/drive/client';

const MAX_CHUNK_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB max chunk limit per request

export async function PUT(req: Request) {
  if (!verifyRequestOrigin(req)) {
    return NextResponse.json({ error: 'طلب غير مصرح به (CSRF Mismatch)' }, { status: 403 });
  }

  const adminToken = extractCookieFromRequest(req, 'admin_session');
  const isAdmin = await getAdminSession(adminToken);
  if (!isAdmin || !adminToken) {
    return NextResponse.json({ error: 'غير مصرح للوصول لهذه العملية' }, { status: 401 });
  }

  const uploadToken = req.headers.get('x-upload-token');
  const contentRange = req.headers.get('content-range');

  if (!uploadToken || !contentRange) {
    return NextResponse.json(
      { error: 'الترويسات غير مكتملة (x-upload-token و content-range مطلوبة)' },
      { status: 400 }
    );
  }

  // 1. Verify and decode upload session ticket (anti-SSRF and admin binding)
  let ticket;
  try {
    ticket = verifyUploadSessionTicket(uploadToken, adminToken);
  } catch (ticketErr: any) {
    console.error('Upload ticket verification failed:', ticketErr?.message);
    return NextResponse.json(
      { error: ticketErr?.message || 'تذكرة جلسة الرفع غير صالحة أو منتهية الصلاحية' },
      { status: 403 }
    );
  }

  // 2. Validate Content-Range header syntax and bounds
  const rangeMatch = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/);
  if (!rangeMatch) {
    return NextResponse.json(
      { error: 'تنسيق Content-Range غير صالح. يجب أن يكون بالصيغة bytes START-END/TOTAL' },
      { status: 400 }
    );
  }

  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  const total = Number(rangeMatch[3]);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    start > end ||
    end >= total
  ) {
    return NextResponse.json(
      { error: 'قيم Content-Range غير صالحة حسابياً (يجب أن تحقق: 0 <= start <= end < total وأعداد صحيحة آمنة)' },
      { status: 400 }
    );
  }

  if (total !== ticket.fileSize) {
    return NextResponse.json(
      { error: `حجم الملف الكلي في Content-Range (${total}) لا يطابق الحجم المعتمد للجلسة (${ticket.fileSize})` },
      { status: 400 }
    );
  }

  const chunkLength = end - start + 1;
  if (chunkLength <= 0 || chunkLength > MAX_CHUNK_SIZE_BYTES) {
    return NextResponse.json(
      { error: `حجم الجزء المحدد (${chunkLength} بايت) يتجاوز الحد الأقصى المسموح به (${MAX_CHUNK_SIZE_BYTES} بايت)` },
      { status: 413 }
    );
  }

  // 3. Check Content-Length header if present before reading body
  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_CHUNK_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'حجم طلب الجزء يتجاوز الحد الأقصى المسموح به (16 ميغابايت)' },
        { status: 413 }
      );
    }
  }

  try {
    // Read body incrementally with a byte counter to enforce 16MB limit even without Content-Length
    if (!req.body) {
      return NextResponse.json({ error: 'جسم الطلب فارغ' }, { status: 400 });
    }

    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          bytesRead += value.byteLength;
          if (bytesRead > MAX_CHUNK_SIZE_BYTES) {
            await reader.cancel('PAYLOAD_TOO_LARGE');
            return NextResponse.json(
              { error: 'حجم طلب الجزء يتجاوز الحد الأقصى المسموح به (16 ميغابايت)' },
              { status: 413 }
            );
          }
          chunks.push(value);
        }
      }
    } catch (readErr: any) {
      if (readErr?.message === 'PAYLOAD_TOO_LARGE') {
        return NextResponse.json(
          { error: 'حجم طلب الجزء يتجاوز الحد الأقصى المسموح به (16 ميغابايت)' },
          { status: 413 }
        );
      }
      throw readErr;
    }

    const chunk = Buffer.concat(chunks.map((c) => Buffer.from(c)));

    if (chunk.length !== chunkLength) {
      return NextResponse.json(
        { error: `حجم البيانات الفعلي المقروء (${chunk.length}) لا يطابق مدى Content-Range (${chunkLength})` },
        { status: 400 }
      );
    }

    const result = await uploadChunk(ticket.sessionUrl, chunk, contentRange);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Chunk proxy error:', err?.message);
    return NextResponse.json(
      { error: err?.message || 'فشل نقل جزء الملف إلى Google Drive' },
      { status: 500 }
    );
  }
}
