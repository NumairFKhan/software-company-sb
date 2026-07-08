# AI Pipeline Dashboard — Frontend

Next.js 14 (App Router) + TypeScript + Tailwind CSS frontend for the AI Pipeline Dashboard.

## Architecture

```
dashboard-frontend/
├── app/                  # Next.js App Router pages & layouts
│   └── dev-ws/           # Throwaway WS connectivity test page (remove before prod)
├── hooks/
│   └── useWebSocket.ts   # Generic WS hook with exponential back-off reconnect
├── lib/
│   └── api/
│       ├── client.ts     # Base fetch helper (ApiError, apiFetch, getWsBaseUrl)
│       ├── projects.ts   # Typed wrappers for all REST endpoints
│       └── index.ts      # Barrel export
├── types/
│   └── index.ts          # All domain types (Project, PipelineEvent, etc.)
└── __tests__/            # Jest unit tests
```

## Environment Variables

| Variable                  | Default                  | Description                        |
|---------------------------|--------------------------|------------------------------------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend base URL for REST and WS   |

Create a `.env.local` file to override:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## WebSocket Rule (IMPORTANT)

> **All WebSocket code MUST live in `'use client'` components or hooks.**

The `useWebSocket` hook already has `'use client'` at the top.  Never import
`useWebSocket` or use the `WebSocket` global from a Server Component —
Next.js will throw at runtime.

An ESLint rule in `.eslintrc.json` warns if you use the `WebSocket` global
directly outside the approved files.  The approved locations are:

- `hooks/useWebSocket.ts` — the hook itself
- `app/dev-ws/**/*.tsx` — the throwaway dev page

Any new file that needs WebSocket access must use `useWebSocket` and carry
`'use client'` at the very top of the file.

## Running Locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run test         # unit tests (Jest)
npm run build        # production build (must pass with 0 TS errors)
npm run lint         # ESLint
```

## API Routes Covered

| Method | Path                                          | Wrapper function          |
|--------|-----------------------------------------------|---------------------------|
| GET    | `/api/projects`                               | `getProjects()`           |
| GET    | `/api/projects/{id}`                          | `getProject(id)`          |
| GET    | `/api/projects/{id}/token_usage`              | `getProjectTokenUsage(id)` |
| POST   | `/api/projects/{id}/approvals/{approval_id}`  | `postApprovalDecision()`  |
| WS     | `/ws/projects/{id}/events`                    | `useWebSocket(url)`       |
| WS     | `/ws/communicator`                            | `useWebSocket(url)`       |

## `useWebSocket` API

```ts
const { status, lastMessage, send } = useWebSocket<T>(url, options);
```

- **`status`**: `'connecting' | 'connected' | 'reconnecting' | 'disconnected'`
- **`lastMessage`**: most-recently received message (parsed JSON, or raw string)
- **`send(payload)`**: JSON-serialises payload and sends over the socket

Auto-reconnect uses exponential back-off: `min(500ms × 2^attempt, 30s)`, up to
10 retries before giving up and setting `status = 'disconnected'`.

## Dev WS Test Page

Visit `http://localhost:3000/dev-ws` while the backend is running.  Open
DevTools → Console to see all incoming events.  This page is **throwaway** —
remove or gate behind a feature flag before production.
