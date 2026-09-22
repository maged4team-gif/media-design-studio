'use client';

import React, { useState, useEffect } from 'react';
import { Lock, ArrowLeft, Globe } from 'lucide-react';

interface PasswordGateProps {
  viewerName: string;
  slug: string;
  redirectTo?: string;
  projectTitle?: string;
  isPublic?: boolean;
}

export const PasswordGate: React.FC<PasswordGateProps> = ({
  viewerName,
  slug,
  redirectTo,
  projectTitle,
  isPublic = false,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isPublic);

  const performLogin = async (pwdToSubmit: string) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/client/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password: pwdToSubmit }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر تسجيل الدخول');
      } else {
        if (redirectTo) {
          window.location.href = redirectTo;
        } else {
          window.location.href = window.location.pathname;
        }
      }
    } catch {
      setError('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPublic && (!password.trim() || loading)) return;
    await performLogin(password.trim());
  };

  useEffect(() => {
    if (isPublic) {
      performLogin('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublic]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-studio-bg p-4">
      {/* Background Glow effects */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
        <div className="h-[450px] w-[450px] rounded-full bg-studio-blue/10 blur-[120px]" />
        <div className="h-[300px] w-[300px] rounded-full bg-studio-gold/10 blur-[100px] translate-x-20 -translate-y-20" />
      </div>

      {/* Access Card */}
      <div className="glass-card relative z-10 w-full max-w-md rounded-2xl p-8 border border-white/10 shadow-2xl animate-fade-in">
        <div className="text-center">
          {/* Lock or Globe Icon */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-studio-blue/15 text-studio-blue-glow border border-studio-blue/25 shadow-lg shadow-studio-blue/20">
            {isPublic ? <Globe className="h-7 w-7" /> : <Lock className="h-7 w-7" />}
          </div>

          {/* Greeting per specification */}
          <h1 className="mt-5 text-2xl font-bold text-white">
            مرحباً {viewerName}
          </h1>
          <p className="mt-2 text-sm text-studio-text-secondary">
            {isPublic
              ? (projectTitle ? `مشروع: ${projectTitle}` : 'رابط عام للمشاريع')
              : (projectTitle ? `مشروع: ${projectTitle}` : 'أدخل كلمة المرور للمتابعة')}
          </p>
        </div>

        {isPublic ? (
          /* Public Link Auto-Login State */
          <div className="mt-8 space-y-4">
            {error ? (
              <div className="space-y-3">
                <p className="text-center text-xs font-medium text-red-400 animate-slide-up">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => performLogin('')}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-blue py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-studio-blue/30 hover:bg-studio-blue-glow transition"
                >
                  <span>إعادة المحاولة</span>
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => performLogin('')}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-blue py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-studio-blue/30 hover:bg-studio-blue-glow transition disabled:opacity-90"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>جاري الدخول إلى {projectTitle || 'المشاريع'}...</span>
                  </>
                ) : (
                  <>
                    <span>دخول مباشر إلى {projectTitle || 'المشاريع'}</span>
                    <ArrowLeft className="h-4 w-4" />
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          /* Password Form */
          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة المرور"
                required
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-studio-surface px-4 py-3 text-center text-base tracking-widest text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue focus:ring-2 focus:ring-studio-blue/30"
              />
            </div>

            {error && (
              <p className="text-center text-xs font-medium text-red-400 animate-slide-up">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-blue py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-studio-blue/30 hover:bg-studio-blue-glow transition disabled:opacity-50"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>{projectTitle ? `دخول إلى ${projectTitle}` : 'دخول للمشاريع'}</span>
                  <ArrowLeft className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-8 text-center text-[11px] text-studio-text-muted">
          استوديو التصميم • {isPublic ? 'رابط عام مصرح به' : 'وصول خاص وآمن'}
        </div>
      </div>
    </div>
  );
};
