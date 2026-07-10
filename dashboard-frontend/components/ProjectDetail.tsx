'use client';

import { useCallback, useEffect, useState } from 'react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getProject, resumeProjectBuild } from '@/lib/api';
import { getWsBaseUrl } from '@/lib/api/client';
import { normalizeEvent } from '@/lib/api/wireFormat';
import { ApprovalCard } from '@/components/ApprovalCard';
import { StageTracker } from '@/components/StageTracker';
import { ActivityFeed } from '@/components/ActivityFeed';
import { TokenUsageWidget } from '@/components/TokenUsageWidget';

// ── WS connection status indicator ─────────────────────────────────────────────
// Acceptance criteria: connected=green, reconnecting=yellow, disconnected=red.
// "connecting" is treated as yellow (transitional state, same UX as reconnecting).

const WS_STATUS_CONFIG: Record<
  string,
  { dotClass: string; label: string; live: boolean }
> = {
  connected:    { dotClass: 'bg-status-done-400',     label: 'connected',    live: false },
  reconnecting: { dotClass: 'bg-status-awaiting-400', label: 'reconnecting', live: true },
  connecting:   { dotClass: 'bg-status-awaiting-400', label: 'connecting',   live: true },
  disconnected: { dotClass: 'bg-status-failed-400',   label: 'disconnected', live: false },
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
        className="text-xs font-medium text-brand-fuchsia hover:text-brand-cyan px-2.5 py-1.5 rounded-lg border border-surface-700
                   hover:border-brand-violet/40 hover:bg-brand-gradient-subtle transition-all focus:outline-none
                   focus:ring-2 focus:ring-brand-violet/50 focus:ring-offset-1 focus:ring-offset-surface-900"
        aria-label="Copy pull request link"
        data-testid="copy-pr-button"
      >
        ⎘ Copy PR link
      </button>
      {copied && (
        <span
          className="absolute top-full mt-1 left-1/2 -translate-x-1/2
                     bg-surface-800 border border-surface-700 text-surface-50 text-xs px-2 py-1 rounded-md
                     whitespace-nowrap pointer-events-none z-10 animate-fade-in-up"
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

// ── ResumeBuildBanner ────────────────────────────────────────────────────────

/**
 * Manual fallback for a project sitting in awaiting_approval with no
 * pending approval_request card visible — happens when the Communicator
 * finished planning but never actually called request_user_approval for
 * this turn (it's supposed to, but isn't guaranteed to every time). Without
 * this, a project can get permanently stuck with no way to move it forward.
 */
function ResumeBuildBanner({ projectId }: { projectId: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResume = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await resumeProjectBuild(projectId);
      // The project_status_changed WS event (building) will arrive shortly
      // and update the UI live — no local optimistic update needed.
    } catch (err) {
      console.error('[ProjectDetail] Failed to resume build:', err);
      setError('Failed to start the build. Please try again.');
      setIsSubmitting(false);
    }
  }, [projectId]);

  return (
    <div
      className="flex-shrink-0 border-t border-status-awaiting-500/40 bg-status-awaiting-500/5 px-4 py-3 flex items-center justify-between gap-3 animate-fade-in-up"
      data-testid="resume-build-banner"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-surface-50">Planning complete — ready to build?</p>
        <p className="text-xs text-surface-400 mt-0.5">
          {error ?? 'The plan is ready. Approve here, or ask the Communicator to proceed.'}
        </p>
      </div>
      <button
        onClick={handleResume}
        disabled={isSubmitting}
        className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-white rounded-lg bg-brand-gradient bg-[length:200%_200%]
                   hover:bg-right shadow-glow-violet hover:shadow-glow-cyan disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-300 active:scale-95"
        data-testid="resume-build-button"
      >
        {isSubmitting ? 'Starting…' : 'Approve & Build'}
      </button>
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
        const pipelineEvent = normalizeEvent(JSON.parse(event.data as string));
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
    WS_STATUS_CONFIG[status] ?? { dotClass: 'bg-surface-500', label: status, live: false };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Header ── */}
      <div className="flex-shrink-0 p-4 border-b border-surface-800 bg-surface-900/40 flex items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-surface-50 truncate tracking-tight">
            {state.project?.name ?? 'Loading…'}
          </h2>
          {state.project?.slug && (
            <p className="text-xs font-mono text-surface-500 truncate">{state.project.slug}</p>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 flex-shrink-0">
          {/* Copy PR link button — only shown when a PR URL is available */}
          {state.project?.pr_url && (
            <CopyPrButton prUrl={state.project.pr_url} />
          )}

          {/* WS connection-status indicator
              Sourced directly from useWebSocket's status field (synced to context).
              Colors: connected=emerald, reconnecting/connecting=amber (pulsing), disconnected=rose. */}
          <div
            className="flex items-center gap-1.5 text-xs text-surface-400 border border-surface-700 rounded-full px-2.5 py-1"
            aria-label={`WebSocket status: ${wsConfig.label}`}
            data-testid="ws-status-indicator"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${wsConfig.dotClass} ${wsConfig.live ? 'animate-pulse-glow' : ''}`}
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
        <div className="flex-shrink-0 border-t border-surface-800 bg-surface-900/60 px-4 py-2.5 space-y-2 max-h-48 overflow-y-auto">
          {Array.from(state.approvals.values()).map((approval) => (
            <ApprovalCard
              key={approval.approval_id}
              approval={approval}
              projectId={projectId}
            />
          ))}
        </div>
      )}

      {/* ── Manual approve-and-build fallback ──
          Only shown when the project is genuinely stuck: awaiting_approval
          with no pending approval_request card already offering the same
          action. */}
      {state.project?.status === 'awaiting_approval' &&
        !Array.from(state.approvals.values()).some((a) => a.status === 'pending') && (
          <ResumeBuildBanner projectId={projectId} />
        )}

      {/* ── Token usage widget ──
          Fetches initial data from GET /api/projects/{id}/token_usage on
          mount; updates live as token_usage_update events arrive via the
          already-open WS subscription. */}
      <TokenUsageWidget projectId={projectId} />
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
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6">
        <span className="h-14 w-14 rounded-2xl bg-brand-gradient shadow-glow-violet animate-gradient-x bg-[length:200%_200%]" aria-hidden="true" />
        <div>
          <p className="text-surface-200 font-semibold">No project selected</p>
          <p className="text-sm text-surface-500 mt-1 max-w-xs">
            Pick a project from the sidebar, or tell the Communicator below what you want to build.
          </p>
        </div>
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
