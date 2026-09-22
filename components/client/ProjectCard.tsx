import React from 'react';
import Link from 'next/link';
import { Project } from '@/lib/supabase/database.types';
import { formatArabicFileCount } from '@/lib/utils/formatters';
import { ArrowLeft, FolderKanban } from 'lucide-react';

interface ProjectCardProps {
  project: Project;
  slug: string;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, slug }) => {
  const fileCount = project.file_count ?? 0;
  const progress = Math.min(100, Math.max(0, project.progress || 0));

  return (
    <div className="glass-card group relative flex flex-col overflow-hidden rounded-2xl transition-all duration-300">
      {/* Project Cover / Cinematic Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-studio-surface">
        {project.cover_url ? (
          <img
            src={
              project.display_cover_url ||
              (project.cover_url.startsWith('http') || project.cover_url.startsWith('/uploads/')
                ? project.cover_url
                : `/api/media/cover/${project.id}?slug=${slug}`)
            }
            alt={project.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-studio-surface to-studio-card text-studio-text-muted">
            <FolderKanban className="h-12 w-12 opacity-30" />
          </div>
        )}

        {/* Ambient Dark Gradient on bottom of thumbnail */}
        <div className="absolute inset-0 bg-gradient-to-t from-studio-card via-transparent to-black/20" />

        {/* Optional Small Category Badge */}
        {project.category && (
          <div className="absolute top-3 right-3 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-medium tracking-wide text-studio-gold backdrop-blur-md border border-white/10">
            {project.category}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex flex-1 flex-col p-5">
        {/* Project Name */}
        <h3 className="text-base font-bold text-white transition-colors group-hover:text-studio-blue-glow line-clamp-1">
          {project.title}
        </h3>

        {/* Number of Files & Optional Progress Percentage */}
        <div className="mt-3 flex items-center justify-between text-xs text-studio-text-secondary">
          <span>{formatArabicFileCount(fileCount)}</span>
          {project.show_progress !== false && (
            <span className="font-semibold text-white">{progress}%</span>
          )}
        </div>

        {/* Optional Progress Bar */}
        {project.show_progress !== false && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-studio-blue to-studio-blue-glow transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Action Button: فتح المشروع */}
        <div className="mt-5 pt-3 border-t border-white/5">
          <Link
            href={`/p/${slug}/projects/${project.id}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-surface hover:bg-studio-blue py-2.5 px-4 text-xs font-semibold text-studio-text-primary hover:text-white transition-all shadow-sm group-hover:shadow-studio-blue/20"
          >
            <span>فتح المشروع</span>
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
};
