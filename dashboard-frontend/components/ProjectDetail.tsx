'use client';

import { useEffect } from 'react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getProject } from '@/lib/api';
import { getWsBaseUrl } from '@/lib/api/client';
import type { PipelineEvent } from '@/types';
// PipelineEvent used for JSON cast in onMessage; explicit import kept for clarity.
import { ChatPanel } from '@/components/ChatPanel';
import { ApprovalCard } from '@/components/ApprovalCard';
import { StageTracker } from '@/components/StageTracker';

// ── WS status indicator dot ────────────────────────────────────────────────────

const WS_STATUS_DOT: Record<string, string> = {
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-500',
  connecting: 'bg-blue-500',
  disconnected: 'bg-red-500',
};

// ── Inner component (only rendered when a project is selected) ─────────────────
// Keyed on projectId in the parent so that the WS hook and fetch effect are
// torn down and re-created fresh whenever the selection changes.

function ProjectDetailContent({ projectId }: { projectId: string }) {
  const { state, dispatch } = useActiveProject();

  const wsUrl = `${getWsBaseUrl()}/ws/projects/${encodeURIComponent(projectId)}/events`;

  // Subscribe to live events for this project.
  // The WS connection is torn down when this component unmounts (project change
  // or navigation), because useWebSocket cleans up its socket on unmount.
  //
  // NOTE: onMessage receives the raw MessageEvent; we parse event.data here.
  // Alternatively, useWebSocket exposes lastMessage (parsed T) — we use the
  // callback here so the reducer dispatch happens synchronously per message.
  const { status } = useWebSocket(wsUrl, {
    onMessage: (event: MessageEvent) => {
      try {
        const pipelineEvent = JSON.parse(event.data as string) as PipelineEvent;
        dispatch({ type: 'ADD_EVENT', payload: pipelineEvent });
      } catch {
        console.warn(
          '[ProjectDetail] Could not parse WS message as PipelineEvent:',
          event.data,
        );
      }
    },
  });

  // Keep context WS status in sync with the hook's reported status.
  useEffect(() => {
    dispatch({ type: 'SET_WS_STATUS', payload: status });
  }, [status, dispatch]);

  // Fetch project detail and hydrate events from REST on mount.
  // Events from recent_events are merged through the same ADD_EVENTS reducer
  // path, so they are automatically deduplicated with any WS events that may
  // have arrived in the meantime.
  useEffect(() => {
    let cancelled = false;

    async function fetchProject() {
      try {
        const project = await getProject(projectId);
        if (cancelled) return;
        dispatch({ type: 'SET_PROJECT', payload: project });
        if (project.recent_events.length > 0) {
          dispatch({ type: 'ADD_EVENTS', payload: project.recent_events });
        }
      } catch (err) {
        // Non-fatal: the WS stream is the source of truth for live events.
        console.error('[ProjectDetail] Failed to fetch project:', err);
      }
    }

    fetchProject();
    return () => {
      cancelled = true;
    };
  }, [projectId, dispatch]);

  const dotClass = WS_STATUS_DOT[status] ?? 'bg-gray-400';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 flex items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 truncate">
            {state.project?.name ?? 'Loading…'}
          </h2>
          {state.project?.slug && (
            <p className="text-xs text-gray-500 truncate">{state.project.slug}</p>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {/* Copy PR link */}
          {state.project?.pr_url && (
            <a
              href={state.project.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
              aria-label="Open pull request"
            >
              PR ↗
            </a>
          )}

          {/* WS connection status */}
          <div
            className="flex items-center gap-1 text-xs text-gray-500"
            aria-label={`WebSocket status: ${status}`}
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`}
              aria-hidden="true"
            />
            <span>{status}</span>
          </div>
        </div>
      </div>

      {/* ── Stage tracker ── */}
      <StageTracker
        current_stage={state.current_stage}
        completed_stages={state.completed_stages}
        developer_progress={state.developer_progress}
      />

      {/* ── Event feed (stub — Ticket 5 will flesh this out) ── */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {state.events.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            {status === 'connecting' || status === 'reconnecting'
              ? 'Connecting to event stream…'
              : 'No events yet.'}
          </p>
        ) : (
          <ul className="space-y-0.5" aria-label="Event log">
            {state.events.map((event) => (
              <li
                key={event.event_id}
                className="text-xs font-mono text-gray-700 border-b border-gray-100 py-1 flex gap-2"
              >
                <span className="text-gray-400 flex-shrink-0">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className="font-semibold">{event.type}</span>
                {event.role && (
                  <span className="text-blue-500">({event.role})</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Inline approval cards ── */}
      {/* Cards are driven by state.approvals (Map<approval_id, ApprovalRequest>),
          populated by approval_request / approval_resolved events in the reducer.
          Resolved approvals render as compact badges; pending ones show action buttons. */}
      {state.approvals.size > 0 && (
        <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-2 space-y-2 max-h-48 overflow-y-auto">
          {Array.from(state.approvals.values()).map((approval) => (
            <ApprovalCard
              key={approval.approval_id}
              approval={approval}
              projectId={projectId}
            />
          ))}
        </div>
      )}

      {/* ── Chat panel (Ticket 4) ── */}
      <ChatPanel />
    </div>
  );
}

// ── Public component ───────────────────────────────────────────────────────────

/**
 * Right-side project detail shell.
 * Shows an empty state when no project is selected; otherwise mounts
 * ProjectDetailContent keyed on the selected project ID so that the
 * WS subscription and fetch are torn down on every project switch.
 */
export function ProjectDetail() {
  const { state } = useActiveProject();

  if (!state.selectedProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p className="text-sm">Select a project from the sidebar to get started.</p>
      </div>
    );
  }

  return (
    <ProjectDetailContent
      key={state.selectedProjectId}
      projectId={state.selectedProjectId}
    />
  );
}
