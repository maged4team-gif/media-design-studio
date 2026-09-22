'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, LogIn, LayoutDashboard } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Admin Boundary Error]:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-studio-bg flex flex-col items-center justify-center p-4 text-center">
      <div className="relative max-w-md w-full rounded-2xl border border-white/10 bg-studio-surface/80 backdrop-blur-xl p-8 shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/25 text-amber-400 mb-6 shadow-lg shadow-amber-500/10">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2">حدث تنبيه في لوحة الإدارة</h2>
        <p className="text-xs text-studio-text-secondary mb-6 leading-relaxed">
          واجه النظام خطأ غير متوقع أثناء تحميل البيانات. قد يعود ذلك إلى الاتصال بقاعدة البيانات أو الحاجة لتحديث الجلسة.
        </p>

        {error?.digest && (
          <div className="mb-6 rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-[11px] text-studio-text-muted font-mono select-all">
            Digest: {error.digest}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-studio-blue hover:bg-studio-blue-glow px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-studio-blue/20 transition"
          >
            <RefreshCw className="h-4 w-4" />
            <span>إعادة المحاولة</span>
          </button>

          <Link
            href="/admin"
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs font-medium text-white transition"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>العودة للوحة الإدارة</span>
          </Link>

          <Link
            href="/admin/login"
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-transparent text-studio-text-muted hover:text-white px-4 py-2 text-xs transition"
          >
            <LogIn className="h-4 w-4" />
            <span>تسجيل الدخول من جديد</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
