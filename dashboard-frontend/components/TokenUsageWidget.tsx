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

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { getProjectTokenUsage, getConfig } from '@/lib/api';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import type { TokenUsageEntry, AgentRole } from '@/types';

/** "claude-sonnet-4-6" -> "sonnet-4-6" — compact enough for a table cell. */
function formatModelName(model: string): string {
  return model.replace(/^claude-/, '');
}

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

function TokenUsageRow({
  entry,
  maxCost,
  model,
}: {
  entry: TokenUsageEntry;
  maxCost: number;
  model?: string;
}) {
  const roleLabel = ROLE_LABELS[entry.agent_role] ?? entry.agent_role;
  const totalTokens = entry.input_tokens + entry.output_tokens;
  const barPct = maxCost > 0 ? Math.max(4, (entry.cost_usd / maxCost) * 100) : 0;

  return (
    <tr
      className="border-b border-surface-800/60 last:border-0 hover:bg-surface-800/40 transition-colors"
      data-testid={`token-usage-row-${entry.agent_role}`}
    >
      <td className="py-2 pr-3 text-surface-200 font-medium">
        <div className="flex flex-col gap-1">
          <span>{roleLabel}</span>
          {/* Relative cost bar — quick visual read on which agent is expensive. */}
          <span className="h-1 rounded-full bg-surface-800 overflow-hidden w-24">
            <span
              className="block h-full rounded-full bg-brand-gradient"
              style={{ width: `${barPct}%` }}
              aria-hidden="true"
            />
          </span>
        </div>
      </td>
      <td className="py-2 pr-3 align-top">
        {model && (
          <span
            className="inline-block font-mono text-[10px] text-brand-cyan bg-brand-violet/10 border border-brand-violet/25 rounded-full px-1.5 py-0.5 whitespace-nowrap"
            data-testid={`token-usage-model-${entry.agent_role}`}
            title="Model toggling coming soon"
          >
            {formatModelName(model)}
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-surface-400 text-right tabular-nums align-top">
        {formatNumber(entry.call_count)}
      </td>
      <td className="py-2 pr-3 text-surface-400 text-right tabular-nums align-top">
        {formatNumber(totalTokens)}
      </td>
      <td className="py-2 text-surface-50 text-right tabular-nums font-semibold align-top">
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
  const [modelsByRole, setModelsByRole] = useState<Record<string, string>>({});

  // MVP: single global key — per-project isolation (keyed by projectId) is
  // deferred. TODO: key on projectId if bleed-across-projects is reported.
  const [collapsed, setCollapsed] = useLocalStorageState('token-widget-collapsed', false);

  // ── Initial fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchTokenUsage() {
      try {
        const response = await getProjectTokenUsage(projectId);
        if (cancelled) return;
        dispatch({ type: 'SET_TOKEN_USAGE', payload: response });
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

  // ── Model-per-role (not project-scoped — same config for every project
  // today, but fetched independently so it's a one-line change to make this
  // per-role/per-project toggleable later without touching this component). ──
  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then((config) => {
        if (!cancelled) setModelsByRole(config.models_by_role);
      })
      .catch((err) => console.error('[TokenUsageWidget] Failed to fetch model config:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = state.tokenUsage;

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalCost   = entries.reduce((sum, e) => sum + e.cost_usd, 0);
  const totalCalls  = entries.reduce((sum, e) => sum + e.call_count, 0);
  const totalTokens = entries.reduce(
    (sum, e) => sum + e.input_tokens + e.output_tokens,
    0,
  );
  const maxCost = entries.reduce((max, e) => Math.max(max, e.cost_usd), 0);

  return (
    <div
      className="flex-shrink-0 border-t border-surface-800 bg-surface-900/60 px-4 py-3"
      data-testid="token-usage-widget"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide">
          Token Usage{' '}
          <span className="font-normal normal-case text-surface-600">
            (per completed agent)
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {entries.length > 0 && !collapsed && (
            <span className="text-sm font-bold text-gradient-brand">
              {formatCost(totalCost)}
            </span>
          )}
          <button
            type="button"
            aria-label={collapsed ? 'Expand token usage' : 'Collapse token usage'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center rounded p-0.5 text-surface-400 hover:text-surface-200 hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-violet transition-colors"
            data-testid="token-usage-toggle"
          >
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body is fully unmounted when collapsed — not hidden with CSS — so
          panels below shift up and vertical space is fully reclaimed. */}
      {!collapsed && (
        entries.length === 0 ? (
          <p className="text-xs text-surface-500 py-1" data-testid="token-usage-empty">
            No token data yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-xs"
              aria-label="Token usage per agent"
            >
              <thead>
                <tr className="text-surface-500 border-b border-surface-800">
                  <th className="pb-1 pr-3 text-left font-medium">Agent</th>
                  <th className="pb-1 pr-3 text-left font-medium">Model</th>
                  <th className="pb-1 pr-3 text-right font-medium">Calls</th>
                  <th className="pb-1 pr-3 text-right font-medium">Tokens</th>
                  <th className="pb-1 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <TokenUsageRow
                    key={entry.agent_role}
                    entry={entry}
                    maxCost={maxCost}
                    model={modelsByRole[entry.agent_role]}
                  />
                ))}
              </tbody>
              {/* Totals footer — only shown when there's something to sum */}
              <tfoot>
                <tr
                  className="border-t border-surface-700 font-semibold text-surface-50"
                  data-testid="token-usage-total"
                >
                  <td className="pt-1.5 pr-3 text-surface-200">Total</td>
                  <td className="pt-1.5 pr-3" />
                  <td className="pt-1.5 pr-3 text-right tabular-nums text-surface-300">
                    {formatNumber(totalCalls)}
                  </td>
                  <td className="pt-1.5 pr-3 text-right tabular-nums text-surface-300">
                    {formatNumber(totalTokens)}
                  </td>
                  <td className="pt-1.5 text-right tabular-nums">
                    {formatCost(totalCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </div>
  );
}
