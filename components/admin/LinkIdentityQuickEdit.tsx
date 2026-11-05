'use client';

import React, { useState } from 'react';
import { AlertCircle, Check, Palette } from 'lucide-react';
import type { AccessLink } from '@/lib/supabase/database.types';
import { LinkBrandingFields, describeLinkBranding, type LinkBrandingState } from './LinkBrandingFields';

type IdentityFields = Pick<AccessLink, 'branding_mode' | 'brand_name' | 'hide_viewer_name'>;

interface LinkIdentityQuickEditProps {
  link: AccessLink;
  /** Called with the saved identity so the parent can update its link list. */
  onSaved: (linkId: string, identity: IdentityFields) => void;
}

function toState(link: AccessLink): LinkBrandingState {
  return {
    brandingMode: link.branding_mode || 'studio',
    brandName: link.brand_name || '',
    hideViewerName: Boolean(link.hide_viewer_name),
  };
}

/**
 * Inline identity editor for one client link (used in the project "Share" window):
 * shows the current page identity and lets the admin switch it without leaving the page.
 */
export const LinkIdentityQuickEdit: React.FC<LinkIdentityQuickEditProps> = ({ link, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<LinkBrandingState>(() => toState(link));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const tags = describeLinkBranding(link);

  const handleOpen = () => {
    setValue(toState(link));
    setError('');
    setOpen(true);
  };

  const handleSave = async () => {
    if (saving) return;
    if (value.brandingMode === 'custom' && !value.brandName.trim()) {
      setError('يرجى كتابة الاسم المخصص الذي سيظهر للمستلم');
      return;
    }

    setSaving(true);
    setError('');
    const identity: IdentityFields = {
      branding_mode: value.brandingMode,
      brand_name: value.brandingMode === 'custom' ? value.brandName.trim() : null,
      hide_viewer_name: value.hideViewerName,
    };

    try {
      const res = await fetch(`/api/admin/links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandingMode: identity.branding_mode,
          brandName: identity.brand_name,
          hideViewerName: identity.hide_viewer_name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.error || 'تعذر حفظ هوية الصفحة');
        return;
      }
      onSaved(link.id, identity);
      setOpen(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch {
      setError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="text-[11px] text-studio-text-secondary">ما يراه العميل:</span>
          {tags.length > 0 ? (
            tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-[10px] font-semibold text-studio-text-muted">هوية الاستوديو • الاسم ظاهر</span>
          )}
          {justSaved && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-400">
              <Check className="h-3 w-3" />
              تم الحفظ
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleOpen}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-violet-300 transition hover:bg-violet-500/15 hover:text-white"
        >
          <Palette className="h-3 w-3" />
          <span>تغيير الهوية</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-violet-500/20 bg-violet-950/10 p-2.5">
      <LinkBrandingFields idPrefix={`share-${link.id}`} value={value} onChange={setValue} />

      {error && (
        <div role="alert" className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-[10px] text-studio-text-muted">
        يطبَّق على كل مشاريع هذا العميل، وعلى الرابط المباشر والعام معاً.
      </p>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="rounded-lg border border-white/10 bg-studio-surface px-3 py-1.5 text-[11px] font-semibold text-studio-text-secondary hover:text-white"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-studio-blue px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-studio-blue-glow disabled:opacity-50"
        >
          {saving ? 'جارٍ الحفظ...' : 'حفظ الهوية'}
        </button>
      </div>
    </div>
  );
};
