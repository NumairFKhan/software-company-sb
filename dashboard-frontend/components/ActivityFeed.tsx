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
  AgentRole | 'user',
  { label: string; className: string }
> = {
  product_manager: {
    label: 'PM',
    className: 'bg-yellow-100 text-yellow-800',
  },
  architect: {
    label: 'Arch',
    className: 'bg-blue-100 text-blue-800',
  },
  ticket_planner: {
    label: 'Plan',
    className: 'bg-purple-100 text-purple-800',
  },
  developer: {
    label: 'Dev',
    className: 'bg-indigo-100 text-indigo-800',
  },
  code_reviewer: {
    label: 'Rev',
    className: 'bg-cyan-100 text-cyan-800',
  },
  qa_tester: {
    label: 'QA',
    className: 'bg-green-100 text-green-800',
  },
  improver: {
    label: 'Imp',
    className: 'bg-orange-100 text-orange-800',
  },
  communicator: {
    label: 'Comm',
    className: 'bg-gray-100 text-gray-600',
  },
  user: {
    label: 'You',
    className: 'bg-gray-100 text-gray-600',
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
    ROLE_CONFIG[role as AgentRole | 'user'] ??
    ({ label: role, className: 'bg-gray-100 text-gray-600' } as {
      label: string;
      className: string;
    });
  return (
    <span
      data-testid={`role-label-${role}`}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${config.className}`}
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
      className={`flex gap-2 items-start text-xs py-1.5 border-b border-gray-100 last:border-0 ${rowClassName}`}
    >
      {/* Timestamp */}
      <span
        className="text-gray-400 flex-shrink-0 font-mono"
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
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono transition-colors hover:brightness-95 ${chipClassName}`}
      >
        <span aria-hidden="true">{expanded ? '▼' : '▶'}</span>
        {summary}
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-40">
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
      <span className="text-gray-800">{e.payload.text}</span>
    </EventRowWrapper>
  );
}

function ThinkingEventRow({ event }: { event: PipelineEvent }) {
  const e = event as ThinkingEvent;
  return (
    <EventRowWrapper event={event}>
      <span className="text-gray-400 italic">{e.payload.text}</span>
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
            <span className="text-gray-500">tool_use</span>
            <span className="ml-1 font-semibold text-blue-700">
              {e.payload.tool_name}
            </span>
          </>
        }
        detail={JSON.stringify(e.payload.tool_input, null, 2)}
        chipClassName="bg-blue-50 text-blue-800"
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
              <span className="text-red-600">✗ error</span>
            ) : (
              <span className="text-green-700">✓ result</span>
            )}
            {parentToolUse && (
              <span className="text-gray-400 ml-1">
                ({parentToolUse.payload.tool_name})
              </span>
            )}
          </>
        }
        detail={contentStr}
        chipClassName={
          isError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
        }
        // Red left-border on the chip wrapper when the result is an error.
        wrapperClassName={isError ? 'border-l-2 border-red-400 pl-1' : ''}
      />
    </EventRowWrapper>
  );
}

function AgentCompletedRow({ event }: { event: PipelineEvent }) {
  const e = event as AgentCompletedEvent;
  return (
    <EventRowWrapper event={event} rowClassName="bg-green-50">
      <div className="font-semibold text-green-700 flex items-center gap-1">
        <span aria-hidden="true">✓</span>
        <span>
          Agent completed{e.payload.stage ? ` — ${e.payload.stage}` : ''}
        </span>
      </div>
      {e.payload.summary && (
        <p className="text-green-600 mt-0.5">{e.payload.summary}</p>
      )}
    </EventRowWrapper>
  );
}

function AgentFailedRow({ event }: { event: PipelineEvent }) {
  const e = event as AgentFailedEvent;
  return (
    <EventRowWrapper event={event} rowClassName="bg-red-50">
      <div className="font-semibold text-red-700 flex items-center gap-1">
        <span aria-hidden="true">✗</span>
        <span>
          Agent failed{e.payload.stage ? ` — ${e.payload.stage}` : ''}
        </span>
      </div>
      {e.payload.error && (
        <p className="text-red-500 mt-0.5">{e.payload.error}</p>
      )}
    </EventRowWrapper>
  );
}

function GenericEventRow({ event }: { event: PipelineEvent }) {
  return (
    <EventRowWrapper event={event}>
      <span className="text-gray-500 capitalize">
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
      className="flex-1 overflow-y-auto min-h-0 p-4"
    >
      {events.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          {isConnecting ? 'Connecting to event stream…' : 'No events yet.'}
        </p>
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
