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
        const permanentPath = data.storagePath || data.url;
        setCoverUrl(permanentPath);
        setCoverPreviewUrl(
          data.previewUrl ||
            (permanentPath.startsWith('http') || permanentPath.startsWith('/uploads/')
              ? permanentPath
              : `/api/admin/preview?path=${encodeURIComponent(permanentPath)}`)
        );
      } else {
        alert(data.error || 'ÙØ´Ù„ Ø±ÙØ¹ ØµÙˆØ±Ø© Ø§Ù„ØºÙ„Ø§Ù');
      }
    } catch {
      alert('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø±ÙØ¹ ØµÙˆØ±Ø© Ø§Ù„ØºÙ„Ø§Ù');
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
        setError(data.error || 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹');
      } else {
        router.push('/admin');
        router.refresh();
      }
    } catch {
      setError('ÙØ´Ù„ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø®Ø§Ø¯Ù…');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-studio-bg flex flex-col">
      <AdminNavbar />

      <main className="mx-auto flex-1 w-full max-w-3xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Ø¥Ø¶Ø§ÙØ© Ù…Ø´Ø±ÙˆØ¹ Ø¬Ø¯ÙŠØ¯</h1>
            <p className="mt-1 text-xs text-studio-text-secondary">
              Ø£Ø¯Ø®Ù„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© ÙˆÙ†Ø³Ø¨Ø© Ø§Ù„Ø¥Ù†Ø¬Ø§Ø² Ù„ØªØ¬Ù‡ÙŠØ² Ø§Ù„Ù…Ø´Ø±ÙˆØ¹
            </p>
          </div>
          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-studio-surface px-3.5 py-2 text-xs text-studio-text-secondary hover:text-white transition"
          >
            <ArrowRight className="h-4 w-4" />
            <span>Ø±Ø¬ÙˆØ¹ Ù„Ù„Ù…Ø´Ø§Ø±ÙŠØ¹</span>
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

            {/* Ø§Ø³Ù… Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">
                Ø§Ø³Ù… Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ù…Ø«Ø§Ù„: Ù‡ÙˆÙŠØ© Ø§Ù„Ù‚Ù†Ø§Ø© 2027ØŒ Ù‡ÙˆÙŠØ© Ø§Ù„Ø£Ø®Ø¨Ø§Ø±ØŒ ..."
                required
                className="w-full rounded-xl border border-white/10 bg-studio-surface px-4 py-2.5 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue focus:ring-1 focus:ring-studio-blue"
              />
            </div>

            {/* ØµÙˆØ±Ø© Ø§Ù„ØºÙ„Ø§Ù */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">
                ØµÙˆØ±Ø© Ø§Ù„ØºÙ„Ø§Ù (Ø±Ø§Ø¨Ø· Ø£Ùˆ Ø±ÙØ¹ Ù…Ù„Ù)
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={coverUrl}
                  onChange={(e) => {
                    setCoverUrl(e.target.value);
                    setCoverPreviewUrl(e.target.value);
                  }}
                  placeholder="https://... Ø£Ùˆ Ù‚Ù… Ø¨Ø±ÙØ¹ ØµÙˆØ±Ø©"
                  className="flex-1 rounded-xl border border-white/10 bg-studio-surface px-4 py-2.5 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue"
                />
                <label className="flex items-center justify-center gap-2 cursor-pointer rounded-xl border border-white/10 bg-studio-surface px-4 py-2.5 text-xs font-semibold text-studio-text-secondary hover:bg-studio-card hover:text-white transition">
                  <Upload className="h-4 w-4 text-studio-blue-glow" />
                  <span>{uploadingCover ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø±ÙØ¹...' : 'Ø±ÙØ¹ ØµÙˆØ±Ø©'}</span>
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

            {/* ÙˆØµÙ Ù…Ø®ØªØµØ± (optional) */}
            <div>
              <label className="block text-xs font-semibold text-white mb-2">
                ÙˆØµÙ Ù…Ø®ØªØµØ± (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ù†Ø¨Ø°Ø© Ù…ÙˆØ¬Ø²Ø© Ø¹Ù† Ù†Ø·Ø§Ù‚ Ø§Ù„Ø¹Ù…Ù„ Ø§Ù„ÙÙ†ÙŠ ÙˆØ§Ù„Ù…Ø®Ø±Ø¬Ø§Øª..."
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-studio-surface p-3 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue focus:ring-1 focus:ring-studio-blue"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Ø§Ù„ØªØµÙ†ÙŠÙ (optional) */}
              <div>
                <label className="block text-xs font-semibold text-white mb-2">
                  Ø§Ù„ØªØµÙ†ÙŠÙ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ù…Ø«Ø§Ù„: Ù‡ÙˆÙŠØ§Øª ØªÙ„ÙØ²ÙŠÙˆÙ†ÙŠØ©ØŒ Ø¨Ø±Ø§Ù…Ø¬ Ø­ÙˆØ§Ø±ÙŠØ©"
                  className="w-full rounded-xl border border-white/10 bg-studio-surface px-4 py-2.5 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue"
                />
              </div>

              {/* ØªÙØ¹ÙŠÙ„ ÙˆØªØ®ØµÙŠØµ Ø´Ø±ÙŠØ· Ø§Ù„Ø¥Ù†Ø¬Ø§Ø² */}
              <div className="rounded-xl border border-white/5 bg-studio-surface/60 p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showProgress}
                    onChange={(e) => setShowProgress(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-studio-surface text-studio-blue focus:ring-studio-blue"
                  />
                  <span className="text-xs font-semibold text-white">
                    ØªØ¶Ù…ÙŠÙ† Ø´Ø±ÙŠØ· Ø§Ù„Ø¥Ù†Ø¬Ø§Ø² ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹
                  </span>
                </label>
                <p className="text-[11px] text-studio-text-muted mr-7">
                  ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ù„ØºØ§Ø¡ Ø´Ø±ÙŠØ· Ø§Ù„Ø¥Ù†Ø¬Ø§Ø² Ø¥Ø°Ø§ ÙƒØ§Ù† Ù‡Ø°Ø§ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ Ù„Ø§ ÙŠØªØ·Ù„Ø¨ Ø¹Ø±Ø¶ Ù†Ø³Ø¨Ø© Ù…Ø¦ÙˆÙŠØ© Ù„Ù„Ø¹Ù…ÙŠÙ„.
                </p>

                {showProgress && (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-studio-text-secondary">Ù†Ø³Ø¨Ø© Ø§Ù„Ø¥Ù†Ø¬Ø§Ø² Ø§Ù„Ø£ÙˆÙ„ÙŠØ© (0â€“100%)</label>
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

            {/* Ø®ÙŠØ§Ø± ÙˆØ¶Ø¹ Ù…Ù„ÙØ§Øª Ø§Ù„Ù…Ø´Ø±ÙˆØ¹: ØªÙØ§Ø¹Ù„ÙŠ Ø£Ùˆ Ù„Ù„Ø¹Ø±Ø¶ ÙÙ‚Ø· */}
            <div className="rounded-xl border border-white/10 bg-studio-surface/60 p-4 space-y-3">
              <label className="text-xs font-semibold text-white block">
                Ø·Ø¨ÙŠØ¹Ø© Ù…Ù„ÙØ§Øª Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ ÙˆØªÙØ§Ø¹Ù„ Ø§Ù„Ø¹Ù…ÙŠÙ„:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* ØªÙØ§Ø¹Ù„ÙŠ (Ù…Ø±Ø§Ø¬Ø¹Ø© ÙˆØ§Ø¹ØªÙ…Ø§Ø¯) */}
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
                      <span>ØªÙØ§Ø¹Ù„ÙŠ (Ù…Ø±Ø§Ø¬Ø¹Ø© ÙˆØ§Ø¹ØªÙ…Ø§Ø¯)</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-studio-text-muted leading-relaxed mr-5">
                    ÙŠØªÙŠØ­ Ù„Ù„Ø¹Ù…ÙŠÙ„ ÙƒØªØ§Ø¨Ø© Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª ÙˆØ§Ù„ØªØ¹Ù„ÙŠÙ‚Ø§Øª Ø¹Ù„Ù‰ Ø§Ù„ÙÙŠØ¯ÙŠÙˆØŒ Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ù…Ù„ÙØ§ØªØŒ ÙˆØ¸Ù‡ÙˆØ± ÙˆØ³Ù… Ù…Ø±Ø­Ù„Ø© Ø§Ù„Ø¹Ù…Ù„ (V1).
                  </p>
                </div>

                {/* Ù„Ù„Ø¹Ø±Ø¶ ÙˆØ§Ù„ØªØ­Ù…ÙŠÙ„ ÙˆØ§Ù„Ù…Ø´Ø§Ø±ÙƒØ© ÙÙ‚Ø· */}
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
                      <span>Ù„Ù„Ø¹Ø±Ø¶ ÙˆØ§Ù„ØªØ­Ù…ÙŠÙ„ ÙˆØ§Ù„Ù…Ø´Ø§Ø±ÙƒØ© ÙÙ‚Ø·</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-studio-text-muted leading-relaxed mr-5">
                    Ø¹Ø±Ø¶ Ø§Ù„ØµÙˆØ± ÙˆØ§Ù„ÙÙŠØ¯ÙŠÙˆ Ø¨Ø­Ø¬Ù… ÙƒØ§Ù…Ù„ ÙˆØ¨Ø¯ÙˆÙ† Ø®Ø§Ù†Ø© Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø£Ùˆ Ø²Ø± Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯ Ø£Ùˆ ÙˆØ³Ù… Ø§Ù„Ù†Ø³Ø®Ø© (V1).
                  </p>
                </div>
              </div>
            </div>

            {/* Ø¸Ø§Ù‡Ø± Ù„Ù„Ø¹Ù…ÙŠÙ„ yes/no */}
            <div className="pt-2 border-t border-white/5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => setIsVisible(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-studio-surface text-studio-blue focus:ring-studio-blue"
                />
                <span className="text-xs font-semibold text-white">
                  Ø¸Ø§Ù‡Ø± Ù„Ù„Ø¹Ù…ÙŠÙ„ (Yes / No)
                </span>
              </label>
              <p className="mt-1 text-[11px] text-studio-text-muted mr-7">
                ÙÙŠ Ø­Ø§Ù„ Ø¥Ù„ØºØ§Ø¡ Ø§Ù„ØªØ­Ø¯ÙŠØ¯ØŒ Ù„Ù† ÙŠØ¸Ù‡Ø± Ù‡Ø°Ø§ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ ÙÙŠ ØµÙØ­Ø§Øª Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ø®Ø§ØµØ© Ø¨Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡.
              </p>
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
              <Link
                href="/admin"
                className="rounded-xl border border-white/10 bg-studio-surface px-5 py-2.5 text-xs font-semibold text-studio-text-secondary hover:text-white transition"
              >
                Ø¥Ù„ØºØ§Ø¡
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
                    <span>Ø­ÙØ¸ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹</span>
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
