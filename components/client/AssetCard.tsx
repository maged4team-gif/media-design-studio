import React from 'react';
import { Asset } from '@/lib/supabase/database.types';
import { formatFileSize, formatSeconds, getAssetTypeLabel, formatClientMediaUrl } from '@/lib/utils/formatters';
import { ApprovalBadge } from './ApprovalBadge';
import {
  Play,
  Eye,
  Download,
  MessageSquare,
  FileCode,
  FileArchive,
  FileText,
  Share2,
} from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  slug: string;
  projectId: string;
  isApproved: boolean;
  onPreview: () => void;
  onCommentClick: () => void;
  onToggleApproval: () => void;
  approvalLoading?: boolean;
  allowFeedback?: boolean;
}

export const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  slug,
  projectId,
  isApproved,
  onPreview,
  onCommentClick,
  onToggleApproval,
  approvalLoading = false,
  allowFeedback = true,
}) => {
  const commentCount = asset.comments?.length || 0;

  const mediaDisplayUrl = formatClientMediaUrl(asset.playback_url, asset.id, slug);
  const downloadUrl = `/api/media/${asset.id}?slug=${encodeURIComponent(slug)}&download=1`;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = asset.original_filename || asset.title;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const renderFileIcon = () => {
    if (asset.title.endsWith('.zip') || asset.title.endsWith('.rar')) {
      return <FileArchive className="h-10 w-10 text-amber-400 opacity-80" />;
    }
    if (asset.title.endsWith('.aep') || asset.title.endsWith('.c4d') || asset.title.endsWith('.psd') || asset.title.endsWith('.ai')) {
      return <FileCode className="h-10 w-10 text-studio-blue-glow opacity-80" />;
    }
    return <FileText className="h-10 w-10 text-studio-text-muted opacity-80" />;
  };

  const thumbnailDisplay = asset.display_thumbnail_url
    ? formatClientMediaUrl(asset.display_thumbnail_url, asset.id, slug, { type: 'thumbnail' })
    : (asset.thumbnail_url && !asset.thumbnail_url.includes('googleusercontent.com') && (asset.thumbnail_url.startsWith('http') || asset.thumbnail_url.startsWith('/uploads/')))
    ? asset.thumbnail_url
    : formatClientMediaUrl(null, asset.id, slug, { type: 'thumbnail' });

  return (
    <div
      onClick={onPreview}
      className="glass-card group relative flex flex-col overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 hover:border-studio-blue/40"
    >
      {/* Thumbnail Area */}
      <div className="relative aspect-video w-full overflow-hidden bg-studio-surface">
        {asset.file_type === 'image' ? (
          <img
            src={thumbnailDisplay || mediaDisplayUrl}
            alt={asset.title}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : asset.file_type === 'video' ? (
          <div className="relative h-full w-full">
            <img
              src={thumbnailDisplay}
              alt={asset.title}
              referrerPolicy="no-referrer"
              onError={(e) => {
                // If thumbnail endpoint returns error/404, hide image gracefully
                e.currentTarget.style.display = 'none';
              }}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Play Button Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px] transition group-hover:bg-black/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-studio-blue/90 text-white shadow-lg shadow-studio-blue/40 transition-transform group-hover:scale-110">
                <Play className="h-5 w-5 fill-current translate-x-[-1px]" />
              </div>
            </div>
          </div>
        ) : (
          /* General File Preview Icon */
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-studio-surface to-studio-card">
            {renderFileIcon()}
            <span className="text-[11px] text-studio-text-muted font-medium">
              {formatFileSize(asset.file_size)}
            </span>
          </div>
        )}

        {/* Ambient Shadow */}
        <div className="absolute inset-0 bg-gradient-to-t from-studio-card via-transparent to-black/20" />

        {/* Top Badges: Version & Duration */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {allowFeedback && asset.version && (
            <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-studio-gold backdrop-blur-md border border-white/10">
              {asset.version}
            </span>
          )}
          <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-studio-text-secondary backdrop-blur-md border border-white/10">
            {getAssetTypeLabel(asset.file_type)}
          </span>
        </div>

        {/* Video Duration (bottom right) */}
        {asset.file_type === 'video' && asset.duration_seconds && (
          <div className="absolute bottom-2.5 right-2.5 rounded bg-black/70 px-2 py-0.5 text-[10px] font-mono text-white backdrop-blur-sm">
            {formatSeconds(asset.duration_seconds)}
          </div>
        )}
      </div>

      {/* Content & Actions Area */}
      <div className="flex flex-1 flex-col p-4">
        {/* Title */}
        <h4 className="text-sm font-semibold text-white transition-colors group-hover:text-studio-blue-glow line-clamp-1">
          {asset.title}
        </h4>

        {/* Meta details & Approval */}
        {allowFeedback && (
          <div className="mt-2.5 flex items-center justify-between text-xs">
            <ApprovalBadge
              approved={isApproved}
              onToggle={onToggleApproval}
              loading={approvalLoading}
            />

            {commentCount > 0 && (
              <div className="flex items-center gap-1 text-[11px] text-studio-text-muted">
                <MessageSquare className="h-3 w-3" />
                <span>{commentCount} ملاحظات</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons Toolbar */}
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/5 text-xs text-studio-text-secondary">
          {/* مشاهدة */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-studio-surface hover:text-white transition"
          >
            <Eye className="h-3.5 w-3.5 text-studio-blue-glow" />
            <span>مشاهدة</span>
          </button>

          {/* تحميل */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-studio-surface hover:text-white transition"
            title="تحميل الملف عبر الرابط المحمي"
          >
            <Download className="h-3.5 w-3.5" />
            <span>تحميل</span>
          </button>

          {/* ملاحظة */}
          {allowFeedback && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCommentClick();
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-studio-surface hover:text-white transition"
              title="كتابة ملاحظة"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>ملاحظة</span>
            </button>
          )}

          {/* مشاركة الرابط المحمي */}
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center rounded-lg p-1.5 hover:bg-studio-surface hover:text-white transition"
            title="مشاركة رابط الصفحة المحمية للملف"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
