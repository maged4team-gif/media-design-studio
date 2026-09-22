'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Project, Asset } from '@/lib/supabase/database.types';
import { StudioHeader } from '@/components/shared/StudioHeader';
import { AssetCard } from '@/components/client/AssetCard';
import { MediaLightbox } from '@/components/client/MediaLightbox';
import { ArrowRight, Film, Image as ImageIcon, FileText, LayoutGrid, AlertCircle } from 'lucide-react';

interface ProjectDetailViewProps {
  viewerName: string;
  linkId: string;
  slug: string;
  project: Project;
  initialAssets: Asset[];
  isDirect?: boolean;
}

type FilterTab = 'all' | 'video' | 'image' | 'file';

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  viewerName,
  linkId,
  slug,
  project,
  initialAssets,
  isDirect = false,
}) => {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [approvalLoadingId, setApprovalLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const progress = Math.min(100, Math.max(0, project.progress || 0));

  // Check URL query parameters for shared asset links: ?asset=...
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const assetParam = params.get('asset');
      if (assetParam) {
        const found = assets.find((a) => a.id === assetParam);
        if (found) {
          setSelectedAsset(found);
          setIsLightboxOpen(true);
        }
      }
    }
  }, [assets]);

  // Filter assets by tab
  const filteredAssets = useMemo(() => {
    if (activeTab === 'all') return assets;
    return assets.filter((a) => a.file_type === activeTab);
  }, [assets, activeTab]);

  const counts = useMemo(() => {
    return {
      all: assets.length,
      video: assets.filter((a) => a.file_type === 'video').length,
      image: assets.filter((a) => a.file_type === 'image').length,
      file: assets.filter((a) => a.file_type === 'file').length,
    };
  }, [assets]);

  // Open asset in lightbox
  const handleOpenPreview = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsLightboxOpen(true);
  };

  // Strict check: Approval bound to linkId, fallback to viewerName snapshot for legacy records
  const isAssetApproved = (asset: Asset): boolean => {
    const approval = asset.approvals?.find((app) =>
      app.access_link_id ? app.access_link_id === linkId : app.viewer_name === viewerName
    );
    return approval ? approval.approved : false;
  };

  // Toggle approval state with verified error handling
  const handleToggleApproval = async (asset: Asset) => {
    setApprovalLoadingId(asset.id);
    setErrorMessage(null);
    const currentlyApproved = isAssetApproved(asset);
    const nextState = !currentlyApproved;

    try {
      const res = await fetch('/api/client/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: asset.id,
          slug,
          approved: nextState,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر تحديث حالة الاعتماد');
      }

      const { approval } = data;
      // Update state matching strictly by access_link_id or viewer_name
      setAssets((prev) =>
        prev.map((a) => {
          if (a.id !== asset.id) return a;
          const otherApprovals =
            a.approvals?.filter((app) =>
              app.access_link_id ? app.access_link_id !== linkId : app.viewer_name !== viewerName
            ) || [];
          return {
            ...a,
            approvals: [...otherApprovals, approval],
          };
        })
      );

      if (selectedAsset && selectedAsset.id === asset.id) {
        setSelectedAsset((prev) => {
          if (!prev) return null;
          const otherApprovals =
            prev.approvals?.filter((app) =>
              app.access_link_id ? app.access_link_id !== linkId : app.viewer_name !== viewerName
            ) || [];
          return {
            ...prev,
            approvals: [...otherApprovals, approval],
          };
        });
      }
    } catch (err: any) {
      console.error('Failed to toggle approval:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء تعديل الاعتماد');
      // Auto clear error message after 4 seconds
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setApprovalLoadingId(null);
    }
  };

  // Add Comment (with optional video timestamp)
  const handleAddComment = async (text: string, timestampSeconds?: number | null) => {
    if (!selectedAsset) return;

    const res = await fetch('/api/client/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId: selectedAsset.id,
        slug,
        body: text,
        timestampSeconds,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'تعذر إرسال الملاحظة');
    }

    const { comment } = data;
    setAssets((prev) =>
      prev.map((a) => {
        if (a.id !== selectedAsset.id) return a;
        return {
          ...a,
          comments: [...(a.comments || []), comment],
        };
      })
    );

    setSelectedAsset((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        comments: [...(prev.comments || []), comment],
      };
    });
  };

  const [clientIsDirect, setClientIsDirect] = useState(isDirect);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('direct') === 'true' || params.get('direct') === '1') {
        setClientIsDirect(true);
      }
    }
  }, []);

  const isDirectLink = isDirect || clientIsDirect;

  const handleLogout = async () => {
    await fetch('/api/client/auth', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    router.push(isDirectLink ? `/p/${slug}/projects/${project.id}?direct=true` : `/p/${slug}`);
  };

  return (
    <div className="min-h-screen bg-studio-bg flex flex-col">
      {/* Studio Header */}
      <StudioHeader viewerName={viewerName} onLogout={handleLogout} />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Error notification banner if any operation fails */}
        {errorMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-400 animate-slide-up">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Top Hero Section */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-studio-surface shadow-2xl">
          {project.cover_url && (
            <div className="absolute inset-0 z-0 opacity-25">
              <img
                src={
                  project.display_cover_url ||
                  (project.cover_url.startsWith('http') || project.cover_url.startsWith('/uploads/')
                    ? project.cover_url
                    : `/api/media/cover/${project.id}?slug=${slug}`)
                }
                alt={project.title}
                className="h-full w-full object-cover blur-sm"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-studio-surface via-studio-surface/80 to-transparent" />
            </div>
          )}

          <div className="relative z-10 p-6 sm:p-8 md:p-10">
            {/* Back Button - Only shown when accessing via general link */}
            {!isDirectLink && (
              <div className="mb-6">
                <Link
                  href={`/p/${slug}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs font-semibold text-studio-text-secondary hover:text-white hover:bg-black/60 transition backdrop-blur-md"
                >
                  <ArrowRight className="h-4 w-4" />
                  <span>العودة للمشاريع</span>
                </Link>
              </div>
            )}

            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              {/* Project Meta Details */}
              <div className="max-w-2xl space-y-3">
                {project.category && (
                  <span className="inline-block rounded-md bg-studio-blue/20 px-3 py-1 text-xs font-semibold text-studio-blue-glow border border-studio-blue/30">
                    {project.category}
                  </span>
                )}
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                  {project.title}
                </h1>
                {project.description && (
                  <p className="text-sm sm:text-base leading-relaxed text-studio-text-secondary">
                    {project.description}
                  </p>
                )}
              </div>

              {/* Optional Progress Box */}
              {project.show_progress !== false && (
                <div className="w-full sm:w-72 rounded-2xl border border-white/10 bg-black/50 p-5 backdrop-blur-md">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-studio-text-secondary">نسبة الإنجاز</span>
                    <span className="text-lg font-bold text-white font-mono">{progress}%</span>
                  </div>
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-studio-blue via-studio-cyan to-studio-gold transition-all duration-700 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-left text-[11px] text-studio-text-muted">
                    {progress === 100 ? 'مكتمل ومعتمد' : 'قيد المراجعة والإنتاج'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === 'all'
                ? 'bg-studio-blue text-white shadow-lg shadow-studio-blue/25'
                : 'bg-studio-surface text-studio-text-secondary hover:bg-studio-card hover:text-white border border-white/5'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>الكل ({counts.all})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === 'video'
                ? 'bg-studio-blue text-white shadow-lg shadow-studio-blue/25'
                : 'bg-studio-surface text-studio-text-secondary hover:bg-studio-card hover:text-white border border-white/5'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            <span>الفيديوهات ({counts.video})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === 'image'
                ? 'bg-studio-blue text-white shadow-lg shadow-studio-blue/25'
                : 'bg-studio-surface text-studio-text-secondary hover:bg-studio-card hover:text-white border border-white/5'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>الصور ({counts.image})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === 'file'
                ? 'bg-studio-blue text-white shadow-lg shadow-studio-blue/25'
                : 'bg-studio-surface text-studio-text-secondary hover:bg-studio-card hover:text-white border border-white/5'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>الملفات ({counts.file})</span>
          </button>
        </div>

        {/* Project Assets Grid */}
        <div className="mt-6">
          {filteredAssets.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  slug={slug}
                  projectId={project.id}
                  isApproved={isAssetApproved(asset)}
                  onPreview={() => handleOpenPreview(asset)}
                  onCommentClick={() => handleOpenPreview(asset)}
                  onToggleApproval={() => handleToggleApproval(asset)}
                  approvalLoading={approvalLoadingId === asset.id}
                  allowFeedback={project.allow_feedback !== false}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-studio-surface/40 p-8 text-center">
              <Film className="h-12 w-12 text-studio-text-muted opacity-40 mb-3" />
              <h3 className="text-base font-bold text-white">لا توجد ملفات في هذا القسم</h3>
              <p className="mt-1 text-xs text-studio-text-secondary">
                لم يتم إدراج أي عناصر تندرج تحت تصنيف الفلتر المختار حالياً.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Media Review / Lightbox Modal */}
      <MediaLightbox
        asset={selectedAsset}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        viewerName={viewerName}
        slug={slug}
        projectId={project.id}
        isApproved={selectedAsset ? isAssetApproved(selectedAsset) : false}
        onToggleApproval={() => selectedAsset && handleToggleApproval(selectedAsset)}
        approvalLoading={selectedAsset ? approvalLoadingId === selectedAsset.id : false}
        onAddComment={handleAddComment}
        allowFeedback={project.allow_feedback !== false}
      />

      <footer className="mt-12 border-t border-white/5 bg-studio-bg py-6 text-center text-xs text-studio-text-muted">
        استوديو التصميم التلفزيوني والإعلامي • جميع الحقوق محفوظة
      </footer>
    </div>
  );
};
