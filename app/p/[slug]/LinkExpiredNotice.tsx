import React from 'react';
import { Clock } from 'lucide-react';
import { STUDIO_BRAND, type LinkBranding } from '@/lib/branding';

/** Shown instead of any link content once the link's expiry date has passed. Follows the link's identity. */
export const LinkExpiredNotice: React.FC<{ branding: LinkBranding }> = ({ branding }) => {
  const brand = branding.showStudioIdentity ? STUDIO_BRAND.name : branding.brandName;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-studio-bg p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-400">
        <Clock className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-white">انتهت صلاحية هذا الرابط</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-studio-text-secondary">
        لم تعد الملفات متاحة عبر هذا الرابط. تواصل مع من أرسله إليك للحصول على رابط جديد.
      </p>
      {brand && <p className="mt-6 text-xs text-studio-text-muted">{brand}</p>}
    </div>
  );
};
