/**
 * Typed REST fetch wrappers for all project-related endpoints.
 *
 * Routes covered:
 *  GET  /api/projects
 *  GET  /api/projects/{id}
 *  GET  /api/projects/{id}/token_usage
 *  POST /api/projects/{id}/approvals/{approval_id}
 */

import { apiFetch } from './client';
import { normalizeEvent, usageByRoleToEntries } from './wireFormat';
import type {
  Project,
  ProjectSummary,
  TokenUsageEntry,
  ApprovalDecisionPayload,
} from '@/types';

/**
 * GET /api/projects
 * Returns the list of all projects (summary shape). The backend returns a
 * raw array, not a {projects: [...]} wrapper.
 */
export async function getProjects(): Promise<ProjectSummary[]> {
  return apiFetch<ProjectSummary[]>('/api/projects');
}

/**
 * GET /api/projects/{id}
 * Returns full project detail including recent_events. recent_events is
 * normalized here (see lib/api/wireFormat.ts) since the backend's raw
 * event shape differs from this frontend's PipelineEvent type.
 */
export async function getProject(id: string): Promise<Project> {
  const raw = await apiFetch<any>(`/api/projects/${encodeURIComponent(id)}`);
  return {
    ...raw,
    recent_events: (raw.recent_events ?? []).map(normalizeEvent),
  };
}

/**
 * GET /api/projects/{id}/token_usage
 * Returns per-agent token usage for the given project. The backend
 * returns a dict keyed by role, not a {project_id, entries: [...]}
 * wrapper — converted to TokenUsageEntry[] here (see wireFormat.ts).
 */
export async function getProjectTokenUsage(
  id: string,
): Promise<TokenUsageEntry[]> {
  const raw = await apiFetch<Record<string, any>>(
    `/api/projects/${encodeURIComponent(id)}/token_usage`,
  );
  return usageByRoleToEntries(raw);
}

/**
 * POST /api/projects/{id}/approvals/{approval_id}
 * Submits an approve/reject decision for a pending approval request. The
 * backend expects {approved: boolean, notes?: string}, not
 * {decision, comment} — translated here so callers keep using the more
 * readable decision-based API.
 */
export async function postApprovalDecision(
  projectId: string,
  approvalId: string,
  payload: ApprovalDecisionPayload,
): Promise<{ approval_id: string; approved: boolean }> {
  return apiFetch<{ approval_id: string; approved: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/approvals/${encodeURIComponent(approvalId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        approved: payload.decision === 'approved',
        notes: payload.comment,
      }),
    },
  );
}

/**
 * POST /api/projects/{id}/resume_build
 * Manual fallback to move a project from awaiting_approval into the real
 * build phase — used when no approval_request event/card ever arrived
 * (e.g. the Communicator planned the project but never called its
 * request_user_approval tool for this turn).
 */
export async function resumeProjectBuild(projectId: string): Promise<{ project_id: string; status: string }> {
  return apiFetch<{ project_id: string; status: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/resume_build`,
    { method: 'POST' },
  );
}

/**
 * GET /api/config
 * Returns which Claude model each agent role is currently running on.
 */
export async function getConfig(): Promise<{ models_by_role: Record<string, string> }> {
  return apiFetch<{ models_by_role: Record<string, string> }>('/api/config');
}
