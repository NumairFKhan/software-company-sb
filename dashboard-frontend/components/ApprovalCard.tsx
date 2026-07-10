'use client';

import { useState } from 'react';
import { postApprovalDecision } from '@/lib/api';
import type { ApprovalRequest } from '@/types';

export interface ApprovalCardProps {
  approval: ApprovalRequest;
  projectId: string;
}

/**
 * Inline approval card for pipeline decisions.
 *
 * - Pending state: renders the question text, optional context, and
 *   Approve/Reject buttons that call POST /api/projects/{id}/approvals/{approval_id}.
 * - Resolved state: renders a compact badge showing the final decision.
 *
 * After a successful button click the backend emits an `approval_resolved` WS
 * event which flows through `ActiveProjectContext` → reducer → `approvals` Map,
 * causing this card to re-render in resolved state.
 *
 * V1 limitation: if the `approval_request` event fell outside the 200-event
 * replay window on page reload AND no subsequent `approval_resolved` event
 * arrived, the card will not appear until the next `approval_request` is
 * received over the live WS stream. This is acceptable for v1.
 */
export function ApprovalCard({ approval, projectId }: ApprovalCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    setIsSubmitting(true);
    setError(null);
    try {
      await postApprovalDecision(projectId, approval.approval_id, { decision });
      // Resolved state arrives via the `approval_resolved` WS event; no local
      // optimistic update needed — the reducer handles the state transition.
    } catch (err) {
      console.error('[ApprovalCard] Failed to submit decision:', err);
      setError('Failed to submit decision. Please try again.');
      setIsSubmitting(false);
    }
    // NOTE: we intentionally do NOT call setIsSubmitting(false) on success
    // because the card will transition to resolved state via the WS event before
    // the user can click again.
  };

  // ── Resolved state ──────────────────────────────────────────────────────────
  if (approval.status !== 'pending') {
    const isApproved = approval.status === 'approved';
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
          isApproved
            ? 'bg-status-done-500/10 text-status-done-300 border-status-done-500/30'
            : 'bg-status-failed-500/10 text-status-failed-300 border-status-failed-500/30'
        }`}
        role="status"
        aria-label={`Approval ${approval.status}`}
        data-testid={`approval-resolved-${approval.approval_id}`}
      >
        <span aria-hidden="true">{isApproved ? '✓' : '✗'}</span>
        <span>{isApproved ? 'Approved' : 'Rejected'}</span>
      </div>
    );
  }

  // ── Pending state ────────────────────────────────────────────────────────────
  return (
    <div
      className="relative border border-status-awaiting-500/40 bg-status-awaiting-500/5 rounded-xl p-3.5 text-sm animate-fade-in-up overflow-hidden"
      role="region"
      aria-label="Pending approval request"
      data-testid={`approval-card-${approval.approval_id}`}
    >
      {/* Attention strip */}
      <span className="absolute inset-y-0 left-0 w-1 bg-status-awaiting-400 animate-pulse-glow" aria-hidden="true" />

      <div className="pl-2">
        <p className="text-[10px] font-bold text-status-awaiting-300 uppercase tracking-wider mb-1">
          Needs your decision
        </p>
        {/* Question */}
        <p className="font-medium text-surface-50 leading-snug">{approval.question}</p>

        {/* Optional context — the backend sends this as an arbitrary object
            (e.g. the ticket plan), not a string; stringify anything non-string
            since React cannot render an object directly as a child. */}
        {approval.context != null && (
          <pre className="text-surface-400 text-xs mt-1.5 leading-relaxed whitespace-pre-wrap break-words bg-surface-900/60 rounded-lg p-2 border border-surface-800 max-h-32 overflow-y-auto">
            {typeof approval.context === 'string'
              ? approval.context
              : JSON.stringify(approval.context, null, 2)}
          </pre>
        )}

        {/* Error feedback */}
        {error && (
          <p className="text-status-failed-400 text-xs mt-2" role="alert">
            {error}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => handleDecision('approved')}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-status-done-500 rounded-lg
                       hover:bg-status-done-400 hover:shadow-glow-emerald disabled:opacity-60 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-status-done-400 focus:ring-offset-1 focus:ring-offset-surface-900
                       transition-all active:scale-95"
            aria-label="Approve"
            data-testid={`approve-btn-${approval.approval_id}`}
          >
            {isSubmitting ? 'Submitting…' : '✓ Approve'}
          </button>
          <button
            onClick={() => handleDecision('rejected')}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-status-failed-500 rounded-lg
                       hover:bg-status-failed-400 hover:shadow-glow-rose disabled:opacity-60 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-status-failed-400 focus:ring-offset-1 focus:ring-offset-surface-900
                       transition-all active:scale-95"
            aria-label="Reject"
            data-testid={`reject-btn-${approval.approval_id}`}
          >
            {isSubmitting ? 'Submitting…' : '✗ Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
