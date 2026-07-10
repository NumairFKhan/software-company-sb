'use client';

/**
 * ChatPanel – communicates with the Communicator Agent over WS /ws/communicator.
 *
 * SINGLE-TAB CONSTRAINT: /ws/communicator is a singleton session per backend
 * instance. The backend assigns exactly one Communicator per WS connection;
 * opening the dashboard in multiple browser tabs creates competing sessions
 * where only one tab reliably sends and receives messages. A BroadcastChannel-
 * based warning banner is shown whenever a second tab is detected.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getWsBaseUrl } from '@/lib/api/client';
import { normalizeEvent } from '@/lib/api/wireFormat';

// Custom renderers so markdown output matches the dark/vibrant theme instead
// of the browser's unstyled defaults — deliberately not pulling in the
// @tailwindcss/typography plugin for a handful of elements.
const MARKDOWN_COMPONENTS = {
  p: ({ children }: any) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }: any) => <strong className="font-bold text-white">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-surface-200">{children}</em>,
  ul: ({ children }: any) => <ul className="list-disc list-outside pl-4 mb-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-outside pl-4 mb-1.5 space-y-0.5">{children}</ol>,
  li: ({ children }: any) => <li className="text-surface-100">{children}</li>,
  code: ({ children }: any) => (
    <code className="font-mono text-xs bg-surface-950/60 text-brand-cyan px-1 py-0.5 rounded">{children}</code>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand-cyan underline hover:text-brand-fuchsia">
      {children}
    </a>
  ),
  h1: ({ children }: any) => <p className="font-bold text-white text-base mb-1">{children}</p>,
  h2: ({ children }: any) => <p className="font-bold text-white mb-1">{children}</p>,
  h3: ({ children }: any) => <p className="font-semibold text-white mb-1">{children}</p>,
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  text: string;
  role: 'user' | 'communicator';
  /** True while the server echo has not yet been received (optimistic append). */
  isPending?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Generate a stable client-side ID for optimistic messages.
 * Uses crypto.randomUUID() when available (secure contexts); falls back to
 * a timestamp+random string for non-secure environments (e.g. plain HTTP).
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Friendlier labels for the meta-tools the Communicator can call — shown as
// a live "doing something" chip while a turn is in progress, instead of a
// raw mcp__communicator__* tool name.
const TOOL_LABELS: Record<string, string> = {
  mcp__communicator__start_project: 'Starting a new project…',
  mcp__communicator__get_project_status: 'Checking project status…',
  mcp__communicator__list_projects: 'Looking up your projects…',
  mcp__communicator__get_recent_events: 'Reviewing recent activity…',
  mcp__communicator__request_user_approval: 'Preparing an approval request…',
  mcp__communicator__resume_project_build: 'Kicking off the build…',
};

// ── Component ──────────────────────────────────────────────────────────────────

