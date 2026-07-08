"use client";

/**
 * ChatClient.tsx
 *
 * Interactive AI coach chat interface.
 *
 * Features:
 * - Generates a stable browser-session ID (stored in sessionStorage) so the
 *   API can group messages into the current session without exposing auth cookies.
 * - Sends messages to POST /api/chat and consumes the streaming text response
 *   using fetch + ReadableStream reader.
 * - Keeps message history in React state for the current browser session only;
 *   on page refresh the history resets (matching the spec: "current browser
 *   session" continuity).
 * - Shows a pulsing loading indicator while the assistant is streaming.
 * - Distinguishes user bubbles (right-aligned, green) from assistant bubbles
 *   (left-aligned, slate).
 * - Displays a 429 error banner when the hourly rate limit is exceeded.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  /** true while the assistant is still streaming this message */
  streaming?: boolean;
}

// ── Utility: stable browser-session UUID ──────────────────────────────────────

function getOrCreateSessionId(): string {
  const key = "courtcoach_chat_session_id";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    // Generate a v4-like UUID without depending on crypto.randomUUID polyfills
    const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    // sessionStorage unavailable (private mode in some browsers) — use in-memory
    return Math.random().toString(36).slice(2);
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-1 px-1 py-1"
      aria-label="Coach is typing"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-2 h-2 rounded-full bg-slate-500 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-green-700 px-4 py-2.5 text-sm text-white leading-relaxed shadow-sm">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="flex justify-start gap-2.5">
      {/* Coach avatar */}
      <div
        className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-green-800 flex items-center justify-center text-sm"
        aria-hidden="true"
      >
        🎾
      </div>

      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-slate-100 leading-relaxed shadow-sm">
        {content.length > 0 ? (
          <span style={{ whiteSpace: "pre-wrap" }}>{content}</span>
        ) : null}
        {streaming && (content.length === 0 ? <TypingIndicator /> : <span className="ml-0.5 inline-block w-0.5 h-4 bg-green-400 animate-pulse align-middle" aria-hidden="true" />)}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialise session ID on mount (runs client-side only)
  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  // Auto-scroll to the bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput("");
    setError(null);

    // Append user message immediately
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    // Placeholder assistant message (will be filled as stream arrives)
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      // Build conversation history to send (exclude the streaming placeholder)
      const historyToSend = messages
        .filter((m) => !m.streaming)
        .map(({ role, content }) => ({ role, content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sessionId,
          history: historyToSend,
        }),
      });

      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`;
        try {
          const data = await res.json();
          if (typeof data.error === "string") errMsg = data.error;
        } catch {
          /* ignore */
        }

        setMessages((prev) =>
          prev.filter((m) => m.id !== assistantId)
        );
        setError(errMsg);
        return;
      }

      // Consume the stream token by token
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });

        const snap = accumulated;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: snap, streaming: true }
              : m
          )
        );
      }

      // Mark streaming done
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: accumulated, streaming: false }
            : m
        )
      );
    } catch (err) {
      console.error("[ChatClient] fetch error:", err);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setError("Something went wrong. Please try again.");
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, isStreaming, messages, sessionId]);

  // ── Keyboard handler (Enter to send, Shift+Enter for newline) ─────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto">
      {/* Page heading */}
      <div className="shrink-0 pb-4">
        <h1 className="text-2xl font-bold text-white">Ask Coach</h1>
        <p className="text-slate-400 text-sm mt-1">
          Your AI tennis coach — powered by your training data.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="shrink-0 mb-3 rounded-lg bg-red-900/20 border border-red-800/50 px-4 py-3 text-sm text-red-400 flex items-start gap-2"
        >
          <span aria-hidden="true">⚠</span>
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-400 transition-colors text-xs shrink-0"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-1 min-h-0">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="text-5xl mb-4">🎾</div>
            <h2 className="text-lg font-semibold text-white mb-2">
              Hey, I&apos;m your AI coach!
            </h2>
            <p className="text-slate-400 text-sm max-w-xs">
              Ask me anything — drill ideas, match tactics, recovery tips, or
              what to train today based on your recent sessions.
            </p>
            {/* Suggestion chips */}
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {[
                "What should I train today?",
                "Help me improve my serve",
                "How's my fatigue trend?",
                "Suggest a 60-min practice plan",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:border-green-600 hover:text-green-400 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble key={msg.id} content={msg.content} />
          ) : (
            <AssistantBubble
              key={msg.id}
              content={msg.content}
              streaming={msg.streaming}
            />
          )
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-slate-800 pt-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            rows={1}
            placeholder="Ask your coach anything…"
            aria-label="Message input"
            className="flex-1 resize-none rounded-xl bg-slate-800 border border-slate-700 focus:border-green-600 focus:ring-1 focus:ring-green-600 focus:outline-none px-4 py-3 text-sm text-white placeholder-slate-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors leading-normal"
            style={{
              minHeight: "48px",
              maxHeight: "160px",
              overflowY: input.split("\n").length > 3 ? "auto" : "hidden",
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={isStreaming || input.trim().length === 0}
            aria-label="Send message"
            className="shrink-0 w-11 h-11 rounded-xl bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
          >
            {isStreaming ? (
              // Spinner while waiting
              <svg
                className="w-5 h-5 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            ) : (
              // Send arrow
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5"
                aria-hidden="true"
              >
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2 text-center">
          30 messages per hour &bull; Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
