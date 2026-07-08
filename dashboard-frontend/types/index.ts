// ─── Core Domain Types ────────────────────────────────────────────────────────

export type ProjectStatus =
  | 'planning'
  | 'awaiting_approval'
  | 'building'
  | 'reviewing'
  | 'done'
  | 'failed'
  | 'interrupted';

export type AgentRole =
  | 'product_manager'
  | 'architect'
  | 'ticket_planner'
  | 'developer'
  | 'code_reviewer'
  | 'qa_tester'
  | 'improver'
  | 'communicator';

export type PipelineStage =
  | 'Product Manager'
  | 'Architect'
  | 'Ticket Planner'
  | 'Developer'
  | 'Code Reviewer'
  | 'QA Tester'
  | 'Improver';

// ─── Event Types ──────────────────────────────────────────────────────────────

export type PipelineEventType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'stage_transition'
  | 'approval_request'
  | 'approval_resolved'
  | 'agent_completed'
  | 'agent_failed'
  | 'token_usage_update'
  | 'chat_message';

export interface PipelineEvent {
  event_id: string;
  project_id: string;
  type: PipelineEventType;
  role: AgentRole | 'user';
  timestamp: string; // ISO 8601
  payload: Record<string, unknown>;
}

export interface TextEvent extends PipelineEvent {
  type: 'text';
  payload: {
    text: string;
  };
}

export interface ThinkingEvent extends PipelineEvent {
  type: 'thinking';
  payload: {
    text: string;
  };
}

export interface ToolUseEvent extends PipelineEvent {
  type: 'tool_use';
  payload: {
    tool_use_id: string;
    tool_name: string;
    tool_input: Record<string, unknown>;
  };
}

export interface ToolResultEvent extends PipelineEvent {
  type: 'tool_result';
  payload: {
    tool_use_id: string;
    content: string | Record<string, unknown>;
    is_error: boolean;
  };
}

export interface StageTransitionEvent extends PipelineEvent {
  type: 'stage_transition';
  payload: {
    stage: PipelineStage;
    previous_stage?: PipelineStage;
  };
}

export interface ApprovalRequest {
  approval_id: string;
  question: string;
  context?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ApprovalRequestEvent extends PipelineEvent {
  type: 'approval_request';
  payload: ApprovalRequest & Record<string, unknown>;
}

export interface ApprovalResolvedEvent extends PipelineEvent {
  type: 'approval_resolved';
  payload: {
    approval_id: string;
    decision: 'approved' | 'rejected';
  };
}

export interface AgentCompletedEvent extends PipelineEvent {
  type: 'agent_completed';
  payload: {
    stage: PipelineStage;
    summary?: string;
  };
}

export interface AgentFailedEvent extends PipelineEvent {
  type: 'agent_failed';
  payload: {
    stage: PipelineStage;
    error: string;
  };
}

export interface TokenUsageUpdateEvent extends PipelineEvent {
  type: 'token_usage_update';
  payload: TokenUsageEntry & Record<string, unknown>;
}

export interface ChatMessageEvent extends PipelineEvent {
  type: 'chat_message';
  payload: {
    text: string;
    role: 'user' | 'communicator';
  };
}

// ─── REST API Entities ────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  pr_url: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  recent_events: PipelineEvent[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  pr_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TokenUsageEntry {
  agent_role: AgentRole;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  call_count: number;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ProjectsListResponse {
  projects: ProjectSummary[];
}

export interface TokenUsageResponse {
  project_id: string;
  entries: TokenUsageEntry[];
}

export interface ApprovalDecisionPayload {
  decision: 'approved' | 'rejected';
  comment?: string;
}

export interface ApprovalDecisionResponse {
  approval_id: string;
  decision: 'approved' | 'rejected';
  resolved_at: string;
}

// ─── WebSocket Message Types ──────────────────────────────────────────────────

export type WebSocketStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface WsChatMessage {
  type: 'chat_message';
  text: string;
}

export type WsOutboundMessage = WsChatMessage;
