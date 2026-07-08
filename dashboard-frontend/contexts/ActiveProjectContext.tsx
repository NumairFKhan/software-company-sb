'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
} from 'react';
import type {
  Project,
  PipelineEvent,
  PipelineStage,
  ApprovalRequest,
  ApprovalRequestEvent,
  ApprovalResolvedEvent,
  StageTransitionEvent,
  TokenUsageEntry,
  WebSocketStatus,
  ToolUseEvent,
} from '@/types';

// ── State & Actions ────────────────────────────────────────────────────────────

export interface ActiveProjectState {
  selectedProjectId: string | null;
  project: Project | null;
  /** Ordered list of pipeline events for the selected project. */
  events: PipelineEvent[];
  /** Set of event_ids already seen — used for O(1) deduplication. */
  eventIds: Set<string>;
  /**
   * Map<approval_id, ApprovalRequest> for in-flight or resolved approvals.
   * Status field is updated when an approval_resolved event arrives.
   */
  approvals: Map<string, ApprovalRequest>;
  tokenUsage: TokenUsageEntry[];
  wsStatus: WebSocketStatus;
  /** The pipeline stage currently active (from the latest stage_transition event). */
  current_stage: PipelineStage | null;
  /** Stages that have been completed (in order of completion). */
  completed_stages: PipelineStage[];
  /**
   * Parsed Developer sub-progress from the pattern /developer\[(\d+)\/(\d+)\]/i
   * found in any event payload. Null until the pattern is first seen.
   */
  developer_progress: { current: number; total: number } | null;
  /**
   * Map<tool_use_id, ToolUseEvent> so that tool_result event rows can look up
   * their parent tool_use event for correlation (shows parent tool_name, etc.).
   */
  toolUseEvents: Map<string, ToolUseEvent>;
}

export type ActiveProjectAction =
  | { type: 'SELECT_PROJECT'; payload: string | null }
  | { type: 'SET_PROJECT'; payload: Project | null }
  | { type: 'ADD_EVENT'; payload: PipelineEvent }
  | { type: 'ADD_EVENTS'; payload: PipelineEvent[] }
  | { type: 'SET_WS_STATUS'; payload: WebSocketStatus };

export const initialActiveProjectState: ActiveProjectState = {
  selectedProjectId: null,
  project: null,
  events: [],
  eventIds: new Set(),
  approvals: new Map(),
  tokenUsage: [],
  wsStatus: 'disconnected',
  current_stage: null,
  completed_stages: [],
  developer_progress: null,
  toolUseEvents: new Map(),
};

/** Regex to detect Developer ticket sub-progress in any event payload string. */
const DEVELOPER_PROGRESS_RE = /developer\[(\d+)\/(\d+)\]/i;

/**
 * Attempt to merge a single event into state.
 * Returns the updated state, or null if the event was a duplicate.
 *
 * Side-effects handled here (beyond deduplication):
 * - approval_request / approval_resolved → approvals map
 * - stage_transition → current_stage and completed_stages
 * - Any event payload → developer_progress (scanned for developer[i/N] pattern)
 */
