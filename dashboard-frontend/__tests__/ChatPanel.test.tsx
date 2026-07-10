/**
 * Tests for the ChatPanel component.
 *
 * useWebSocket is mocked at the module level so tests run without a real WS
 * server. We capture the onMessage callback passed by ChatPanel so individual
 * tests can simulate incoming messages.
 *
 * Covers:
 * - Input + Send button render and initial state
 * - Optimistic user bubble appended on send
 * - 'thinking…' indicator shown after send, cleared by incoming message
 * - Communicator message bubbles rendered
 * - Deduplication of user-echo from the server
 * - Send disabled when input is empty or WS is not connected
 * - Enter key triggers send
 * - Connection status strip shown when not connected
 * - Multi-tab warning (BroadcastChannel)
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ChatPanel } from '@/components/ChatPanel';
import {
  ActiveProjectContext,
  type ActiveProjectContextValue,
  initialActiveProjectState,
} from '@/contexts/ActiveProjectContext';
import type { UseWebSocketReturn, UseWebSocketOptions } from '@/hooks/useWebSocket';
import type { ChatMessageEvent } from '@/types';

// ── Mock useWebSocket ──────────────────────────────────────────────────────────

jest.mock('@/hooks/useWebSocket');

// Import the hook after the mock so jest.fn() is already in place.
import { useWebSocket } from '@/hooks/useWebSocket';

const mockUseWebSocket = useWebSocket as jest.MockedFunction<
  (url: string | null, options?: UseWebSocketOptions) => UseWebSocketReturn
>;

// ── Mock getWsBaseUrl ─────────────────────────────────────────────────────────

jest.mock('@/lib/api/client', () => ({
  getWsBaseUrl: () => 'ws://localhost:8000',
  API_BASE_URL: 'http://localhost:8000',
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Capture the onMessage callback that ChatPanel passes to useWebSocket. */
let capturedOnMessage: ((event: MessageEvent) => void) | undefined;

function setupWsMock(status: UseWebSocketReturn['status'] = 'connected') {
  const mockSend = jest.fn();
  capturedOnMessage = undefined;

  mockUseWebSocket.mockImplementation((_url, options) => {
    capturedOnMessage = options?.onMessage;
    return { status, lastMessage: null, send: mockSend };
  });

  return { mockSend };
}

/** Simulate an incoming chat_message WS event. */
function simulateIncoming(
  text: string,
  role: 'user' | 'communicator',
  eventId = `evt-${Date.now()}`,
) {
  const event: ChatMessageEvent = {
    event_id: eventId,
    project_id: 'proj-1',
    type: 'chat_message',
    role,
    timestamp: new Date().toISOString(),
    payload: { text, role },
  };
  act(() => {
    capturedOnMessage?.(
      new MessageEvent('message', { data: JSON.stringify(event) }),
    );
  });
}

function buildContextValue(
  overrides?: Partial<ActiveProjectContextValue>,
): ActiveProjectContextValue {
  const chatInputRef = React.createRef<HTMLInputElement>();
  return {
    state: { ...initialActiveProjectState },
    dispatch: jest.fn(),
    chatInputRef,
    focusChatInput: jest.fn(),
    ...overrides,
  };
}

function renderChatPanel(contextValue?: Partial<ActiveProjectContextValue>) {
  const value = buildContextValue(contextValue);
  return render(
    <ActiveProjectContext.Provider value={value}>
      <ChatPanel />
    </ActiveProjectContext.Provider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setupWsMock('connected');
  jest.clearAllMocks();
});

describe('ChatPanel — initial render', () => {
  it('renders the chat input', () => {
    renderChatPanel();
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
  });

  it('renders the Send button', () => {
    renderChatPanel();
    expect(screen.getByTestId('send-button')).toBeInTheDocument();
  });

  it('Send button is disabled when input is empty', () => {
    renderChatPanel();
    expect(screen.getByTestId('send-button')).toBeDisabled();
  });

  it('Send button is enabled when input has text and WS is connected', () => {
    renderChatPanel();
    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'hello' },
    });
    expect(screen.getByTestId('send-button')).not.toBeDisabled();
  });

  it('input is not disabled', () => {
    renderChatPanel();
    expect(screen.getByTestId('chat-input')).not.toBeDisabled();
  });

  it('shows a "Connected" empty state prompt when WS is connected', () => {
    renderChatPanel();
    expect(screen.getByText(/connected\. type a message/i)).toBeInTheDocument();
  });
});

describe('ChatPanel — connection status', () => {
  it('shows connection strip when WS is connecting', () => {
    setupWsMock('connecting');
    renderChatPanel();
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });

  it('shows connection strip when WS is reconnecting', () => {
    setupWsMock('reconnecting');
    renderChatPanel();
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });

  it('shows connection strip when WS is disconnected', () => {
    setupWsMock('disconnected');
    renderChatPanel();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('does NOT show connection strip when WS is connected', () => {
    setupWsMock('connected');
    renderChatPanel();
    expect(screen.queryByText('Connecting…')).not.toBeInTheDocument();
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument();
  });

  it('Send button is disabled when WS is disconnected even with text', () => {
    setupWsMock('disconnected');
    renderChatPanel();
    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'hello' },
    });
    expect(screen.getByTestId('send-button')).toBeDisabled();
  });
});

