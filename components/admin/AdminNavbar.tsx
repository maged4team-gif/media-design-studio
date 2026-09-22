'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Tv, FolderKanban, Link2, PlusCircle, LogOut, Cloud } from 'lucide-react';
import { NotificationsDropdown } from './NotificationsDropdown';

export const AdminNavbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin/login');
    router.refresh();
  };

  const navItems = [
    { label: 'المشاريع', href: '/admin', icon: FolderKanban },
    { label: 'روابط العملاء', href: '/admin/links', icon: Link2 },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-studio-bg/95 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo & Section Title */}
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-studio-blue to-studio-blue-subtle text-white shadow-md shadow-studio-blue/20">
                <Tv className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">إدارة الاستوديو</span>
                  <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-studio-gold">
                    ADMIN
                  </span>
                </div>
                <p className="text-[11px] text-studio-text-muted">نظام إدارة المحتوى والروابط</p>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-studio-blue text-white shadow-md shadow-studio-blue/25'
                      : 'text-studio-text-secondary hover:bg-studio-surface hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* ربط Google Drive */}
            <a
              href="/api/admin/auth/google"
              className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-400 shadow-sm transition ml-2"
              title="ربط أو تجديد تفويض Google Drive"
            >
              <Cloud className="h-4 w-4" />
              <span className="hidden lg:inline">ربط Google Drive</span>
            </a>

            {/* مركز التنبيهات والملاحظات */}
            <div className="mx-1">
              <NotificationsDropdown />
            </div>

            {/* + مشروع جديد */}
            <Link
              href="/admin/projects/new"
              className="flex items-center gap-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition ml-1"
            >
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">+ مشروع جديد</span>
            </Link>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border border-white/5 bg-studio-surface px-3 py-2 text-xs text-studio-text-muted hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition ml-1"
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">خروج</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
