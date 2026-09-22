'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Project } from '@/lib/supabase/database.types';
import { StudioHeader } from '@/components/shared/StudioHeader';
import { ProjectCard } from '@/components/client/ProjectCard';
import { matchesArabicSearch } from '@/lib/utils/arabic';
import { useRouter } from 'next/navigation';
import { FolderKanban } from 'lucide-react';

interface ClientHomeViewProps {
  viewerName: string;
  slug: string;
  projects: Project[];
}

export const ClientHomeView: React.FC<ClientHomeViewProps> = ({
  viewerName,
  slug,
  projects,
}) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('الكل');

  // Prevent mobile scroll jumping (e.g., 1487px jump) and ensure viewport begins at top
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, []);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [projects]);

  // Filter projects based on category and intelligent Arabic search
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        matchesArabicSearch(project.title, searchQuery) ||
        matchesArabicSearch(project.description, searchQuery);

      const matchesCategory =
        activeCategory === 'الكل' || project.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [projects, searchQuery, activeCategory]);

  const handleLogout = async () => {
    await fetch('/api/client/auth', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-studio-bg flex flex-col" style={{ overflowAnchor: 'none' }}>
      {/* Studio Header */}
      <StudioHeader
        viewerName={viewerName}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-8 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-studio-blue" />
            <span className="text-xs font-semibold tracking-wider text-studio-blue-glow">
              معرض المشاريع المعتمد
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            مشاريع التصميم والإنتاج
          </h1>
          <p className="text-sm text-studio-text-secondary max-w-2xl">
            استعرض مسار تنفيذ هويات القنوات والباقات التلفزيونية، شاهد العروض، وشارك ملاحظاتك واعتماداتك بسهولة وسرعة.
          </p>
        </div>

        {/* Projects Grid: 4 on desktop, 2-3 on tablet, 1 on mobile */}
        {filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} slug={slug} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[350px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-studio-surface/40 p-8 text-center">
            <FolderKanban className="h-16 w-16 text-studio-text-muted opacity-40 mb-3" />
            <h3 className="text-lg font-bold text-white">لا توجد مشاريع مطابقة</h3>
            <p className="mt-1 text-xs text-studio-text-secondary max-w-sm">
              لم نتمكن من العثور على أي مشاريع تطابق بحثك الحالي. جرب تغيير كلمة البحث أو تصفية التصنيف.
            </p>
            {(searchQuery || activeCategory !== 'الكل') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('الكل');
                }}
                className="mt-4 rounded-xl bg-studio-surface px-4 py-2 text-xs font-semibold text-studio-blue-glow border border-white/10 hover:bg-studio-card transition"
              >
                إعادة ضبط الفلاتر
              </button>
            )}
          </div>
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-white/5 bg-studio-bg py-6 text-center text-xs text-studio-text-muted">
        استوديو التصميم • جميع الحقوق محفوظة
      </footer>
    </div>
  );
};