export function ChatPanel() {
  const { chatInputRef } = useActiveProject();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  // Live, in-progress Communicator activity for the current turn — cleared
  // once its final text reply arrives. This is what makes the chat feel
  // like you're watching the agent actually work, not just waiting.
  const [liveThinking, setLiveThinking] = useState('');
  const [liveTool, setLiveTool] = useState<string | null>(null);
  const [multiTabWarning, setMultiTabWarning] = useState(false);
  const [isUserScrolled, setIsUserScrolled] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── BroadcastChannel multi-tab detection ──────────────────────────────────
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('ai-dashboard-communicator-session');
    // Announce our presence so any already-open tab can warn the user.
    channel.postMessage({ type: 'tab_open' });

    channel.onmessage = (event: MessageEvent<{ type: string }>) => {
      if (event.data?.type === 'tab_open') {
        // Another tab just opened — respond so it also shows the warning.
        channel.postMessage({ type: 'tab_conflict' });
        setMultiTabWarning(true);
      } else if (event.data?.type === 'tab_conflict') {
        setMultiTabWarning(true);
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  // ── WebSocket message handler ──────────────────────────────────────────────
  // useCallback with [] is safe here because we use functional updater forms
  // for setMessages and setIsThinking doesn't read stale state.
  const handleMessage = useCallback((rawEvent: MessageEvent) => {
    try {
      const event = normalizeEvent(JSON.parse(rawEvent.data as string));

      // thinking/tool_use are real Communicator activity for the CURRENT
      // turn — surfaced live (not as permanent chat bubbles) so the panel
      // feels like you're watching the agent actually work.
      if (event.type === 'thinking') {
        const chunk = (event.payload as { text?: string }).text ?? '';
        setLiveThinking((prev) => (prev ? `${prev} ${chunk}` : chunk));
        return;
      }
      if (event.type === 'tool_use') {
        const toolName = (event.payload as { tool_name?: string }).tool_name ?? '';
        setLiveTool(toolName);
        return;
      }
      if (event.type !== 'chat_message' && event.type !== 'text') return;

      const role = event.role as 'user' | 'communicator';
      const text = (event.payload as { text?: string }).text ?? '';

      // The final reply (or the echoed human message) resolves the turn —
      // clear the live thinking/tool state and the generic indicator.
      setIsThinking(false);
      if (role === 'communicator') {
        setLiveThinking('');
        setLiveTool(null);
      }

      if (role === 'user') {
        // Deduplicate optimistic bubble: if we already appended a pending
        // message with the same text, mark it confirmed instead of duplicating.
        setMessages((prev) => {
          const pendingIdx = prev.findIndex(
            (m) => m.isPending && m.text === text,
          );
          if (pendingIdx !== -1) {
            const updated = [...prev];
            updated[pendingIdx] = { ...updated[pendingIdx], isPending: false };
            return updated;
          }
          // No matching pending message — add as a fresh entry.
          return [...prev, { id: event.event_id, text, role: 'user' }];
        });
      } else {
        setMessages((prev) => [
          ...prev,
          { id: event.event_id, text, role: 'communicator' },
        ]);
      }
    } catch {
      console.warn('[ChatPanel] Could not parse WS message:', rawEvent.data);
    }
  }, []); // deps: none — setIsThinking/setMessages are stable React setters

  // ── WebSocket connection ───────────────────────────────────────────────────
  const wsUrl = `${getWsBaseUrl()}/ws/communicator`;

  const { status, send } = useWebSocket(wsUrl, {
    onMessage: handleMessage,
  });

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isUserScrolled) {
      // scrollIntoView may be unavailable in jsdom test environments.
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [messages, isThinking, liveThinking, liveTool, isUserScrolled]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    // Treat within 8px of the bottom as "at bottom" to account for sub-pixel
    // rounding differences across browsers.
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 8;
    setIsUserScrolled(!isAtBottom);
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;

    // Optimistically append the user bubble so the UI feels instant.
    const tempId = generateId();
    setMessages((prev) => [
      ...prev,
      { id: tempId, text, role: 'user', isPending: true },
    ]);
    setIsThinking(true);
    setLiveThinking('');
    setLiveTool(null);
    setInputValue('');
    // Ensure the new message is visible regardless of scroll position.
    setIsUserScrolled(false);

    send({ type: 'chat_message', text });
  }, [inputValue, send]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex-shrink-0 border-t border-surface-800 bg-surface-900/90 backdrop-blur-xl flex flex-col h-72"
      data-testid="chat-panel"
    >
      {/* Multi-tab warning banner */}
      {multiTabWarning && (
        <div
          className="flex-shrink-0 bg-status-awaiting-500/10 border-b border-status-awaiting-500/30 px-3 py-1.5 text-xs text-status-awaiting-300"
          role="alert"
          data-testid="multi-tab-warning"
        >
          ⚠ Another browser tab has the dashboard open. Only one tab can
          reliably communicate with the Communicator (singleton WS session).
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-0"
        aria-label="Chat messages"
        aria-live="polite"
        data-testid="chat-messages"
      >
        {messages.length === 0 && !isThinking && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 py-4">
            <span className="h-8 w-8 rounded-full bg-brand-gradient shadow-glow-violet" aria-hidden="true" />
            <p className="text-sm font-medium text-surface-200 mt-1">
              {status === 'connected' ? 'Talk to the Communicator' : 'Connecting…'}
            </p>
            <p className="text-xs text-surface-500 max-w-xs">
              {status === 'connected'
                ? 'Describe an idea to start a new build, or ask what’s happening with an existing one.'
                : status === 'connecting' || status === 'reconnecting'
                ? 'Connecting to the Communicator Agent…'
                : 'Disconnected from the Communicator.'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isThinking && (
          <div
            className="flex justify-start animate-fade-in-up"
            aria-live="polite"
            data-testid="thinking-indicator"
          >
            <div className="max-w-[85%] bg-surface-800/80 border border-brand-violet/20 rounded-xl px-3.5 py-2.5 text-sm space-y-1.5">
              {/* Live thinking text, streamed in as ThinkingBlock chunks arrive —
                  this is the actual reasoning, not a placeholder. */}
              {liveThinking ? (
                <p className="italic text-surface-400 leading-relaxed">
                  {liveThinking}
                  <span className="inline-block w-1.5 h-3 ml-0.5 align-middle bg-brand-fuchsia animate-pulse-glow" aria-hidden="true" />
                </p>
              ) : (
                <div className="flex items-center gap-1.5 text-surface-500">
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-fuchsia animate-pulse-glow [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-fuchsia animate-pulse-glow [animation-delay:200ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-fuchsia animate-pulse-glow [animation-delay:400ms]" />
                  </span>
                  <span>thinking…</span>
                </div>
              )}

              {/* Live tool-call chip — shows the Communicator actually doing
                  something (checking a project, starting a build, etc). */}
              {liveTool && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-brand-cyan bg-brand-violet/10 border border-brand-violet/25 rounded-full px-2.5 py-1 w-fit animate-fade-in-up">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan animate-pulse-glow" aria-hidden="true" />
                  {TOOL_LABELS[liveTool] ?? `Using ${liveTool}…`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scroll anchor — kept at the end so scrollIntoView goes to the bottom */}
        <div ref={messagesEndRef} />
      </div>

      {/* Connection status strip (shown only when not connected) */}
      {status !== 'connected' && (
        <div
          className="flex-shrink-0 bg-surface-800/60 border-t border-surface-800 px-3 py-1 flex items-center gap-1.5 text-xs text-surface-400"
          aria-live="polite"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              status === 'connecting' || status === 'reconnecting'
                ? 'bg-status-awaiting-400 animate-pulse-glow'
                : 'bg-status-failed-400'
            }`}
            aria-hidden="true"
          />
          <span>
            {status === 'connecting'
              ? 'Connecting…'
              : status === 'reconnecting'
              ? 'Reconnecting…'
              : 'Disconnected'}
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-surface-800 px-3 py-2.5 flex gap-2">
        <input
          ref={chatInputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the Communicator…"
          className="flex-1 text-sm px-3.5 py-2.5 rounded-lg bg-surface-800 border border-surface-700 text-surface-50 placeholder:text-surface-500
                     focus:outline-none focus:ring-2 focus:ring-brand-violet/50 focus:border-brand-violet/50
                     transition-colors"
          aria-label="Chat input"
          data-testid="chat-input"
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || status !== 'connected'}
          className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg bg-brand-gradient bg-[length:200%_200%]
                     hover:bg-right shadow-glow-violet hover:shadow-glow-cyan disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-brand-violet/50 focus:ring-offset-2 focus:ring-offset-surface-900
                     transition-all duration-300 active:scale-95"
          aria-label="Send message"
          data-testid="send-button"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── MessageBubble ──────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
      data-testid={`message-bubble-${message.id}`}
    >
      <div
        className={`max-w-xs lg:max-w-sm rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? `bg-brand-gradient text-white shadow-glow-violet${message.isPending ? ' opacity-60' : ''}`
            : 'bg-surface-800 border border-surface-700 text-surface-100'
        }`}
        role="article"
      >
        {!isUser && (
          <p className="text-[11px] font-semibold text-brand-fuchsia mb-0.5 tracking-wide uppercase">Communicator</p>
        )}
        {isUser ? (
          <p className="break-words">{message.text}</p>
        ) : (
          <div className="break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {message.text}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
