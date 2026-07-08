'use client';

import { useCallback, useEffect, useState } from 'react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getProject } from '@/lib/api';
import { getWsBaseUrl } from '@/lib/api/client';
import type { PipelineEvent } from '@/types';
// PipelineEvent used for JSON cast in onMessage; explicit import kept for clarity.
import { ChatPanel } from '@/components/ChatPanel';
import { ApprovalCard } from '@/components/ApprovalCard';
import { StageTracker } from '@/components/StageTracker';
import { ActivityFeed } from '@/components/ActivityFeed';
import { TokenUsageWidget } from '@/components/TokenUsageWidget';

// ── WS connection status indicator ─────────────────────────────────────────────
// Acceptance criteria: connected=green, reconnecting=yellow, disconnected=red.
// "connecting" is treated as yellow (transitional state, same UX as reconnecting).

const WS_STATUS_CONFIG: Record<
  string,
  { dotClass: string; label: string }
> = {
  connected:    { dotClass: 'bg-green-500',  label: 'connected'    },
  reconnecting: { dotClass: 'bg-yellow-500', label: 'reconnecting' },
  connecting:   { dotClass: 'bg-yellow-500', label: 'connecting'   },
  disconnected: { dotClass: 'bg-red-500',    label: 'disconnected' },
};

// ── CopyPrButton ───────────────────────────────────────────────────────────────

/**
 * "Copy PR link" button with a transient "Copied!" tooltip.
 * Uses navigator.clipboard.writeText; shows the tooltip for 2 s after success.
 */
function CopyPrButton({ prUrl }: { prUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(prUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error('[ProjectDetail] Failed to copy PR URL:', err);
    });
  }, [prUrl]);

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded
                   hover:bg-blue-50 transition-colors focus:outline-none
                   focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
        aria-label="Copy pull request link"
        data-testid="copy-pr-button"
      >
        Copy PR link
      </button>
      {copied && (
        <span
          className="absolute top-full mt-1 left-1/2 -translate-x-1/2
                     bg-gray-800 text-white text-xs px-2 py-1 rounded
                     whitespace-nowrap pointer-events-none z-10"
          role="status"
          aria-live="polite"
          data-testid="copy-pr-tooltip"
        >
          Copied!
        </span>
      )}
    </div>
  );
}

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

  const wsConfig =
    WS_STATUS_CONFIG[status] ?? { dotClass: 'bg-gray-400', label: status };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="flex-shrink-0 p-4 border-b border-surface-200 flex items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 truncate">
            {state.project?.name ?? 'Loading…'}
          </h2>
          {state.project?.slug && (
            <p className="text-xs text-gray-500 truncate">{state.project.slug}</p>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {/* Copy PR link button — only shown when a PR URL is available */}
          {state.project?.pr_url && (
            <CopyPrButton prUrl={state.project.pr_url} />
          )}

          {/* WS connection-status indicator
              Sourced directly from useWebSocket's status field (synced to context).
              Colors: connected=green, reconnecting/connecting=yellow, disconnected=red. */}
          <div
            className="flex items-center gap-1 text-xs text-gray-500"
            aria-label={`WebSocket status: ${wsConfig.label}`}
            data-testid="ws-status-indicator"
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${wsConfig.dotClass}`}
              aria-hidden="true"
              data-testid={`ws-status-dot-${status}`}
            />
            <span>{wsConfig.label}</span>
          </div>
        </div>
      </div>

      {/* ── Stage tracker ── */}
      <StageTracker
        current_stage={state.current_stage}
        completed_stages={state.completed_stages}
        developer_progress={state.developer_progress}
      />

      {/* ── Activity feed ── */}
      <ActivityFeed
        events={state.events}
        toolUseEvents={state.toolUseEvents}
        wsStatus={state.wsStatus}
      />

      {/* ── Inline approval cards ── */}
      {/* Cards are driven by state.approvals (Map<approval_id, ApprovalRequest>),
          populated by approval_request / approval_resolved events in the reducer.
          Resolved approvals render as compact badges; pending ones show action buttons. */}
      {state.approvals.size > 0 && (
        <div className="flex-shrink-0 border-t border-surface-200 bg-surface-50 px-4 py-2 space-y-2 max-h-48 overflow-y-auto">
          {Array.from(state.approvals.values()).map((approval) => (
            <ApprovalCard
              key={approval.approval_id}
              approval={approval}
              projectId={projectId}
            />
          ))}
        </div>
      )}

      {/* ── Token usage widget ──
          Fetches initial data from GET /api/projects/{id}/token_usage on
          mount; updates live as token_usage_update events arrive via the
          already-open WS subscription. */}
      <TokenUsageWidget projectId={projectId} />

      {/* ── Chat panel ── */}
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
