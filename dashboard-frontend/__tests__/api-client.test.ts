/**
 * Tests for the typed API client (fetch wrappers).
 */

// Mock the global fetch before any imports so the module uses the mock.
const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

import {
  API_BASE_URL,
  getWsBaseUrl,
  ApiError,
  apiFetch,
} from '@/lib/api/client';
import {
  getProjects,
  getProject,
  getProjectTokenUsage,
  postApprovalDecision,
} from '@/lib/api/projects';

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ─── API_BASE_URL ─────────────────────────────────────────────────────────────

describe('API_BASE_URL', () => {
  it('falls back to http://localhost:8000 when env var is not set', () => {
    // In jest, NEXT_PUBLIC_API_BASE_URL is not set by default.
    expect(API_BASE_URL).toBe('http://localhost:8000');
  });
});

// ─── getWsBaseUrl ─────────────────────────────────────────────────────────────

describe('getWsBaseUrl', () => {
  it('replaces http:// with ws://', () => {
    expect(getWsBaseUrl()).toBe('ws://localhost:8000');
  });
});

// ─── apiFetch ─────────────────────────────────────────────────────────────────

describe('apiFetch', () => {
  it('calls fetch with full URL and JSON headers', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));
    await apiFetch('/api/projects');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/projects',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('returns parsed JSON on 200', async () => {
    const data = { projects: [] };
    mockFetch.mockResolvedValueOnce(makeResponse(data));
    const result = await apiFetch('/api/projects');
    expect(result).toEqual(data);
  });

  it('throws ApiError on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 404));
    await expect(apiFetch('/api/projects/nope')).rejects.toThrow(ApiError);
  });

  it('ApiError carries the status code', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));
    try {
      await apiFetch('/api/whatever');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
    }
  });
});

// ─── getProjects ──────────────────────────────────────────────────────────────

describe('getProjects', () => {
  it('hits GET /api/projects and returns typed response', async () => {
    const payload = { projects: [{ id: '1', name: 'Test', slug: 'test', status: 'planning', pr_url: null, created_at: '', updated_at: '' }] };
    mockFetch.mockResolvedValueOnce(makeResponse(payload));
    const result = await getProjects();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects'),
      expect.anything(),
    );
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].id).toBe('1');
  });
});

// ─── getProject ───────────────────────────────────────────────────────────────

describe('getProject', () => {
  it('hits GET /api/projects/{id}', async () => {
    const payload = { id: 'proj-1', name: 'My Project', slug: 'my-project', status: 'building', pr_url: null, created_at: '', updated_at: '', recent_events: [] };
    mockFetch.mockResolvedValueOnce(makeResponse(payload));
    const result = await getProject('proj-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/proj-1'),
      expect.anything(),
    );
    expect(result.id).toBe('proj-1');
  });

  it('URL-encodes the project id', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}));
    await getProject('proj/with spaces');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('proj%2Fwith%20spaces'),
      expect.anything(),
    );
  });
});

// ─── getProjectTokenUsage ─────────────────────────────────────────────────────

describe('getProjectTokenUsage', () => {
  it('hits GET /api/projects/{id}/token_usage', async () => {
    const payload = { project_id: 'p1', entries: [] };
    mockFetch.mockResolvedValueOnce(makeResponse(payload));
    const result = await getProjectTokenUsage('p1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/p1/token_usage'),
      expect.anything(),
    );
    expect(result.project_id).toBe('p1');
  });
});

// ─── postApprovalDecision ─────────────────────────────────────────────────────

describe('postApprovalDecision', () => {
  it('sends POST with decision payload', async () => {
    const responsePayload = { approval_id: 'a1', decision: 'approved', resolved_at: '2024-01-01T00:00:00Z' };
    mockFetch.mockResolvedValueOnce(makeResponse(responsePayload));
    const result = await postApprovalDecision('proj-1', 'a1', { decision: 'approved' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/proj-1/approvals/a1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'approved' }),
      }),
    );
    expect(result.decision).toBe('approved');
  });

  it('sends POST with reject decision and optional comment', async () => {
    const responsePayload = { approval_id: 'a2', decision: 'rejected', resolved_at: '2024-01-01T00:00:00Z' };
    mockFetch.mockResolvedValueOnce(makeResponse(responsePayload));
    await postApprovalDecision('proj-1', 'a2', { decision: 'rejected', comment: 'Not ready' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({ decision: 'rejected', comment: 'Not ready' }),
      }),
    );
  });
});
