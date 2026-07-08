'use client';

/**
 * TokenUsageWidget – per-agent token cost and call-count table.
 *
 * Data flow:
 *   1. On mount, fetches GET /api/projects/{id}/token_usage and dispatches
 *      SET_TOKEN_USAGE to populate the context.
 *   2. Live token_usage_update events (arriving via the already-open project
 *      WS subscription) upsert entries incrementally through ADD_EVENT in the
 *      context reducer — no new WS connection is opened here.
 *   3. The table re-renders automatically whenever state.tokenUsage changes.
 *
 * The heading is labeled "per completed agent" because the backend only emits
 * token_usage_update when an agent finishes; costs may lag real-time usage.
 */

import { useEffect } from 'react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { getProjectTokenUsage } from '@/lib/api';
import type { TokenUsageEntry, AgentRole } from '@/types';

// ── Role display names ─────────────────────────────────────────────────────────
// Reuses the canonical AgentRole type so the map is exhaustive.
const ROLE_LABELS: Record<AgentRole, string> = {
  product_manager: 'Product Manager',
  architect:       'Architect',
  ticket_planner:  'Ticket Planner',
  developer:       'Developer',
  code_reviewer:   'Code Reviewer',
  qa_tester:       'QA Tester',
  improver:        'Improver',
  communicator:    'Communicator',
};

// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd === 0) return '$0.0000';
  if (usd < 0.0001) return '<$0.0001';
  return `$${usd.toFixed(4)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ── TokenUsageRow ──────────────────────────────────────────────────────────────

function TokenUsageRow({ entry }: { entry: TokenUsageEntry }) {
  const roleLabel = ROLE_LABELS[entry.agent_role] ?? entry.agent_role;
  const totalTokens = entry.input_tokens + entry.output_tokens;

  return (
    <tr
      className="border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors"
      data-testid={`token-usage-row-${entry.agent_role}`}
    >
      <td className="py-1.5 pr-3 text-gray-700 font-medium">{roleLabel}</td>
      <td className="py-1.5 pr-3 text-gray-600 text-right tabular-nums">
        {formatNumber(entry.call_count)}
      </td>
      <td className="py-1.5 pr-3 text-gray-600 text-right tabular-nums">
        {formatNumber(totalTokens)}
      </td>
      <td className="py-1.5 text-gray-900 text-right tabular-nums font-medium">
        {formatCost(entry.cost_usd)}
      </td>
    </tr>
  );
}

// ── TokenUsageWidget ───────────────────────────────────────────────────────────

export interface TokenUsageWidgetProps {
  projectId: string;
}

export function TokenUsageWidget({ projectId }: TokenUsageWidgetProps) {
  const { state, dispatch } = useActiveProject();

  // ── Initial fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchTokenUsage() {
      try {
        const response = await getProjectTokenUsage(projectId);
        if (cancelled) return;
        dispatch({ type: 'SET_TOKEN_USAGE', payload: response.entries });
      } catch (err) {
        // Non-fatal: live token_usage_update events will still populate the
        // widget as each agent completes.
        console.error('[TokenUsageWidget] Failed to fetch token usage:', err);
      }
    }

    fetchTokenUsage();
    return () => {
      cancelled = true;
    };
  }, [projectId, dispatch]);

  const entries = state.tokenUsage;

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalCost   = entries.reduce((sum, e) => sum + e.cost_usd, 0);
  const totalCalls  = entries.reduce((sum, e) => sum + e.call_count, 0);
  const totalTokens = entries.reduce(
    (sum, e) => sum + e.input_tokens + e.output_tokens,
    0,
  );

  return (
    <div
      className="flex-shrink-0 border-t border-surface-200 bg-white px-4 py-3"
      data-testid="token-usage-widget"
    >
      {/* ── Header ── */}
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Token Usage{' '}
        <span className="font-normal normal-case text-gray-400">
          (per completed agent)
        </span>
      </h3>

      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 py-1" data-testid="token-usage-empty">
          No token data yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full text-xs"
            aria-label="Token usage per agent"
          >
            <thead>
              <tr className="text-gray-400 border-b border-surface-200">
                <th className="pb-1 pr-3 text-left font-medium">Agent</th>
                <th className="pb-1 pr-3 text-right font-medium">Calls</th>
                <th className="pb-1 pr-3 text-right font-medium">Tokens</th>
                <th className="pb-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <TokenUsageRow key={entry.agent_role} entry={entry} />
              ))}
            </tbody>
            {/* Totals footer — only shown when there's something to sum */}
            <tfoot>
              <tr
                className="border-t border-surface-200 font-semibold text-gray-900"
                data-testid="token-usage-total"
              >
                <td className="pt-1.5 pr-3 text-gray-700">Total</td>
                <td className="pt-1.5 pr-3 text-right tabular-nums">
                  {formatNumber(totalCalls)}
                </td>
                <td className="pt-1.5 pr-3 text-right tabular-nums">
                  {formatNumber(totalTokens)}
                </td>
                <td className="pt-1.5 text-right tabular-nums">
                  {formatCost(totalCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
