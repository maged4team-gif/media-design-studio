'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Project, AccessLink } from '@/lib/supabase/database.types';
import { AdminNavbar } from '@/components/admin/AdminNavbar';
import {
  FolderKanban,
  PlusCircle,
  Eye,
  EyeOff,
  Archive,
  ArchiveRestore,
  Trash2,
  FolderOpen,
  Edit,
  Check,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Share2,
  Copy,
  Link2,
  User,
  Globe,
  Lock,
  CheckSquare,
  Square,
} from 'lucide-react';

interface AdminProjectsViewProps {
  initialProjects: Project[];
  initialLinks?: (AccessLink & { project_ids: string[] })[];
  systemStatus?: {
    supabaseConfigured: boolean;
    dataMode: string;
    warning?: string;
  };
}

export const AdminProjectsView: React.FC<AdminProjectsViewProps> = ({
  initialProjects,
  initialLinks = [],
  systemStatus,
}) => {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [links] = useState<(AccessLink & { project_ids: string[] })[]>(initialLinks);
  const [showStatusBanner, setShowStatusBanner] = useState(true);
  const [editingProgressId, setEditingProgressId] = useState<string | null>(null);
  const [progressVal, setProgressVal] = useState<number>(0);
  const [filterArchived, setFilterArchived] = useState(false);
  const [driveBanner, setDriveBanner] = useState<{
    type: 'success' | 'error';
    message: string;
    refreshToken?: string;
    rootFolderId?: string;
  } | null>(null);
  const [sharingProject, setSharingProject] = useState<Project | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Batch & Safe Delete State
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [deleteModalProjects, setDeleteModalProjects] = useState<Project[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      alert(`القيمة: ${text}`);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('drive_connected') === 'true') {
        fetch('/api/admin/drive/credentials')
          .then((r) => r.json())
          .then((data) => {
            setDriveBanner({
              type: 'success',
              message: 'تم ربط حساب Google Drive بنجاح وتجهيز مجلد الأرشيف!',
              rootFolderId: data.root_folder_id,
            });
          })
          .catch(() => {
            setDriveBanner({ type: 'success', message: 'تم ربط حساب Google Drive بنجاح وتجهيز مجلد الأرشيف!' });
          });
      } else if (params.get('drive_error')) {
        setDriveBanner({ type: 'error', message: `خطأ في ربط Google Drive: ${params.get('drive_error')}` });
      }
    }
  }, []);

  // Toggle Visibility
  const handleToggleVisibility = async (project: Project) => {
    const nextVal = !project.is_visible;
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_visible: nextVal }),
    });

    if (res.ok) {
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, is_visible: nextVal } : p))
      );
    }
  };

  // Toggle Archive
  const handleToggleArchive = async (project: Project) => {
    const nextVal = !project.is_archived;
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: nextVal }),
    });

    if (res.ok) {
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, is_archived: nextVal } : p))
      );
    }
  };

  // Save Progress
  const handleSaveProgress = async (projectId: string) => {
    const res = await fetch(`/api/admin/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: progressVal }),
    });

    if (res.ok) {
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, progress: progressVal } : p))
      );
      setEditingProgressId(null);
    }
  };

  // Toggle Show Progress Bar
  const handleToggleShowProgress = async (project: Project) => {
    const nextVal = project.show_progress === false ? true : false;
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_progress: nextVal }),
    });

    if (res.ok) {
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, show_progress: nextVal } : p))
      );
    }
  };

  // Toggle Project Files Mode (Interactive / Showcase)
  const handleToggleAllowFeedback = async (project: Project) => {
    const nextVal = project.allow_feedback === false ? true : false;
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allow_feedback: nextVal }),
    });

    if (res.ok) {
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, allow_feedback: nextVal } : p))
      );
    }
  };

  const displayedProjects = projects.filter((p) =>
    filterArchived ? p.is_archived : !p.is_archived
  );

  const allDisplayedSelected =
    displayedProjects.length > 0 &&
    displayedProjects.every((p) => selectedProjectIds.includes(p.id));

  const handleToggleSelectAll = () => {
    if (allDisplayedSelected) {
      const displayedIds = new Set(displayedProjects.map((p) => p.id));
      setSelectedProjectIds((prev) => prev.filter((id) => !displayedIds.has(id)));
    } else {
      const combined = new Set([...selectedProjectIds, ...displayedProjects.map((p) => p.id)]);
      setSelectedProjectIds(Array.from(combined));
    }
  };

  const handleToggleSelect = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  // Trigger individual deletion via safe modal
  const handlePromptDeleteSingle = (project: Project) => {
    setDeleteError(null);
    setDeleteModalProjects([project]);
  };

  // Trigger batch deletion via safe modal
  const handlePromptDeleteBatch = () => {
    setDeleteError(null);
    const selectedProjs = projects.filter((p) => selectedProjectIds.includes(p.id));
    if (selectedProjs.length > 0) {
      setDeleteModalProjects(selectedProjs);
    }
  };

  // Execute deletion (single or batch)
  const handleExecuteDelete = async () => {
    if (!deleteModalProjects || deleteModalProjects.length === 0) return;
    setIsDeleting(true);
    setDeleteError(null);

    const idsToDelete = deleteModalProjects.map((p) => p.id);

    try {
      const res = await fetch('/api/admin/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: idsToDelete }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر إتمام عملية الحذف');
      }

      setProjects((prev) => prev.filter((p) => !idsToDelete.includes(p.id)));
      setSelectedProjectIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
      setDeleteModalProjects(null);
      setActionBanner({
        type: 'success',
        message: `تم بنجاح حذف ${data.deletedCount ?? idsToDelete.length} مشروع وتنظيف ${data.totalAssetsDeleted ?? 0} ملف من قاعدة البيانات ومحاولة إزالتها من Google Drive.`,
      });
    } catch (err: any) {
      setDeleteError(err?.message || 'حدث خطأ أثناء محاولة الحذف');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-studio-bg flex flex-col">
      <AdminNavbar />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {showStatusBanner && systemStatus?.warning && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-semibold text-amber-200 animate-fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
              <span>{systemStatus.warning}</span>
            </div>
            <button
              onClick={() => setShowStatusBanner(false)}
              className="rounded-lg p-1 text-white/50 hover:text-white transition"
              title="إغلاق"
            >
              ✕
            </button>
          </div>
        )}

        {showStatusBanner && !systemStatus?.warning && !systemStatus?.supabaseConfigured && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs font-semibold text-sky-200 animate-fade-in">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-sky-400 animate-pulse flex-shrink-0" />
              <span>
                <strong>وضع العرض التجريبي (Showcase Mode):</strong> لوحة التحكم جاهزة ومفعّلة بكافة ميزاتها بالبيانات التجريبية. لحفظ المشاريع في قاعدة بيانات دائمة، يمكنك إضافة متغيرات Supabase في إعدادات Vercel.
              </span>
            </div>
            <button
              onClick={() => setShowStatusBanner(false)}
              className="rounded-lg p-1 text-white/50 hover:text-white transition"
              title="إغلاق"
            >
              ✕
            </button>
          </div>
        )}

        {driveBanner && (
          <div
            className={`mb-6 rounded-2xl border p-4 text-xs font-semibold animate-fade-in ${
              driveBanner.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {driveBanner.type === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                )}
                <span>{driveBanner.message}</span>
              </div>
              <button
                onClick={() => setDriveBanner(null)}
                className="rounded-lg p-1 text-white/50 hover:text-white transition"
                title="إغلاق"
              >
                ✕
              </button>
            </div>

            {driveBanner.rootFolderId && (
              <div className="mt-3 pt-3 border-t border-emerald-500/20 text-xs text-emerald-200/90 flex flex-col gap-2">
                <p className="text-[11px] text-emerald-400/90 font-medium">
                  معرّف مجلد الأرشيف (Root Folder ID):
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleCopyText(driveBanner.rootFolderId!, 'root_folder')}
                    className="rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 px-3 py-1.5 text-xs text-white transition flex items-center gap-1.5"
                  >
                    <span>{copiedKey === 'root_folder' ? 'تم النسخ ✓' : 'نسخ GOOGLE_DRIVE_ROOT_FOLDER_ID'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Banner (Delete / Operations Feedback) */}
        {actionBanner && (
          <div
            className={`mb-6 flex items-center justify-between gap-3 rounded-2xl border p-4 text-xs font-semibold animate-fade-in ${
              actionBanner.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {actionBanner.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              )}
              <span>{actionBanner.message}</span>
            </div>
            <button
              onClick={() => setActionBanner(null)}
              className="rounded-lg p-1 text-white/50 hover:text-white transition"
              title="إغلاق"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white">إدارة المشاريع</h1>
            <p className="mt-1 text-xs text-studio-text-secondary">
              التحكم في المشاريع ونسب الإنجاز والملفات وظهورها للعملاء
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {displayedProjects.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border transition ${
                  allDisplayedSelected
                    ? 'border-studio-blue/50 bg-studio-blue/20 text-studio-blue-glow'
                    : 'border-white/10 bg-studio-surface text-studio-text-secondary hover:text-white'
                }`}
                title={allDisplayedSelected ? 'إلغاء تحديد جميع المشاريع' : 'تحديد جميع المشاريع'}
              >
                <CheckSquare className="h-4 w-4" />
                <span>{allDisplayedSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</span>
              </button>
            )}

            {selectedProjectIds.length > 0 && (
              <button
                type="button"
                onClick={handlePromptDeleteBatch}
                className="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 px-3.5 py-2 text-xs font-bold text-white transition shadow-lg shadow-red-600/30 animate-fade-in"
                title="حذف جميع المشاريع المحددة"
              >
                <Trash2 className="h-4 w-4" />
                <span>حذف المشاريع المحددة ({selectedProjectIds.length})</span>
              </button>
            )}

            <button
              onClick={() => setFilterArchived(!filterArchived)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold border transition ${
                filterArchived
                  ? 'border-amber-500/30 bg-amber-500/15 text-studio-gold'
                  : 'border-white/10 bg-studio-surface text-studio-text-secondary hover:text-white'
              }`}
            >
              {filterArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              <span>{filterArchived ? 'المشاريع النشطة' : 'المشاريع المؤرشفة'}</span>
            </button>

            <Link
              href="/admin/projects/new"
              className="flex items-center gap-2 rounded-xl bg-studio-blue hover:bg-studio-blue-glow px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-studio-blue/20 transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ مشروع جديد</span>
            </Link>
          </div>
        </div>

        {/* Projects Cards Grid */}
        {displayedProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedProjects.map((project) => {
              const isSelected = selectedProjectIds.includes(project.id);
              return (
                <div
                  key={project.id}
                  className={`glass-card flex flex-col overflow-hidden rounded-2xl border transition ${
                    isSelected
                      ? 'border-studio-blue ring-2 ring-studio-blue/50 bg-studio-blue/[0.04]'
                      : !project.is_visible
                      ? 'border-dashed border-red-500/30 opacity-75'
                      : 'border-white/10'
                  }`}
                >
                  {/* Cover Thumbnail */}
                  <div className="relative aspect-video w-full overflow-hidden bg-studio-surface">
                    {project.cover_url ? (
                      <img
                        src={
                          project.display_cover_url ||
                          (project.cover_url?.startsWith('http') || project.cover_url?.startsWith('/uploads/')
                            ? project.cover_url
                            : `/api/media/cover/${project.id}`)
                        }
                        alt={project.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-studio-surface text-studio-text-muted">
                        <FolderKanban className="h-10 w-10 opacity-30" />
                      </div>
                    )}

                    {/* Checkbox and Category overlay */}
                    <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                      {project.category && (
                        <div className="rounded-md bg-black/70 px-2.5 py-1 text-[11px] font-medium text-studio-gold backdrop-blur-md border border-white/10">
                          {project.category}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelect(project.id);
                        }}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border transition backdrop-blur-md ${
                          isSelected
                            ? 'border-studio-blue bg-studio-blue text-white shadow-md shadow-studio-blue/40'
                            : 'border-white/20 bg-black/60 text-white/60 hover:border-white/40 hover:text-white'
                        }`}
                        title={isSelected ? 'إلغاء تحديد المشروع' : 'تحديد المشروع'}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Visibility Status Badge */}
                    <div className="absolute top-3 left-3 z-10">
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(project)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold backdrop-blur-md border ${
                          project.is_visible
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}
                        title="تبديل ظهور المشروع للعميل"
                      >
                        {project.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        <span>{project.is_visible ? 'ظاهر للعميل' : 'مخفي عن العميل'}</span>
                      </button>
                    </div>
                  </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-white line-clamp-1">{project.title}</h3>
                    <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-studio-text-secondary whitespace-nowrap">
                      {project.file_count ?? 0} ملف
                    </span>
                  </div>

                  {project.description && (
                    <p className="mt-2 text-xs text-studio-text-secondary line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>
                  )}

                  {/* Client Activity & Status Badges */}
                  {((project.comments_count && project.comments_count > 0) || (project.approvals_count && project.approvals_count > 0)) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {project.comments_count && project.comments_count > 0 ? (
                        <Link
                          href={`/admin/projects/${project.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 text-xs font-bold text-studio-blue-glow transition shadow-sm"
                          title="توجد ملاحظات وطلبات تعديل مسجلة من العميل في هذا المشروع"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span>{project.comments_count} طلب تعديل / ملاحظة</span>
                        </Link>
                      ) : null}

                      {project.approvals_count && project.approvals_count > 0 ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400 shadow-sm"
                          title="تم اعتماد ملفات في هذا المشروع من قبل العميل"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{project.approvals_count} ملف معتمد</span>
                        </span>
                      ) : null}
                    </div>
                  )}

                  {/* Progress Control & Toggle */}
                  <div className="mt-4 rounded-xl border border-white/5 bg-studio-surface/60 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-studio-text-muted">شريط الإنجاز:</span>
                        <button
                          type="button"
                          onClick={() => handleToggleShowProgress(project)}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold border transition ${
                            project.show_progress !== false
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              : 'border-white/10 bg-white/5 text-studio-text-muted hover:bg-white/10 hover:text-white'
                          }`}
                          title={project.show_progress !== false ? 'انقر لإلغاء شريط الإنجاز لهذا المشروع' : 'انقر لتفعيل شريط الإنجاز'}
                        >
                          {project.show_progress !== false ? 'مفعل' : 'ملغي'}
                        </button>
                      </div>

                      {project.show_progress !== false && (
                        editingProgressId === project.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={progressVal}
                              onChange={(e) => setProgressVal(Number(e.target.value))}
                              className="w-16 rounded border border-studio-blue bg-studio-card px-2 py-0.5 text-xs text-white text-center font-mono outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveProgress(project.id)}
                              className="rounded bg-studio-blue p-1 text-white hover:bg-studio-blue-glow transition"
                              title="حفظ النسبة"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProgressId(project.id);
                              setProgressVal(project.progress);
                            }}
                            className="flex items-center gap-1 font-mono font-bold text-studio-gold hover:underline text-xs"
                            title="انقر لتعديل نسبة الإنجاز"
                          >
                            <span>{project.progress}%</span>
                            <Edit className="h-3 w-3 opacity-60" />
                          </button>
                        )
                      )}
                    </div>

                    {project.show_progress !== false ? (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-studio-blue to-studio-gold transition-all duration-300"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    ) : (
                      <p className="text-[11px] text-studio-text-muted italic">
                        تم إلغاء شريط الإنجاز (لن يظهر للعميل)
                      </p>
                    )}

                    {/* وضع الملفات: تفاعلي (مراجعة واعتماد) أو للعرض فقط */}
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-studio-text-muted">وضع الملفات:</span>
                        <button
                          type="button"
                          onClick={() => handleToggleAllowFeedback(project)}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold border transition ${
                            project.allow_feedback !== false
                              ? 'border-studio-blue/30 bg-studio-blue/10 text-studio-blue-glow hover:bg-studio-blue/20'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                          }`}
                          title={
                            project.allow_feedback !== false
                              ? 'انقر للتحويل إلى وضع العرض والتحميل والمشاركة فقط'
                              : 'انقر للتحويل إلى الوضع التفاعلي (مراجعة واعتماد وملاحظات)'
                          }
                        >
                          {project.allow_feedback !== false ? 'مراجعة واعتماد' : 'للعرض والتحميل فقط'}
                        </button>
                      </div>
                      <span className="text-[10px] text-studio-text-muted">
                        {project.allow_feedback !== false ? 'تفاعلي (ملاحظات+V1)' : 'ملء الشاشة (بدون ملاحظات)'}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-5 flex items-center justify-between pt-3 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      {/* إدارة الملفات */}
                      <Link
                        href={`/admin/projects/${project.id}`}
                        className="flex items-center gap-1.5 rounded-xl bg-studio-surface hover:bg-studio-blue px-3 py-2 text-xs font-semibold text-white transition shadow-sm"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>إدارة الملفات</span>
                      </Link>

                      {/* زر مشاركة المشروع */}
                      <button
                        type="button"
                        onClick={() => setSharingProject(project)}
                        className="flex items-center gap-1.5 rounded-xl bg-studio-surface/80 hover:bg-studio-blue/20 hover:text-studio-blue-glow border border-white/5 px-2.5 py-2 text-xs font-semibold text-studio-text transition"
                        title="مشاركة رابط المشروع"
                      >
                        <Share2 className="h-3.5 w-3.5 text-studio-blue-glow" />
                        <span>مشاركة</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Archive Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleArchive(project)}
                        className="rounded-lg p-2 text-studio-text-muted hover:bg-studio-surface hover:text-white transition"
                        title={project.is_archived ? 'استعادة المشروع' : 'أرشفة المشروع'}
                      >
                        {project.is_archived ? (
                          <ArchiveRestore className="h-4 w-4 text-amber-400" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handlePromptDeleteSingle(project)}
                        className="rounded-lg p-2 text-studio-text-muted hover:bg-red-500/10 hover:text-red-400 transition"
                        title="حذف المشروع"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        ) : (
          <div className="flex min-h-[350px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-studio-surface/40 p-8 text-center">
            <FolderKanban className="h-16 w-16 text-studio-text-muted opacity-40 mb-3" />
            <h3 className="text-lg font-bold text-white">لا توجد مشاريع</h3>
            <p className="mt-1 text-xs text-studio-text-secondary max-w-sm">
              {filterArchived
                ? 'لا توجد مشاريع مؤرشفة حالياً'
                : 'ابدأ بإنشاء أول مشروع تصميم لعرضه للعملاء'}
            </p>
            {!filterArchived && (
              <Link
                href="/admin/projects/new"
                className="mt-4 flex items-center gap-2 rounded-xl bg-studio-blue px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-studio-blue/25 hover:bg-studio-blue-glow transition"
              >
                <PlusCircle className="h-4 w-4" />
                <span>+ مشروع جديد</span>
              </Link>
            )}
          </div>
        )}

        {/* Modal: مشاركة المشروع مباشرة للعميل */}
        {sharingProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-studio-surface p-6 shadow-2xl">
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Share2 className="h-5 w-5 text-studio-blue-glow" />
                    <h3 className="text-base font-bold text-white">مشاركة مشروع: {sharingProject.title}</h3>
                  </div>
                  <p className="mt-1 text-xs text-studio-text-secondary">
                    اختر العميل لنسخ رابط المشروع المباشر أو رابطه العام
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSharingProject(null)}
                  className="rounded-lg p-1.5 text-studio-text-muted hover:bg-white/5 hover:text-white transition"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-3">
                {(() => {
                  const assignedLinks = links.filter((l) =>
                    l.project_ids?.includes(sharingProject.id)
                  );

                  if (assignedLinks.length === 0) {
                    return (
                      <div className="rounded-xl border border-dashed border-white/10 p-5 text-center">
                        <AlertCircle className="mx-auto h-8 w-8 text-studio-gold mb-2 opacity-80" />
                        <p className="text-sm font-semibold text-white">
                          هذا المشروع غير مرتبط بأي عميل حالياً
                        </p>
                        <p className="mt-1 text-xs text-studio-text-secondary">
                          قم بتعيين هذا المشروع لعميل في صفحة إدارة الروابط حتى يتمكن من فتحه.
                        </p>
                        <Link
                          href="/admin/links"
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-studio-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-studio-blue-glow transition"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          <span>الانتقال لروابط العملاء</span>
                        </Link>
                      </div>
                    );
                  }

                  const origin = typeof window !== 'undefined' ? window.location.origin : '';

                  return assignedLinks.map((link) => {
                    const directUrl = `${origin}/p/${link.slug}/projects/${sharingProject.id}?direct=true`;
                    const generalUrl = `${origin}/p/${link.slug}`;
                    const isDirectCopied = copiedKey === `direct-${link.id}`;
                    const isGeneralCopied = copiedKey === `general-${link.id}`;

                    return (
                      <div
                        key={link.id}
                        className="rounded-xl border border-white/5 bg-studio-bg/60 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-studio-blue-glow" />
                            <span className="text-xs font-bold text-white">{link.viewer_name}</span>
                            {link.has_password === false ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400">
                                <Globe className="h-2.5 w-2.5" />
                                <span>رابط عام (بدون كلمة سر)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-400">
                                <Lock className="h-2.5 w-2.5" />
                                <span>محمي</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-studio-text-muted font-mono bg-white/5 px-2 py-0.5 rounded">
                            {link.slug}
                          </span>
                        </div>

                        {/* Direct Project Link */}
                        <div className="rounded-lg bg-studio-blue/10 border border-studio-blue/20 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-studio-blue-glow" />
                                <span className="text-xs font-bold text-studio-blue-glow">
                                  رابط المشروع المباشر
                                </span>
                              </div>
                              <p className="mt-0.5 text-[10px] text-studio-text-muted truncate font-mono" dir="ltr">
                                {directUrl}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyText(directUrl, `direct-${link.id}`)}
                              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                isDirectCopied
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-studio-blue text-white hover:bg-studio-blue-glow'
                              }`}
                            >
                              {isDirectCopied ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  <span>تم النسخ!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>نسخ الرابط المباشر</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* General Link (Secondary option) */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                          <span className="text-[11px] text-studio-text-secondary">
                            أو الرابط العام لمعرض العميل:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(generalUrl, `general-${link.id}`)}
                            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition ${
                              isGeneralCopied
                                ? 'text-emerald-400 font-semibold'
                                : 'text-studio-text-muted hover:text-white'
                            }`}
                          >
                            {isGeneralCopied ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>تم النسخ</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>نسخ المعرض العام</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="mt-5 flex justify-end border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={() => setSharingProject(null)}
                  className="rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-studio-text hover:bg-white/10 transition"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: تأكيد حذف المشاريع (فردي أو جماعي) */}
        {deleteModalProjects && deleteModalProjects.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-studio-surface p-6 shadow-2xl space-y-5">
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      {deleteModalProjects.length === 1
                        ? 'تأكيد حذف المشروع'
                        : `تأكيد حذف ${deleteModalProjects.length} مشاريع محددة`}
                    </h3>
                    <p className="mt-0.5 text-xs text-studio-text-secondary">
                      يرجى مراجعة التفاصيل أدناه قبل تأكيد الحذف النهائي
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    if (!isDeleting) {
                      setDeleteModalProjects(null);
                      setDeleteError(null);
                    }
                  }}
                  className="rounded-lg p-1.5 text-studio-text-muted hover:bg-white/5 hover:text-white transition disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              {/* Details Box */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/5 bg-studio-card/80 p-3 text-center">
                  <span className="text-[11px] text-studio-text-muted block">عدد المشاريع</span>
                  <span className="text-lg font-mono font-bold text-white mt-1 block">
                    {deleteModalProjects.length}
                  </span>
                </div>
                <div className="rounded-xl border border-white/5 bg-studio-card/80 p-3 text-center">
                  <span className="text-[11px] text-studio-text-muted block">إجمالي الملفات المرتبطة</span>
                  <span className="text-lg font-mono font-bold text-studio-gold mt-1 block">
                    {deleteModalProjects.reduce((sum, p) => sum + (p.file_count || 0), 0)} ملف
                  </span>
                </div>
              </div>

              {/* Projects List Preview */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-studio-text-secondary block">
                  المشاريع التي سيتم حذفها:
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-xl border border-white/5 bg-studio-card/50 p-2.5">
                  {deleteModalProjects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-white line-clamp-1 flex-1 ml-2">
                        {p.title}
                      </span>
                      <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] font-mono text-studio-text-muted whitespace-nowrap">
                        {p.file_count || 0} ملف
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warning Box */}
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300 flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">تنبيه أمان وهيكلية البيانات:</p>
                  <p className="text-[11px] text-red-200/90 leading-relaxed">
                    سيتم حذف سجلات المشاريع، الروابط، اعتمادات العميل والملاحظات من قاعدة البيانات بالترتيب الآمن، ومحاولة تنظيف وحذف الملفات والمجلدات المرتبطة من Google Drive تلقائياً مع حماية مجلد الأرشيف الرئيسي والمجلدات المشتركة.
                  </p>
                </div>
              </div>

              {deleteError && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-3 text-xs text-red-300">
                  {deleteError}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleExecuteDelete}
                  className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 py-2.5 text-xs font-bold text-white transition flex items-center justify-center gap-2 shadow-lg shadow-red-600/30"
                >
                  {isDeleting ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري الحذف وتنظيف Drive...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      <span>تأكيد الحذف النهائي</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setDeleteModalProjects(null);
                    setDeleteError(null);
                  }}
                  className="rounded-xl border border-white/10 bg-studio-surface hover:bg-white/5 px-4 py-2.5 text-xs font-semibold text-studio-text-secondary hover:text-white transition disabled:opacity-50"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