function applyEvent(
  state: ActiveProjectState,
  event: PipelineEvent,
): ActiveProjectState | null {
  if (state.eventIds.has(event.event_id)) return null;

  const newEventIds = new Set(state.eventIds);
  newEventIds.add(event.event_id);
  const newEvents = [...state.events, event];
  let newApprovals = state.approvals;
  let newCurrentStage = state.current_stage;
  let newCompletedStages = state.completed_stages;
  let newDeveloperProgress = state.developer_progress;
  let newToolUseEvents = state.toolUseEvents;

  // ── tool_use event → populate toolUseEvents map ───────────────────────────
  if (event.type === 'tool_use') {
    const toolEvent = event as ToolUseEvent;
    newToolUseEvents = new Map(state.toolUseEvents);
    newToolUseEvents.set(toolEvent.payload.tool_use_id, toolEvent);
  }

  // ── Approval handling ──────────────────────────────────────────────────────
  if (event.type === 'approval_request') {
    // Narrow to ApprovalRequestEvent so payload is typed as ApprovalRequest.
    const approvalEvent = event as ApprovalRequestEvent;
    const approval = approvalEvent.payload as unknown as ApprovalRequest;
    newApprovals = new Map(state.approvals);
    newApprovals.set(approval.approval_id, approval);
  } else if (event.type === 'approval_resolved') {
    const resolved = event as ApprovalResolvedEvent;
    const existing = state.approvals.get(resolved.payload.approval_id);
    if (existing) {
      newApprovals = new Map(state.approvals);
      newApprovals.set(resolved.payload.approval_id, {
        ...existing,
        status: resolved.payload.decision,
      });
    }
  }

  // ── Stage transition handling ──────────────────────────────────────────────
  if (event.type === 'stage_transition') {
    const stageEvent = event as StageTransitionEvent;
    newCurrentStage = stageEvent.payload.stage;
    if (
      stageEvent.payload.previous_stage &&
      !newCompletedStages.includes(stageEvent.payload.previous_stage)
    ) {
      newCompletedStages = [...newCompletedStages, stageEvent.payload.previous_stage];
    }
  }

  // ── Developer progress parsing (any event payload) ─────────────────────────
  // The backend may embed a progress string like "developer[3/7]" in any event.
  const payloadStr = JSON.stringify(event.payload);
  const devMatch = payloadStr.match(DEVELOPER_PROGRESS_RE);
  if (devMatch) {
    newDeveloperProgress = {
      current: parseInt(devMatch[1], 10),
      total: parseInt(devMatch[2], 10),
    };
  }

  return {
    ...state,
    events: newEvents,
    eventIds: newEventIds,
    approvals: newApprovals,
    current_stage: newCurrentStage,
    completed_stages: newCompletedStages,
    developer_progress: newDeveloperProgress,
    toolUseEvents: newToolUseEvents,
  };
}

export function activeProjectReducer(
  state: ActiveProjectState,
  action: ActiveProjectAction,
): ActiveProjectState {
  switch (action.type) {
    case 'SELECT_PROJECT':
      // Clear all per-project state when selecting a new project.
      // The WS subscription is torn down in the ProjectDetail component via key prop.
      return {
        ...initialActiveProjectState,
        selectedProjectId: action.payload,
        wsStatus: action.payload != null ? 'connecting' : 'disconnected',
      };

    case 'SET_PROJECT':
      return { ...state, project: action.payload };

    case 'ADD_EVENT': {
      const next = applyEvent(state, action.payload);
      return next ?? state;
    }

    case 'ADD_EVENTS': {
      // Batch-apply events (e.g. from REST hydration), skipping duplicates.
      let next: ActiveProjectState = state;
      for (const event of action.payload) {
        const result = applyEvent(next, event);
        if (result) next = result;
      }
      return next;
    }

    case 'SET_WS_STATUS':
      return { ...state, wsStatus: action.payload };

    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────────

export interface ActiveProjectContextValue {
  state: ActiveProjectState;
  dispatch: React.Dispatch<ActiveProjectAction>;
  /** Ref forwarded to the chat panel input — lets Sidebar's "+ New" focus it. */
  chatInputRef: React.RefObject<HTMLInputElement>;
  /** Programmatically focus the chat panel input. */
  focusChatInput: () => void;
}

export const ActiveProjectContext =
  createContext<ActiveProjectContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function ActiveProjectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(
    activeProjectReducer,
    initialActiveProjectState,
  );

  const chatInputRef = useRef<HTMLInputElement>(null);
  const focusChatInput = useCallback(() => {
    chatInputRef.current?.focus();
  }, []);

  return (
    <ActiveProjectContext.Provider
      value={{ state, dispatch, chatInputRef, focusChatInput }}
    >
      {children}
    </ActiveProjectContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useActiveProject(): ActiveProjectContextValue {
  const context = useContext(ActiveProjectContext);
  if (!context) {
    throw new Error(
      'useActiveProject must be used within an ActiveProjectProvider',
    );
  }
  return context;
}