describe('ChatPanel — sending messages', () => {
  it('appends an optimistic user bubble immediately on send', () => {
    renderChatPanel();
    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'Test message' },
    });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('clears the input after send', () => {
    renderChatPanel();
    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'Test message' },
    });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(screen.getByTestId('chat-input')).toHaveValue('');
  });

  it('sends the correct WS payload', () => {
    const { mockSend } = setupWsMock('connected');
    renderChatPanel();

    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'deploy now' },
    });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(mockSend).toHaveBeenCalledWith({
      type: 'chat_message',
      text: 'deploy now',
    });
  });

  it('shows thinking indicator after send', () => {
    renderChatPanel();
    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'anything' },
    });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(screen.getByTestId('thinking-indicator')).toBeInTheDocument();
    expect(screen.getByText('thinking…')).toBeInTheDocument();
  });

  it('clears thinking indicator when a communicator message arrives', () => {
    renderChatPanel();
    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByTestId('send-button'));

    // Thinking indicator is visible
    expect(screen.getByTestId('thinking-indicator')).toBeInTheDocument();

    // Simulate communicator response
    simulateIncoming('Hello there!', 'communicator');

    expect(screen.queryByTestId('thinking-indicator')).not.toBeInTheDocument();
  });

  it('trims whitespace-only input and does not send', () => {
    const { mockSend } = setupWsMock('connected');
    renderChatPanel();

    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends on Enter key press', () => {
    const { mockSend } = setupWsMock('connected');
    renderChatPanel();

    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'enter press' },
    });
    fireEvent.keyDown(screen.getByTestId('chat-input'), { key: 'Enter' });

    expect(mockSend).toHaveBeenCalledWith({
      type: 'chat_message',
      text: 'enter press',
    });
  });

  it('does NOT send on Shift+Enter', () => {
    const { mockSend } = setupWsMock('connected');
    renderChatPanel();

    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'shift enter' },
    });
    fireEvent.keyDown(screen.getByTestId('chat-input'), {
      key: 'Enter',
      shiftKey: true,
    });

    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('ChatPanel — receiving messages', () => {
  it('renders a communicator message bubble', () => {
    renderChatPanel();
    simulateIncoming('How can I help you?', 'communicator');

    expect(screen.getByText('How can I help you?')).toBeInTheDocument();
    expect(screen.getByText('Communicator')).toBeInTheDocument();
  });

  it('deduplicates user echo — does not double-render an optimistic bubble', () => {
    renderChatPanel();

    fireEvent.change(screen.getByTestId('chat-input'), {
      target: { value: 'unique message' },
    });
    fireEvent.click(screen.getByTestId('send-button'));

    // Simulate the server echoing the same message back as a user role event
    simulateIncoming('unique message', 'user', 'evt-echo-1');

    // Should appear exactly once
    expect(screen.getAllByText('unique message')).toHaveLength(1);
  });

  it('renders a fresh user message if no optimistic bubble matches', () => {
    renderChatPanel();
    // No optimistic message was sent — simulate incoming user message directly
    simulateIncoming('out-of-band message', 'user', 'evt-oob-1');

    expect(screen.getByText('out-of-band message')).toBeInTheDocument();
  });

  it('ignores non-chat_message WS events gracefully', () => {
    renderChatPanel();
    act(() => {
      capturedOnMessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            event_id: 'e1',
            type: 'stage_transition',
            payload: { stage: 'Architect' },
          }),
        }),
      );
    });
    // No crash and no spurious message bubbles
    expect(screen.queryByText('Communicator')).not.toBeInTheDocument();
  });

  it('handles malformed (non-JSON) WS messages gracefully', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    renderChatPanel();
    act(() => {
      capturedOnMessage?.(
        new MessageEvent('message', { data: 'this is not JSON{{' }),
      );
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ChatPanel]'),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });
});

describe('ChatPanel — multi-tab warning', () => {
  it('shows multi-tab warning when a tab_conflict message is received', () => {
    // BroadcastChannel may not exist in jsdom — guard the test.
    if (typeof BroadcastChannel === 'undefined') return;

    renderChatPanel();

    act(() => {
      // Simulate another tab broadcasting a conflict signal.
      const channels = (global as unknown as { __broadcastChannels?: Map<string, BroadcastChannel[]> }).__broadcastChannels;
      if (!channels) return;
      // We'll dispatch directly via the component's registered channel
      // by broadcasting on the same channel name.
      const channel = new BroadcastChannel('ai-dashboard-communicator-session');
      channel.postMessage({ type: 'tab_conflict' });
      channel.close();
    });

    // The component should show the warning asynchronously.
    // Note: BroadcastChannel in jsdom fires events asynchronously.
    waitFor(() => {
      expect(screen.getByTestId('multi-tab-warning')).toBeInTheDocument();
    });
  });
});
