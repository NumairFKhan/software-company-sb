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
      className="flex items-start overflow-x-auto py-3 px-4 bg-gray-50 border-b border-gray-200"
      role="list"
      aria-label="Pipeline stage tracker"
    >
      {PIPELINE_STAGES.map((stage, index) => {
        const isCompleted = completed_stages.includes(stage);
        const isCurrent = stage === current_stage;
        const isDeveloper = stage === 'Developer';
        const isLast = index === PIPELINE_STAGES.length - 1;

        // Circle styles — reuse design tokens from StatusBadge where they overlap
        const circleClass = isCompleted
          ? 'bg-green-500 border-green-500 text-white'
          : isCurrent
            ? 'bg-blue-500 border-blue-500 text-white ring-2 ring-blue-200 ring-offset-1'
            : 'bg-white border-gray-300 text-gray-400';

        const labelClass = isCompleted
          ? 'text-green-700 font-medium'
          : isCurrent
            ? 'text-blue-700 font-semibold'
            : 'text-gray-400';

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
              <div
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors ${circleClass}`}
                aria-hidden="true"
              >
                {isCompleted ? '✓' : isCurrent ? '●' : ''}
              </div>

              {/* Stage label */}
              <p
                className={`text-xs text-center mt-1 leading-tight ${labelClass}`}
              >
                {stage}
              </p>

              {/* Developer sub-progress badge */}
              {isDeveloper && developer_progress && (
                <span
                  className={`mt-1 text-xs px-1.5 py-0.5 rounded-full font-mono leading-tight ${
                    isCompleted
                      ? 'bg-green-100 text-green-700'
                      : isCurrent
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
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
                className={`flex-1 min-w-3 h-0.5 mt-4 mx-1 flex-shrink-0 transition-colors ${
                  isCompleted ? 'bg-green-400' : 'bg-gray-200'
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
