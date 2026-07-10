import type { ProjectStatus } from '@/types';

// ── Design tokens ──────────────────────────────────────────────────────────────
// Centralise status → Tailwind class mapping here so every ticket that needs a
// status colour can import STATUS_CONFIG instead of duplicating strings.

export interface StatusConfig {
  label: string;
  /** Tailwind utility classes for background, text, and border. */
  className: string;
  /** Solid dot color class — pulses for statuses where the pipeline is actively running. */
  dotClassName: string;
  /** Whether this status represents live, in-progress work (drives the pulse animation). */
  isLive: boolean;
}

export const STATUS_CONFIG: Record<ProjectStatus, StatusConfig> = {
  planning: {
    label: 'Planning',
    className: 'bg-status-planning-500/10 text-status-planning-300 border-status-planning-500/30',
    dotClassName: 'bg-status-planning-400',
    isLive: true,
  },
  awaiting_approval: {
    label: 'Awaiting Approval',
    className: 'bg-status-awaiting-500/10 text-status-awaiting-300 border-status-awaiting-500/30',
    dotClassName: 'bg-status-awaiting-400',
    isLive: false,
  },
  building: {
    label: 'Building',
    className: 'bg-status-building-500/10 text-status-building-300 border-status-building-500/30',
    dotClassName: 'bg-status-building-400',
    isLive: true,
  },
  reviewing: {
    label: 'Reviewing',
    className: 'bg-status-reviewing-500/10 text-status-reviewing-300 border-status-reviewing-500/30',
    dotClassName: 'bg-status-reviewing-400',
    isLive: true,
  },
  done: {
    label: 'Done',
    className: 'bg-status-done-500/10 text-status-done-300 border-status-done-500/30',
    dotClassName: 'bg-status-done-400',
    isLive: false,
  },
  failed: {
    label: 'Failed',
    className: 'bg-status-failed-500/10 text-status-failed-300 border-status-failed-500/30',
    dotClassName: 'bg-status-failed-400',
    isLive: false,
  },
  interrupted: {
    label: 'Interrupted',
    className: 'bg-status-interrupted-500/10 text-status-interrupted-300 border-status-interrupted-500/30',
    dotClassName: 'bg-status-interrupted-400',
    isLive: false,
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

export interface StatusBadgeProps {
  status: ProjectStatus;
  className?: string;
}

/**
 * Colour-coded pill badge for a project's status, with a small pulsing dot
 * for statuses where the pipeline is actively doing real work right now.
 * Colours come from STATUS_CONFIG — import that object to reuse the same
 * tokens in other components (e.g. event-feed role labels, stage tracker).
 */
export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm ${config.className} ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
        {config.isLive && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${config.dotClassName} animate-pulse-glow`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${config.dotClassName}`} />
      </span>
      {config.label}
    </span>
  );
}
