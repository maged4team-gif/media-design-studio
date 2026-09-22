import React from 'react';
import Link from 'next/link';
import { Tv, Shield, ArrowLeft, Sparkles, Film } from 'lucide-react';

export default function RootHomePage() {
  return (
    <div className="relative min-h-screen bg-studio-bg flex flex-col justify-between overflow-hidden">
      {/* Background ambient glowing spheres */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-studio-blue/10 blur-[150px]" />
        <div className="h-[400px] w-[400px] rounded-full bg-studio-gold/10 blur-[130px] translate-x-32 -translate-y-32" />
      </div>

      {/* Top minimal header */}
      <header className="relative z-10 w-full border-b border-white/5 bg-studio-bg/60 backdrop-blur-md px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-studio-blue to-studio-blue-subtle text-white shadow-lg shadow-studio-blue/25">
              <Tv className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold text-white">استوديو التصميم</span>
              <p className="text-[11px] text-studio-text-muted">Broadcast Design Studio</p>
            </div>
          </div>

          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-studio-gold hover:bg-amber-500/20 transition"
          >
            <Shield className="h-3.5 w-3.5" />
            <span>لوحة الإدارة</span>
          </Link>
        </div>
      </header>

      {/* Main hero showcase */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 py-16 sm:py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-studio-blue/30 bg-studio-blue/10 px-4 py-1.5 text-xs font-semibold text-studio-blue-glow mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          <span>منصة استعراض واعتماد الهويات التلفزيونية والمشاريع الإعلامية</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight tracking-tight">
          معرض مشاريع التصميم <br />
          <span className="bg-gradient-to-r from-studio-blue-glow via-sky-300 to-studio-gold bg-clip-text text-transparent">
            بأعلى معايير الإنتاج التلفزيوني
          </span>
        </h1>

        <p className="mt-6 text-sm sm:text-base text-studio-text-secondary max-w-2xl mx-auto leading-relaxed">
          بوابة خاصة وسريعة تتيح للعملاء استعراض باقات الجرافيك، مشاهدة الفواصل والشارات بدقة عالية، تدوين الملاحظات عند اللحظات الزمنية الدقيقة، واعتماد المخرجات فوراً.
        </p>

        {/* Action cards */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
          {/* Client Demo Link */}
          <Link
            href="/p/x7K29AbC"
            className="glass-card group flex flex-col items-center justify-center p-6 rounded-2xl border border-white/10 hover:border-studio-blue/50 text-center transition shadow-xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-studio-blue/20 text-studio-blue-glow mb-3 group-hover:scale-110 transition">
              <Film className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-studio-blue-glow transition">
              دخول العميل (رابط أحمد)
            </h3>
            <p className="mt-1 text-xs text-studio-text-muted">
              استعراض المشاريع المصرح بها (كلمة المرور: 2580)
            </p>
            <span className="mt-4 flex items-center gap-1 text-xs font-semibold text-studio-blue-glow">
              <span>فتح الرابط التجريبي</span>
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-1 transition" />
            </span>
          </Link>

          {/* Admin Login Link */}
          <Link
            href="/admin"
            className="glass-card group flex flex-col items-center justify-center p-6 rounded-2xl border border-white/10 hover:border-amber-500/50 text-center transition shadow-xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-studio-gold mb-3 group-hover:scale-110 transition">
              <Shield className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-studio-gold transition">
              لوحة تحكم الإدارة
            </h3>
            <p className="mt-1 text-xs text-studio-text-muted">
              إدارة المشاريع، رفع الملفات، وتوليد روابط العملاء
            </p>
            <span className="mt-4 flex items-center gap-1 text-xs font-semibold text-studio-gold">
              <span>دخول الإدارة</span>
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-1 transition" />
            </span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-studio-text-muted">
        استوديو التصميم التلفزيوني والإعلامي • Broadcast Media Showcase Portal
      </footer>
    </div>
  );
}
