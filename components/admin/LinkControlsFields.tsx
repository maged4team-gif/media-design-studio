'use client';

import React, { useEffect, useState } from 'react';
import { CalendarClock, Download } from 'lucide-react';
import { isLinkExpired, linkAllowsDownload } from '@/lib/link-controls';

export interface LinkControlsState {
  /** ISO timestamp, or null when the link never expires. */
  expiresAt: string | null;
  allowDownload: boolean;
}

export const DEFAULT_LINK_CONTROLS: LinkControlsState = { expiresAt: null, allowDownload: true };

const QUICK_DAYS = [7, 30, 90];
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp → value for <input type="datetime-local"> in the admin's own timezone. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface LinkControlsFieldsProps {
  idPrefix: string;
  value: LinkControlsState;
  onChange: (next: LinkControlsState) => void;
}

/** Admin controls for a link's expiry date and download permission. */
export const LinkControlsFields: React.FC<LinkControlsFieldsProps> = ({ idPrefix, value, onChange }) => {
  const set = (patch: Partial<LinkControlsState>) => onChange({ ...value, ...patch });
  const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();
  const hasExpiry = value.expiresAt !== null;
  const isPast = value.expiresAt !== null && isLinkExpired({ expires_at: value.expiresAt });

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-studio-surface/60 p-3">
      <p className="text-xs font-bold text-white">التحكم في الرابط</p>

      <div>
        <label htmlFor={`${idPrefix}-has-expiry`} className="flex cursor-pointer items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span className={`rounded-lg border p-2 ${hasExpiry ? 'border-studio-blue/40 bg-studio-blue/20 text-studio-blue-glow' : 'border-white/10 bg-white/5 text-studio-text-muted'}`}>
              <CalendarClock className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-xs font-bold text-white">إيقاف الرابط تلقائياً</span>
              <span className="block text-[11px] text-studio-text-muted">
                بعد هذا الموعد لا يفتح الرابط، حتى لمن سجّل دخوله من قبل
              </span>
            </span>
          </span>
          <input
            id={`${idPrefix}-has-expiry`}
            type="checkbox"
            checked={hasExpiry}
            onChange={(e) => set({ expiresAt: e.target.checked ? inDays(7) : null })}
            className="h-4 w-4 cursor-pointer rounded border-white/20 bg-studio-surface text-studio-blue focus:ring-0"
          />
        </label>

        {hasExpiry && (
          <div className="mt-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => set({ expiresAt: inDays(days) })}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-studio-text-secondary transition hover:border-studio-blue/40 hover:text-white"
                >
                  بعد {days} {days <= 10 ? 'أيام' : 'يوماً'}
                </button>
              ))}
            </div>
            <label htmlFor={`${idPrefix}-expires-at`} className="sr-only">
              موعد انتهاء الرابط
            </label>
            <input
              id={`${idPrefix}-expires-at`}
              type="datetime-local"
              dir="ltr"
              value={value.expiresAt ? toLocalInputValue(value.expiresAt) : ''}
              onChange={(e) => {
                if (!e.target.value) return;
                const next = new Date(e.target.value);
                if (!Number.isNaN(next.getTime())) set({ expiresAt: next.toISOString() });
              }}
              className="w-full rounded-xl border border-white/10 bg-studio-surface px-3.5 py-2.5 text-xs text-white outline-none [color-scheme:dark] focus:border-studio-blue focus-visible:ring-2 focus-visible:ring-studio-blue"
            />
            {isPast && <p className="text-[11px] text-amber-300">هذا الموعد مضى، والرابط لا يفتح حالياً. اختر موعداً لاحقاً لإعادة فتحه.</p>}
          </div>
        )}
      </div>

      <div className="border-t border-white/5 pt-3">
        <label htmlFor={`${idPrefix}-allow-download`} className="flex cursor-pointer items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span className={`rounded-lg border p-2 ${value.allowDownload ? 'border-studio-blue/40 bg-studio-blue/20 text-studio-blue-glow' : 'border-white/10 bg-white/5 text-studio-text-muted'}`}>
              <Download className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-xs font-bold text-white">السماح بتحميل الملفات</span>
              <span className="block text-[11px] text-studio-text-muted">
                عند الإيقاف تُعرض الصور والفيديو والصوت وPDF داخل الصفحة فقط، ولا تفتح بقية الملفات
              </span>
            </span>
          </span>
          <input
            id={`${idPrefix}-allow-download`}
            type="checkbox"
            checked={value.allowDownload}
            onChange={(e) => set({ allowDownload: e.target.checked })}
            className="h-4 w-4 cursor-pointer rounded border-white/20 bg-studio-surface text-studio-blue focus:ring-0"
          />
        </label>
        {!value.allowDownload && (
          <p className="mt-2 text-[10px] leading-relaxed text-studio-text-muted">
            هذا يمنع التحميل العادي من الصفحة، لكنه لا يمنع تصوير الشاشة أو أدوات التنزيل المتخصصة. لا تعتمد عليه وحده مع الملفات الحساسة جداً.
          </p>
        )}
      </div>
    </div>
  );
};

/** Dates render after mount so the server's timezone never decides what the admin reads. */
function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat('ar', {
    calendar: 'gregory',
    numberingSystem: 'latn',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Admin tags for a link's controls: expiry state and blocked downloads. */
export const LinkControlTags: React.FC<{ link: { expires_at?: string | null; allow_download?: boolean } }> = ({ link }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const expired = mounted && isLinkExpired(link);
  const tagClass = 'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold';

  return (
    <>
      {link.expires_at && (
        <span className={`${tagClass} ${expired ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-sky-500/30 bg-sky-500/10 text-sky-300'}`}>
          {!mounted ? 'له موعد انتهاء' : expired ? 'انتهت صلاحيته' : `ينتهي ${formatExpiry(link.expires_at)}`}
        </span>
      )}
      {!linkAllowsDownload(link) && (
        <span className={`${tagClass} border-amber-500/30 bg-amber-500/10 text-amber-300`}>التحميل ممنوع</span>
      )}
    </>
  );
};
