'use client';

/**
 * ActivityFeed – scrolling event log for a project's pipeline events.
 *
 * Each event type gets a distinct visual treatment:
 *   text            → plain text
 *   thinking        → dimmer italic text
 *   tool_use        → collapsed chip (tool_name), expandable to show tool_input
 *   tool_result     → collapsed chip, correlated to parent tool_use, red border on error
 *   agent_completed → bold success row with ✓ icon
 *   agent_failed    → bold failure row with ✗ icon
 *   (other types)   → generic event-type label
 *
 * Auto-scroll: tracks whether the user has manually scrolled up.
 *   - isUserScrolled=false → auto-scroll to bottom on every new event
 *   - isUserScrolled=true  → leave the viewport where the user placed it
 *   Scrolling back to the bottom (within 8px) resets isUserScrolled to false.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PipelineEvent,
  ToolUseEvent,
  ToolResultEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
  TextEvent,
  ThinkingEvent,
  AgentRole,
  WebSocketStatus,
} from '@/types';

// ── Role label design tokens ────────────────────────────────────────────────────
// Reuses the same Tailwind tokens established by StatusBadge for project statuses:
//   yellow  = planning   → product_manager
//   blue    = building   → architect
//   purple  = reviewing  → ticket_planner, code_reviewer
//   indigo               → developer   (visually distinct from architect)
//   cyan                 → code_reviewer  (lighter variant of purple)
//   green   = done       → qa_tester
//   orange  = awaiting   → improver
//   gray    = interrupted → communicator, user

export const ROLE_CONFIG: Record<
  AgentRole | 'user' | 'orchestrator',
  { label: string; className: string }
> = {
  product_manager: {
    label: 'PM',
    className: 'bg-role-pm-500/15 text-role-pm-300 border border-role-pm-500/30',
  },
  architect: {
    label: 'Arch',
    className: 'bg-role-architect-500/15 text-role-architect-300 border border-role-architect-500/30',
  },
  ticket_planner: {
    label: 'Plan',
    className: 'bg-role-planner-500/15 text-role-planner-300 border border-role-planner-500/30',
  },
  developer: {
    label: 'Dev',
    className: 'bg-role-developer-500/15 text-role-developer-300 border border-role-developer-500/30',
  },
  code_reviewer: {
    label: 'Rev',
    className: 'bg-role-reviewer-500/15 text-role-reviewer-300 border border-role-reviewer-500/30',
  },
  qa_tester: {
    label: 'QA',
    className: 'bg-role-qa-500/15 text-role-qa-300 border border-role-qa-500/30',
  },
  improver: {
    label: 'Imp',
    className: 'bg-role-improver-500/15 text-role-improver-300 border border-role-improver-500/30',
  },
  communicator: {
    label: 'Comm',
    className: 'bg-role-comm-500/15 text-role-comm-300 border border-role-comm-500/30',
  },
  user: {
    label: 'You',
    className: 'bg-surface-700 text-surface-300 border border-surface-600',
  },
  orchestrator: {
    label: 'System',
    className: 'bg-role-orchestrator-500/15 text-role-orchestrator-300 border border-role-orchestrator-500/30',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

// ── RoleLabel ───────────────────────────────────────────────────────────────────

/**
 * Coloured badge for an agent role — reuses ROLE_CONFIG design tokens.
 * Falls back to a plain gray chip if the role is unrecognised.
 */
