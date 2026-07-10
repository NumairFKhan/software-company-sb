/**
 * Tests for the useWebSocket hook.
 *
 * Uses a mock WebSocket class to verify connection lifecycle, message
 * handling, and exponential back-off reconnect behaviour.
 */

import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '@/hooks/useWebSocket';

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

type MockWsInstance = {
  url: string;
  readyState: number;
  onopen: ((e: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose: ((e: CloseEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  close: jest.Mock;
  send: jest.Mock;
  // Helpers to simulate server events:
  simulateOpen: () => void;
  simulateMessage: (data: unknown) => void;
  simulateClose: (code?: number) => void;
  simulateError: () => void;
};

let mockWsInstances: MockWsInstance[] = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static CONNECTING = 0;

  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  close = jest.fn(() => { this.readyState = MockWebSocket.CLOSED; });
  send = jest.fn();

  constructor(public url: string) {
    mockWsInstances.push(this as unknown as MockWsInstance);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown) {
    const event = new MessageEvent('message', {
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });
    this.onmessage?.(event);
  }

  simulateClose(code = 1000) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code }));
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

beforeAll(() => {
  (global as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
});

beforeEach(() => {
  mockWsInstances = [];
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lastWs(): MockWsInstance {
  expect(mockWsInstances.length).toBeGreaterThan(0);
  return mockWsInstances[mockWsInstances.length - 1];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useWebSocket', () => {
  it('starts in connecting status when a URL is provided', () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test'),
    );
    expect(result.current.status).toBe('connecting');
  });

  it('starts in disconnected status when url is null', () => {
    const { result } = renderHook(() => useWebSocket(null));
    expect(result.current.status).toBe('disconnected');
  });

  it('transitions to connected after open', () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test'),
    );
    act(() => lastWs().simulateOpen());
    expect(result.current.status).toBe('connected');
  });

  it('parses JSON messages and exposes them as lastMessage', () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test'),
    );
    act(() => lastWs().simulateOpen());
    act(() => lastWs().simulateMessage({ event_id: 'e1', type: 'text' }));
    expect(result.current.lastMessage).toEqual({ event_id: 'e1', type: 'text' });
  });

  it('stores raw string when message is not valid JSON', () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test'),
    );
    act(() => lastWs().simulateOpen());
    act(() => lastWs().simulateMessage('not-json}'));
    expect(result.current.lastMessage).toBe('not-json}');
  });

  it('transitions to reconnecting after close', () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test'),
    );
    act(() => lastWs().simulateOpen());
    act(() => lastWs().simulateClose());
    expect(result.current.status).toBe('reconnecting');
  });

  it('opens a new WebSocket after back-off delay', () => {
    renderHook(() => useWebSocket('ws://localhost:8000/ws/test'));
    const ws1 = lastWs();
    act(() => ws1.simulateOpen());
    act(() => ws1.simulateClose());
    expect(mockWsInstances).toHaveLength(1); // not reconnected yet
    act(() => jest.advanceTimersByTime(600)); // first back-off = 500ms
    expect(mockWsInstances).toHaveLength(2); // new connection opened
  });

  it('back-off delay doubles on each retry', () => {
    renderHook(() => useWebSocket('ws://localhost:8000/ws/test'));
    // Retry 1: 500 ms
    act(() => lastWs().simulateOpen());
    act(() => lastWs().simulateClose());
    act(() => jest.advanceTimersByTime(600));
    // Retry 2: 1000 ms
    act(() => lastWs().simulateClose());
    act(() => jest.advanceTimersByTime(500));
    expect(mockWsInstances).toHaveLength(2); // not yet
    act(() => jest.advanceTimersByTime(600));
    expect(mockWsInstances).toHaveLength(3); // now
  });

  it('send() JSON-serialises and calls ws.send', () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test'),
    );
    act(() => lastWs().simulateOpen());
    act(() => { result.current.send({ type: 'chat_message', text: 'hello' }); });
    expect(lastWs().send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'chat_message', text: 'hello' }),
    );
  });

  it('send() warns and does not throw when socket is not open', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test'),
    );
    // Not open yet — still in CONNECTING state
    act(() => { result.current.send({ type: 'ping' }); });
    expect(lastWs().send).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not open'));
    warnSpy.mockRestore();
  });

  it('calls onMessage callback when a message arrives', () => {
    const onMessage = jest.fn();
    renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test', { onMessage }),
    );
    act(() => lastWs().simulateOpen());
    act(() => lastWs().simulateMessage({ type: 'ping' }));
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('calls onOpen and onClose callbacks', () => {
    const onOpen = jest.fn();
    const onClose = jest.fn();
    renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test', { onOpen, onClose }),
    );
    act(() => lastWs().simulateOpen());
    expect(onOpen).toHaveBeenCalledTimes(1);
    act(() => lastWs().simulateClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes socket when enabled is set to false', () => {
    let enabled = true;
    const { rerender } = renderHook(
      ({ enabled: e }: { enabled: boolean }) =>
        useWebSocket('ws://localhost:8000/ws/test', { enabled: e }),
      { initialProps: { enabled } },
    );
    act(() => lastWs().simulateOpen());
    enabled = false;
    rerender({ enabled });
    expect(lastWs().close).toHaveBeenCalled();
  });

  it('closes socket and stops reconnecting on unmount', () => {
    const { unmount } = renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test'),
    );
    act(() => lastWs().simulateOpen());
    unmount();
    expect(lastWs().close).toHaveBeenCalled();
  });

  it('transitions to disconnected after max retries', () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:8000/ws/test'),
    );
    const MAX_RETRIES = 10;

    // Exhaust all retries
    for (let i = 0; i <= MAX_RETRIES; i++) {
      act(() => lastWs().simulateClose());
      if (i < MAX_RETRIES) {
        // advance past back-off timer
        act(() => jest.advanceTimersByTime(30_001));
      }
    }

    expect(result.current.status).toBe('disconnected');
  });
});
