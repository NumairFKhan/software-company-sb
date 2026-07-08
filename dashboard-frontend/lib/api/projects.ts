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
import type {
  Project,
  ProjectsListResponse,
  TokenUsageResponse,
  ApprovalDecisionPayload,
  ApprovalDecisionResponse,
} from '@/types';

/**
 * GET /api/projects
 * Returns the list of all projects (summary shape).
 */
export async function getProjects(): Promise<ProjectsListResponse> {
  return apiFetch<ProjectsListResponse>('/api/projects');
}

/**
 * GET /api/projects/{id}
 * Returns full project detail including recent_events.
 */
export async function getProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${encodeURIComponent(id)}`);
}

/**
 * GET /api/projects/{id}/token_usage
 * Returns per-agent token usage for the given project.
 */
export async function getProjectTokenUsage(
  id: string,
): Promise<TokenUsageResponse> {
  return apiFetch<TokenUsageResponse>(
    `/api/projects/${encodeURIComponent(id)}/token_usage`,
  );
}

/**
 * POST /api/projects/{id}/approvals/{approval_id}
 * Submits an approve/reject decision for a pending approval request.
 */
export async function postApprovalDecision(
  projectId: string,
  approvalId: string,
  payload: ApprovalDecisionPayload,
): Promise<ApprovalDecisionResponse> {
  return apiFetch<ApprovalDecisionResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/approvals/${encodeURIComponent(approvalId)}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}
