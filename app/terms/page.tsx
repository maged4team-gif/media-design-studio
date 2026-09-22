import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  FileText,
  Shield,
  AlertTriangle,
  Mail,
  ArrowRight,
  Tv,
  Scale,
  RefreshCw,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'شروط الخدمة | Terms of Service - Media Design Studio',
  description: 'شروط وأحكام استخدام منصة استوديو التصميم Media Design Studio وإدارة المشاريع والملفات',
};

export default function TermsOfServicePage() {
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
          <div className="inline-flex items-center gap-2 rounded-full border border-studio-gold/30 bg-studio-gold/10 px-4 py-1.5 text-xs font-semibold text-studio-gold mb-4">
            <Scale className="h-4 w-4" />
            <span>شروط وأحكام الاستخدام • Terms of Service</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            شروط وأحكام استخدام المنصة
          </h1>
          <p className="mt-3 text-sm text-studio-text-muted">
            آخر تحديث: {lastUpdated} | Last Updated: September 23, 2026
          </p>
        </div>

        {/* Terms Sections Container */}
        <div className="space-y-8">
          {/* Section 1: Acceptance & Service Description */}
          <div className="rounded-2xl border border-studio-border bg-studio-card p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-studio-blue/20 text-studio-blue-glow">
                <FileText className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                1. طبيعة المنصة وقبول الشروط (Platform Overview & Acceptance)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                تُعد منصة <strong className="text-white">Media Design Studio</strong> استوديو رقمياً متخصصاً لإدارة وتنظيم واستعراض مشاريع التصميم والهويات التلفزيونية والملفات الإعلامية، مع إتاحة روابط وصول خاصة لاعتماد مخرجات الإنتاج والمواد المرئية.
              </p>
              <p>
                إن وصولك إلى المنصة أو استخدامك لأي من خدماتها يعني موافقتك الصريحة والكاملة على الالتزام بجميع بنود هذه الشروط والأحكام. إذا كنت لا توافق على هذه الشروط، يُرجى التوقف عن استخدام المنصة فوراً.
              </p>
            </div>
          </div>

          {/* Section 2: User Responsibilities & Content Ownership */}
          <div className="rounded-2xl border border-studio-border bg-studio-card p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-studio-blue/20 text-studio-blue-glow">
                <Shield className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                2. مسؤولية المستخدم والمحتوى المرفوع (Content & Responsibilities)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <ul className="space-y-2 mr-4 list-disc list-inside text-studio-text-primary">
                <li>
                  <strong className="text-white">ملكية المحتوى:</strong> يحتفظ المستخدم أو العميل بكامل حقوق الملكية الفكرية للملفات والمشاريع التي يقوم برفعها أو مشاركتها عبر المنصة.
                </li>
                <li>
                  <strong className="text-white">المسؤولية الكاملة عن المحتوى:</strong> يتحمل المستخدم أو المسؤول وحده المسؤولية القانونية والأخلاقية الكاملة عن صحة وشرعية المواد والملفات والتصاميم التي يرفعها أو يعتمدها من خلال المنصة.
                </li>
                <li>
                  <strong className="text-white">حقوق النشر والملكية:</strong> يجب على المستخدم التأكد من امتلاكه كافة الحقوق والتراخيص اللازمة للمواد الإعلامية والصوتية والبصرية قبل إضافتها أو بثها.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 3: Prohibited Use */}
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                3. الاستخدامات المحظورة (Prohibited Uses)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                يُحظر استخدام المنصة أو أي جزء منها في أي من الأنشطة التالية:
              </p>
              <ul className="space-y-2 mr-4 list-disc list-inside text-studio-text-primary">
                <li>أي استخدام غير قانوني أو ينتهك القوانين والأنظمة المعمول بها محلياً أو دولياً.</li>
                <li>رفع أو توزيع أي ملفات أو وسائط تحتوي على برمجيات ضارة، فيروسات، أو روابط مشبوهة.</li>
                <li>محاولة اختراق النظام، فك التشفير، تعطيل البنية التحتية، أو تجاوز القيود الأمنية الخاصة بالمنصة.</li>
                <li>إساءة استخدام بروتوكولات الربط السحابي (APIs) أو إجراء استدعاءات مكثفة تهدف للإضرار بالأداء العام.</li>
              </ul>
            </div>
          </div>

          {/* Section 4: Maintenance & Service Availability */}
          <div className="rounded-2xl border border-studio-border bg-studio-card p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-studio-blue/20 text-studio-blue-glow">
                <RefreshCw className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                4. تعديل الخدمة والصيانة الدورية (Service Changes & Maintenance)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                نحتفظ بالحق في تطوير أو تعديل أو تحديث ميزات المنصة أو واجهاتها في أي وقت لمواكبة أحدث معايير الإنتاج التلفزيوني والتقني.
              </p>
              <p>
                قد تتوقف الخدمة أو تتأثر مؤقتاً لأغراض الصيانة الدورية أو الطارئة، أو ترقية الخوادم والبنية التحتية السحابية. سنسعى دائماً لتقليل فترات التوقف المجدولة قدر الإمكان.
              </p>
            </div>
          </div>

          {/* Section 5: Disclaimer & Limitation of Liability */}
          <div className="rounded-2xl border border-studio-border bg-studio-card p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-studio-gold/20 text-studio-gold">
                <Scale className="h-5 w-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                5. إخلاء المسؤولية وحدود الضمان (Disclaimer & Limitation of Liability)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                تُقدم الخدمة على أساس حالتها الراهنة ومتاحة <strong className="text-white font-mono" dir="ltr">&quot;AS IS&quot;</strong> و <strong className="text-white font-mono" dir="ltr">&quot;AS AVAILABLE&quot;</strong> دون أي ضمانات صريحة أو ضمنية لعدم حدوث انقطاعات تقنية مفاجئة أو تأخير ناتج عن شبكات الاتصال أو المزودين السحابيين من الأطراف الثالثة (مثل Google Cloud أو Vercel أو Supabase).
              </p>
              <p>
                لا تتحمل إدارة <strong className="text-white">Media Design Studio</strong> أي مسؤولية عن أي أضرار غير مباشرة أو فقدان مؤقت للملفات ناتج عن قوة قاهرة أو سوء استخدام أو انقطاعات خارجة عن السيطرة التشغيلية المباشرة.
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
                6. التواصل والاستفسارات القانونية (Contact Us)
              </h2>
            </div>
            <div className="text-sm leading-relaxed text-studio-text-secondary space-y-3">
              <p>
                إذا كان لديك أي استفسار أو ملاحظة بخصوص شروط وأحكام الخدمة، يمكنك التواصل معنا مباشرة عبر البريد الإلكتروني:
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
            <Link href="/privacy" className="text-studio-text-muted hover:text-white transition">
              سياسة الخصوصية
            </Link>
            <Link href="/terms" className="text-white hover:underline">
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
