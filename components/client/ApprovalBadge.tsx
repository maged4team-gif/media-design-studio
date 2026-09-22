import React from 'react';
import { CheckCircle2, CircleDashed } from 'lucide-react';

interface ApprovalBadgeProps {
  approved: boolean;
  onToggle?: () => void;
  interactive?: boolean;
  loading?: boolean;
  viewerName?: string;
}

export const ApprovalBadge: React.FC<ApprovalBadgeProps> = ({
  approved,
  onToggle,
  interactive = true,
  loading = false,
  viewerName: _viewerName,
}) => {
  if (interactive && onToggle) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!loading) onToggle();
        }}
        disabled={loading}
        className={`group relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-200 ${
          approved
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
            : 'bg-white/5 text-studio-text-secondary border border-white/10 hover:bg-white/10 hover:text-white'
        }`}
        title={approved ? 'إلغاء الاعتماد' : 'اعتماد العنصر'}
      >
        {loading ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : approved ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <CircleDashed className="h-3.5 w-3.5 text-studio-text-muted group-hover:text-white" />
        )}
        <span>{approved ? 'معتمد' : 'غير معتمد'}</span>
      </button>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
        approved
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'bg-white/5 text-studio-text-muted border border-white/5'
      }`}
    >
      {approved ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <CircleDashed className="h-3.5 w-3.5 text-studio-text-muted" />
      )}
      <span>{approved ? 'معتمد' : 'غير معتمد'}</span>
    </div>
  );
};
