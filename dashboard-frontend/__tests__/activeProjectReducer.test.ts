/**
 * Unit tests for the ActiveProjectContext reducer.
 * Covers: SELECT_PROJECT, SET_PROJECT, ADD_EVENT (dedup), ADD_EVENTS (batch
 * dedup), SET_WS_STATUS, and approval event handling.
 */

import {
  activeProjectReducer,
  initialActiveProjectState,
  type ActiveProjectState,
} from '@/contexts/ActiveProjectContext';
import type {
  PipelineEvent,
  Project,
  ApprovalRequestEvent,
  ApprovalResolvedEvent,
} from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEvent(id: string, type: PipelineEvent['type'] = 'text'): PipelineEvent {
  return {
    event_id: id,
    project_id: 'proj-1',
    type,
    role: 'product_manager',
    timestamp: '2024-01-01T00:00:00Z',
    payload: { text: `event ${id}` },
  };
}

function makeProject(id = 'proj-1'): Project {
  return {
    id,
    name: 'Test Project',
    slug: 'test-project',
    status: 'building',
    pr_url: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    recent_events: [],
  };
}

const state = initialActiveProjectState;

// ── SELECT_PROJECT ─────────────────────────────────────────────────────────────

describe('SELECT_PROJECT', () => {
  it('sets selectedProjectId and resets all per-project state', () => {
    const withData: ActiveProjectState = {
      ...state,
      selectedProjectId: 'old',
      project: makeProject('old'),
      events: [makeEvent('e1')],
      eventIds: new Set(['e1']),
    };

    const next = activeProjectReducer(withData, {
      type: 'SELECT_PROJECT',
      payload: 'new-id',
    });

    expect(next.selectedProjectId).toBe('new-id');
    expect(next.project).toBeNull();
    expect(next.events).toHaveLength(0);
    expect(next.eventIds.size).toBe(0);
    expect(next.approvals.size).toBe(0);
  });

  it('sets wsStatus to "connecting" when a project id is given', () => {
    const next = activeProjectReducer(state, {
      type: 'SELECT_PROJECT',
      payload: 'proj-1',
    });
    expect(next.wsStatus).toBe('connecting');
  });

  it('sets wsStatus to "disconnected" when cleared (null)', () => {
    const next = activeProjectReducer(state, {
      type: 'SELECT_PROJECT',
      payload: null,
    });
    expect(next.wsStatus).toBe('disconnected');
  });
});

// ── SET_PROJECT ────────────────────────────────────────────────────────────────

describe('SET_PROJECT', () => {
  it('stores the project object', () => {
    const project = makeProject();
    const next = activeProjectReducer(state, {
      type: 'SET_PROJECT',
      payload: project,
    });
    expect(next.project).toEqual(project);
  });

  it('accepts null to clear the project', () => {
    const withProject = { ...state, project: makeProject() };
    const next = activeProjectReducer(withProject, {
      type: 'SET_PROJECT',
      payload: null,
    });
    expect(next.project).toBeNull();
  });
});

// ── ADD_EVENT ─────────────────────────────────────────────────────────────────

describe('ADD_EVENT', () => {
  it('appends a new event', () => {
    const event = makeEvent('e1');
    const next = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(next.events).toHaveLength(1);
    expect(next.events[0]).toEqual(event);
    expect(next.eventIds.has('e1')).toBe(true);
  });

  it('is idempotent — duplicate event_id is ignored', () => {
    const event = makeEvent('e1');
    const s1 = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    const s2 = activeProjectReducer(s1, { type: 'ADD_EVENT', payload: event });
    expect(s2.events).toHaveLength(1);
    expect(s2).toBe(s1); // strict equality — same object returned
  });

  it('tracks an approval_request event in the approvals map', () => {
    const approvalEvent: ApprovalRequestEvent = {
      event_id: 'e-approval',
      project_id: 'proj-1',
      type: 'approval_request',
      role: 'communicator',
      timestamp: '2024-01-01T00:00:00Z',
      payload: {
        approval_id: 'appr-1',
        question: 'Proceed?',
        status: 'pending',
      },
    };

    const next = activeProjectReducer(state, {
      type: 'ADD_EVENT',
      payload: approvalEvent,
    });

    expect(next.approvals.has('appr-1')).toBe(true);
    expect(next.approvals.get('appr-1')?.status).toBe('pending');
  });

  it('resolves a pending approval when approval_resolved event arrives', () => {
    const approvalEvent: ApprovalRequestEvent = {
      event_id: 'e-req',
      project_id: 'proj-1',
      type: 'approval_request',
      role: 'communicator',
      timestamp: '2024-01-01T00:00:00Z',
      payload: {
        approval_id: 'appr-1',
        question: 'Proceed?',
        status: 'pending',
      },
    };
    const resolvedEvent: ApprovalResolvedEvent = {
      event_id: 'e-res',
      project_id: 'proj-1',
      type: 'approval_resolved',
      role: 'communicator',
      timestamp: '2024-01-01T00:01:00Z',
      payload: { approval_id: 'appr-1', decision: 'approved' },
    };

    const s1 = activeProjectReducer(state, { type: 'ADD_EVENT', payload: approvalEvent });
    const s2 = activeProjectReducer(s1, { type: 'ADD_EVENT', payload: resolvedEvent });

    expect(s2.approvals.get('appr-1')?.status).toBe('approved');
  });
});

// ── ADD_EVENTS ────────────────────────────────────────────────────────────────

describe('ADD_EVENTS', () => {
  it('adds multiple events in one dispatch', () => {
    const events = [makeEvent('e1'), makeEvent('e2'), makeEvent('e3')];
    const next = activeProjectReducer(state, { type: 'ADD_EVENTS', payload: events });
    expect(next.events).toHaveLength(3);
  });

  it('deduplicates events within the batch', () => {
    const event = makeEvent('e1');
    const next = activeProjectReducer(state, {
      type: 'ADD_EVENTS',
      payload: [event, event, event],
    });
    expect(next.events).toHaveLength(1);
  });

  it('deduplicates against previously added events', () => {
    const e1 = makeEvent('e1');
    const s1 = activeProjectReducer(state, { type: 'ADD_EVENT', payload: e1 });
    const next = activeProjectReducer(s1, {
      type: 'ADD_EVENTS',
      payload: [e1, makeEvent('e2')],
    });
    expect(next.events).toHaveLength(2);
  });
});

// ── SET_WS_STATUS ─────────────────────────────────────────────────────────────

describe('SET_WS_STATUS', () => {
  it('updates wsStatus', () => {
    const next = activeProjectReducer(state, {
      type: 'SET_WS_STATUS',
      payload: 'connected',
    });
    expect(next.wsStatus).toBe('connected');
  });
});

// ── default branch ────────────────────────────────────────────────────────────

describe('default', () => {
  it('returns state unchanged for unknown action', () => {
    // @ts-expect-error — testing the default branch
    const next = activeProjectReducer(state, { type: 'UNKNOWN' });
    expect(next).toBe(state);
  });
});
