'use client';

import React from 'react';
import { Tv, EyeOff, PenLine, UserX } from 'lucide-react';
import type { BrandingMode } from '@/lib/supabase/database.types';
import { BRAND_NAME_MAX_LENGTH, STUDIO_BRAND } from '@/lib/branding';

export interface LinkBrandingState {
  brandingMode: BrandingMode;
  brandName: string;
  hideViewerName: boolean;
}

export const DEFAULT_LINK_BRANDING: LinkBrandingState = {
  brandingMode: 'studio',
  brandName: '',
  hideViewerName: false,
};

const MODE_OPTIONS: { value: BrandingMode; label: string; hint: string; icon: React.ElementType }[] = [
  { value: 'studio', label: 'الاستوديو', hint: `يظهر اسم "${STUDIO_BRAND.name}" وشعاره`, icon: Tv },
  { value: 'neutral', label: 'محايد', hint: 'بدون أي اسم أو شعار، العنوان اسم المشروع فقط', icon: EyeOff },
  { value: 'custom', label: 'اسم مخصص', hint: 'اسم تكتبه أنت يظهر مكان اسم الاستوديو', icon: PenLine },
];

interface LinkBrandingFieldsProps {
  idPrefix: string;
  value: LinkBrandingState;
  onChange: (next: LinkBrandingState) => void;
}

/** Admin controls for a link's page identity (studio / neutral / custom) and viewer-name visibility. */
export const LinkBrandingFields: React.FC<LinkBrandingFieldsProps> = ({ idPrefix, value, onChange }) => {
  const set = (patch: Partial<LinkBrandingState>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-studio-surface/60 p-3">
      <fieldset>
        <legend className="mb-2 block text-xs font-bold text-white">هوية الصفحة عند المستلم</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = value.brandingMode === opt.value;
            return (
              <label
                key={opt.value}
                htmlFor={`${idPrefix}-branding-${opt.value}`}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-2.5 transition ${
                  active
                    ? 'border-studio-blue/60 bg-studio-blue/15'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <input
                    id={`${idPrefix}-branding-${opt.value}`}
                    type="radio"
                    name={`${idPrefix}-branding-mode`}
                    value={opt.value}
                    checked={active}
                    onChange={() => set({ brandingMode: opt.value })}
                    className="h-3.5 w-3.5 cursor-pointer accent-studio-blue"
                  />
                  <Icon className={`h-3.5 w-3.5 ${active ? 'text-studio-blue-glow' : 'text-studio-text-muted'}`} />
                  <span className="text-xs font-bold text-white">{opt.label}</span>
                </span>
                <span className="text-[10px] leading-snug text-studio-text-muted">{opt.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {value.brandingMode === 'custom' && (
        <div>
          <label htmlFor={`${idPrefix}-brand-name`} className="mb-1.5 block text-xs font-semibold text-white">
            الاسم الذي يظهر للمستلم <span className="text-red-400">*</span>
          </label>
          <input
            id={`${idPrefix}-brand-name`}
            type="text"
            value={value.brandName}
            maxLength={BRAND_NAME_MAX_LENGTH}
            onChange={(e) => set({ brandName: e.target.value })}
            placeholder="مثال: شركة الأفق، أو اسمك الشخصي"
            className="w-full rounded-xl border border-white/10 bg-studio-surface px-3.5 py-2.5 text-xs text-white outline-none focus:border-studio-blue focus-visible:ring-2 focus-visible:ring-studio-blue"
          />
        </div>
      )}

      <label htmlFor={`${idPrefix}-hide-viewer-name`} className="flex cursor-pointer items-center justify-between gap-3 border-t border-white/5 pt-3">
        <span className="flex items-center gap-2.5">
          <span
            className={`rounded-lg border p-2 ${
              value.hideViewerName
                ? 'border-studio-blue/40 bg-studio-blue/20 text-studio-blue-glow'
                : 'border-white/10 bg-white/5 text-studio-text-muted'
            }`}
          >
            <UserX className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-xs font-bold text-white">إخفاء اسم المستلم</span>
            <span className="block text-[11px] text-studio-text-muted">
              لا تظهر عبارة «مرحباً فلان» ولا الاسم في الصفحة. يبقى الاسم لك فقط في لوحة الإدارة
            </span>
          </span>
        </span>
        <input
          id={`${idPrefix}-hide-viewer-name`}
          type="checkbox"
          checked={value.hideViewerName}
          onChange={(e) => set({ hideViewerName: e.target.checked })}
          className="h-4 w-4 cursor-pointer rounded border-white/20 bg-studio-surface text-studio-blue focus:ring-0"
        />
      </label>
    </div>
  );
};

/** Short admin-card label describing a link's identity, or null for the default. */
export function describeLinkBranding(link: {
  branding_mode?: BrandingMode;
  brand_name?: string | null;
  hide_viewer_name?: boolean;
}): string[] {
  const tags: string[] = [];
  if (link.branding_mode === 'neutral') tags.push('هوية محايدة');
  if (link.branding_mode === 'custom') tags.push(link.brand_name ? `باسم: ${link.brand_name}` : 'هوية محايدة');
  if (link.hide_viewer_name) tags.push('الاسم مخفي');
  return tags;
}