function RoleLabel({ role }: { role: string }) {
  const config =
    ROLE_CONFIG[role as AgentRole | 'user' | 'orchestrator'] ??
    ({ label: role, className: 'bg-surface-700 text-surface-300 border border-surface-600' } as {
      label: string;
      className: string;
    });
  return (
    <span
      data-testid={`role-label-${role}`}
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold font-mono flex-shrink-0 ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// ── EventRowWrapper ─────────────────────────────────────────────────────────────

/**
 * Common layout wrapper for every event row.
 * Shows: [timestamp] [role badge] [content]
 */
function EventRowWrapper({
  event,
  rowClassName = '',
  children,
}: {
  event: PipelineEvent;
  rowClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex gap-2.5 items-start text-xs py-1.5 border-b border-surface-800/60 last:border-0 animate-fade-in-up ${rowClassName}`}
    >
      {/* Timestamp */}
      <span
        className="text-surface-600 flex-shrink-0 font-mono"
        style={{ minWidth: '5.5rem' }}
        data-testid="event-timestamp"
      >
        {formatTimestamp(event.timestamp)}
      </span>
      {/* Role badge */}
      <RoleLabel role={event.role} />
      {/* Event-type-specific content */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── ExpandableChip ──────────────────────────────────────────────────────────────

/**
 * A collapsed chip that expands to reveal a detail block.
 *
 * Expand/collapse state is purely local (no context required).
 * Used by tool_use and tool_result rows.
 */
function ExpandableChip({
  summary,
  detail,
  chipClassName = '',
  wrapperClassName = '',
  defaultExpanded = false,
}: {
  summary: React.ReactNode;
  detail: string;
  chipClassName?: string;
  /** Optional wrapper class — used to apply the red left-border for error results. */
  wrapperClassName?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className={wrapperClassName}>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono border transition-all hover:brightness-125 ${chipClassName}`}
      >
        <span aria-hidden="true">{expanded ? '▼' : '▶'}</span>
        {summary}
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-surface-950 border border-surface-800 rounded-md text-xs font-mono text-surface-300 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
          {detail}
        </pre>
      )}
    </div>
  );
}

// ── Event-specific row components ───────────────────────────────────────────────

function TextEventRow({ event }: { event: PipelineEvent }) {
  const e = event as TextEvent;
  return (
    <EventRowWrapper event={event}>
      <span className="text-surface-100">{e.payload.text}</span>
    </EventRowWrapper>
  );
}

function ThinkingEventRow({ event }: { event: PipelineEvent }) {
  const e = event as ThinkingEvent;
  return (
    <EventRowWrapper event={event}>
      <span className="text-surface-500 italic">{e.payload.text}</span>
    </EventRowWrapper>
  );
}

function ToolUseEventRow({ event }: { event: PipelineEvent }) {
  const e = event as ToolUseEvent;
  return (
    <EventRowWrapper event={event}>
      <ExpandableChip
        summary={
          <>
            <span className="text-surface-400">tool_use</span>
            <span className="ml-1 font-semibold text-status-building-300">
              {e.payload.tool_name}
            </span>
          </>
        }
        detail={JSON.stringify(e.payload.tool_input, null, 2)}
        chipClassName="bg-status-building-500/10 text-status-building-200 border-status-building-500/30"
      />
    </EventRowWrapper>
  );
}

function ToolResultEventRow({
  event,
  toolUseEvents,
}: {
  event: PipelineEvent;
  toolUseEvents: Map<string, ToolUseEvent>;
}) {
  const e = event as ToolResultEvent;
  const isError = e.payload.is_error;

  // Look up the parent tool_use event by tool_use_id for label correlation.
  const parentToolUse = toolUseEvents.get(e.payload.tool_use_id);

  const contentStr =
    typeof e.payload.content === 'string'
      ? e.payload.content
      : JSON.stringify(e.payload.content, null, 2);

  return (
    <EventRowWrapper event={event}>
      <ExpandableChip
        summary={
          <>
            {isError ? (
              <span className="text-status-failed-400">✗ error</span>
            ) : (
              <span className="text-status-done-400">✓ result</span>
            )}
            {parentToolUse && (
              <span className="text-surface-500 ml-1">
                ({parentToolUse.payload.tool_name})
              </span>
            )}
          </>
        }
        detail={contentStr}
        chipClassName={
          isError
            ? 'bg-status-failed-500/10 text-status-failed-200 border-status-failed-500/30'
            : 'bg-status-done-500/10 text-status-done-200 border-status-done-500/30'
        }
        // Red left-border on the chip wrapper when the result is an error.
        wrapperClassName={isError ? 'border-l-2 border-status-failed-500 pl-1' : ''}
      />
    </EventRowWrapper>
  );
}

function AgentCompletedRow({ event }: { event: PipelineEvent }) {
  const e = event as AgentCompletedEvent;
  return (
    <EventRowWrapper event={event} rowClassName="bg-status-done-500/5">
      <div className="font-semibold text-status-done-300 flex items-center gap-1">
        <span aria-hidden="true">✓</span>
        <span>
          Agent completed{e.payload.stage ? ` — ${e.payload.stage}` : ''}
        </span>
      </div>
      {e.payload.summary && (
        <p className="text-surface-400 mt-0.5">{e.payload.summary}</p>
      )}
    </EventRowWrapper>
  );
}

