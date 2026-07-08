/**
 * Unit tests for the ActiveProjectContext reducer.
 * Covers: SELECT_PROJECT, SET_PROJECT, ADD_EVENT (dedup), ADD_EVENTS (batch
 * dedup), SET_WS_STATUS, approval event handling, stage_transition events,
 * and developer progress parsing.
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
  StageTransitionEvent,
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

// ── stage_transition events ───────────────────────────────────────────────────

describe('stage_transition events', () => {
  function makeStageTransition(
    id: string,
    stage: StageTransitionEvent['payload']['stage'],
    previous_stage?: StageTransitionEvent['payload']['previous_stage'],
  ): StageTransitionEvent {
    return {
      event_id: id,
      project_id: 'proj-1',
      type: 'stage_transition',
      role: 'product_manager',
      timestamp: '2024-01-01T00:00:00Z',
      payload: { stage, ...(previous_stage ? { previous_stage } : {}) },
    };
  }

  it('sets current_stage from a stage_transition event', () => {
    const event = makeStageTransition('e1', 'Architect');
    const next = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(next.current_stage).toBe('Architect');
  });

  it('updates current_stage on subsequent stage_transition events', () => {
    const e1 = makeStageTransition('e1', 'Product Manager');
    const e2 = makeStageTransition('e2', 'Architect', 'Product Manager');
    const s1 = activeProjectReducer(state, { type: 'ADD_EVENT', payload: e1 });
    const s2 = activeProjectReducer(s1, { type: 'ADD_EVENT', payload: e2 });
    expect(s2.current_stage).toBe('Architect');
  });

  it('adds previous_stage to completed_stages', () => {
    const event = makeStageTransition('e1', 'Architect', 'Product Manager');
    const next = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(next.completed_stages).toContain('Product Manager');
  });

  it('does NOT add to completed_stages when previous_stage is absent', () => {
    const event = makeStageTransition('e1', 'Product Manager');
    const next = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(next.completed_stages).toHaveLength(0);
  });

  it('does NOT duplicate a stage already in completed_stages', () => {
    // Simulates replaying an already-seen stage_transition event via a fresh
    // identical event id — this would be caught by dedup, but test the
    // completed_stages guard with a different event id and same previous_stage.
    const e1 = makeStageTransition('e1', 'Architect', 'Product Manager');
    const e2 = makeStageTransition('e2', 'Ticket Planner', 'Product Manager'); // same previous
    const s1 = activeProjectReducer(state, { type: 'ADD_EVENT', payload: e1 });
    const s2 = activeProjectReducer(s1, { type: 'ADD_EVENT', payload: e2 });
    const pmCount = s2.completed_stages.filter((s) => s === 'Product Manager').length;
    expect(pmCount).toBe(1);
  });

  it('builds correct completed_stages across a full run (ADD_EVENTS batch)', () => {
    const events: PipelineEvent[] = [
      makeStageTransition('e1', 'Product Manager'),
      makeStageTransition('e2', 'Architect', 'Product Manager'),
      makeStageTransition('e3', 'Developer', 'Architect'),
      makeStageTransition('e4', 'Code Reviewer', 'Developer'),
    ];
    const next = activeProjectReducer(state, { type: 'ADD_EVENTS', payload: events });
    expect(next.current_stage).toBe('Code Reviewer');
    expect(next.completed_stages).toEqual(['Product Manager', 'Architect', 'Developer']);
  });

  it('resets current_stage and completed_stages when SELECT_PROJECT is called', () => {
    const event = makeStageTransition('e1', 'Architect', 'Product Manager');
    const withStage = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(withStage.current_stage).toBe('Architect');

    const reset = activeProjectReducer(withStage, {
      type: 'SELECT_PROJECT',
      payload: 'new-project',
    });
    expect(reset.current_stage).toBeNull();
    expect(reset.completed_stages).toHaveLength(0);
  });
});

// ── developer_progress parsing ────────────────────────────────────────────────

describe('developer_progress parsing', () => {
  function makeEventWithProgress(id: string, progressStr: string): PipelineEvent {
    return {
      event_id: id,
      project_id: 'proj-1',
      type: 'text',
      role: 'developer',
      timestamp: '2024-01-01T00:00:00Z',
      payload: { text: progressStr },
    };
  }

  it('parses developer progress from an event payload string', () => {
    const event = makeEventWithProgress('e1', 'developer[3/7]');
    const next = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(next.developer_progress).toEqual({ current: 3, total: 7 });
  });

  it('parses developer progress case-insensitively', () => {
    const event = makeEventWithProgress('e1', 'Developer[5/12]');
    const next = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(next.developer_progress).toEqual({ current: 5, total: 12 });
  });

  it('updates developer_progress when a later event has a higher count', () => {
    const e1 = makeEventWithProgress('e1', 'developer[1/7]');
    const e2 = makeEventWithProgress('e2', 'developer[4/7]');
    const s1 = activeProjectReducer(state, { type: 'ADD_EVENT', payload: e1 });
    const s2 = activeProjectReducer(s1, { type: 'ADD_EVENT', payload: e2 });
    expect(s2.developer_progress).toEqual({ current: 4, total: 7 });
  });

  it('leaves developer_progress null when no event contains the pattern', () => {
    const event = makeEvent('e1', 'text');
    const next = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(next.developer_progress).toBeNull();
  });

  it('resets developer_progress when SELECT_PROJECT is called', () => {
    const event = makeEventWithProgress('e1', 'developer[3/7]');
    const withProgress = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(withProgress.developer_progress).not.toBeNull();

    const reset = activeProjectReducer(withProgress, {
      type: 'SELECT_PROJECT',
      payload: 'other-project',
    });
    expect(reset.developer_progress).toBeNull();
  });
});

// ── toolUseEvents map ─────────────────────────────────────────────────────────

describe('toolUseEvents', () => {
  function makeToolUseEvent(
    id: string,
    toolUseId: string,
    toolName: string,
  ) {
    return {
      event_id: id,
      project_id: 'proj-1',
      type: 'tool_use' as const,
      role: 'developer' as const,
      timestamp: '2024-01-01T00:00:00Z',
      payload: {
        tool_use_id: toolUseId,
        tool_name: toolName,
        tool_input: { path: '/src/index.ts' },
      },
    };
  }

  it('adds a tool_use event to toolUseEvents map', () => {
    const event = makeToolUseEvent('e1', 'tu-1', 'read_file');
    const next = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(next.toolUseEvents.has('tu-1')).toBe(true);
    expect(next.toolUseEvents.get('tu-1')?.payload.tool_name).toBe('read_file');
  });

  it('stores multiple tool_use events by their tool_use_id', () => {
    const e1 = makeToolUseEvent('e1', 'tu-1', 'read_file');
    const e2 = makeToolUseEvent('e2', 'tu-2', 'write_file');
    const s1 = activeProjectReducer(state, { type: 'ADD_EVENT', payload: e1 });
    const s2 = activeProjectReducer(s1, { type: 'ADD_EVENT', payload: e2 });
    expect(s2.toolUseEvents.size).toBe(2);
    expect(s2.toolUseEvents.get('tu-1')?.payload.tool_name).toBe('read_file');
    expect(s2.toolUseEvents.get('tu-2')?.payload.tool_name).toBe('write_file');
  });

  it('does NOT add non-tool_use events to toolUseEvents map', () => {
    const textEvent = makeEvent('e1', 'text');
    const next = activeProjectReducer(state, { type: 'ADD_EVENT', payload: textEvent });
    expect(next.toolUseEvents.size).toBe(0);
  });

  it('populates toolUseEvents from ADD_EVENTS batch', () => {
    const events = [
      makeToolUseEvent('e1', 'tu-1', 'bash'),
      makeToolUseEvent('e2', 'tu-2', 'grep'),
    ];
    const next = activeProjectReducer(state, { type: 'ADD_EVENTS', payload: events });
    expect(next.toolUseEvents.size).toBe(2);
    expect(next.toolUseEvents.has('tu-1')).toBe(true);
    expect(next.toolUseEvents.has('tu-2')).toBe(true);
  });

  it('resets toolUseEvents when SELECT_PROJECT is called', () => {
    const event = makeToolUseEvent('e1', 'tu-1', 'read_file');
    const withTool = activeProjectReducer(state, { type: 'ADD_EVENT', payload: event });
    expect(withTool.toolUseEvents.size).toBe(1);

    const reset = activeProjectReducer(withTool, {
      type: 'SELECT_PROJECT',
      payload: 'new-project',
    });
    expect(reset.toolUseEvents.size).toBe(0);
  });

  it('initialises toolUseEvents as empty Map', () => {
    expect(state.toolUseEvents).toBeInstanceOf(Map);
    expect(state.toolUseEvents.size).toBe(0);
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
