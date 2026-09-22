'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { StudioNotification } from '@/lib/supabase/database.types';
import {
  Bell,
  MessageSquare,
  CheckCircle2,
  Clock,
  RefreshCw,
  FolderKanban,
  CheckCheck,
  ChevronLeft,
} from 'lucide-react';
import { formatSeconds } from '@/lib/utils/formatters';

const STORAGE_KEY = 'admin_last_read_notifications_time';

function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'الآن';
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays === 1) return 'أمس';
    if (diffDays < 7) return `منذ ${diffDays} أيام`;
    return new Date(dateStr).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const NotificationsDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<StudioNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastReadTime, setLastReadTime] = useState<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load last read time from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setLastReadTime(parseInt(stored, 10) || 0);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/notifications?limit=30');
      if (res.ok) {
        const data = await res.json();
        if (data.notifications) {
          setNotifications(data.notifications);
        }
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and polling every 25 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 25000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Unread count: notifications with created_at > lastReadTime
  const unreadCount = notifications.filter(
    (n) => new Date(n.created_at).getTime() > lastReadTime
  ).length;

  const handleMarkAllRead = () => {
    const now = Date.now();
    setLastReadTime(now);
    try {
      localStorage.setItem(STORAGE_KEY, now.toString());
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = (n: StudioNotification) => {
    handleMarkAllRead();
    setIsOpen(false);
    router.push(`/admin/projects/${n.project_id}?assetId=${n.asset_id}&openFeedback=true`);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) {
            fetchNotifications();
          }
        }}
        className={`relative flex items-center justify-center rounded-xl border p-2 transition ${
          isOpen
            ? 'border-studio-blue bg-studio-blue/20 text-white'
            : 'border-white/10 bg-studio-surface text-studio-text-secondary hover:border-white/20 hover:text-white'
        }`}
        title="التنبيهات والملاحظات الأخيرة"
      >
        <Bell className="h-4 w-4" />

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg shadow-red-500/50 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 sm:right-auto sm:left-0 mt-2 z-50 w-80 sm:w-96 rounded-2xl border border-white/10 bg-studio-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden animate-fade-in text-right">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white">التنبيهات والملاحظات</h3>
              {notifications.length > 0 && (
                <span className="rounded-full bg-studio-blue/20 px-2 py-0.5 text-[10px] font-bold text-studio-blue-glow">
                  {notifications.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[11px] text-studio-text-muted hover:text-white transition"
                  title="تحديد الكل كمقروء"
                >
                  <CheckCheck className="h-3 w-3" />
                  <span>تحديد كمقروء</span>
                </button>
              )}

              <button
                type="button"
                onClick={fetchNotifications}
                disabled={loading}
                className="text-studio-text-muted hover:text-white transition disabled:opacity-50 p-1"
                title="تحديث التنبيهات"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-studio-blue-glow' : ''}`} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 sm:max-h-96 overflow-y-auto divide-y divide-white/5 p-1">
            {notifications.length > 0 ? (
              notifications.map((n) => {
                const isUnread = new Date(n.created_at).getTime() > lastReadTime;

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-right p-3 rounded-xl flex items-start gap-3 transition group ${
                      isUnread
                        ? 'bg-studio-blue/10 hover:bg-studio-blue/15 border-r-2 border-r-studio-blue'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {/* Thumbnail / Cover */}
                    <div className="relative aspect-video w-12 sm:w-14 flex-shrink-0 overflow-hidden rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shadow-inner mt-0.5">
                      {n.asset_thumbnail_url || n.project_cover_url ? (
                        <img
                          src={n.asset_thumbnail_url || n.project_cover_url || ''}
                          alt={n.project_title}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <FolderKanban className="h-4 w-4 text-studio-text-muted opacity-50" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      {/* Project and Asset */}
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        <span className="truncate max-w-[110px] text-studio-gold">{n.project_title}</span>
                        <span className="text-white/30 text-[10px]">/</span>
                        <span className="truncate max-w-[120px] text-white/90 text-[11px]">{n.asset_title}</span>
                      </div>

                      {/* Content Snippet */}
                      <div className="mt-1 flex items-start gap-1.5 text-xs">
                        {n.type === 'comment' ? (
                          <MessageSquare className="h-3.5 w-3.5 text-studio-blue-glow shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-white/90 text-[11px]">{n.client_name}:</span>
                            {n.timestamp_seconds !== null && n.timestamp_seconds !== undefined && (
                              <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-mono font-bold text-amber-300">
                                ⏱️ {formatSeconds(n.timestamp_seconds)}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-studio-text-secondary line-clamp-1 mt-0.5">
                            {n.type === 'comment' ? `"${n.content}"` : n.content}
                          </p>
                        </div>
                      </div>

                      {/* Relative Time */}
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-studio-text-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          <span>{formatRelativeTime(n.created_at)}</span>
                        </span>
                        <span className="text-studio-blue-glow group-hover:translate-x-[-2px] transition-transform flex items-center gap-0.5 font-medium">
                          <span>عرض</span>
                          <ChevronLeft className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-studio-text-muted">
                <Bell className="h-6 w-6 mx-auto mb-2 opacity-30" />
                <span>لا توجد تنبيهات أو ملاحظات جديدة بعد</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
