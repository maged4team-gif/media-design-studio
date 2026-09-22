'use client';

import React from 'react';
import { Tv, Search, Shield, LogOut } from 'lucide-react';

interface StudioHeaderProps {
  viewerName?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  categories?: string[];
  activeCategory?: string;
  onCategoryChange?: (cat: string) => void;
  onLogout?: () => void;
  isAdmin?: boolean;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  viewerName,
  searchQuery = '',
  onSearchChange,
  categories = [],
  activeCategory = 'الكل',
  onCategoryChange,
  onLogout,
  isAdmin = false,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-studio-bg/90 backdrop-blur-xl transition-all">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        {/* Top Branding Row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Logo & Studio Identity */}
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-studio-blue to-studio-blue-subtle text-white shadow-lg shadow-studio-blue/20">
              <Tv className="h-6 w-6 stroke-[2.2]" />
              <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-studio-bg bg-studio-gold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white">
                  استوديو التصميم
                </span>
                <span className="rounded bg-studio-blue/15 px-2 py-0.5 text-[11px] font-semibold text-studio-blue-glow">
                  PORTFOLIO
                </span>
              </div>
              <p className="text-xs text-studio-text-muted">Broadcast & Motion Design Showcase</p>
            </div>
          </div>

          {/* User / Viewer Session Info & Actions */}
          <div className="flex items-center gap-3">
            {viewerName && (
              <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-studio-surface/80 px-3.5 py-1.5 text-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-white">{viewerName}</span>
              </div>
            )}

            {isAdmin ? (
              <span className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-studio-gold">
                <Shield className="h-3.5 w-3.5" />
                لوحة الإدارة
              </span>
            ) : null}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                aria-label="تسجيل الخروج من الجلسة"
                title="تسجيل الخروج"
                className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-studio-surface/60 px-3 py-1.5 text-xs text-studio-text-muted hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>خروج</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Category Filter Section */}
        {(onSearchChange || categories.length > 0) && (
          <div className="mt-4 flex flex-col gap-3 pt-3 border-t border-white/5 md:flex-row md:items-center md:justify-between">
            {/* Search Input */}
            {onSearchChange && (
              <div className="relative w-full md:w-80">
                <label htmlFor="studio-header-search" className="sr-only">
                  بحث في المشاريع
                </label>
                <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-text-muted" />
                <input
                  id="studio-header-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="بحث في المشاريع..."
                  className="w-full rounded-xl border border-white/10 bg-studio-surface py-2 pr-10 pl-4 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue focus:ring-1 focus:ring-studio-blue focus-visible:ring-2 focus-visible:ring-studio-blue"
                />
              </div>
            )}

            {/* Category Filter Pills */}
            {categories.length > 0 && onCategoryChange && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="تصفية المشاريع حسب التصنيف">
                <button
                  type="button"
                  aria-pressed={activeCategory === 'الكل'}
                  onClick={() => onCategoryChange('الكل')}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none ${
                    activeCategory === 'الكل'
                      ? 'bg-studio-blue text-white shadow-md shadow-studio-blue/25'
                      : 'bg-studio-surface text-studio-text-secondary hover:bg-studio-card hover:text-white'
                  }`}
                >
                  الكل
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={activeCategory === cat}
                    onClick={() => onCategoryChange(cat)}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none ${
                      activeCategory === cat
                        ? 'bg-studio-blue text-white shadow-md shadow-studio-blue/25'
                        : 'bg-studio-surface text-studio-text-secondary hover:bg-studio-card hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
