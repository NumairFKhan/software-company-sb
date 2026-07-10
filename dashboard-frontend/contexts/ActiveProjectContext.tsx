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
import { PIPELINE_STAGES, usageByRoleToEntries } from '@/lib/api/wireFormat';

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
  | { type: 'SET_WS_STATUS'; payload: WebSocketStatus }
  /**
   * SET_TOKEN_USAGE – replaces the tokenUsage array in full.
   * Dispatched by TokenUsageWidget after fetching initial data from
   * GET /api/projects/{id}/token_usage.  Live token_usage_update events
   * are merged incrementally via ADD_EVENT instead.
   */
  | { type: 'SET_TOKEN_USAGE'; payload: TokenUsageEntry[] };

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
  let newTokenUsage = state.tokenUsage;
  let newProject = state.project;

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
  // The backend doesn't send a previous_stage field — stages run strictly in
  // PIPELINE_STAGES order, so every stage before the current one in that
  // canonical order is derived as completed rather than tracked explicitly.
  if (event.type === 'stage_transition') {
    const stageEvent = event as StageTransitionEvent;
    newCurrentStage = stageEvent.payload.stage;
    const idx = PIPELINE_STAGES.indexOf(stageEvent.payload.stage);
    if (idx > 0) {
      const priorStages = PIPELINE_STAGES.slice(0, idx);
      newCompletedStages = Array.from(new Set([...newCompletedStages, ...priorStages]));
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

  // ── Token usage update ──────────────────────────────────────────────────────
  // token_usage_update events carry the full cumulative usage_by_role dict
  // (not a single role's delta), so this is a full replace, not an upsert.
  if (event.type === 'token_usage_update') {
    const payload = event.payload as { usage_by_role?: Record<string, unknown> };
    newTokenUsage = usageByRoleToEntries(payload.usage_by_role as any);
  }

  // ── Live project status / PR updates ────────────────────────────────────────
  // Without this, state.project (set once from the initial REST fetch) never
  // reflects reality once the WS stream starts reporting real changes — the
  // header badge, the "ready to build" banner, and the PR link would all
  // silently go stale mid-run.
  if (event.type === 'project_status_changed' && state.project) {
    const payload = event.payload as { status?: string };
    if (payload.status) {
      newProject = { ...state.project, status: payload.status as typeof state.project.status };
    }
  } else if (event.type === 'pr_opened' && state.project) {
    const payload = event.payload as { pr_number?: number; pr_url?: string };
    newProject = { ...state.project, pr_url: payload.pr_url ?? state.project.pr_url };
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
    tokenUsage: newTokenUsage,
    project: newProject,
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

    case 'SET_TOKEN_USAGE':
      // Full replacement — used by TokenUsageWidget after the initial API fetch.
      // Live updates use ADD_EVENT (token_usage_update) to upsert incrementally.
      return { ...state, tokenUsage: action.payload };

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
