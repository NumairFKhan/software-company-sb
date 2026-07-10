/**
 * Reconciles the real backend wire format with this frontend's declared
 * types (see types/index.ts). The backend sends events shaped
 * {event_id, project_id, run_id, role, event_type, payload, timestamp,
 * sequence} with several payload shapes that differ from what this
 * frontend originally assumed — this module is the single place that
 * translates raw backend JSON into the shapes the rest of the app expects,
 * so every consumer (WebSocket handlers, REST recent_events hydration,
 * token usage fetch) agrees.
 */

import type {
  PipelineEvent,
  PipelineEventType,
  PipelineStage,
  AgentRole,
  TokenUsageEntry,
} from '@/types';
import { PIPELINE_STAGES } from '@/components/StageTracker';

export { PIPELINE_STAGES };

const STAGE_LABELS: Record<string, PipelineStage> = {
  product_manager: 'Product Manager',
  architect: 'Architect',
  ticket_planner: 'Ticket Planner',
  developer: 'Developer',
  code_reviewer: 'Code Reviewer',
  qa_tester: 'QA Tester',
  improver: 'Improver',
};

/**
 * The backend sends "developer[3/7]" for the looping Developer stage —
 * strip the bracket suffix before mapping to a display label. Returns null
 * for roles/stages with no pipeline-stage equivalent (e.g. "communicator").
 */
export function normalizeStage(raw: string | undefined | null): PipelineStage | null {
  if (!raw) return null;
  const base = raw.replace(/\[.*\]$/, '');
  return STAGE_LABELS[base] ?? null;
}

/**
 * Converts one raw backend event into this frontend's PipelineEvent shape.
 */
export function normalizeEvent(raw: any): PipelineEvent {
  const type = (raw.event_type ?? raw.type) as PipelineEventType;
  const payload = raw.payload ?? {};
  let normalizedPayload: Record<string, unknown> = payload;

  switch (type) {
    case 'stage_transition':
      // raw_stage is kept alongside the mapped label — the Developer
      // sub-progress badge (ActiveProjectContext's DEVELOPER_PROGRESS_RE)
      // scans event payloads for the "developer[i/N]" pattern, which the
      // mapped "Developer" label alone no longer carries.
      normalizedPayload = {
        stage: normalizeStage(payload.stage) ?? payload.stage,
        raw_stage: payload.stage,
      };
      break;
    case 'approval_resolved':
      normalizedPayload = {
        approval_id: payload.approval_id,
        decision: payload.approved ? 'approved' : 'rejected',
      };
      break;
    case 'agent_completed':
      normalizedPayload = {
        stage: normalizeStage(raw.role) ?? undefined,
        summary: `${payload.num_turns ?? '?'} turn(s) · $${Number(payload.total_cost_usd ?? 0).toFixed(4)}`,
      };
      break;
    case 'agent_failed':
      normalizedPayload = {
        stage: normalizeStage(raw.role) ?? undefined,
        error: payload.message,
      };
      break;
    case 'tool_result':
      normalizedPayload = {
        tool_use_id: payload.tool_use_id,
        content: payload.content_summary,
        is_error: Boolean(payload.is_error),
      };
      break;
    default:
      normalizedPayload = payload;
  }

  return {
    event_id: raw.event_id,
    project_id: raw.project_id,
    type,
    role: raw.role,
    timestamp: raw.timestamp,
    payload: normalizedPayload,
  };
}

/**
 * The backend's token-usage shape (both GET .../token_usage and the
 * token_usage_update event payload's usage_by_role field) is a dict keyed
 * by role: {role: {total_cost_usd, calls, usage: {input_tokens,
 * output_tokens, ...}}}. This frontend renders TokenUsageEntry[] — convert
 * once here so REST fetch and live WS updates share one code path.
 */
export function usageByRoleToEntries(
  usageByRole: Record<string, { total_cost_usd?: number; calls?: number; usage?: { input_tokens?: number; output_tokens?: number } }> | undefined | null,
): TokenUsageEntry[] {
  if (!usageByRole) return [];
  return Object.entries(usageByRole).map(([role, v]) => ({
    agent_role: role as AgentRole,
    input_tokens: v.usage?.input_tokens ?? 0,
    output_tokens: v.usage?.output_tokens ?? 0,
    cost_usd: v.total_cost_usd ?? 0,
    call_count: v.calls ?? 0,
  }));
}
