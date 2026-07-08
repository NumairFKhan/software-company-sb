/**
 * Tests for the StatusBadge component and its STATUS_CONFIG design tokens.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatusBadge, STATUS_CONFIG } from '@/components/StatusBadge';
import type { ProjectStatus } from '@/types';

const ALL_STATUSES: ProjectStatus[] = [
  'planning',
  'awaiting_approval',
  'building',
  'reviewing',
  'done',
  'failed',
  'interrupted',
];

describe('STATUS_CONFIG', () => {
  it('has an entry for every ProjectStatus', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_CONFIG[status]).toBeDefined();
      expect(STATUS_CONFIG[status].label).toBeTruthy();
      expect(STATUS_CONFIG[status].className).toBeTruthy();
    }
  });
});

describe('StatusBadge', () => {
  it.each(ALL_STATUSES)('renders the correct label for "%s"', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(STATUS_CONFIG[status].label)).toBeInTheDocument();
  });

  it.each(ALL_STATUSES)(
    'has data-testid="status-badge-%s" for "%s"',
    (status) => {
      const { container } = render(<StatusBadge status={status} />);
      const badge = container.querySelector(
        `[data-testid="status-badge-${status}"]`,
      );
      expect(badge).not.toBeNull();
    },
  );

  it('merges an extra className onto the badge', () => {
    const { container } = render(
      <StatusBadge status="planning" className="extra-class" />,
    );
    const badge = container.querySelector('[data-testid="status-badge-planning"]');
    expect(badge?.className).toContain('extra-class');
  });

  it('renders a <span> element', () => {
    const { container } = render(<StatusBadge status="done" />);
    expect(container.querySelector('span')).not.toBeNull();
  });
});
