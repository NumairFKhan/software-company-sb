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
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getWsBaseUrl } from '@/lib/api/client';
import type { ChatMessageEvent } from '@/types';

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

// ── Component ──────────────────────────────────────────────────────────────────

export function ChatPanel() {
  const { chatInputRef } = useActiveProject();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
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
      const event = JSON.parse(rawEvent.data as string) as ChatMessageEvent;
      if (event.type !== 'chat_message') return;

      // Any incoming communicator event clears the thinking indicator.
      setIsThinking(false);

      const { role, text } = event.payload;

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

  const { status, send } = useWebSocket<ChatMessageEvent>(wsUrl, {
    onMessage: handleMessage,
  });

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isUserScrolled) {
      // scrollIntoView may be unavailable in jsdom test environments.
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isUserScrolled]);

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
      className="flex-shrink-0 border-t border-gray-200 bg-white flex flex-col h-64"
      data-testid="chat-panel"
    >
      {/* Multi-tab warning banner */}
      {multiTabWarning && (
        <div
          className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-xs text-amber-800"
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
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0"
        aria-label="Chat messages"
        aria-live="polite"
        data-testid="chat-messages"
      >
        {messages.length === 0 && !isThinking && (
          <p className="text-xs text-gray-400 text-center py-4">
            {status === 'connected'
              ? 'Connected. Type a message to start a conversation.'
              : status === 'connecting' || status === 'reconnecting'
              ? 'Connecting to Communicator…'
              : 'Disconnected from Communicator.'}
          </p>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isThinking && (
          <div
            className="flex justify-start"
            aria-live="polite"
            data-testid="thinking-indicator"
          >
            <div className="bg-gray-100 text-gray-500 rounded-lg px-3 py-2 text-sm italic max-w-xs">
              thinking…
            </div>
          </div>
        )}

        {/* Scroll anchor — kept at the end so scrollIntoView goes to the bottom */}
        <div ref={messagesEndRef} />
      </div>

      {/* Connection status strip (shown only when not connected) */}
      {status !== 'connected' && (
        <div
          className="flex-shrink-0 bg-gray-50 border-t border-gray-100 px-3 py-1 flex items-center gap-1.5 text-xs text-gray-500"
          aria-live="polite"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              status === 'connecting' || status === 'reconnecting'
                ? 'bg-yellow-400'
                : 'bg-red-400'
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
      <div className="flex-shrink-0 border-t border-gray-100 px-3 py-2 flex gap-2">
        <input
          ref={chatInputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Communicator…"
          className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-md
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     bg-white"
          aria-label="Chat input"
          data-testid="chat-input"
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || status !== 'connected'}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                     transition-colors"
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
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid={`message-bubble-${message.id}`}
    >
      <div
        className={`max-w-xs lg:max-w-sm rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? `bg-blue-600 text-white${message.isPending ? ' opacity-70' : ''}`
            : 'bg-gray-100 text-gray-900'
        }`}
        role="article"
      >
        {!isUser && (
          <p className="text-xs font-semibold text-gray-400 mb-0.5">Communicator</p>
        )}
        <p className="break-words">{message.text}</p>
      </div>
    </div>
  );
}
