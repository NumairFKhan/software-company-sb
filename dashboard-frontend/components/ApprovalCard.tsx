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
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
          isApproved
            ? 'bg-green-100 text-green-700 border border-green-200'
            : 'bg-red-100 text-red-700 border border-red-200'
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
      className="border border-yellow-300 bg-yellow-50 rounded-lg p-3 text-sm"
      role="region"
      aria-label="Pending approval request"
      data-testid={`approval-card-${approval.approval_id}`}
    >
      {/* Question */}
      <p className="font-medium text-gray-900 leading-snug">{approval.question}</p>

      {/* Optional context */}
      {approval.context && (
        <p className="text-gray-600 text-xs mt-1 leading-relaxed">{approval.context}</p>
      )}

      {/* Error feedback */}
      {error && (
        <p className="text-red-600 text-xs mt-2" role="alert">
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => handleDecision('approved')}
          disabled={isSubmitting}
          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md
                     hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1
                     transition-colors"
          aria-label="Approve"
          data-testid={`approve-btn-${approval.approval_id}`}
        >
          {isSubmitting ? 'Submitting…' : 'Approve'}
        </button>
        <button
          onClick={() => handleDecision('rejected')}
          disabled={isSubmitting}
          className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md
                     hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1
                     transition-colors"
          aria-label="Reject"
          data-testid={`reject-btn-${approval.approval_id}`}
        >
          {isSubmitting ? 'Submitting…' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
