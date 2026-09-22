'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Project, Asset } from '@/lib/supabase/database.types';
import { AdminNavbar } from '@/components/admin/AdminNavbar';
import { MediaUploader } from '@/components/admin/MediaUploader';
import { formatFileSize, formatSeconds, getAssetTypeLabel } from '@/lib/utils/formatters';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Trash2,
  ArrowUp,
  ArrowDown,
  Edit2,
  Check,
  Film,
  FileArchive,
  FileText,
  Save,
  Upload,
  MessageSquare,
  CheckCircle2,
  Clock,
  RefreshCw,
  X,
  User,
  ExternalLink,
  Play,
  Cloud,
  Image as ImageIcon,
} from 'lucide-react';

interface ProjectAssetsManagerProps {
  project: Project;
  initialAssets: Asset[];
}

export const ProjectAssetsManager: React.FC<ProjectAssetsManagerProps> = ({
  project: initialProject,
  initialAssets,
}) => {
  const [project, setProject] = useState<Project>(initialProject);
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  const getAssetThumbnailUrl = (asset: Asset) => {
    if (failedThumbs[asset.id]) return null;
    if (asset.display_thumbnail_url) return asset.display_thumbnail_url;
    if (asset.drive_file_id) return `/api/media/${asset.id}?type=thumbnail`;
    if (asset.thumbnail_url && !asset.thumbnail_url.includes('googleusercontent.com')) return asset.thumbnail_url;
    if (asset.file_type === 'image') return asset.file_url;
    return null;
  };

  // Edit Project Details State
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description || '');
  const [progress, setProgress] = useState(project.progress);
  const [category, setCategory] = useState(project.category || '');
  const [coverUrl, setCoverUrl] = useState(project.cover_url || '');
  const [allowFeedback, setAllowFeedback] = useState(project.allow_feedback !== false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [projectSavedMsg, setProjectSavedMsg] = useState(false);

  // Handle Cover Upload
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', 'covers');

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && (data.storagePath || data.url)) {
        setCoverUrl(data.storagePath || data.url);
      } else {
        alert(data.error || 'فشل رفع صورة الغلاف');
      }
    } catch {
      alert('حدث خطأ أثناء رفع صورة الغلاف');
    } finally {
      setUploadingCover(false);
    }
  };

  // Edit Asset Title State
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingAssetTitle, setEditingAssetTitle] = useState('');

  // Feedback & Approvals Review State
  const [selectedFeedbackAsset, setSelectedFeedbackAsset] = useState<Asset | null>(null);
  const [refreshingAssets, setRefreshingAssets] = useState(false);
  const searchParams = useSearchParams();

  // Auto-scroll and open feedback modal if URL has ?assetId=...&openFeedback=true
  useEffect(() => {
    const targetAssetId = searchParams.get('assetId');
    const shouldOpenFeedback = searchParams.get('openFeedback') === 'true';

    if (targetAssetId && assets.length > 0) {
      const match = assets.find((a) => a.id === targetAssetId);
      if (match) {
        if (shouldOpenFeedback) {
          setSelectedFeedbackAsset(match);
        }
        setTimeout(() => {
          const el = document.getElementById(`asset-${targetAssetId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-studio-blue', 'ring-offset-2', 'ring-offset-studio-bg');
            setTimeout(() => {
              el.classList.remove('ring-2', 'ring-studio-blue', 'ring-offset-2', 'ring-offset-studio-bg');
            }, 3000);
          }
        }, 200);
      }
    }
  }, [searchParams, assets]);

  const handleRefreshAssets = async () => {
    setRefreshingAssets(true);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.assets) {
          setAssets(data.assets);
          if (selectedFeedbackAsset) {
            const fresh = data.assets.find((a: Asset) => a.id === selectedFeedbackAsset.id);
            if (fresh) setSelectedFeedbackAsset(fresh);
          }
        }
      }
    } catch (err) {
      console.error('Refresh assets error:', err);
    } finally {
      setRefreshingAssets(false);
    }
  };

  // Save Project Details
  const handleSaveProjectDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProject(true);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          progress: Number(progress),
          category,
          cover_url: coverUrl,
          allow_feedback: allowFeedback,
        }),
      });

      if (res.ok) {
        const { project: updated } = await res.json();
        setProject(updated);
        setProjectSavedMsg(true);
        setTimeout(() => setProjectSavedMsg(false), 2500);
      }
    } catch {
      alert('فشل حفظ التعديلات');
    } finally {
      setSavingProject(false);
    }
  };

  // Toggle Asset Visibility
  const handleToggleAssetVisibility = async (asset: Asset) => {
    const nextVal = !asset.is_visible;
    const res = await fetch(`/api/admin/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_visible: nextVal }),
    });

    if (res.ok) {
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, is_visible: nextVal } : a))
      );
    }
  };

  // Change Asset Version (V1, V2, V3, Final)
  const handleChangeVersion = async (asset: Asset, newVersion: string) => {
    const res = await fetch(`/api/admin/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: newVersion }),
    });

    if (res.ok) {
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, version: newVersion } : a))
      );
    }
  };

  // Save Asset Renaming
  const handleSaveAssetTitle = async (assetId: string) => {
    if (!editingAssetTitle.trim()) return;

    const res = await fetch(`/api/admin/assets/${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editingAssetTitle.trim() }),
    });

    if (res.ok) {
      setAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, title: editingAssetTitle.trim() } : a))
      );
      setEditingAssetId(null);
    }
  };

  // Reorder Assets (Move Up / Down)
  const handleMoveAsset = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= assets.length) return;

    const newAssets = [...assets];
    const temp = newAssets[index];
    newAssets[index] = newAssets[targetIndex];
    newAssets[targetIndex] = temp;

    setAssets(newAssets);

    // Save order
    const orderedIds = newAssets.map((a) => a.id);
    await fetch('/api/admin/assets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    });
  };

  // Delete Asset
  const handleDeleteAsset = async (assetId: string, assetTitle: string) => {
    if (!confirm(`هل أنت متأكد من حذف الملف "${assetTitle}"؟`)) return;

    const res = await fetch(`/api/admin/assets/${assetId}`, { method: 'DELETE' });
    if (res.ok) {
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    }
  };

  return (
    <div className="min-h-screen bg-studio-bg flex flex-col">
      <AdminNavbar />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-studio-surface px-3 py-1.5 text-xs text-studio-text-secondary hover:text-white transition"
            >
              <ArrowRight className="h-4 w-4" />
              <span>المشاريع</span>
            </Link>
            <span className="text-studio-text-muted text-xs">/</span>
            <h1 className="text-lg sm:text-xl font-bold text-white truncate max-w-sm sm:max-w-md">
              {project.title}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-studio-surface px-3 py-1 text-xs text-studio-gold border border-white/5 font-mono font-bold">
              {assets.length} ملف
            </span>
          </div>
        </div>

        {/* Project Quick Edit Details Form */}
        <div className="glass-card mb-8 rounded-2xl border border-white/10 p-6 shadow-xl">
          <form onSubmit={handleSaveProjectDetails} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-white mb-1.5">اسم المشروع</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-studio-surface px-3 py-2 text-xs text-white outline-none focus:border-studio-blue"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-white mb-1.5">التصنيف</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-studio-surface px-3 py-2 text-xs text-white outline-none focus:border-studio-blue"
                />
              </div>

              {/* Progress Slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-white">نسبة الإنجاز (0–100%)</label>
                  <span className="text-xs font-mono font-bold text-studio-gold">{progress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full accent-studio-blue cursor-pointer"
                />
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-gradient-to-r from-studio-blue to-studio-gold rounded-full transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Cover URL */}
              <div>
                <label className="block text-xs font-semibold text-white mb-1.5">صورة الغلاف</label>
                <div className="flex gap-2 items-center">
                  {coverUrl && (
                    <div className="relative h-9 w-14 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-black group/cover">
                      <img
                        src={coverUrl}
                        alt="Cover"
                        className="h-full w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <button
                        type="button"
                        onClick={() => setCoverUrl('')}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center text-red-400 transition"
                        title="إزالة الغلاف"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <input
                    type="text"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://... أو رفع صورة"
                    className="flex-1 rounded-xl border border-white/10 bg-studio-surface px-3 py-2 text-xs text-white outline-none focus:border-studio-blue"
                  />
                  <label className="flex items-center justify-center gap-1.5 cursor-pointer rounded-xl border border-white/10 bg-studio-surface px-3 py-2 text-xs font-semibold text-studio-text-secondary hover:bg-studio-card hover:text-white transition shrink-0">
                    <Upload className="h-3.5 w-3.5 text-studio-blue-glow" />
                    <span>{uploadingCover ? '...' : 'رفع'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCoverUpload}
                      disabled={uploadingCover}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* نمط التفاعل والملفات */}
            <div className="rounded-xl border border-white/10 bg-studio-surface/50 p-3">
              <label className="block text-xs font-semibold text-white mb-2">
                طريقة عرض ملفات المشروع للعميل
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAllowFeedback(true)}
                  className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-right transition ${
                    allowFeedback
                      ? 'border-studio-blue bg-studio-blue/15 text-white'
                      : 'border-white/5 bg-studio-surface text-studio-text-secondary hover:border-white/20'
                  }`}
                >
                  <MessageSquare className={`h-4 w-4 mt-0.5 shrink-0 ${allowFeedback ? 'text-studio-blue-glow' : 'text-white/40'}`} />
                  <div>
                    <div className="text-xs font-bold">تفاعلي: مراجعة واعتماد</div>
                    <div className="text-[11px] text-white/50 mt-0.5">
                      إتاحة كتابة الملاحظات الزمنية، أزرار الاعتماد، وإصدارات الملفات (V1).
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAllowFeedback(false)}
                  className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-right transition ${
                    !allowFeedback
                      ? 'border-amber-500 bg-amber-500/15 text-white'
                      : 'border-white/5 bg-studio-surface text-studio-text-secondary hover:border-white/20'
                  }`}
                >
                  <Eye className={`h-4 w-4 mt-0.5 shrink-0 ${!allowFeedback ? 'text-amber-400' : 'text-white/40'}`} />
                  <div>
                    <div className="text-xs font-bold">للعرض والتحميل والمشاركة فقط</div>
                    <div className="text-[11px] text-white/50 mt-0.5">
                      عرض الصور والفيديوهات بحجم كامل بدون خانة الملاحظات أو الاعتماد أو V1.
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Description & Save Button */}
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-white mb-1.5">الوصف المختصر</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-studio-surface px-3 py-2 text-xs text-white outline-none focus:border-studio-blue"
                />
              </div>
              <button
                type="submit"
                disabled={savingProject}
                className="flex items-center gap-2 rounded-xl bg-studio-blue hover:bg-studio-blue-glow px-5 py-2 text-xs font-semibold text-white shadow-md shadow-studio-blue/20 transition disabled:opacity-50"
              >
                {savingProject ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    <span>حفظ بيانات المشروع</span>
                  </>
                )}
              </button>
            </div>

            {projectSavedMsg && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                <span>تم حفظ تعديلات المشروع بنجاح</span>
              </div>
            )}
          </form>
        </div>

        {/* Media Uploader Box */}
        <div className="mb-8">
          <MediaUploader
            projectId={project.id}
            onUploadSuccess={(newAsset) => setAssets((prev) => [...prev, newAsset])}
          />
        </div>

        {/* Assets Management Table / List */}
        <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-xl">
          <div className="border-b border-white/5 bg-studio-surface px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-white">ملفات الوسائط ({assets.length})</h3>
              <button
                type="button"
                onClick={handleRefreshAssets}
                disabled={refreshingAssets}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-studio-text-secondary hover:text-white hover:border-studio-blue/40 transition disabled:opacity-50"
                title="تحديث قائمة الملاحظات والاعتمادات"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshingAssets ? 'animate-spin text-studio-blue-glow' : 'text-studio-blue-glow'}`} />
                <span>{refreshingAssets ? 'جارٍ التحديث...' : 'تحديث الملاحظات والاعتماد'}</span>
              </button>
            </div>
            <span className="text-xs text-studio-text-muted">
              يمكنك متابعة اعتمادات العميل وطلبات التعديل، وتغيير النسخة وتحديد الظهور
            </span>
          </div>

          {assets.length > 0 ? (
            <div className="divide-y divide-white/5 p-2 sm:p-4 space-y-2">
              {assets.map((asset, index) => {
                const thumbUrl = getAssetThumbnailUrl(asset);
                const approvedList = asset.approvals?.filter((a) => a.approved) || [];
                const commentsCount = asset.comments?.length || 0;

                return (
                  <div
                    key={asset.id}
                    id={`asset-${asset.id}`}
                    className={`group flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-3.5 sm:p-4 transition-all duration-200 rounded-xl border ${
                      !asset.is_visible
                        ? 'bg-red-500/5 border-red-500/20 opacity-75'
                        : 'bg-studio-surface/40 hover:bg-studio-surface/80 border-white/5 hover:border-studio-blue/30 shadow-sm'
                    }`}
                  >
                    {/* Left: Thumbnail & Details */}
                    <div className="flex items-center gap-3.5 sm:gap-4 flex-1 min-w-0">
                      {/* 16:9 Thumbnail Container */}
                      <div className="relative aspect-video w-28 sm:w-36 flex-shrink-0 overflow-hidden rounded-xl bg-black/40 border border-white/10 group-hover:border-studio-blue/50 transition-colors flex items-center justify-center shadow-inner">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={asset.title}
                            referrerPolicy="no-referrer"
                            onError={() => setFailedThumbs((prev) => ({ ...prev, [asset.id]: true }))}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : asset.file_type === 'video' ? (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-studio-blue/15 to-studio-surface">
                            <Film className="h-6 w-6 text-studio-blue-glow" />
                          </div>
                        ) : asset.title.endsWith('.zip') || asset.title.endsWith('.rar') ? (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-amber-500/15 to-studio-surface">
                            <FileArchive className="h-6 w-6 text-amber-400" />
                          </div>
                        ) : asset.file_type === 'image' ? (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-emerald-500/15 to-studio-surface">
                            <ImageIcon className="h-6 w-6 text-emerald-400" />
                          </div>
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-studio-surface">
                            <FileText className="h-6 w-6 text-studio-text-muted" />
                          </div>
                        )}

                        {/* Video Overlay Badge */}
                        {asset.file_type === 'video' && (
                          <div className="absolute inset-0 flex items-end justify-between p-1.5 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none">
                            <div className="rounded-md bg-black/85 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-mono font-medium text-white flex items-center gap-1 shadow">
                              <Play className="h-2.5 w-2.5 fill-current text-studio-blue-glow" />
                              {asset.duration_seconds ? formatSeconds(asset.duration_seconds) : 'فيديو'}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Title & Metadata */}
                      <div className="flex-1 min-w-0">
                        {editingAssetId === asset.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingAssetTitle}
                              onChange={(e) => setEditingAssetTitle(e.target.value)}
                              className="w-full max-w-sm rounded-lg border border-studio-blue bg-studio-surface px-2.5 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-studio-blue"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveAssetTitle(asset.id);
                                if (e.key === 'Escape') setEditingAssetId(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveAssetTitle(asset.id)}
                              className="rounded-lg bg-studio-blue p-1.5 text-white hover:bg-studio-blue-glow transition"
                              title="حفظ"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAssetId(null)}
                              className="rounded-lg bg-white/10 p-1.5 text-studio-text-muted hover:text-white transition"
                              title="إلغاء"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group/title">
                            <span className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                              {asset.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAssetId(asset.id);
                                setEditingAssetTitle(asset.title);
                              }}
                              className="opacity-0 group-hover/title:opacity-100 text-studio-text-muted hover:text-white p-1 transition"
                              title="إعادة تسمية الملف"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] text-studio-text-muted">
                          <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 font-medium text-studio-text-secondary border border-white/5">
                            {getAssetTypeLabel(asset.file_type)}
                          </span>
                          <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 font-mono text-studio-text-muted border border-white/5">
                            {formatFileSize(asset.file_size)}
                          </span>
                          {asset.duration_seconds && (
                            <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 font-mono text-studio-text-muted border border-white/5">
                              {formatSeconds(asset.duration_seconds)}
                            </span>
                          )}
                          {asset.drive_file_id && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 font-sans text-studio-blue-glow border border-blue-500/20 text-[10px]" title="مخزن على Google Drive">
                              <Cloud className="h-3 w-3" />
                              <span>Google Drive</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Grouped Controls */}
                    <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 justify-end pt-3 lg:pt-0 border-t border-white/5 lg:border-t-0">
                      {/* Client Interaction Group */}
                      <div className="flex items-center gap-2">
                        {/* Approval Badge */}
                        {approvedList.length > 0 ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-400 shadow-sm"
                            title={`معتمد بواسطة: ${approvedList.map((a) => a.viewer_name).join('، ')}`}
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            <span className="truncate max-w-[120px]">معتمد ({approvedList[0].viewer_name})</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-studio-text-muted"
                            title="لم يتم اعتماد هذا الملف بعد"
                          >
                            <Clock className="h-4 w-4 text-studio-text-muted shrink-0" />
                            <span>بانتظار الاعتماد</span>
                          </span>
                        )}

                        {/* Comments Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedFeedbackAsset(asset)}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition shadow-sm ${
                            commentsCount > 0
                              ? 'border-blue-500/40 bg-blue-500/20 text-studio-blue-glow hover:bg-studio-blue/30 hover:border-studio-blue'
                              : 'border-white/10 bg-white/5 text-studio-text-muted hover:border-white/20 hover:text-white'
                          }`}
                          title="استعراض الملاحظات وطلبات التعديل"
                        >
                          <MessageSquare className={`h-4 w-4 ${commentsCount > 0 ? 'text-studio-blue-glow' : 'text-white/40'}`} />
                          <span>{commentsCount > 0 ? `${commentsCount} ملاحظة` : 'الملاحظات'}</span>
                        </button>
                      </div>

                      <div className="h-6 w-px bg-white/10 hidden sm:block" />

                      {/* Asset Management Group */}
                      <div className="flex items-center gap-2">
                        {/* Version Selector */}
                        <select
                          value={asset.version || 'V1'}
                          onChange={(e) => handleChangeVersion(asset, e.target.value)}
                          className="rounded-xl border border-white/10 bg-studio-surface px-3 py-1.5 text-xs font-bold text-studio-gold outline-none hover:border-studio-gold/40 transition cursor-pointer"
                        >
                          <option value="V1">V1</option>
                          <option value="V2">V2</option>
                          <option value="V3">V3</option>
                          <option value="Final">Final</option>
                        </select>

                        {/* Visibility Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleAssetVisibility(asset)}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium border transition ${
                            asset.is_visible
                              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                              : 'border-red-500/30 bg-red-500/15 text-red-400 hover:bg-red-500/25'
                          }`}
                          title={asset.is_visible ? 'إخفاء عن العميل' : 'إظهار للعميل'}
                        >
                          {asset.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          <span className="hidden sm:inline">{asset.is_visible ? 'ظاهر' : 'مخفي'}</span>
                        </button>

                        {/* Reordering */}
                        <div className="flex items-center rounded-xl border border-white/10 bg-studio-surface overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleMoveAsset(index, 'up')}
                            disabled={index === 0}
                            className="p-1.5 text-studio-text-muted hover:bg-white/10 hover:text-white transition disabled:opacity-20"
                            title="تحريك لأعلى"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <div className="h-4 w-px bg-white/10" />
                          <button
                            type="button"
                            onClick={() => handleMoveAsset(index, 'down')}
                            disabled={index === assets.length - 1}
                            className="p-1.5 text-studio-text-muted hover:bg-white/10 hover:text-white transition disabled:opacity-20"
                            title="تحريك لأسفل"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset(asset.id, asset.title)}
                          className="rounded-xl p-2 text-studio-text-muted hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 border border-transparent transition"
                          title="حذف الملف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-studio-text-muted">
              لا توجد ملفات مرفوعة في هذا المشروع بعد. استخدم صندوق الرفع أعلاه لإضافة أول ملف.
            </div>
          )}
        </div>

        {/* Feedback & Comments Modal */}
        {selectedFeedbackAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="glass-card relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 p-6 shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-studio-blue/15 text-studio-blue-glow border border-studio-blue/20 shrink-0">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>ملاحظات واعتماد الملف:</span>
                      <span className="text-studio-blue-glow truncate">{selectedFeedbackAsset.title}</span>
                    </h3>
                    <span className="text-[11px] text-studio-text-muted font-mono">
                      النسخة: {selectedFeedbackAsset.version || 'V1'} • النوع: {getAssetTypeLabel(selectedFeedbackAsset.file_type)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedFeedbackAsset(null)}
                  className="rounded-lg p-1.5 text-studio-text-muted hover:bg-white/10 hover:text-white transition shrink-0"
                  title="إغلاق"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                {/* Approval Status Card */}
                <div className="rounded-xl border border-white/10 bg-studio-surface/60 p-3.5 text-xs">
                  {(() => {
                    const approvedList = selectedFeedbackAsset.approvals?.filter((a) => a.approved) || [];
                    if (approvedList.length > 0) {
                      return (
                        <div className="flex items-start gap-2.5 text-emerald-400">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-bold text-xs">تم اعتماد هذا الملف من قبل العميل</div>
                            <div className="mt-1 space-y-1 text-[11px] text-emerald-400/90">
                              {approvedList.map((app) => (
                                <div key={app.id}>
                                  • العميل: <span className="font-bold text-white">{app.viewer_name}</span>
                                  {app.updated_at && (
                                    <span className="text-white/60 mr-2">
                                      (بتاريخ {new Date(app.updated_at).toLocaleDateString('ar-SA')} - {new Date(app.updated_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center gap-2 text-studio-text-muted">
                        <Clock className="h-4 w-4 shrink-0 text-amber-400/80" />
                        <span>حالة الاعتماد: <span className="text-amber-400/90 font-semibold">بانتظار اعتماد العميل</span></span>
                      </div>
                    );
                  })()}
                </div>

                {/* Revision Comments Section */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>طلبات التعديل والملاحظات</span>
                      <span className="rounded-full bg-studio-blue/20 px-2 py-0.5 text-[10px] text-studio-blue-glow font-bold">
                        {selectedFeedbackAsset.comments?.length || 0}
                      </span>
                    </h4>
                  </div>

                  {selectedFeedbackAsset.comments && selectedFeedbackAsset.comments.length > 0 ? (
                    <div className="space-y-2.5">
                      {selectedFeedbackAsset.comments.map((comment) => (
                        <div
                          key={comment.id}
                          className="rounded-xl border border-white/5 bg-studio-surface/80 p-3 text-xs hover:border-studio-blue/30 transition"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-white text-[10px] font-bold shrink-0">
                                <User className="h-3 w-3" />
                              </div>
                              <span className="font-bold text-white">{comment.author_name}</span>
                              {comment.timestamp_seconds !== null && comment.timestamp_seconds !== undefined && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-studio-blue/20 border border-studio-blue/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-studio-blue-glow">
                                  <span>⏱️</span>
                                  <span>{formatSeconds(comment.timestamp_seconds)}</span>
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-studio-text-muted shrink-0">
                              {new Date(comment.created_at).toLocaleDateString('ar-SA')}{' '}
                              {new Date(comment.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-studio-text-secondary whitespace-pre-wrap leading-relaxed bg-black/20 rounded-lg p-2.5 border border-white/5">
                            {comment.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-studio-surface/30 p-8 text-center">
                      <MessageSquare className="h-8 w-8 text-studio-text-muted opacity-30 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-white/80">لا توجد ملاحظات مسجلة لهذا الملف بعد</p>
                      <p className="text-[11px] text-studio-text-muted mt-1">
                        عند قيام العميل بكتابة أي ملاحظة أو طلب تعديل، ستظهر هنا فوراً مع التوقيت المختار في الفيديو.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <div>
                  {selectedFeedbackAsset.playback_url || selectedFeedbackAsset.file_url ? (
                    <a
                      href={selectedFeedbackAsset.playback_url || selectedFeedbackAsset.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-studio-blue-glow hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>فتح ومعاينة الملف في نافذة جديدة</span>
                    </a>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedFeedbackAsset(null)}
                  className="rounded-xl border border-white/10 bg-studio-surface px-4 py-1.5 text-xs font-semibold text-studio-text-secondary hover:text-white transition"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
