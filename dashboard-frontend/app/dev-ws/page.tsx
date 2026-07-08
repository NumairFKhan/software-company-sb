'use client';

/**
 * Throwaway dev page for verifying WebSocket connectivity.
 *
 * Open http://localhost:3000/dev-ws in your browser while the backend is
 * running at http://localhost:8000.  Open DevTools → Console to see
 * incoming events from both WS endpoints.
 *
 * Usage:
 *   1. Set the Project ID field to a real project ID.
 *   2. Click "Connect" on each panel.
 *   3. All received events are console.logged and listed on screen.
 *
 * This page is intentionally rough — it is plumbing verification only.
 * Delete or gate behind a feature flag before shipping to production.
 */

import { useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getWsBaseUrl } from '@/lib/api';
import type { PipelineEvent } from '@/types';

// ─── Project Events Panel ─────────────────────────────────────────────────────

function ProjectEventsPanel({ projectId }: { projectId: string }) {
  const wsUrl = projectId
    ? `${getWsBaseUrl()}/ws/projects/${encodeURIComponent(projectId)}/events`
    : null;

  const [events, setEvents] = useState<PipelineEvent[]>([]);

  const { status, lastMessage } = useWebSocket<PipelineEvent>(wsUrl, {
    onOpen: () => console.log('[ProjectEvents] WebSocket connected', wsUrl),
    onClose: (e) => console.log('[ProjectEvents] WebSocket closed', e.code, e.reason),
    onError: (e) => console.error('[ProjectEvents] WebSocket error', e),
  });

  useEffect(() => {
    if (lastMessage) {
      console.log('[ProjectEvents] received event:', lastMessage);
      setEvents((prev) => [...prev, lastMessage]);
    }
  }, [lastMessage]);

  return (
    <section className="p-4 border rounded-lg space-y-2">
      <h2 className="font-semibold text-lg">
        Project Events — <code>/ws/projects/{'{id}'}/events</code>
      </h2>
      <p>
        Status:{' '}
        <span className="font-mono text-sm">{status}</span>
        {projectId ? ` (project: ${projectId})` : ' (no project id set)'}
      </p>
      <div className="h-64 overflow-y-auto bg-gray-900 text-green-400 font-mono text-xs p-2 rounded">
        {events.length === 0 ? (
          <p className="text-gray-500">Waiting for events…</p>
        ) : (
          events.map((ev, i) => (
            <div key={ev.event_id ?? i} className="mb-1">
              <span className="text-gray-400">[{ev.timestamp ?? '—'}]</span>{' '}
              <span className="text-yellow-300">{ev.type}</span>{' '}
              <span>{JSON.stringify(ev.payload)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ─── Communicator Panel ───────────────────────────────────────────────────────

function CommunicatorPanel() {
  const wsUrl = `${getWsBaseUrl()}/ws/communicator`;
  const [messages, setMessages] = useState<unknown[]>([]);
  const [draft, setDraft] = useState('');

  const { status, lastMessage, send } = useWebSocket<unknown>(wsUrl, {
    onOpen: () => console.log('[Communicator] WebSocket connected', wsUrl),
    onClose: (e) => console.log('[Communicator] WebSocket closed', e.code, e.reason),
    onError: (e) => console.error('[Communicator] WebSocket error', e),
  });

  useEffect(() => {
    if (lastMessage) {
      console.log('[Communicator] received message:', lastMessage);
      setMessages((prev) => [...prev, lastMessage]);
    }
  }, [lastMessage]);

  const handleSend = () => {
    if (!draft.trim()) return;
    const payload = { type: 'chat_message', text: draft.trim() };
    console.log('[Communicator] sending:', payload);
    send(payload);
    setDraft('');
  };

  return (
    <section className="p-4 border rounded-lg space-y-2">
      <h2 className="font-semibold text-lg">
        Communicator — <code>/ws/communicator</code>
      </h2>
      <p>
        Status: <span className="font-mono text-sm">{status}</span>
      </p>
      <div className="h-48 overflow-y-auto bg-gray-900 text-green-400 font-mono text-xs p-2 rounded">
        {messages.length === 0 ? (
          <p className="text-gray-500">Waiting for messages…</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="mb-1">
              {JSON.stringify(msg)}
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 border rounded px-2 py-1 text-sm font-mono"
          placeholder='Type a message and press Send (sends {type:"chat_message", text:"..."})'
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          onClick={handleSend}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DevWsPage() {
  const [projectId, setProjectId] = useState('');
  const [submittedProjectId, setSubmittedProjectId] = useState('');

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        🔌 Dev: WebSocket Connectivity Test
      </h1>
      <p className="text-sm text-gray-600">
        Open DevTools → Console. All events are logged there. This page is
        throwaway plumbing verification — it will be removed before production.
      </p>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Project ID</label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 font-mono text-sm"
            placeholder="e.g. proj_abc123"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSubmittedProjectId(projectId)}
          />
        </div>
        <button
          onClick={() => setSubmittedProjectId(projectId)}
          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
        >
          Connect
        </button>
      </div>

      {submittedProjectId && (
        <ProjectEventsPanel projectId={submittedProjectId} />
      )}

      <CommunicatorPanel />

      <p className="text-xs text-gray-400">
        Backend URL: <code>{process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'}</code>
      </p>
    </main>
  );
}
