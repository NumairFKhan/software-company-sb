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
  ApprovalRequest,
  ApprovalRequestEvent,
  ApprovalResolvedEvent,
  TokenUsageEntry,
  WebSocketStatus,
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
};

/**
 * Attempt to merge a single event into state.
 * Returns the updated state, or null if the event was a duplicate.
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

  return {
    ...state,
    events: newEvents,
    eventIds: newEventIds,
    approvals: newApprovals,
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
