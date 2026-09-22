'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Asset, Comment } from '@/lib/supabase/database.types';
import { formatFileSize, formatSeconds, formatArabicDate, getAssetTypeLabel, formatClientMediaUrl } from '@/lib/utils/formatters';
import { ApprovalBadge } from './ApprovalBadge';
import {
  X,
  Download,
  Share2,
  Clock,
  Send,
  MessageSquare,
  FileCode,
  FileArchive,
  FileText,
  User,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface MediaLightboxProps {
  asset: Asset | null;
  isOpen: boolean;
  onClose: () => void;
  viewerName: string;
  slug: string;
  projectId: string;
  isApproved: boolean;
  onToggleApproval: () => void;
  approvalLoading?: boolean;
  onAddComment: (text: string, timestampSeconds?: number | null) => Promise<void>;
  allowFeedback?: boolean;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  asset,
  isOpen,
  onClose,
  viewerName,
  slug,
  projectId,
  isApproved,
  onToggleApproval,
  approvalLoading = false,
  onAddComment,
  allowFeedback = true,
}) => {
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Video playback resilience state: loading, loaded, error
  const [videoState, setVideoState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [videoRetryKey, setVideoRetryKey] = useState(0);

  // Reset video state & start 10s fallback timeout when asset or retryKey changes
  useEffect(() => {
    if (asset?.file_type === 'video') {
      setVideoState('loading');
      const timer = setTimeout(() => {
        setVideoState((prev) => (prev === 'loading' ? 'error' : prev));
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [asset?.id, videoRetryKey, asset?.file_type]);

  const handleRetryVideo = () => {
    setVideoState('loading');
    setVideoRetryKey((k) => k + 1);
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !asset) return null;

  const downloadUrl = `/api/media/${asset.id}?slug=${encodeURIComponent(slug)}&download=1`;
  const mediaSrc = formatClientMediaUrl(asset.playback_url, asset.id, slug);

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentVideoTime(Math.floor(videoRef.current.currentTime));
    }
  };

  const handleJumpToTime = (seconds: number | null | undefined) => {
    if (seconds !== null && seconds !== undefined && videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleSubmitComment = async (e: React.FormEvent, useCurrentTimestamp: boolean = false) => {
    e.preventDefault();
    if (!commentText.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    setCommentError('');
    try {
      const timestamp = useCurrentTimestamp && asset.file_type === 'video' ? currentVideoTime : null;
      await onAddComment(commentText.trim(), timestamp);
      setCommentText(''); // Clear only on verified success
    } catch (err: any) {
      console.error('Failed to submit comment:', err);
      setCommentError(err?.message || 'تعذر إرسال الملاحظة. يرجى المحاولة مجدداً.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = asset.original_filename || asset.title;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    // Strict requirement: Share protected page view URL, NEVER the raw file URL
    const protectedUrl = `${window.location.origin}/p/${slug}/projects/${projectId}?asset=${asset.id}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(protectedUrl);
        alert('تم نسخ رابط الصفحة المحمية للملف إلى الحافظة');
      }
    } catch {
      alert(`الرابط المحمي: ${protectedUrl}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 md:p-6 animate-fade-in">
      {/* Modal Container */}
      <div className={`relative flex h-full max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-studio-surface shadow-2xl ${
        allowFeedback ? 'max-w-6xl lg:flex-row' : 'max-w-7xl'
      }`}>
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق نافذة المعاينة"
          className="absolute top-4 left-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-white/20 transition focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          title="إغلاق"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Media Display Area (Main Area) */}
        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-black/95">
          {asset.file_type === 'video' ? (
            <div className="relative flex h-full w-full items-center justify-center p-2">
              {/* Video Loading State */}
              {videoState === 'loading' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-sm animate-fade-in text-center p-4">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-studio-blue border-t-transparent" />
                  <p className="text-sm font-semibold text-white">جارٍ تجهيز مشغل الفيديو...</p>
                  <p className="text-xs text-studio-text-muted">يتم تحميل البث بجودة الاستوديو العالية</p>
                </div>
              )}

              {/* Video Error State with Retry & Direct Download */}
              {videoState === 'error' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/90 p-6 text-center animate-fade-in max-w-md mx-auto">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-400 border border-red-500/25 shadow-lg shadow-red-500/10">
                    <AlertCircle className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">تعذر تشغيل الفيديو</h3>
                    <p className="mt-1 text-xs text-studio-text-secondary leading-relaxed">
                      قد يكون تنسيق الفيديو غير مدعوم في المتصفح أو أن الاتصال بالخادم تعثر. يمكنك إعادة المحاولة أو تحميل الملف للمشاهدة المباشرة.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                    <button
                      type="button"
                      onClick={handleRetryVideo}
                      aria-label="إعادة محاولة تشغيل الفيديو"
                      className="flex items-center gap-1.5 rounded-xl bg-studio-blue px-4 py-2 text-xs font-semibold text-white shadow-md shadow-studio-blue/30 hover:bg-studio-blue-glow transition focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>إعادة المحاولة</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      aria-label={`تنزيل الملف للمشاهدة المباشرة: ${asset.title}`}
                      className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-studio-surface px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>تنزيل الملف المباشر</span>
                    </button>
                  </div>
                </div>
              )}

              <video
                key={`${asset.id}-${videoRetryKey}`}
                ref={videoRef}
                src={mediaSrc}
                controls
                playsInline
                onTimeUpdate={handleVideoTimeUpdate}
                onCanPlay={() => setVideoState('loaded')}
                onLoadedData={() => setVideoState('loaded')}
                onError={() => setVideoState('error')}
                className={`max-h-full max-w-full rounded-lg object-contain shadow-2xl transition-opacity duration-300 ${
                  videoState === 'loaded' ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
          ) : asset.file_type === 'image' ? (
            <div className="flex h-full w-full items-center justify-center p-4">
              <img
                src={mediaSrc}
                alt={asset.title}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
              {asset.title.endsWith('.zip') || asset.title.endsWith('.rar') ? (
                <FileArchive className="h-20 w-20 text-amber-400" />
              ) : asset.title.endsWith('.aep') || asset.title.endsWith('.c4d') ? (
                <FileCode className="h-20 w-20 text-studio-blue-glow" />
              ) : (
                <FileText className="h-20 w-20 text-studio-text-muted" />
              )}
              <h3 className="text-lg font-bold text-white max-w-md">{asset.title}</h3>
              <p className="text-sm text-studio-text-secondary">
                {getAssetTypeLabel(asset.file_type)} • {formatFileSize(asset.file_size)}
              </p>
              <button
                type="button"
                onClick={handleDownload}
                aria-label={`تحميل الملف: ${asset.title}`}
                className="flex items-center gap-2 rounded-xl bg-studio-blue px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-studio-blue/30 hover:bg-studio-blue-glow transition focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none"
              >
                <Download className="h-4 w-4" />
                <span>تحميل الملف عبر الرابط المحمي</span>
              </button>
            </div>
          )}

          {/* Bottom Overlay Action Bar on Media Player */}
          <div className="w-full flex items-center justify-between border-t border-white/5 bg-studio-card/80 px-5 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-white truncate max-w-[200px] sm:max-w-xs">
                {asset.title}
              </span>
              {allowFeedback && asset.version && (
                <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-studio-gold border border-white/10">
                  {asset.version}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Approval Toggle */}
              {allowFeedback && (
                <ApprovalBadge
                  approved={isApproved}
                  onToggle={onToggleApproval}
                  loading={approvalLoading}
                />
              )}

              {/* Download */}
              <button
                type="button"
                onClick={handleDownload}
                aria-label={`تحميل الملف: ${asset.title}`}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-studio-surface px-3 py-1.5 text-xs text-white hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none"
                title="تحميل الملف"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">تحميل</span>
              </button>

              {/* Share */}
              <button
                type="button"
                onClick={handleShare}
                aria-label={`مشاركة رابط الصفحة المحمية للملف: ${asset.title}`}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-studio-surface px-3 py-1.5 text-xs text-white hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none"
                title="مشاركة رابط الصفحة المحمية"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">مشاركة</span>
              </button>
            </div>
          </div>
        </div>

        {/* Comments & Review Sidebar */}
        {allowFeedback && (
          <div className="flex w-full flex-col border-t border-white/10 bg-studio-card lg:w-96 lg:border-t-0 lg:border-r">
          {/* Comments Header */}
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-studio-blue-glow" />
              <h4 className="text-sm font-bold text-white">الملاحظات والمراجعة</h4>
            </div>
            <span className="rounded-full bg-studio-surface px-2.5 py-0.5 text-xs text-studio-text-secondary">
              {asset.comments?.length || 0}
            </span>
          </div>

          {/* Comments Timeline */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {(!asset.comments || asset.comments.length === 0) ? (
              <div className="flex h-36 flex-col items-center justify-center text-center text-studio-text-muted">
                <MessageSquare className="h-8 w-8 opacity-30 mb-2" />
                <p className="text-xs">لا توجد ملاحظات حتى الآن</p>
                <p className="text-[11px] text-studio-text-muted/70 mt-1">
                  كن أول من يكتب تعليقاً أو يضيف ملاحظة توقيت
                </p>
              </div>
            ) : (
              asset.comments.map((comment: Comment) => {
                const isClient = comment.author_name === viewerName;
                return (
                  <div
                    key={comment.id}
                    className="rounded-xl border border-white/5 bg-studio-surface/80 p-3.5 transition hover:border-white/10"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                          isClient
                            ? 'bg-studio-blue/20 text-studio-blue-glow'
                            : 'bg-amber-500/20 text-studio-gold'
                        }`}>
                          <User className="h-3 w-3" />
                        </div>
                        <span className="font-semibold text-white">{comment.author_name}</span>
                      </div>

                      {/* Video Timestamp badge with interactive click-to-seek */}
                      {comment.timestamp_seconds !== null && comment.timestamp_seconds !== undefined && (
                        <button
                          type="button"
                          onClick={() => handleJumpToTime(comment.timestamp_seconds)}
                          className="flex items-center gap-1 rounded bg-studio-blue/20 px-2 py-0.5 text-[11px] font-mono font-medium text-studio-blue-glow hover:bg-studio-blue/30 transition"
                          title="الانتقال إلى هذه اللحظة في الفيديو"
                        >
                          <Clock className="h-3 w-3" />
                          <span>{formatSeconds(comment.timestamp_seconds)}</span>
                        </button>
                      )}
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-studio-text-secondary whitespace-pre-wrap">
                      {comment.body}
                    </p>

                    <div className="mt-2 text-[10px] text-studio-text-muted">
                      {formatArabicDate(comment.created_at)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Comment Input Form */}
          <div className="border-t border-white/5 bg-studio-surface/90 p-4">
            {commentError && (
              <div role="alert" aria-live="assertive" className="mb-2.5 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-400">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{commentError}</span>
              </div>
            )}

            <form onSubmit={(e) => handleSubmitComment(e, false)} noValidate className="space-y-2.5">
              <label htmlFor="lightbox-comment-text" className="sr-only">
                كتابة ملاحظة أو تعليق على الملف
              </label>
              <textarea
                id="lightbox-comment-text"
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value);
                  if (commentError) setCommentError('');
                }}
                placeholder={`أضف ملاحظتك باسم "${viewerName}"...`}
                rows={2}
                className="w-full resize-none rounded-xl border border-white/10 bg-studio-card p-3 text-xs text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue focus:ring-1 focus:ring-studio-blue focus-visible:ring-2 focus-visible:ring-studio-blue"
              />

              <div className="flex items-center justify-between gap-2">
                {/* Optional Timestamp Note Button (for videos) */}
                {asset.file_type === 'video' ? (
                  <button
                    type="button"
                    onClick={(e) => handleSubmitComment(e, true)}
                    disabled={!commentText.trim() || isSubmittingComment}
                    aria-label={`إضافة ملاحظة مقترنة بالتوقيت ${formatSeconds(currentVideoTime)}`}
                    className="flex items-center gap-1.5 rounded-lg border border-studio-blue/30 bg-studio-blue/10 px-2.5 py-1.5 text-[11px] font-medium text-studio-blue-glow hover:bg-studio-blue/20 transition disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none"
                    title={`إضافة ملاحظة عند ${formatSeconds(currentVideoTime)}`}
                  >
                    <Clock className="h-3 w-3" />
                    <span>ملاحظة عند {formatSeconds(currentVideoTime)}</span>
                  </button>
                ) : <div />}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={!commentText.trim() || isSubmittingComment}
                  aria-label="إرسال الملاحظة"
                  className="flex items-center gap-1.5 rounded-lg bg-studio-blue px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-studio-blue/20 hover:bg-studio-blue-glow transition disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none"
                >
                  <Send className="h-3 w-3 -scale-x-100" />
                  <span>{isSubmittingComment ? 'جارٍ الإرسال...' : 'إرسال'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};
