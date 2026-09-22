'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Prevent mobile scroll jump (1487px) and ensure viewport stays at top
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, []);

  const performLogin = async (pwdToSubmit: string) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/client/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password: pwdToSubmit }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'تعذر تسجيل الدخول');
        setLoading(false);
        setTimeout(() => {
          passwordInputRef.current?.focus();
          passwordInputRef.current?.select();
        }, 50);
      } else {
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
        if (redirectTo) {
          window.location.href = redirectTo;
        } else {
          window.location.href = window.location.pathname;
        }
      }
    } catch {
      setError('حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مجدداً.');
      setLoading(false);
      passwordInputRef.current?.focus();
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const domInput = e.currentTarget?.querySelector('input[type="password"]') as HTMLInputElement | null;
    const pwdToSubmit = password.trim() || domInput?.value?.trim() || '';

    if (!isPublic && !pwdToSubmit) {
      setError('يرجى إدخال كلمة المرور للمتابعة');
      passwordInputRef.current?.focus();
      return;
    }

    if (!isPublic && loading) return;
    await performLogin(pwdToSubmit);
  };

  useEffect(() => {
    if (isPublic) {
      performLogin('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublic]);

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-studio-bg p-4"
      style={{ overflowAnchor: 'none' }}
    >
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
                <p
                  role="alert"
                  aria-live="assertive"
                  className="text-center text-xs font-medium text-red-400 animate-slide-up"
                >
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => performLogin('')}
                  aria-label="إعادة محاولة الدخول المباشر"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-blue py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-studio-blue/30 hover:bg-studio-blue-glow transition focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none"
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
                aria-label={`دخول مباشر إلى ${projectTitle || 'المشاريع'}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-blue py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-studio-blue/30 hover:bg-studio-blue-glow transition disabled:opacity-90 focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none"
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
          /* Protected Password Form */
          <form
            method="POST"
            action="/api/client/auth"
            noValidate
            onSubmit={handleLogin}
            className="mt-8 space-y-4"
          >
            <input type="hidden" name="slug" value={slug} />
            <div className="relative">
              <label htmlFor="client-gate-password" className="sr-only">
                كلمة المرور للدخول
              </label>
              <input
                ref={passwordInputRef}
                id="client-gate-password"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="كلمة المرور"
                required
                aria-required="true"
                aria-invalid={!!error}
                aria-describedby={error ? 'client-gate-error' : undefined}
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-studio-surface px-4 py-3 text-center text-base tracking-widest text-white placeholder-studio-text-muted outline-none transition focus:border-studio-blue focus:ring-2 focus:ring-studio-blue/30 focus-visible:ring-2 focus-visible:ring-studio-blue"
              />
            </div>

            {error && (
              <p
                id="client-gate-error"
                role="alert"
                aria-live="assertive"
                className="text-center text-xs font-medium text-red-400 animate-slide-up"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              aria-label={projectTitle ? `دخول إلى ${projectTitle}` : 'دخول للمشاريع'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-blue py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-studio-blue/30 hover:bg-studio-blue-glow transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-studio-blue focus-visible:outline-none"
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
