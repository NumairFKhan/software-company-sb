import type { ProjectStatus } from '@/types';

// ── Design tokens ──────────────────────────────────────────────────────────────
// Centralise status → Tailwind class mapping here so every ticket that needs a
// status colour can import STATUS_CONFIG instead of duplicating strings.

export interface StatusConfig {
  label: string;
  /** Tailwind utility classes for background, text, and border. */
  className: string;
}

export const STATUS_CONFIG: Record<ProjectStatus, StatusConfig> = {
  planning: {
    label: 'Planning',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  awaiting_approval: {
    label: 'Awaiting Approval',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  building: {
    label: 'Building',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  reviewing: {
    label: 'Reviewing',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  done: {
    label: 'Done',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  interrupted: {
    label: 'Interrupted',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

export interface StatusBadgeProps {
  status: ProjectStatus;
  className?: string;
}

/**
 * Colour-coded badge for a project's status.
 * Colours come from STATUS_CONFIG — import that object to reuse the same
 * tokens in other components (e.g. event-feed role labels, stage tracker).
 */
export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className} ${className}`}
    >
      {config.label}
    </span>
  );
}
