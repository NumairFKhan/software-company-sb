'use client';

import React from 'react';
import type { PipelineStage } from '@/types';

// ── Stage order ────────────────────────────────────────────────────────────────

/**
 * Canonical ordered list of pipeline stages displayed by the tracker.
 * Order matters — the tracker renders them left-to-right in this sequence.
 */
export const PIPELINE_STAGES: PipelineStage[] = [
  'Product Manager',
  'Architect',
  'Ticket Planner',
  'Developer',
  'Code Reviewer',
  'QA Tester',
  'Improver',
];

// ── Props ──────────────────────────────────────────────────────────────────────

export interface StageTrackerProps {
  /** The currently-active stage (from the latest stage_transition event), or null. */
  current_stage: PipelineStage | null;
  /** Stages that have already completed (shown with a checkmark). */
  completed_stages: PipelineStage[];
  /**
   * Parsed Developer ticket sub-progress (e.g. { current: 3, total: 7 }).
   * Rendered as a mini badge on the Developer stage node.
   */
  developer_progress: { current: number; total: number } | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Horizontal pipeline stage tracker.
 *
 * Accepts pure props so it can be unit-tested without any context providers.
 * Reads stage data from `ActiveProjectContext` via `ProjectDetail` — this
 * component itself does NOT open a WebSocket connection.
 *
 * Visual states per stage node:
 * - completed  → green circle with ✓, green label
 * - current    → blue circle with ring highlight, bold label
 * - upcoming   → gray empty circle, muted label
 *
 * Developer stage shows a mini ticket-count badge when `developer_progress`
 * is non-null (e.g. "3 / 7 tickets").
 */
export function StageTracker({
  current_stage,
  completed_stages,
  developer_progress,
}: StageTrackerProps) {
  return (
    <div
      className="flex items-start overflow-x-auto py-4 px-5 bg-surface-900/60 border-b border-surface-800"
      role="list"
      aria-label="Pipeline stage tracker"
    >
      {PIPELINE_STAGES.map((stage, index) => {
        const isCompleted = completed_stages.includes(stage);
        const isCurrent = stage === current_stage;
        const isDeveloper = stage === 'Developer';
        const isLast = index === PIPELINE_STAGES.length - 1;

        // Circle styles: completed = solid emerald, current = brand gradient
        // with a live pulse ring, upcoming = hollow outline.
        const circleClass = isCompleted
          ? 'bg-status-done-500 border-status-done-500 text-white'
          : isCurrent
            ? 'bg-brand-gradient border-transparent text-white shadow-glow-violet'
            : 'bg-surface-900 border-surface-700 text-surface-500';

        const labelClass = isCompleted
          ? 'text-status-done-300 font-medium'
          : isCurrent
            ? 'text-surface-50 font-semibold'
            : 'text-surface-500';

        return (
          <React.Fragment key={stage}>
            {/* ── Stage node ── */}
            <div
              className="flex flex-col items-center flex-shrink-0 w-20"
              role="listitem"
              aria-label={
                isCompleted
                  ? `${stage}: completed`
                  : isCurrent
                    ? `${stage}: in progress`
                    : `${stage}: upcoming`
              }
            >
              {/* Circle indicator */}
              <div className="relative">
                {isCurrent && (
                  <span
                    className="absolute inset-0 rounded-full bg-brand-gradient animate-pulse-glow blur-[6px]"
                    aria-hidden="true"
                  />
                )}
                <div
                  className={`relative w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-300 ${circleClass}`}
                  aria-hidden="true"
                >
                  {isCompleted ? '✓' : isCurrent ? '●' : ''}
                </div>
              </div>

              {/* Stage label */}
              <p
                className={`text-[11px] text-center mt-1.5 leading-tight transition-colors ${labelClass}`}
              >
                {stage}
              </p>

              {/* Developer sub-progress badge */}
              {isDeveloper && developer_progress && (
                <span
                  className={`mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono leading-tight border ${
                    isCompleted
                      ? 'bg-status-done-500/10 text-status-done-300 border-status-done-500/30'
                      : isCurrent
                        ? 'bg-brand-violet/15 text-brand-fuchsia border-brand-violet/30'
                        : 'bg-surface-800 text-surface-500 border-surface-700'
                  }`}
                  aria-label={`${developer_progress.current} of ${developer_progress.total} tickets`}
                  data-testid="developer-progress"
                >
                  {developer_progress.current}&nbsp;/&nbsp;{developer_progress.total}
                  <span className="sr-only"> tickets</span>
                </span>
              )}
            </div>

            {/* ── Connector line between stage nodes ── */}
            {!isLast && (
              <div
                className={`flex-1 min-w-3 h-0.5 mt-[18px] mx-1 flex-shrink-0 rounded-full transition-all duration-500 ${
                  isCompleted ? 'bg-status-done-500' : 'bg-surface-700'
                }`}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
