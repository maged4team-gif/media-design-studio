'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminNavbar } from '@/components/admin/AdminNavbar';
import { ArrowRight, Upload, Check, MessageSquare, Eye } from 'lucide-react';

export function NewProjectView() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(true);
  const [allowFeedback, setAllowFeedback] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Helper to downscale and compress high-resolution wallpapers/photos on client
  const compressImageForCover = (file: File, maxWidth = 1600, quality = 0.82): Promise<{ file: File; dataUrl: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = (e.target?.result as string) || '';
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ file, dataUrl: src });
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve({ file: compressedFile, dataUrl });
              } else {
                resolve({ file, dataUrl });
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => resolve({ file, dataUrl: src });
        img.src = src;
      };
      reader.onerror = () => resolve({ file, dataUrl: '' });
      reader.readAsDataURL(file);
    });
  };

  // Handle Cover Upload
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    // 1. Instant local preview
    const objectUrl = URL.createObjectURL(rawFile);
    setCoverPreviewUrl(objectUrl);

    setUploadingCover(true);
    try {
      // 2. Client-side compression (ensures tiny payload < 250KB, avoids 413 limits)
      const { file, dataUrl } = await compressImageForCover(rawFile);
      if (dataUrl) {
        setCoverUrl(dataUrl);
      }

      // 3. Attempt cloud upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', 'covers');

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && (data.storagePath || data.url)) {
        const permanentPath = data.storagePath || data.url;
        setCoverUrl(permanentPath);
        setCoverPreviewUrl(
          data.previewUrl ||
            (permanentPath.startsWith('http') || permanentPath.startsWith('/uploads/') || permanentPath.startsWith('data:')
              ? permanentPath
              : `/api/admin/preview?path=${encodeURIComponent(permanentPath)}`)
        );
      }
    } catch {
      // Non-fatal: the optimized compressed dataUrl is already set and preserved
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          cover_url: coverUrl.trim() || null,
          description: description.trim() || null,
          category: category.trim() || null,
          progress: Number(progress),
          show_progress: showProgress,
          allow_feedback: allowFeedback,
          is_visible: isVisible,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'حدث خطأ أثناء إنشاء المشروع');
      } else {
        router.push('/admin');
        router.refresh();
      }
    } catch {
      setError('فشل الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-studio-bg flex flex-col" dir="rtl">
      <AdminNavbar />

      <main className="mx-auto flex-1 w-full max-w-3xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">إضافة مشروع جديد</h1>
            <p className="mt-1 text-xs text-studio-text-secondary">
              أدخل البيانات الأساسية ونسبة الإنجاز لتجهيز المشروع
            </p>
          </div>
          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-studio-surface px-3.5 py-2 text-xs text-studio-text-secondary hover:text-white transition"
          >
            <ArrowRight className="h-4 w-4" />
            <span>رجوع للمشاريع</span>
          </Link>
        </div>

        {/* Form Container */}
        <div className="glass-card rounded-2xl border border-white/10 p-6 sm:p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-400">
                {error}
              </div>
            )}

            {/* اسم المشروع */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">
                اسم المشروع <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: هوية القناة 2027، هوية الأخبار، ..."
                required
                className="w-full rounded-xl border border-white/10 bg-studio-surface px-4 py-2.5 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue focus:ring-1 focus:ring-studio-blue"
              />
            </div>

            {/* صورة الغلاف */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">
                صورة الغلاف (رابط أو رفع ملف)
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={coverUrl}
                  onChange={(e) => {
                    setCoverUrl(e.target.value);
                    setCoverPreviewUrl(e.target.value);
                  }}
                  placeholder="https://... أو قم برفع صورة"
                  className="flex-1 rounded-xl border border-white/10 bg-studio-surface px-4 py-2.5 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue"
                />
                <label className="flex items-center justify-center gap-2 cursor-pointer rounded-xl border border-white/10 bg-studio-surface px-4 py-2.5 text-xs font-semibold text-studio-text-secondary hover:bg-studio-card hover:text-white transition">
                  <Upload className="h-4 w-4 text-studio-blue-glow" />
                  <span>{uploadingCover ? 'جارٍ الرفع...' : 'رفع صورة'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    disabled={uploadingCover}
                    className="hidden"
                  />
                </label>
              </div>

              {(coverPreviewUrl || coverUrl) && (
                <div className="mt-3 relative aspect-video w-full max-w-xs overflow-hidden rounded-xl border border-white/10">
                  <img
                    src={
                      coverPreviewUrl ||
                      (coverUrl.startsWith('http') || coverUrl.startsWith('/uploads/')
                        ? coverUrl
                        : `/api/admin/preview?path=${encodeURIComponent(coverUrl)}`)
                    }
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>

            {/* وصف مختصر (optional) */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">
                وصف مختصر (اختياري)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="نبذة موجزة عن نطاق العمل الفني والمخرجات..."
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-studio-surface p-3 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue focus:ring-1 focus:ring-studio-blue"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* التصنيف (optional) */}
              <div>
                <label className="block text-xs font-semibold text-white mb-2">
                  التصنيف (اختياري)
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="مثال: هويات تلفزيونية، برامج حوارية"
                  className="w-full rounded-xl border border-white/10 bg-studio-surface px-4 py-2.5 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue"
                />
              </div>

              {/* تفعيل وتخصيص شريط الإنجاز */}
              <div className="rounded-xl border border-white/5 bg-studio-surface/60 p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showProgress}
                    onChange={(e) => setShowProgress(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-studio-surface text-studio-blue focus:ring-studio-blue"
                  />
                  <span className="text-xs font-semibold text-white">
                    تضمين شريط الإنجاز في هذا المشروع
                  </span>
                </label>
                <p className="text-[11px] text-studio-text-muted mr-7">
                  يمكنك إلغاء شريط الإنجاز إذا كان هذا المشروع لا يتطلب عرض نسبة مئوية للعميل.
                </p>

                {showProgress && (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-studio-text-secondary">نسبة الإنجاز الأولية (0–100%)</label>
                      <span className="text-xs font-mono font-bold text-studio-gold">{progress}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={progress}
                        onChange={(e) => setProgress(Number(e.target.value))}
                        className="w-full accent-studio-blue cursor-pointer"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={progress}
                        onChange={(e) => setProgress(Math.min(100, Math.max(0, Number(e.target.value))))}
                        className="w-16 rounded-lg border border-white/10 bg-studio-surface p-1.5 text-center text-xs font-mono text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* خيار وضع ملفات المشروع: تفاعلي أو للعرض فقط */}
            <div className="rounded-xl border border-white/10 bg-studio-surface/60 p-4 space-y-3">
              <label className="text-xs font-semibold text-white block">
                طبيعة ملفات المشروع وتفاعل العميل:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* تفاعلي (مراجعة واعتماد) */}
                <div
                  onClick={() => setAllowFeedback(true)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition flex flex-col justify-between ${
                    allowFeedback
                      ? 'border-studio-blue bg-studio-blue/10 text-white shadow-md shadow-studio-blue/15'
                      : 'border-white/5 bg-studio-surface hover:border-white/10 text-studio-text-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <input
                      type="radio"
                      name="projectMode"
                      checked={allowFeedback}
                      onChange={() => setAllowFeedback(true)}
                      className="accent-studio-blue cursor-pointer"
                    />
                    <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                      <MessageSquare className="h-3.5 w-3.5 text-studio-blue-glow" />
                      <span>تفاعلي (مراجعة واعتماد)</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-studio-text-muted leading-relaxed mr-5">
                    يتيح للعميل كتابة الملاحظات والتعليقات على الفيديو، اعتماد الملفات، وظهور وسم مرحلة العمل (V1).
                  </p>
                </div>

                {/* للعرض والتحميل والمشاركة فقط */}
                <div
                  onClick={() => setAllowFeedback(false)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition flex flex-col justify-between ${
                    !allowFeedback
                      ? 'border-studio-blue bg-studio-blue/10 text-white shadow-md shadow-studio-blue/15'
                      : 'border-white/5 bg-studio-surface hover:border-white/10 text-studio-text-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <input
                      type="radio"
                      name="projectMode"
                      checked={!allowFeedback}
                      onChange={() => setAllowFeedback(false)}
                      className="accent-studio-blue cursor-pointer"
                    />
                    <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                      <Eye className="h-3.5 w-3.5 text-studio-blue-glow" />
                      <span>للعرض والتحميل والمشاركة فقط</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-studio-text-muted leading-relaxed mr-5">
                    عرض الصور والفيديو بحجم كامل وبدون خانة الملاحظات أو زر الاعتماد أو وسم النسخة (V1).
                  </p>
                </div>
              </div>
            </div>

            {/* ظاهر للعميل yes/no */}
            <div className="pt-2 border-t border-white/5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => setIsVisible(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-studio-surface text-studio-blue focus:ring-studio-blue"
                />
                <span className="text-xs font-semibold text-white">
                  ظاهر للعميل (Yes / No)
                </span>
              </label>
              <p className="mt-1 text-[11px] text-studio-text-muted mr-7">
                في حال إلغاء التحديد، لن يظهر هذا المشروع في صفحات العرض الخاصة بالعملاء.
              </p>
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
              <Link
                href="/admin"
                className="rounded-xl border border-white/10 bg-studio-surface px-5 py-2.5 text-xs font-semibold text-studio-text-secondary hover:text-white transition"
              >
                إلغاء
              </Link>
              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="flex items-center gap-2 rounded-xl bg-studio-blue hover:bg-studio-blue-glow px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-studio-blue/30 transition disabled:opacity-50"
              >
                {saving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>حفظ المشروع</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
