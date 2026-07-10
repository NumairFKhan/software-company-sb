/**
 * Tests for the ApprovalCard component.
 *
 * Covers:
 * - Rendering a pending approval (question, optional context, action buttons)
 * - Rendering a resolved approval as a badge (approved / rejected)
 * - Approve and Reject buttons call postApprovalDecision with the correct args
 * - Error message shown when postApprovalDecision rejects
 * - Buttons disabled while a submission is in-flight
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ApprovalCard } from '@/components/ApprovalCard';
import type { ApprovalRequest } from '@/types';

// ── Mock the API layer ─────────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  postApprovalDecision: jest.fn(),
}));

// Import AFTER the jest.mock() call so the mock is wired up.
import { postApprovalDecision } from '@/lib/api';

const mockPostApproval = postApprovalDecision as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePendingApproval(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    approval_id: 'appr-1',
    question: 'Do you want to proceed with deployment?',
    status: 'pending',
    ...overrides,
  };
}

function renderCard(
  approval: ApprovalRequest = makePendingApproval(),
  projectId = 'proj-1',
) {
  return render(<ApprovalCard approval={approval} projectId={projectId} />);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockPostApproval.mockReset();
});

describe('ApprovalCard — pending state', () => {
  it('renders the question text', () => {
    renderCard();
    expect(
      screen.getByText('Do you want to proceed with deployment?'),
    ).toBeInTheDocument();
  });

  it('renders context when provided', () => {
    const approval = makePendingApproval({ context: 'This will affect prod.' });
    renderCard(approval);
    expect(screen.getByText('This will affect prod.')).toBeInTheDocument();
  });

  it('does not render context element when context is absent', () => {
    renderCard(makePendingApproval({ context: undefined }));
    // There should be no paragraph with context content — just the question paragraph
    // and the buttons. We verify the card renders without errors and no extra text.
    expect(screen.queryByText(/affect prod/i)).not.toBeInTheDocument();
  });

  it('renders Approve and Reject buttons', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('has correct data-testid attributes', () => {
    renderCard();
    expect(screen.getByTestId('approval-card-appr-1')).toBeInTheDocument();
    expect(screen.getByTestId('approve-btn-appr-1')).toBeInTheDocument();
    expect(screen.getByTestId('reject-btn-appr-1')).toBeInTheDocument();
  });

  it('calls postApprovalDecision with approved decision on Approve click', async () => {
    mockPostApproval.mockResolvedValueOnce({
      approval_id: 'appr-1',
      decision: 'approved',
      resolved_at: '2024-01-01T00:01:00Z',
    });

    renderCard();
    fireEvent.click(screen.getByTestId('approve-btn-appr-1'));

    await waitFor(() => {
      expect(mockPostApproval).toHaveBeenCalledTimes(1);
    });

    expect(mockPostApproval).toHaveBeenCalledWith('proj-1', 'appr-1', {
      decision: 'approved',
    });
  });

  it('calls postApprovalDecision with rejected decision on Reject click', async () => {
    mockPostApproval.mockResolvedValueOnce({
      approval_id: 'appr-1',
      decision: 'rejected',
      resolved_at: '2024-01-01T00:01:00Z',
    });

    renderCard();
    fireEvent.click(screen.getByTestId('reject-btn-appr-1'));

    await waitFor(() => {
      expect(mockPostApproval).toHaveBeenCalledTimes(1);
    });

    expect(mockPostApproval).toHaveBeenCalledWith('proj-1', 'appr-1', {
      decision: 'rejected',
    });
  });

  it('disables both buttons while a submission is in-flight', async () => {
    // Never-resolving promise to freeze the in-flight state.
    mockPostApproval.mockReturnValueOnce(new Promise(() => {}));

    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('approve-btn-appr-1'));
    });

    expect(screen.getByTestId('approve-btn-appr-1')).toBeDisabled();
    expect(screen.getByTestId('reject-btn-appr-1')).toBeDisabled();
  });

  it('shows "Submitting…" label while in-flight', async () => {
    mockPostApproval.mockReturnValueOnce(new Promise(() => {}));

    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('approve-btn-appr-1'));
    });

    expect(screen.getAllByText('Submitting…')).toHaveLength(2);
  });

  it('shows an error message when postApprovalDecision rejects', async () => {
    mockPostApproval.mockRejectedValueOnce(new Error('Network error'));

    renderCard();
    await act(async () => {
      fireEvent.click(screen.getByTestId('approve-btn-appr-1'));
    });

    await waitFor(() => {
      expect(
        screen.getByRole('alert'),
      ).toHaveTextContent(/failed to submit/i);
    });
  });

  it('re-enables buttons after an error', async () => {
    mockPostApproval.mockRejectedValueOnce(new Error('oops'));

    renderCard();
    await act(async () => {
      fireEvent.click(screen.getByTestId('reject-btn-appr-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('approve-btn-appr-1')).not.toBeDisabled();
    });
  });
});

describe('ApprovalCard — resolved state (approved)', () => {
  it('renders an approved badge', () => {
    const approval = makePendingApproval({ status: 'approved' });
    renderCard(approval);

    expect(screen.getByTestId('approval-resolved-appr-1')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('does NOT render action buttons for an approved approval', () => {
    const approval = makePendingApproval({ status: 'approved' });
    renderCard(approval);

    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
  });
});

describe('ApprovalCard — resolved state (rejected)', () => {
  it('renders a rejected badge', () => {
    const approval = makePendingApproval({ status: 'rejected' });
    renderCard(approval);

    expect(screen.getByTestId('approval-resolved-appr-1')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('does NOT render action buttons for a rejected approval', () => {
    const approval = makePendingApproval({ status: 'rejected' });
    renderCard(approval);

    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
  });
});