function AgentFailedRow({ event }: { event: PipelineEvent }) {
  const e = event as AgentFailedEvent;
  return (
    <EventRowWrapper event={event} rowClassName="bg-status-failed-500/5">
      <div className="font-semibold text-status-failed-300 flex items-center gap-1">
        <span aria-hidden="true">✗</span>
        <span>
          Agent failed{e.payload.stage ? ` — ${e.payload.stage}` : ''}
        </span>
      </div>
      {e.payload.error && (
        <p className="text-status-failed-400/90 mt-0.5">{e.payload.error}</p>
      )}
    </EventRowWrapper>
  );
}

function GenericEventRow({ event }: { event: PipelineEvent }) {
  return (
    <EventRowWrapper event={event}>
      <span className="text-surface-500 capitalize">
        {event.type.replace(/_/g, ' ')}
      </span>
    </EventRowWrapper>
  );
}

// ── EventRow dispatcher ─────────────────────────────────────────────────────────

function EventRow({
  event,
  toolUseEvents,
}: {
  event: PipelineEvent;
  toolUseEvents: Map<string, ToolUseEvent>;
}) {
  switch (event.type) {
    case 'text':
      return <TextEventRow event={event} />;
    case 'thinking':
      return <ThinkingEventRow event={event} />;
    case 'tool_use':
      return <ToolUseEventRow event={event} />;
    case 'tool_result':
      return <ToolResultEventRow event={event} toolUseEvents={toolUseEvents} />;
    case 'agent_completed':
      return <AgentCompletedRow event={event} />;
    case 'agent_failed':
      return <AgentFailedRow event={event} />;
    default:
      return <GenericEventRow event={event} />;
  }
}

// ── ActivityFeed ────────────────────────────────────────────────────────────────

export interface ActivityFeedProps {
  events: PipelineEvent[];
  /**
   * Map<tool_use_id, ToolUseEvent> from the ActiveProjectContext reducer.
   * Passed as a prop (not consumed from context) so the component is
   * easily unit-testable without a provider.
   */
  toolUseEvents: Map<string, ToolUseEvent>;
  /** WS connection status used for the "connecting" empty-state message. */
  wsStatus?: WebSocketStatus;
}

/**
 * Scrolling activity feed for a project's pipeline events.
 *
 * Receives events and toolUseEvents as pure props — no context access —
 * which keeps this component easy to unit test with React Testing Library.
 *
 * Auto-scroll behaviour:
 *   - When the user has NOT manually scrolled up, new events scroll the feed
 *     to the bottom automatically.
 *   - Once the user scrolls up, auto-scroll stops.
 *   - Scrolling back within 8px of the bottom re-enables auto-scroll.
 */
export function ActivityFeed({ events, toolUseEvents, wsStatus }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isUserScrolled, setIsUserScrolled] = useState(false);

  // ── Scroll tracking ────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    // Treat within 8px of the bottom as "at bottom" to handle sub-pixel rounding.
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 8;
    setIsUserScrolled(!isAtBottom);
  }, []);

  // ── Auto-scroll to bottom when new events arrive ───────────────────────────
  useEffect(() => {
    if (!isUserScrolled) {
      // scrollIntoView may be absent in jsdom — guard defensively.
      bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [events.length, isUserScrolled]);

  // ── Empty state message ────────────────────────────────────────────────────
  const isConnecting = wsStatus === 'connecting' || wsStatus === 'reconnecting';

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      role="log"
      aria-label="Activity feed"
      aria-live="polite"
      aria-relevant="additions"
      className="flex-1 overflow-y-auto min-h-0 p-4 bg-surface-950/40"
    >
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10 gap-1.5">
          {isConnecting && (
            <span className="h-2 w-2 rounded-full bg-status-building-400 animate-pulse-glow mb-1" aria-hidden="true" />
          )}
          <p className="text-sm text-surface-400">
            {isConnecting ? 'Connecting to event stream…' : 'No events yet.'}
          </p>
        </div>
      ) : (
        <ol aria-label="Event log" className="list-none">
          {events.map((event) => (
            <li key={event.event_id}>
              <EventRow event={event} toolUseEvents={toolUseEvents} />
            </li>
          ))}
        </ol>
      )}
      {/* Invisible anchor element — scrolled into view on new events */}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
