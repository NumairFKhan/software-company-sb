/**
 * Unit tests for the StageTracker component.
 *
 * StageTracker accepts pure props (current_stage, completed_stages,
 * developer_progress) — no context providers required.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { StageTracker, PIPELINE_STAGES } from '@/components/StageTracker';
import type { PipelineStage } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderTracker({
  current_stage = null as PipelineStage | null,
  completed_stages = [] as PipelineStage[],
  developer_progress = null as { current: number; total: number } | null,
} = {}) {
  return render(
    <StageTracker
      current_stage={current_stage}
      completed_stages={completed_stages}
      developer_progress={developer_progress}
    />,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('StageTracker', () => {
  // ── Rendering all stages ───────────────────────────────────────────────────

  it('renders all 7 pipeline stages', () => {
    renderTracker();
    for (const stage of PIPELINE_STAGES) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
  });

  it('renders stages in the canonical order', () => {
    renderTracker();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(7);
    PIPELINE_STAGES.forEach((stage, index) => {
      expect(items[index]).toHaveAccessibleName(expect.stringContaining(stage));
    });
  });

  it('renders the pipeline stage tracker with correct aria-label', () => {
    renderTracker();
    expect(
      screen.getByRole('list', { name: /pipeline stage tracker/i }),
    ).toBeInTheDocument();
  });

  // ── No stage selected ──────────────────────────────────────────────────────

  it('renders all stages as "upcoming" when no stage is active', () => {
    renderTracker({ current_stage: null, completed_stages: [] });
    for (const stage of PIPELINE_STAGES) {
      const item = screen.getByRole('listitem', { name: `${stage}: upcoming` });
      expect(item).toBeInTheDocument();
    }
  });

  // ── Current stage highlighting ─────────────────────────────────────────────

  it('marks the current stage as "in progress"', () => {
    renderTracker({ current_stage: 'Architect' });
    expect(
      screen.getByRole('listitem', { name: 'Architect: in progress' }),
    ).toBeInTheDocument();
  });

  it('marks non-active stages as "upcoming" when no stages are completed', () => {
    renderTracker({ current_stage: 'Developer' });
    const upcoming = PIPELINE_STAGES.filter((s) => s !== 'Developer');
    for (const stage of upcoming) {
      expect(
        screen.getByRole('listitem', { name: `${stage}: upcoming` }),
      ).toBeInTheDocument();
    }
  });

  // ── Completed stages ───────────────────────────────────────────────────────

  it('marks completed stages as "completed"', () => {
    renderTracker({
      current_stage: 'Architect',
      completed_stages: ['Product Manager'],
    });
    expect(
      screen.getByRole('listitem', { name: 'Product Manager: completed' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: 'Architect: in progress' }),
    ).toBeInTheDocument();
  });

  it('marks multiple completed stages correctly', () => {
    renderTracker({
      current_stage: 'Developer',
      completed_stages: ['Product Manager', 'Architect', 'Ticket Planner'],
    });
    expect(
      screen.getByRole('listitem', { name: 'Product Manager: completed' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: 'Architect: completed' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: 'Ticket Planner: completed' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: 'Developer: in progress' }),
    ).toBeInTheDocument();
  });

  it('shows all stages as completed when the final stage is also done', () => {
    renderTracker({
      current_stage: null,
      completed_stages: [...PIPELINE_STAGES],
    });
    for (const stage of PIPELINE_STAGES) {
      expect(
        screen.getByRole('listitem', { name: `${stage}: completed` }),
      ).toBeInTheDocument();
    }
  });

  // ── Developer progress badge ───────────────────────────────────────────────

  it('does NOT render the developer progress badge when developer_progress is null', () => {
    renderTracker({ developer_progress: null });
    expect(screen.queryByTestId('developer-progress')).not.toBeInTheDocument();
  });

  it('renders the developer progress badge when developer_progress is provided', () => {
    renderTracker({ developer_progress: { current: 3, total: 7 } });
    const badge = screen.getByTestId('developer-progress');
    expect(badge).toBeInTheDocument();
    // The badge includes an accessible label with the ticket counts
    expect(badge).toHaveAccessibleName('3 of 7 tickets');
  });

  it('renders updated developer progress correctly', () => {
    renderTracker({ developer_progress: { current: 0, total: 12 } });
    const badge = screen.getByTestId('developer-progress');
    expect(badge).toHaveAccessibleName('0 of 12 tickets');
  });

  it('shows developer progress regardless of whether Developer is the current stage', () => {
    // Progress can persist even after the Developer stage moves to completed
    renderTracker({
      current_stage: 'Code Reviewer',
      completed_stages: ['Product Manager', 'Architect', 'Ticket Planner', 'Developer'],
      developer_progress: { current: 5, total: 5 },
    });
    expect(screen.getByTestId('developer-progress')).toBeInTheDocument();
  });

  // ── PIPELINE_STAGES constant ───────────────────────────────────────────────

  it('PIPELINE_STAGES exports exactly the 7 expected stages in order', () => {
    expect(PIPELINE_STAGES).toEqual([
      'Product Manager',
      'Architect',
      'Ticket Planner',
      'Developer',
      'Code Reviewer',
      'QA Tester',
      'Improver',
    ]);
  });
});
