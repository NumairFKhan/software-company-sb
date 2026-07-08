/**
 * Unit tests for the ActivityFeed component.
 *
 * ActivityFeed accepts pure props (events, toolUseEvents, wsStatus) — no
 * context provider required, which makes these tests fast and isolated.
 *
 * Covers:
 * - Empty-state messages (idle / connecting)
 * - All event-type-specific row renderers
 * - ExpandableChip expand/collapse behaviour for tool_use and tool_result
 * - tool_result error state (red border, error indicator)
 * - tool_result / tool_use correlation via toolUseEvents map
 * - agent_completed and agent_failed summary rows
 * - Chronological ordering of events
 * - Role label rendering
 * - ROLE_CONFIG exported constant
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityFeed, ROLE_CONFIG, type ActivityFeedProps } from '@/components/ActivityFeed';
import type {
  PipelineEvent,
  ToolUseEvent,
  WebSocketStatus,
  AgentRole,
} from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

let eventCounter = 0;

function makeEvent(
  overrides: Partial<PipelineEvent> & { type: PipelineEvent['type'] },
): PipelineEvent {
  eventCounter++;
  return {
    event_id: `evt-${eventCounter}`,
    project_id: 'proj-1',
    type: 'text',
    role: 'developer',
    timestamp: '2024-06-15T10:30:00Z',
    payload: {},
    ...overrides,
  };
}

function makeToolUseEvent(
  toolUseId: string,
  toolName: string,
  input: Record<string, unknown> = {},
): ToolUseEvent {
  return makeEvent({
    event_id: `tuse-${toolUseId}`,
    type: 'tool_use',
    payload: {
      tool_use_id: toolUseId,
      tool_name: toolName,
      tool_input: input,
    },
  }) as ToolUseEvent;
}

function renderFeed(
  events: PipelineEvent[] = [],
  toolUseEvents: Map<string, ToolUseEvent> = new Map(),
  wsStatus?: WebSocketStatus,
) {
  const props: ActivityFeedProps = { events, toolUseEvents, wsStatus };
  return render(<ActivityFeed {...props} />);
}

// ── Reset event counter between tests ──────────────────────────────────────────
beforeEach(() => {
  eventCounter = 0;
});

// ── Empty state ────────────────────────────────────────────────────────────────

describe('ActivityFeed — empty state', () => {
  it('renders "No events yet." when events is empty and status is connected', () => {
    renderFeed([], new Map(), 'connected');
    expect(screen.getByText('No events yet.')).toBeInTheDocument();
  });

  it('renders "No events yet." when wsStatus is undefined', () => {
    renderFeed([]);
    expect(screen.getByText('No events yet.')).toBeInTheDocument();
  });

  it('renders connecting message when wsStatus is "connecting"', () => {
    renderFeed([], new Map(), 'connecting');
    expect(screen.getByText('Connecting to event stream…')).toBeInTheDocument();
  });

  it('renders connecting message when wsStatus is "reconnecting"', () => {
    renderFeed([], new Map(), 'reconnecting');
    expect(screen.getByText('Connecting to event stream…')).toBeInTheDocument();
  });

  it('renders "No events yet." when wsStatus is "disconnected"', () => {
    renderFeed([], new Map(), 'disconnected');
    expect(screen.getByText('No events yet.')).toBeInTheDocument();
  });
});

// ── Accessibility structure ────────────────────────────────────────────────────

describe('ActivityFeed — accessibility structure', () => {
  it('has a log role with aria-label', () => {
    renderFeed([]);
    expect(screen.getByRole('log', { name: 'Activity feed' })).toBeInTheDocument();
  });

  it('has an event log ordered list when events are present', () => {
    const events = [makeEvent({ type: 'text', payload: { text: 'hello' } })];
    renderFeed(events);
    expect(screen.getByRole('list', { name: 'Event log' })).toBeInTheDocument();
  });
});

// ── text events ────────────────────────────────────────────────────────────────

describe('ActivityFeed — text events', () => {
  it('renders text event content as plain text', () => {
    const events = [
      makeEvent({ type: 'text', payload: { text: 'Hello from the pipeline' } }),
    ];
    renderFeed(events);
    expect(screen.getByText('Hello from the pipeline')).toBeInTheDocument();
  });

  it('renders multiple text events', () => {
    const events = [
      makeEvent({ type: 'text', payload: { text: 'First message' } }),
      makeEvent({ type: 'text', payload: { text: 'Second message' } }),
    ];
    renderFeed(events);
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });
});

// ── thinking events ────────────────────────────────────────────────────────────

describe('ActivityFeed — thinking events', () => {
  it('renders thinking event content as italic text', () => {
    const events = [
      makeEvent({ type: 'thinking', payload: { text: 'Hmm, let me think…' } }),
    ];
    renderFeed(events);
    const el = screen.getByText('Hmm, let me think…');
    expect(el).toBeInTheDocument();
    expect(el.tagName.toLowerCase()).toBe('span');
    expect(el).toHaveClass('italic');
  });

  it('renders thinking text with dimmed styling', () => {
    const events = [
      makeEvent({ type: 'thinking', payload: { text: 'Thinking deeply…' } }),
    ];
    renderFeed(events);
    const el = screen.getByText('Thinking deeply…');
    // Should have a dimmed color class (text-gray-400 or similar)
    expect(el.className).toMatch(/text-gray/);
  });
});

// ── tool_use events ────────────────────────────────────────────────────────────

describe('ActivityFeed — tool_use events', () => {
  it('renders a collapsed chip showing the tool_name', () => {
    const events = [
      makeEvent({
        type: 'tool_use',
        payload: {
          tool_use_id: 'tu-1',
          tool_name: 'read_file',
          tool_input: { path: '/src/index.ts' },
        },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText('read_file')).toBeInTheDocument();
  });

  it('chip is collapsed by default (pre block not rendered)', () => {
    const events = [
      makeEvent({
        type: 'tool_use',
        payload: {
          tool_use_id: 'tu-1',
          tool_name: 'read_file',
          tool_input: { path: '/src/index.ts' },
        },
      }),
    ];
    renderFeed(events);
    // The tool_input JSON should NOT be visible when collapsed
    expect(screen.queryByText('/src/index.ts')).not.toBeInTheDocument();
  });

  it('expands to reveal tool_input JSON on click', () => {
    const events = [
      makeEvent({
        type: 'tool_use',
        payload: {
          tool_use_id: 'tu-1',
          tool_name: 'read_file',
          tool_input: { path: '/src/index.ts' },
        },
      }),
    ];
    renderFeed(events);
    const button = screen.getByRole('button', { expanded: false });
    fireEvent.click(button);
    // After expansion, the JSON content should be visible in a pre block
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    // The JSON content of tool_input should now be visible
    expect(screen.getByText(/\/src\/index\.ts/)).toBeInTheDocument();
  });

  it('collapses again when clicking the expanded chip', () => {
    const events = [
      makeEvent({
        type: 'tool_use',
        payload: {
          tool_use_id: 'tu-1',
          tool_name: 'write_file',
          tool_input: { path: '/out.ts', content: 'hello' },
        },
      }),
    ];
    renderFeed(events);
    const button = screen.getByRole('button', { expanded: false });
    // Expand
    fireEvent.click(button);
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    // Collapse again
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('labels the chip button with aria-expanded=false when collapsed', () => {
    const events = [
      makeEvent({
        type: 'tool_use',
        payload: {
          tool_use_id: 'tu-1',
          tool_name: 'search',
          tool_input: {},
        },
      }),
    ];
    renderFeed(events);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

// ── tool_result events ─────────────────────────────────────────────────────────

describe('ActivityFeed — tool_result events', () => {
  it('renders a collapsed chip for a successful result', () => {
    const events = [
      makeEvent({
        type: 'tool_result',
        payload: {
          tool_use_id: 'tu-1',
          content: 'File contents here',
          is_error: false,
        },
      }),
    ];
    renderFeed(events);
    // Should show a success indicator
    expect(screen.getByText(/✓ result/)).toBeInTheDocument();
    // Content should be hidden (collapsed)
    expect(screen.queryByText('File contents here')).not.toBeInTheDocument();
  });

  it('expands to show the result content on click', () => {
    const events = [
      makeEvent({
        type: 'tool_result',
        payload: {
          tool_use_id: 'tu-1',
          content: 'Expanded content',
          is_error: false,
        },
      }),
    ];
    renderFeed(events);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByText('Expanded content')).toBeInTheDocument();
  });

  it('shows an error indicator when is_error is true', () => {
    const events = [
      makeEvent({
        type: 'tool_result',
        payload: {
          tool_use_id: 'tu-1',
          content: 'Something went wrong',
          is_error: true,
        },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText(/✗ error/)).toBeInTheDocument();
  });

  it('applies red border class when is_error is true', () => {
    const events = [
      makeEvent({
        type: 'tool_result',
        payload: {
          tool_use_id: 'tu-1',
          content: 'Error output',
          is_error: true,
        },
      }),
    ];
    const { container } = renderFeed(events);
    // The wrapper div of the expandable chip should carry the red border class.
    const borderEl = container.querySelector('.border-red-400');
    expect(borderEl).toBeInTheDocument();
  });

  it('does NOT apply red border when is_error is false', () => {
    const events = [
      makeEvent({
        type: 'tool_result',
        payload: {
          tool_use_id: 'tu-1',
          content: 'OK',
          is_error: false,
        },
      }),
    ];
    const { container } = renderFeed(events);
    expect(container.querySelector('.border-red-400')).not.toBeInTheDocument();
  });

  it('shows parent tool_name from toolUseEvents map', () => {
    const toolUseEvent = makeToolUseEvent('tu-1', 'bash_exec');
    const toolUseMap = new Map<string, ToolUseEvent>([
      ['tu-1', toolUseEvent],
    ]);
    const events = [
      makeEvent({
        type: 'tool_result',
        payload: {
          tool_use_id: 'tu-1',
          content: 'stdout output',
          is_error: false,
        },
      }),
    ];
    renderFeed(events, toolUseMap);
    // The chip should reference the parent tool_name
    expect(screen.getByText(/bash_exec/)).toBeInTheDocument();
  });

  it('renders without error when parent tool_use is not in the map', () => {
    const events = [
      makeEvent({
        type: 'tool_result',
        payload: {
          tool_use_id: 'unknown-id',
          content: 'result',
          is_error: false,
        },
      }),
    ];
    // Pass an empty map — should not throw
    expect(() => renderFeed(events, new Map())).not.toThrow();
    expect(screen.getByText(/✓ result/)).toBeInTheDocument();
  });

  it('renders JSON content in the expanded view for object payloads', () => {
    const events = [
      makeEvent({
        type: 'tool_result',
        payload: {
          tool_use_id: 'tu-1',
          content: { files: ['a.ts', 'b.ts'] },
          is_error: false,
        },
      }),
    ];
    renderFeed(events);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    // JSON.stringify'd output should be visible
    expect(screen.getByText(/a\.ts/)).toBeInTheDocument();
  });
});

// ── agent_completed events ─────────────────────────────────────────────────────

describe('ActivityFeed — agent_completed events', () => {
  it('renders a success summary row with ✓ icon', () => {
    const events = [
      makeEvent({
        type: 'agent_completed',
        payload: {
          stage: 'Architect',
          summary: 'Generated architecture document.',
        },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText(/✓/)).toBeInTheDocument();
    expect(screen.getByText(/Agent completed/)).toBeInTheDocument();
  });

  it('includes the stage name in the summary', () => {
    const events = [
      makeEvent({
        type: 'agent_completed',
        payload: { stage: 'Developer' },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText(/Developer/)).toBeInTheDocument();
  });

  it('renders the optional summary text when provided', () => {
    const events = [
      makeEvent({
        type: 'agent_completed',
        payload: {
          stage: 'QA Tester',
          summary: 'All tests passed.',
        },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText('All tests passed.')).toBeInTheDocument();
  });

  it('does not render a summary paragraph when summary is absent', () => {
    const events = [
      makeEvent({
        type: 'agent_completed',
        payload: { stage: 'Product Manager' },
      }),
    ];
    renderFeed(events);
    // No extra paragraphs beyond the main row
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('has semibold styling on the summary row', () => {
    const events = [
      makeEvent({
        type: 'agent_completed',
        payload: { stage: 'Architect' },
      }),
    ];
    const { container } = renderFeed(events);
    const semibold = container.querySelector('.font-semibold');
    expect(semibold).toBeInTheDocument();
  });
});

// ── agent_failed events ────────────────────────────────────────────────────────

describe('ActivityFeed — agent_failed events', () => {
  it('renders a failure summary row with ✗ icon', () => {
    const events = [
      makeEvent({
        type: 'agent_failed',
        payload: {
          stage: 'Developer',
          error: 'Build failed: cannot find module.',
        },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText(/✗/)).toBeInTheDocument();
    expect(screen.getByText(/Agent failed/)).toBeInTheDocument();
  });

  it('includes the stage name', () => {
    const events = [
      makeEvent({
        type: 'agent_failed',
        payload: { stage: 'Code Reviewer', error: 'Fatal error' },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText(/Code Reviewer/)).toBeInTheDocument();
  });

  it('renders the error message', () => {
    const events = [
      makeEvent({
        type: 'agent_failed',
        payload: { stage: 'Developer', error: 'TypeScript type error in index.ts' },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText('TypeScript type error in index.ts')).toBeInTheDocument();
  });

  it('renders on a red background', () => {
    const events = [
      makeEvent({
        type: 'agent_failed',
        payload: { stage: 'Developer', error: 'Oops' },
      }),
    ];
    const { container } = renderFeed(events);
    // The row wrapper should have a red background class
    const redRow = container.querySelector('.bg-red-50');
    expect(redRow).toBeInTheDocument();
  });
});

// ── Generic (other) event types ────────────────────────────────────────────────

describe('ActivityFeed — generic event types', () => {
  it('renders stage_transition as a generic row with readable label', () => {
    const events = [
      makeEvent({
        type: 'stage_transition',
        payload: { stage: 'Developer' },
      }),
    ];
    renderFeed(events);
    // Generic renderer replaces underscores with spaces
    expect(screen.getByText('stage transition')).toBeInTheDocument();
  });

  it('renders approval_request as a generic row', () => {
    const events = [
      makeEvent({
        type: 'approval_request',
        payload: {
          approval_id: 'a1',
          question: 'Proceed?',
          status: 'pending',
        },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText('approval request')).toBeInTheDocument();
  });

  it('renders token_usage_update as a generic row', () => {
    const events = [
      makeEvent({
        type: 'token_usage_update',
        payload: {
          agent_role: 'developer',
          input_tokens: 100,
          output_tokens: 50,
          cost_usd: 0.001,
          call_count: 1,
        },
      }),
    ];
    renderFeed(events);
    expect(screen.getByText('token usage update')).toBeInTheDocument();
  });
});

// ── Role labels ────────────────────────────────────────────────────────────────

describe('ActivityFeed — role labels', () => {
  function renderWithRole(role: AgentRole | 'user') {
    const events = [
      makeEvent({
        type: 'text',
        role,
        payload: { text: 'message' },
      }),
    ];
    renderFeed(events);
  }

  it('shows the PM label for product_manager role', () => {
    renderWithRole('product_manager');
    expect(screen.getByTestId('role-label-product_manager')).toHaveTextContent(
      'PM',
    );
  });

  it('shows the Arch label for architect role', () => {
    renderWithRole('architect');
    expect(screen.getByTestId('role-label-architect')).toHaveTextContent('Arch');
  });

  it('shows the Dev label for developer role', () => {
    renderWithRole('developer');
    expect(screen.getByTestId('role-label-developer')).toHaveTextContent('Dev');
  });

  it('shows the QA label for qa_tester role', () => {
    renderWithRole('qa_tester');
    expect(screen.getByTestId('role-label-qa_tester')).toHaveTextContent('QA');
  });

  it('shows the Comm label for communicator role', () => {
    renderWithRole('communicator');
    expect(screen.getByTestId('role-label-communicator')).toHaveTextContent(
      'Comm',
    );
  });

  it('shows the You label for user role', () => {
    renderWithRole('user');
    expect(screen.getByTestId('role-label-user')).toHaveTextContent('You');
  });
});

// ── Chronological ordering ─────────────────────────────────────────────────────

describe('ActivityFeed — event ordering', () => {
  it('renders events in the order they are supplied', () => {
    const events = [
      makeEvent({ type: 'text', payload: { text: 'Alpha' } }),
      makeEvent({ type: 'text', payload: { text: 'Beta' } }),
      makeEvent({ type: 'text', payload: { text: 'Gamma' } }),
    ];
    renderFeed(events);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Alpha');
    expect(items[1]).toHaveTextContent('Beta');
    expect(items[2]).toHaveTextContent('Gamma');
  });

  it('renders 1 row per event', () => {
    const events = [
      makeEvent({ type: 'text', payload: { text: 'A' } }),
      makeEvent({ type: 'thinking', payload: { text: 'B' } }),
      makeEvent({
        type: 'tool_use',
        payload: { tool_use_id: 'tu-1', tool_name: 'read', tool_input: {} },
      }),
    ];
    renderFeed(events);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});

// ── ROLE_CONFIG export ─────────────────────────────────────────────────────────

describe('ROLE_CONFIG', () => {
  it('has an entry for every AgentRole and user', () => {
    const expectedRoles: Array<AgentRole | 'user'> = [
      'product_manager',
      'architect',
      'ticket_planner',
      'developer',
      'code_reviewer',
      'qa_tester',
      'improver',
      'communicator',
      'user',
    ];
    for (const role of expectedRoles) {
      expect(ROLE_CONFIG[role]).toBeDefined();
      expect(ROLE_CONFIG[role].label).toBeTruthy();
      expect(ROLE_CONFIG[role].className).toBeTruthy();
    }
  });
});
