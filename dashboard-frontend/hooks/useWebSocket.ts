'use client';

/**
 * useWebSocket – generic WebSocket hook with exponential back-off reconnect.
 *
 * IMPORTANT: All WebSocket code must live in 'use client' components/hooks.
 * This file has the directive at the top; keep it there.
 *
 * Exposes:
 *  - status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
 *  - lastMessage: the most-recently received message (parsed JSON or raw string)
 *  - send(payload): JSON-serialises payload and sends over the socket
 *
 * Auto-reconnect:
 *  - Retries up to MAX_RETRIES times with exponential back-off capped at MAX_DELAY_MS.
 *  - Back-off formula: Math.min(BASE_DELAY_MS * 2^attempt, MAX_DELAY_MS)
 *  - Set `enabled` to false to disable the socket (e.g. no project selected).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebSocketStatus } from '@/types';

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;
const MAX_RETRIES = 10;

export interface UseWebSocketOptions {
  /** Set to false to close the socket and stop reconnecting. */
  enabled?: boolean;
  /** Called when the socket receives a message (raw MessageEvent). */
  onMessage?: (event: MessageEvent) => void;
  /** Called when the socket opens. */
  onOpen?: () => void;
  /** Called when the socket closes. */
  onClose?: (event: CloseEvent) => void;
  /** Called when the socket errors. */
  onError?: (event: Event) => void;
}

export interface UseWebSocketReturn<T = unknown> {
  status: WebSocketStatus;
  lastMessage: T | null;
  send: (payload: unknown) => void;
}

export function useWebSocket<T = unknown>(
  url: string | null,
  options: UseWebSocketOptions = {},
): UseWebSocketReturn<T> {
  const { enabled = true, onMessage, onOpen, onClose, onError } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<T | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Keep stable callback refs so effects don't re-run on every render.
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearRetryTimer();
    if (socketRef.current) {
      // Remove handlers before closing to prevent the onClose handler from
      // triggering a reconnect after an intentional disconnect.
      socketRef.current.onopen = null;
      socketRef.current.onmessage = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.close();
      socketRef.current = null;
    }
  }, [clearRetryTimer]);

  const connect = useCallback(() => {
    if (!url || !isMountedRef.current) return;

    disconnect();

    setStatus(
      retryCountRef.current === 0 ? 'connecting' : 'reconnecting',
    );

    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      retryCountRef.current = 0;
      setStatus('connected');
      onOpenRef.current?.();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!isMountedRef.current) return;
      onMessageRef.current?.(event);
      try {
        const parsed = JSON.parse(event.data as string) as T;
        setLastMessage(parsed);
      } catch {
        // If JSON parse fails, store raw string.
        setLastMessage(event.data as unknown as T);
      }
    };

    ws.onclose = (event: CloseEvent) => {
      if (!isMountedRef.current) return;
      onCloseRef.current?.(event);
      socketRef.current = null;

      if (!isMountedRef.current) return;

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(
          BASE_DELAY_MS * Math.pow(2, retryCountRef.current),
          MAX_DELAY_MS,
        );
        retryCountRef.current += 1;
        setStatus('reconnecting');
        retryTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) connect();
        }, delay);
      } else {
        setStatus('disconnected');
      }
    };

    ws.onerror = (event: Event) => {
      if (!isMountedRef.current) return;
      onErrorRef.current?.(event);
      // onclose fires after onerror, so reconnect logic lives there.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, disconnect]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!url || !enabled) {
      disconnect();
      setStatus('disconnected');
      return;
    }

    retryCountRef.current = 0;
    connect();

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [url, enabled, connect, disconnect]);

  const send = useCallback((payload: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    } else {
      console.warn('[useWebSocket] send() called when socket is not open');
    }
  }, []);

  return { status, lastMessage, send };
}
