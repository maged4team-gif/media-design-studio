'use client';

import React, { useState } from 'react';
import { Project, AccessLink } from '@/lib/supabase/database.types';
import { AdminNavbar } from '@/components/admin/AdminNavbar';
import {
  Link2,
  PlusCircle,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  User,
  CheckSquare,
  Square,
  AlertCircle,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Key,
  Pencil,
  Share2,
} from 'lucide-react';

interface LinksManagerViewProps {
  initialLinks: (AccessLink & { project_ids: string[] })[];
  projects: Project[];
}

export const LinksManagerView: React.FC<LinksManagerViewProps> = ({ initialLinks, projects }) => {
  const [links, setLinks] = useState(initialLinks);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [viewerName, setViewerName] = useState('');
  const [password, setPassword] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Copy Feedback State
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [copiedDirectKey, setCopiedDirectKey] = useState<string | null>(null);
  const [copiedPasswordId, setCopiedPasswordId] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Password Visibility State (per link)
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const togglePasswordReveal = (id: string) => {
    setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Edit Link Modal State
  const [editingLink, setEditingLink] = useState<(AccessLink & { project_ids: string[] }) | null>(null);
  const [editViewerName, setEditViewerName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editSelectedProjectIds, setEditSelectedProjectIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const handleOpenEditModal = (link: AccessLink & { project_ids: string[] }) => {
    setEditingLink(link);
    setEditViewerName(link.viewer_name);
    setEditPassword(link.password_plain || '');
    setEditIsPublic(link.has_password === false);
    setEditSelectedProjectIds(link.project_ids || []);
    setEditError('');
  };

  const handleToggleAllEditProjects = () => {
    if (editSelectedProjectIds.length === projects.length) {
      setEditSelectedProjectIds([]);
    } else {
      setEditSelectedProjectIds(projects.map((p) => p.id));
    }
  };

  const handleToggleEditProject = (id: string) => {
    setEditSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  const handleCopyPassword = async (linkId: string, passwordText: string) => {
    try {
      await navigator.clipboard.writeText(passwordText);
      setCopiedPasswordId(linkId);
      setTimeout(() => setCopiedPasswordId(null), 2000);
    } catch {
      alert(`كلمة المرور: ${passwordText}`);
    }
  };

  const handleCopyInviteMessage = async (link: AccessLink & { project_ids: string[] }) => {
    const fullUrl = `${window.location.origin}/p/${link.slug}`;
    let message = '';
    if (link.has_password !== false && link.password_plain) {
      message = `مرحباً ${link.viewer_name}،\nيمكنك الاطلاع على ملفاتك عبر الرابط التالي:\n🔗 الرابط: ${fullUrl}\n🔑 كلمة المرور: ${link.password_plain}`;
    } else if (link.has_password !== false && !link.password_plain) {
      message = `مرحباً ${link.viewer_name}،\nيمكنك الاطلاع على ملفاتك عبر الرابط التالي:\n🔗 الرابط: ${fullUrl}\n🔒 (الرابط محمي بكلمة المرور الخاصة بك)`;
    } else {
      message = `مرحباً ${link.viewer_name}،\nيمكنك الاطلاع على ملفاتك عبر الرابط المباشر التالي:\n🔗 الرابط: ${fullUrl}`;
    }

    try {
      await navigator.clipboard.writeText(message);
      setCopiedInviteId(link.id);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch {
      alert(message);
    }
  };

  const handleUpdateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink || !editViewerName.trim() || editSaving) return;
    if (!editIsPublic && !editPassword.trim() && !editingLink.has_password) {
      setEditError('يرجى كتابة كلمة المرور أو تفعيل الرابط العام');
      return;
    }

    setEditSaving(true);
    setEditError('');

    try {
      const payload: any = {
        viewerName: editViewerName.trim(),
        projectIds: editSelectedProjectIds,
      };

      if (editIsPublic) {
        payload.removePassword = true;
      } else if (editPassword.trim() !== '') {
        payload.password = editPassword.trim();
      }

      const res = await fetch(`/api/admin/links/${editingLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'تعذر تعديل الرابط');
      } else {
        const newPlain = editIsPublic
          ? null
          : editPassword.trim() !== ''
          ? editPassword.trim()
          : editingLink.password_plain;

        setLinks((prev) =>
          prev.map((l) => {
            if (l.id !== editingLink.id) return l;
            return {
              ...l,
              viewer_name: editViewerName.trim(),
              project_ids: editSelectedProjectIds,
              has_password: !editIsPublic,
              password_plain: newPlain,
            };
          })
        );
        setEditingLink(null);
      }
    } catch {
      setEditError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setEditSaving(false);
    }
  };

  // Select all or deselect all projects
  const handleToggleAllProjects = () => {
    if (selectedProjectIds.length === projects.length) {
      setSelectedProjectIds([]);
    } else {
      setSelectedProjectIds(projects.map((p) => p.id));
    }
  };

  const handleToggleProject = (id: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  // Create Link
  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewerName.trim() || (!isPublic && !password.trim()) || saving) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/admin/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerName: viewerName.trim(),
          password: isPublic ? '' : password.trim(),
          projectIds: selectedProjectIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر إنشاء الرابط');
      } else {
        setLinks((prev) => [data.link, ...prev]);
        setShowCreateModal(false);
        setViewerName('');
        setPassword('');
        setIsPublic(false);
        setSelectedProjectIds([]);
      }
    } catch {
      setError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  };

  // Copy Link to Clipboard
  const handleCopyLink = async (slug: string) => {
    const fullUrl = `${window.location.origin}/p/${slug}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      alert(`الرابط: ${fullUrl}`);
    }
  };

  const handleCopyProjectLink = async (slug: string, projectId: string, projectTitle: string) => {
    const fullUrl = `${window.location.origin}/p/${slug}/projects/${projectId}?direct=true`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedDirectKey(`${slug}_${projectId}`);
      setTimeout(() => setCopiedDirectKey(null), 2000);
    } catch {
      alert(`رابط مشروع ${projectTitle}: ${fullUrl}`);
    }
  };

  // Delete Link
  const handleDeleteLink = async (id: string, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف رابط العميل "${name}"؟`)) return;

    const res = await fetch(`/api/admin/links/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setLinks((prev) => prev.filter((l) => l.id !== id));
    }
  };

  // Toggle enabled
  const handleToggleEnabled = async (link: AccessLink & { project_ids: string[] }) => {
    const nextVal = !link.enabled;
    const res = await fetch(`/api/admin/links/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextVal }),
    });

    if (res.ok) {
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, enabled: nextVal } : l))
      );
    }
  };

  return (
    <div className="min-h-screen bg-studio-bg flex flex-col">
      <AdminNavbar />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white">روابط العملاء</h1>
            <p className="mt-1 text-xs text-studio-text-secondary">
              توليد روابط مخصصة للعملاء مع تعيين كلمات المرور والمشاريع المصرح لهم بها
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-xl bg-studio-blue hover:bg-studio-blue-glow px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-studio-blue/20 transition"
          >
            <PlusCircle className="h-4 w-4" />
            <span>+ رابط عميل جديد</span>
          </button>
        </div>

        {/* Links Grid / List */}
        {links.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {links.map((link) => {
              const assignedCount = link.project_ids?.length || 0;
              const isAll = assignedCount === projects.length && projects.length > 0;

              return (
                <div
                  key={link.id}
                  className="glass-card flex flex-col rounded-2xl border border-white/10 p-5 shadow-xl transition hover:border-studio-blue/30"
                >
                  {/* Top: Client Name & Enabled Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-studio-blue/15 text-studio-blue-glow border border-studio-blue/20">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white">{link.viewer_name}</h3>
                          {link.has_password === false ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                              <Globe className="h-3 w-3" />
                              <span>رابط عام</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400">
                              <Lock className="h-3 w-3" />
                              <span>محمي</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-studio-text-muted font-mono">
                          /p/{link.slug}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(link)}
                      className={`rounded-lg px-2 py-0.5 text-[10px] font-bold border transition ${
                        link.enabled
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-red-500/30 bg-red-500/10 text-red-400'
                      }`}
                    >
                      {link.enabled ? 'مفعل' : 'معطل'}
                    </button>
                  </div>

                  {/* Password Display / Management */}
                  {link.has_password !== false ? (
                    <div className="mt-3.5 rounded-xl border border-blue-500/20 bg-blue-950/25 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Key className="h-3.5 w-3.5 text-studio-blue-glow shrink-0" />
                          <span className="text-[11px] text-studio-text-secondary shrink-0">كلمة المرور:</span>
                          {link.password_plain ? (
                            <span className="font-mono text-xs font-bold text-white tracking-wider truncate">
                              {revealedPasswords[link.id] ? link.password_plain : '••••••••'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-400 font-medium" title="تم إنشاؤها قبل دعم عرض كلمة السر">
                              مشفرة سابقاً
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {link.password_plain ? (
                            <>
                              <button
                                type="button"
                                onClick={() => togglePasswordReveal(link.id)}
                                className="rounded-lg p-1 text-studio-text-muted hover:bg-white/10 hover:text-white transition"
                                title={revealedPasswords[link.id] ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                              >
                                {revealedPasswords[link.id] ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyPassword(link.id, link.password_plain!)}
                                className="flex items-center gap-1 rounded-lg bg-studio-blue/20 hover:bg-studio-blue px-2 py-1 text-[10px] font-semibold text-studio-blue-glow hover:text-white transition"
                                title="نسخ كلمة المرور للحافظة"
                              >
                                {copiedPasswordId === link.id ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-400" />
                                    <span className="text-emerald-400 font-bold">تم!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    <span>نسخ</span>
                                  </>
                                )}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(link)}
                              className="flex items-center gap-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:text-black transition"
                              title="تعيين كلمة سر جديدة لتظهر لك في البطاقة"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>تعيين كلمة سر</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3.5 rounded-xl border border-white/5 bg-white/5 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          <span className="text-[11px] text-studio-text-secondary">نوع الرابط:</span>
                          <span className="text-[11px] font-semibold text-amber-400">رابط عام بدون كلمة مرور</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(link)}
                          className="flex items-center gap-1 rounded-lg bg-white/5 hover:bg-white/10 px-2 py-1 text-[10px] text-studio-text-secondary hover:text-white transition"
                          title="تعديل الرابط وإضافة كلمة سر إن رغبت"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>تعديل</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Assigned Projects Info */}
                  <div className="mt-4 rounded-xl border border-white/5 bg-studio-surface p-3 text-xs">
                    <div className="flex items-center justify-between text-studio-text-secondary">
                      <span>المشاريع المتاحة:</span>
                      <span className="font-bold text-white font-mono">
                        {isAll ? 'جميع المشاريع' : `${assignedCount} مشروع`}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {link.project_ids && link.project_ids.length > 0 ? (
                        link.project_ids.map((pId) => {
                          const p = projects.find((proj) => proj.id === pId);
                          const isCopied = copiedDirectKey === `${link.slug}_${pId}`;
                          return p ? (
                            <div
                              key={pId}
                              className="flex items-center gap-1.5 rounded-lg bg-white/5 pl-1.5 pr-2 py-0.5 text-[10px] text-studio-text-secondary border border-white/5 hover:border-studio-blue/30 transition"
                            >
                              <span className="truncate max-w-[110px] text-white/90">{p.title}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyProjectLink(link.slug, p.id, p.title)}
                                className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold text-studio-blue-glow hover:bg-studio-blue/20 hover:text-white transition"
                                title={`نسخ رابط مباشر لمشروع "${p.title}"`}
                              >
                                {isCopied ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                <span>{isCopied ? 'تم!' : 'رابط مباشر'}</span>
                              </button>
                            </div>
                          ) : null;
                        })
                      ) : (
                        <span className="text-[11px] text-studio-text-muted">لم يتم تعيين مشاريع</span>
                      )}
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="mt-5 flex items-center justify-between pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      {/* Copy Link Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyLink(link.slug)}
                        className="flex items-center gap-1.5 rounded-xl bg-studio-surface hover:bg-studio-blue px-3 py-1.5 text-xs font-semibold text-white transition shadow-sm"
                        title="نسخ رابط المعرض العام (يعرض جميع مشاريع هذا العميل)"
                      >
                        {copiedSlug === link.slug ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">تم النسخ!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-studio-blue-glow" />
                            <span>نسخ الرابط</span>
                          </>
                        )}
                      </button>

                      {/* Copy Invite Message Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyInviteMessage(link)}
                        className="flex items-center gap-1.5 rounded-xl bg-studio-surface hover:bg-studio-blue/20 px-2.5 py-1.5 text-xs font-semibold text-studio-blue-glow hover:text-white transition shadow-sm border border-studio-blue/20"
                        title="نسخ رسالة دعوة جاهزة للعميل بالرابط وكلمة المرور عبر واتساب أو إيميل"
                      >
                        {copiedInviteId === link.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">تم نسخ الرسالة!</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="h-3.5 w-3.5" />
                            <span>رسالة العميل</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Edit */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(link)}
                        className="rounded-lg p-2 text-studio-text-muted hover:bg-studio-surface hover:text-white transition"
                        title="تعديل الرابط وكلمة المرور والمشاريع"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>

                      {/* Visit Link */}
                      <a
                        href={`/p/${link.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg p-2 text-studio-text-muted hover:bg-studio-surface hover:text-white transition"
                        title="فتح الرابط في نافذة جديدة"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDeleteLink(link.id, link.viewer_name)}
                        className="rounded-lg p-2 text-studio-text-muted hover:bg-red-500/10 hover:text-red-400 transition"
                        title="حذف الرابط"
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
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-studio-surface/40 p-8 text-center">
            <Link2 className="h-14 w-14 text-studio-text-muted opacity-30 mb-3" />
            <h3 className="text-base font-bold text-white">لا توجد روابط عملاء بعد</h3>
            <p className="mt-1 text-xs text-studio-text-secondary max-w-sm">
              قم بإنشاء أول رابط مخصص لعميل مع تحديد كلمة المرور والمشاريع المخصصة له.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 flex items-center gap-2 rounded-xl bg-studio-blue px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-studio-blue/20 hover:bg-studio-blue-glow transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ إنشاء رابط عميل</span>
            </button>
          </div>
        )}

        {/* Create Client Link Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="glass-card relative w-full max-w-lg rounded-2xl border border-white/10 p-6 sm:p-8 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-1">إنشاء رابط وصول عميل</h3>
              <p className="text-xs text-studio-text-secondary mb-6">
                توليد رابط مخصص للعميل للوصول للمشاريع المصرح بها
              </p>

              {error && (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleCreateLink} className="space-y-4">
                {/* Client Name */}
                <div>
                  <label className="block text-xs font-semibold text-white mb-1.5">
                    اسم العميل <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={viewerName}
                    onChange={(e) => setViewerName(e.target.value)}
                    placeholder="مثال: أحمد، قناة الهلال، الأستاذ فهد"
                    required
                    className="w-full rounded-xl border border-white/10 bg-studio-surface px-3.5 py-2.5 text-xs text-white outline-none focus:border-studio-blue"
                  />
                </div>

                {/* Public Link Toggle */}
                <div className="rounded-xl border border-white/10 bg-studio-surface/60 p-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2 rounded-lg border ${
                          isPublic
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            : 'bg-white/5 border-white/10 text-studio-text-muted'
                        }`}
                      >
                        <Globe className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-white">رابط عام (بدون كلمة سر)</span>
                        <span className="block text-[11px] text-studio-text-muted">
                          السماح للعميل بالدخول الفوري والتصفح مباشرة دون طلب كلمة مرور
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-studio-surface text-studio-blue focus:ring-0 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Password - only if not public */}
                {!isPublic ? (
                  <div>
                    <label className="block text-xs font-semibold text-white mb-1.5">
                      كلمة المرور الخاصة بالعميل <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="مثال: 2580 أو أي كلمة سر"
                      required={!isPublic}
                      className="w-full rounded-xl border border-white/10 bg-studio-surface px-3.5 py-2.5 text-xs text-white outline-none focus:border-studio-blue font-mono"
                    />
                    <p className="mt-1 text-[11px] text-studio-text-muted">
                      يتم تشفير كلمة المرور ولا تخزن كنص عادي (Bcrypt hash).
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-300/90 flex items-center gap-2">
                    <Globe className="h-4 w-4 flex-shrink-0 text-amber-400" />
                    <span>هذا الرابط سيكون عاماً: يدخل العميل فوراً للمشاريع المحددة دون الحاجة لكلمة سر.</span>
                  </div>
                )}

                {/* Projects Assignment */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-white">المشاريع المصرح بها</label>
                    <button
                      type="button"
                      onClick={handleToggleAllProjects}
                      className="text-[11px] text-studio-blue-glow hover:underline"
                    >
                      {selectedProjectIds.length === projects.length ? 'إلغاء تحديد الكل' : 'تحديد جميع المشاريع'}
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-white/10 bg-studio-surface p-3">
                    {projects.map((proj) => {
                      const isSelected = selectedProjectIds.includes(proj.id);
                      return (
                        <div
                          key={proj.id}
                          onClick={() => handleToggleProject(proj.id)}
                          className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-studio-card cursor-pointer transition text-xs"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-studio-blue-glow flex-shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-studio-text-muted flex-shrink-0" />
                          )}
                          <span className={isSelected ? 'text-white font-semibold' : 'text-studio-text-secondary'}>
                            {proj.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl border border-white/10 bg-studio-surface px-4 py-2 text-xs font-semibold text-studio-text-secondary hover:text-white"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !viewerName.trim() || (!isPublic && !password.trim())}
                    className="flex items-center gap-1.5 rounded-xl bg-studio-blue hover:bg-studio-blue-glow px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-studio-blue/25 transition disabled:opacity-50"
                  >
                    {saving ? 'جارٍ الإنشاء...' : 'توليد الرابط'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Client Link Modal */}
        {editingLink && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="glass-card relative w-full max-w-lg rounded-2xl border border-white/10 p-6 sm:p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold text-white">تعديل رابط العميل</h3>
                <span className="font-mono text-xs text-studio-text-muted">/p/{editingLink.slug}</span>
              </div>
              <p className="text-xs text-studio-text-secondary mb-6">
                تحديث كلمة المرور، اسم العميل، أو المشاريع المخصصة له
              </p>

              {editError && (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleUpdateLink} className="space-y-4">
                {/* Client Name */}
                <div>
                  <label className="block text-xs font-semibold text-white mb-1.5">
                    اسم العميل <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={editViewerName}
                    onChange={(e) => setEditViewerName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-white/10 bg-studio-surface px-3.5 py-2.5 text-xs text-white outline-none focus:border-studio-blue"
                  />
                </div>

                {/* Public Link Toggle */}
                <div className="rounded-xl border border-white/10 bg-studio-surface/60 p-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2 rounded-lg border ${
                          editIsPublic
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            : 'bg-white/5 border-white/10 text-studio-text-muted'
                        }`}
                      >
                        <Globe className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-white">رابط عام (بدون كلمة سر)</span>
                        <span className="block text-[11px] text-studio-text-muted">
                          السماح للعميل بالدخول الفوري دون طلب كلمة مرور
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={editIsPublic}
                      onChange={(e) => setEditIsPublic(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-studio-surface text-studio-blue focus:ring-0 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Password if not public */}
                {!editIsPublic ? (
                  <div>
                    <label className="block text-xs font-semibold text-white mb-1.5">
                      كلمة المرور للعميل
                    </label>
                    <input
                      type="text"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder={editingLink.password_plain ? editingLink.password_plain : 'اتركها فارغة للاحتفاظ بالسابقة، أو اكتب كلمة جديدة'}
                      className="w-full rounded-xl border border-white/10 bg-studio-surface px-3.5 py-2.5 text-xs text-white outline-none focus:border-studio-blue font-mono"
                    />
                    <p className="mt-1 text-[11px] text-studio-text-muted">
                      {editingLink.password_plain
                        ? `كلمة المرور المسجلة حالياً: ${editingLink.password_plain}`
                        : 'عند كتابة كلمة سر جديدة هنا، سيتم حفظها وتظهر على الكرت لنسخها بسهولة في أي وقت.'}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-300/90 flex items-center gap-2">
                    <Globe className="h-4 w-4 flex-shrink-0 text-amber-400" />
                    <span>سيتم تحويل الرابط إلى رابط عام وإلغاء حمايته بكلمة مرور.</span>
                  </div>
                )}

                {/* Projects Assignment */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-white">المشاريع المصرح بها</label>
                    <button
                      type="button"
                      onClick={handleToggleAllEditProjects}
                      className="text-[11px] text-studio-blue-glow hover:underline"
                    >
                      {editSelectedProjectIds.length === projects.length ? 'إلغاء تحديد الكل' : 'تحديد جميع المشاريع'}
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-white/10 bg-studio-surface p-3">
                    {projects.map((proj) => {
                      const isSelected = editSelectedProjectIds.includes(proj.id);
                      return (
                        <div
                          key={proj.id}
                          onClick={() => handleToggleEditProject(proj.id)}
                          className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-studio-card cursor-pointer transition text-xs"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-studio-blue-glow flex-shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-studio-text-muted flex-shrink-0" />
                          )}
                          <span className={isSelected ? 'text-white font-semibold' : 'text-studio-text-secondary'}>
                            {proj.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setEditingLink(null)}
                    className="rounded-xl border border-white/10 bg-studio-surface px-4 py-2 text-xs font-semibold text-studio-text-secondary hover:text-white"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving || !editViewerName.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-studio-blue hover:bg-studio-blue-glow px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-studio-blue/25 transition disabled:opacity-50"
                  >
                    {editSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
