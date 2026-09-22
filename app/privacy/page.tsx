import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ShieldCheck,
  HardDrive,
  Lock,
  Mail,
  ExternalLink,
  ArrowRight,
  Tv,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'سياسة الخصوصية | Privacy Policy - Media Design Studio',
  description: 'سياسة الخصوصية واستخدام بيانات Google OAuth و Google Drive في منصة Media Design Studio',
};

export default function PrivacyPolicyPage() {
  const lastUpdated = '23 سبتمبر 2026';

  return (
    <div className="relative min-h-screen bg-studio-bg text-studio-text-primary selection:bg-studio-blue selection:text-white flex flex-col justify-between overflow-hidden">
      {/* Background ambient glowing spheres */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center -z-10">
        <div className="h-[600px] w-[600px] rounded-full bg-studio-blue/10 blur-[150px]" />
        <div className="h-[400px] w-[400px] rounded-full bg-studio-gold/10 blur-[130px] translate-x-32 -translate-y-32" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-studio-bg/80 backdrop-blur-md px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-studio-blue to-studio-blue-subtle text-white shadow-lg shadow-studio-blue/25 group-hover:scale-105 transition">
              <Tv className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold text-white group-hover:text-studio-blue-glow transition">
                استوديو التصميم
              </span>
              <p className="text-[11px] text-studio-text-muted">Media Design Studio</p>
            </div>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-studio-surface/80 px-3.5 py-1.5 text-xs font-semibold text-studio-text-secondary hover:text-white hover:border-white/20 transition"
          >
            <span>الرئيسية</span>
            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 py-12 sm:py-16">
        {/* Page Title & Badge */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-studio-blue/30 bg-studio-blue/10 px-4 py-1.5 text-xs font-semibold text-studio-blue-glow mb-4">
            <ShieldCheck className="h-4 w-4" />
            <span>سياسة الخصوصية وحماية البيانات • Privacy Policy</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            سياسة الخصوصية وحماية بيانات المستخدم
          </h1>
          <p className="mt-3 text-sm text-studio-text-muted">
            آخر تحديث: {lastUpdated} | Last Updated: September 23, 2026
          </p>
        </div>

        {/* Policy Sections Container */}
        <div className="space-y-8">
          {/* Section 1: Introduction */}
          <div className="rounded-2xl border border-studio-border bg-studio-card p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-studio-blue/20 text-studio-blue-glow">
                <FileText className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                1. مقدمة ونطاق التطبيق (Introduction & Scope)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                نلتزم في <strong className="text-white">Media Design Studio</strong> بحماية خصوصية وأمان بيانات مستخدمينا وعملائنا. توضح هذه السياسة كيفية جمع واستخدام وحماية البيانات عند استخدام المنصة وتطبيقات الربط السحابي المرتبطة بها.
              </p>
              <p>
                تم تصميم المنصة لتسهيل استعراض واعتماد ملفات التصميم والإنتاج الإعلامي، ونحن نلتزم بأعلى معايير الشفافية والأمان وفقاً للوائح والسياسات العالمية بما في ذلك سياسات بيانات مستخدم خدمات Google.
              </p>
            </div>
          </div>

          {/* Section 2: Google OAuth & Drive Integration */}
          <div className="rounded-2xl border border-studio-border bg-studio-card p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-studio-blue/20 text-studio-blue-glow">
                <HardDrive className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                2. استخدام خدمات Google وبروتوكول التحقق (Google OAuth & Google Drive)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                يستخدم تطبيق <strong className="text-white">Media Design Studio</strong> خدمات Google السحابية من خلال التالي:
              </p>
              <ul className="space-y-2 mr-4 list-disc list-inside text-studio-text-primary">
                <li>
                  <strong className="text-white">بروتوكول Google OAuth 2.0:</strong> للتحقق الآمن من هوية مسؤول المنصة وربط الحساب السحابي المعتمد بدون الحاجة للاحتفاظ بكلمات المرور.
                </li>
                <li>
                  <strong className="text-white">واجهة Google Drive API:</strong> لرفع وتنظيم وحفظ ملفات المشاريع ومواد الميديا (فيديو، صوت، تصاميم، صور) التي يختار المدير أو المستخدم رفعها بشكل اختياري وصريح لعرضها داخل الاستوديو.
                </li>
                <li>
                  <strong className="text-white">نطاق الوصول المحدود (drive.file):</strong> يطلب التطبيق فقط صلاحية الوصول إلى الملفات التي تم إنشاؤها أو رفعها بواسطة هذا التطبيق تحديداً، ولا يستعرض أو يتصفح ملفاتك الشخصية الأخرى الموجودة في Google Drive.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 3: Data Usage & Limited Use Policy */}
          <div className="rounded-2xl border border-studio-border bg-studio-card p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                3. الغرض من استخدام البيانات والالتزام الصارم (Purpose & Limited Use)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                نؤكد بوضوح التزامنا الصارم بالمبادئ التالية:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 mt-4">
                <div className="p-4 rounded-xl border border-white/5 bg-studio-surface">
                  <h3 className="font-semibold text-white mb-1">عدم بيع البيانات إطلاقاً</h3>
                  <p className="text-xs text-studio-text-muted">
                    لا نقوم ببيع أو تأجير أو المتاجرة ببيانات المستخدمين أو بيانات Google لأي جهة تجارية أو إعلانية تحت أي ظرف.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-studio-surface">
                  <h3 className="font-semibold text-white mb-1">عدم مشاركة البيانات مع أطراف ثالثة</h3>
                  <p className="text-xs text-studio-text-muted">
                    لا نشارك بيانات مستخدمي Google مع أي أطراف ثالثة، باستثناء ما يلزم تشغيلياً لتقديم الخدمة واستضافة المنصة أو استجابة لطلب قانوني ملزم.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-studio-surface">
                  <h3 className="font-semibold text-white mb-1">حصرية الاستخدام للوظائف الأساسية</h3>
                  <p className="text-xs text-studio-text-muted">
                    تُستخدم بيانات Google حصرياً لتوفير الوظائف المعلنة للتطبيق، والمتمثلة في حفظ وبث واستعراض أصول التصميم والإنتاج الإعلامي.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-studio-surface">
                  <h3 className="font-semibold text-white mb-1">امتثال سياسة الاستخدام المحدود</h3>
                  <p className="text-xs text-studio-text-muted">
                    يلتزم التطبيق التام بـ Google API Services User Data Policy بما في ذلك متطلبات الاستخدام المحدود (Limited Use requirements).
                  </p>
                </div>
              </div>

              {/* Official Google Statement in English */}
              <div className="mt-4 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-studio-text-secondary font-mono leading-relaxed" dir="ltr">
                <strong>Google API Limited Use Disclosure:</strong><br />
                Media Design Studio&#39;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-studio-blue-glow underline hover:text-white"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </div>
            </div>
          </div>

          {/* Section 4: Security & Storage */}
          <div className="rounded-2xl border border-studio-border bg-studio-card p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-studio-blue/20 text-studio-blue-glow">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                4. حماية وتشفير البيانات (Data Security & Protection)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                نطبق معايير أمنية تقنية وتنظيمية متقدمة لحماية بياناتك:
              </p>
              <ul className="space-y-2 mr-4 list-disc list-inside text-studio-text-primary">
                <li>يتم تشفير جميع الاتصالات والبيانات المنقولة باستخدام بروتوكول TLS / HTTPS المشفّر.</li>
                <li>يتم تأمين رموز الوصول والشهادات الرقمية على خوادم محمية بأعلى معايير الأمان الموصى بها.</li>
                <li>تتم إدارة الجلسات وروابط المشاريع عبر توقيعات تشفير قوية (HMAC-SHA256) لمنع التلاعب أو الوصول غير المصرح به.</li>
              </ul>
            </div>
          </div>

          {/* Section 5: Revoking Access */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-studio-gold">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                5. التحكم وإلغاء صلاحية الوصول (Revoking Access)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                يحتفظ المستخدم أو مدير الحساب بكامل الصلاحية لإلغاء وصول التطبيق إلى حسابه في Google أو Google Drive في أي وقت وبكل سهولة من خلال الخطوات التالية:
              </p>
              <ol className="space-y-2 mr-4 list-decimal list-inside text-studio-text-primary">
                <li>
                  الانتقال إلى صفحة إدارة أمان حساب Google الخاصة بك:{' '}
                  <a
                    href="https://myaccount.google.com/permissions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-studio-gold hover:underline font-semibold"
                    dir="ltr"
                  >
                    <span>Google Account Permissions</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>البحث عن تطبيق <strong className="text-white">Media Design Studio</strong> في قائمة التطبيقات المرتبطة.</li>
                <li>الضغط على زر <strong>إلغاء حق الوصول (Remove Access)</strong>.</li>
              </ol>
              <p className="text-xs text-studio-text-muted mt-2">
                بمجرد إلغاء الوصول، يتوقف التطبيق فوراً وبشكل نهائي عن القدرة على الاتصال بحساب Google أو التعامل مع أي ملفات جديدة.
              </p>
            </div>
          </div>

          {/* Section 6: Contact Information */}
          <div className="rounded-2xl border border-studio-border bg-studio-card p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-studio-blue/20 text-studio-blue-glow">
                <Mail className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                6. التواصل والاستفسارات (Contact Information)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                إذا كانت لديك أي أسئلة أو استفسارات تتعلق بسياسة الخصوصية أو معالجة البيانات، يسعدنا تواصلك المباشر معنا عبر البريد الإلكتروني المعتمد:
              </p>
              <div className="inline-block mt-2">
                <a
                  href="mailto:yam25y22@gmail.com"
                  className="inline-flex items-center gap-2 rounded-xl border border-studio-blue/30 bg-studio-blue/10 px-4 py-2 text-sm font-semibold text-studio-blue-glow hover:bg-studio-blue/20 hover:text-white transition"
                  dir="ltr"
                >
                  <Mail className="h-4 w-4" />
                  <span>yam25y22@gmail.com</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-studio-bg/60 py-6 text-center text-xs text-studio-text-muted mt-12">
        <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            استوديو التصميم • Media Design Studio © {new Date().getFullYear()}
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-white hover:underline">
              سياسة الخصوصية
            </Link>
            <Link href="/terms" className="text-studio-text-muted hover:text-white transition">
              شروط الخدمة
            </Link>
            <Link href="/" className="text-studio-text-muted hover:text-white transition">
              الرئيسية
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
