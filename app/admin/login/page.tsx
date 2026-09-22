'use client';

import React, { useState, useRef } from 'react';
import { Shield, Lock, ArrowLeft } from 'lucide-react';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    const formPassword = (formData.get('password') as string) || '';
    const finalPassword = formPassword || password;

    if (!finalPassword.trim()) {
      setError('يرجى إدخال كلمة مرور الإدارة');
      passwordInputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: finalPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'كلمة المرور غير صحيحة');
        setLoading(false);
        setTimeout(() => {
          passwordInputRef.current?.focus();
          passwordInputRef.current?.select();
        }, 50);
      } else {
        // Full navigation ensures cookie persistence and bypasses Next.js stale router cache
        window.location.href = '/admin';
      }
    } catch {
      setError('حدث خطأ في الاتصال بالخادم. يرجى المحاولة مجدداً.');
      setLoading(false);
      passwordInputRef.current?.focus();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-studio-bg p-4">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
        <div className="h-[400px] w-[400px] rounded-full bg-amber-500/10 blur-[130px]" />
      </div>

      <div className="glass-card relative z-10 w-full max-w-md rounded-2xl p-8 border border-white/10 shadow-2xl animate-fade-in">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-studio-gold border border-amber-500/25 shadow-lg shadow-amber-500/10">
            <Shield className="h-7 w-7" />
          </div>

          <h1 className="mt-5 text-2xl font-bold text-white">
            لوحة الإدارة
          </h1>
          <p className="mt-2 text-xs text-studio-text-secondary">
            أدخل كلمة مرور الإدارة لإدارة المشاريع وروابط العملاء
          </p>
        </div>

        <form
          method="POST"
          action="/api/admin/login"
          noValidate
          onSubmit={handleLogin}
          className="mt-8 space-y-4"
        >
          <div className="relative">
            <label htmlFor="admin-password-input" className="sr-only">
              كلمة مرور الإدارة
            </label>
            <Lock className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-text-muted" />
            <input
              ref={passwordInputRef}
              id="admin-password-input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder="كلمة مرور الإدارة"
              required
              aria-required="true"
              aria-invalid={!!error}
              aria-describedby={error ? 'admin-login-error' : undefined}
              autoFocus
              className="w-full rounded-xl border border-white/10 bg-studio-surface py-3 pr-10 pl-4 text-sm text-white placeholder-studio-text-muted outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 focus-visible:ring-2 focus-visible:ring-amber-500"
            />
          </div>

          {error && (
            <p
              id="admin-login-error"
              role="alert"
              aria-live="assertive"
              className="text-center text-xs font-medium text-red-400 animate-slide-up"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-label="تسجيل الدخول إلى لوحة الإدارة"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 hover:bg-amber-800 active:bg-amber-900 py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-amber-900/30 transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-studio-bg focus-visible:outline-none"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <span>تسجيل الدخول</span>
                <ArrowLeft className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-[11px] text-studio-text-muted">
          استوديو التصميم التلفزيوني والإعلامي • منطقة الإدارة
        </div>
      </div>
    </div>
  );
}
