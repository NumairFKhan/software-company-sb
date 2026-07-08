"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { LogType, SessionLog } from "@/types/database";
import type { SessionSummary, FatigueTrend } from "@/lib/session-summary";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const TYPE_EMOJI: Record<LogType, string> = {
  practice: "🎾",
  match: "🏆",
  fitness: "💪",
  recovery: "😴",
};

const TYPE_LABEL: Record<LogType, string> = {
  practice: "Practice",
  match: "Match",
  fitness: "Fitness",
  recovery: "Recovery",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterType = "all" | LogType;

interface ApiResponse {
  sessions: SessionLog[];
  total: number;
  summary: SessionSummary;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/** Format "YYYY-MM-DD" → "Mon, 7 Jul 2026" using UTC to avoid timezone shifts */
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IntensityDots({
  value,
  max = 5,
  colorClass = "bg-green-400",
}: {
  value: number;
  max?: number;
  colorClass?: string;
}) {
  return (
    <span className="inline-flex gap-0.5 items-center" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`inline-block w-2 h-2 rounded-full ${
            i < value ? colorClass : "bg-slate-700"
          }`}
        />
      ))}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-300 ${
        expanded ? "rotate-180" : ""
      }`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── SummaryBlock ──────────────────────────────────────────────────────────────

const TREND_COLORS: Record<FatigueTrend, string> = {
  improving: "text-green-400",
  stable: "text-slate-300",
  worsening: "text-red-400",
  insufficient_data: "text-slate-500",
};

const TREND_LABELS: Record<FatigueTrend, string> = {
  improving: "↓ Improving",
  stable: "→ Stable",
  worsening: "↑ Worsening",
  insufficient_data: "Not enough data",
};

function SummaryBlock({ summary }: { summary: SessionSummary }) {
  return (
    <section
      aria-label="14-day training summary"
      className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800/80 border border-slate-700 p-4"
    >
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Last 14 days
      </h2>
      <div className="grid grid-cols-3 divide-x divide-slate-700 text-center">
        {/* Top focus area */}
        <div className="px-2">
          <p className="text-xs text-slate-500 mb-1">Top focus</p>
          <p
            className="text-sm font-medium text-white truncate"
            title={summary.top_focus_area ?? "None"}
          >
            {summary.top_focus_area ?? (
              <span className="text-slate-600">—</span>
            )}
          </p>
        </div>

        {/* Fatigue trend */}
        <div className="px-2">
          <p className="text-xs text-slate-500 mb-1">Fatigue trend</p>
          <p
            className={`text-sm font-medium ${TREND_COLORS[summary.fatigue_trend]}`}
          >
            {TREND_LABELS[summary.fatigue_trend]}
          </p>
        </div>

        {/* Pain flag */}
        <div className="px-2">
          <p className="text-xs text-slate-500 mb-1">Pain flag</p>
          {summary.pain_flag ? (
            <p className="text-sm font-medium text-amber-400">⚠ Flagged</p>
          ) : (
            <p className="text-sm font-medium text-green-400">✓ Clear</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ── SessionCard ───────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-slate-500 shrink-0 w-28">{label}</span>
      <span className="text-slate-300">{String(value)}</span>
    </div>
  );
}

function SessionCard({
  session,
  isExpanded,
  onToggle,
}: {
  session: SessionLog;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const details = (session.details ?? {}) as Record<string, unknown>;

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      {/* ── Collapsed header (always visible) ── */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={`session-body-${session.id}`}
      >
        {/* Type emoji */}
        <span className="text-xl shrink-0" aria-hidden="true">
          {TYPE_EMOJI[session.log_type]}
        </span>

        {/* Date + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white text-sm">
              {formatDate(session.log_date)}
            </span>
            <span className="text-xs text-slate-400 capitalize px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
              {TYPE_LABEL[session.log_type]}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-400">
              {session.duration_mins} min
            </span>
            {session.intensity !== null && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                Intensity&nbsp;
                <IntensityDots value={session.intensity} />
              </span>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <ChevronIcon expanded={isExpanded} />
      </button>

      {/* ── Expanded body ── */}
      <div
        id={`session-body-${session.id}`}
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? "600px" : "0" }}
        aria-hidden={!isExpanded}
      >
        <div className="px-4 pb-4 pt-3 space-y-2 border-t border-slate-800">
          {/* Metrics */}
          {session.fatigue !== null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 w-28 shrink-0">Fatigue after</span>
              <IntensityDots
                value={session.fatigue}
                colorClass="bg-amber-400"
              />
            </div>
          )}

          {/* Type-specific details */}
          {session.log_type === "practice" && (
            <>
              <DetailRow
                label="Focus area"
                value={details["focus_area"] as string | undefined}
              />
              <DetailRow
                label="Drill notes"
                value={details["drill_notes"] as string | undefined}
              />
            </>
          )}
          {session.log_type === "match" && (
            <>
              <DetailRow
                label="Score"
                value={details["sets_score"] as string | undefined}
              />
              <DetailRow
                label="Surface"
                value={details["surface"] as string | undefined}
              />
              <DetailRow
                label="Opponent level"
                value={details["opponent_level"] as string | undefined}
              />
            </>
          )}
          {session.log_type === "fitness" && (
            <>
              <DetailRow
                label="Activity"
                value={details["activity_type"] as string | undefined}
              />
              <DetailRow
                label="Notes"
                value={details["gym_notes"] as string | undefined}
              />
            </>
          )}
          {session.log_type === "recovery" && (
            <>
              {typeof details["sleep_quality"] === "number" && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 w-28 shrink-0">Sleep quality</span>
                  <IntensityDots
                    value={details["sleep_quality"] as number}
                    colorClass="bg-blue-400"
                  />
                </div>
              )}
              <DetailRow
                label="Soreness"
                value={details["soreness_areas"] as string | undefined}
              />
            </>
          )}

          {/* Notes */}
          {session.pain_notes && (
            <div className="flex gap-2 text-xs">
              <span className="text-amber-500 shrink-0 w-28">⚠ Pain notes</span>
              <span className="text-slate-300">{session.pain_notes}</span>
            </div>
          )}
          <DetailRow label="Notes" value={session.free_notes} />

          {/* ID (subtle) */}
          <p className="text-xs text-slate-700 pt-1">
            Logged {new Date(session.created_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
    </article>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

const FILTERS: Array<{ label: string; value: FilterType }> = [
  { label: "All", value: "all" },
  { label: "🎾 Practice", value: "practice" },
  { label: "🏆 Match", value: "match" },
  { label: "💪 Fitness", value: "fitness" },
  { label: "😴 Recovery", value: "recovery" },
];

function FilterBar({
  active,
  onChange,
  disabled,
}: {
  active: FilterType;
  onChange: (f: FilterType) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Filter sessions by type"
    >
      {FILTERS.map(({ label, value }) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            active === value
              ? "bg-green-600 border-green-500 text-white"
              : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 disabled:opacity-50"
          } disabled:cursor-not-allowed`}
          aria-pressed={active === value}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-6 text-3xl">
        🎾
      </div>
      {hasFilter ? (
        <>
          <h2 className="text-lg font-bold text-white mb-2">
            No sessions of this type yet
          </h2>
          <p className="text-slate-400 text-sm max-w-xs">
            You haven&apos;t logged any sessions with this filter yet. Try
            selecting &ldquo;All&rdquo; or log a new session.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold text-white mb-2">
            Your training history is empty
          </h2>
          <p className="text-slate-400 text-sm max-w-xs mb-6">
            Every great player starts somewhere. Log your first session to begin
            tracking your progress!
          </p>
          <Link
            href="/log-session"
            className="bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
          >
            Log your first session →
          </Link>
        </>
      )}
    </div>
  );
}

// ── HistoryClient (main) ──────────────────────────────────────────────────────

export default function HistoryClient() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);

  const fetchSessions = useCallback(
    async (
      currentFilter: FilterType,
      currentOffset: number,
      append: boolean
    ) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      });
      if (currentFilter !== "all") {
        params.set("log_type", currentFilter);
      }

      try {
        const res = await fetch(`/api/sessions?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as ApiResponse;

        setSessions((prev) =>
          append ? [...prev, ...data.sessions] : data.sessions
        );
        setTotal(data.total);
        // Always update summary (it reflects all types regardless of filter)
        if (data.summary) setSummary(data.summary);
      } catch (err) {
        setError("Failed to load training history. Please try again.");
        console.error("[HistoryClient] fetch error:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Initial data load
  useEffect(() => {
    fetchSessions("all", 0, false);
  }, [fetchSessions]);

  const handleFilterChange = (newFilter: FilterType) => {
    if (newFilter === filter) return;
    setFilter(newFilter);
    setOffset(0);
    setExpanded(new Set());
    fetchSessions(newFilter, 0, false);
  };

  const handleLoadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchSessions(filter, newOffset, true);
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasMore = sessions.length < total;
  const hasFilter = filter !== "all";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-white">Training History</h1>
        <p className="text-slate-400 text-sm mt-1">
          All your logged sessions, newest first.
        </p>
      </div>

      {/* 14-day summary block */}
      {summary && <SummaryBlock summary={summary} />}

      {/* Skeleton summary while first loading */}
      {!summary && loading && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 animate-pulse">
          <div className="h-3 w-24 bg-slate-700 rounded mb-4" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-2 w-12 bg-slate-700 rounded mx-auto" />
                <div className="h-4 w-16 bg-slate-800 rounded mx-auto" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter buttons */}
      <FilterBar
        active={filter}
        onChange={handleFilterChange}
        disabled={loading}
      />

      {/* Error state */}
      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-800/50 px-4 py-3 text-sm text-red-400">
          {error}
          <button
            type="button"
            onClick={() => fetchSessions(filter, 0, false)}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Session list */}
      {loading ? (
        // Skeleton cards
        <ul className="space-y-3" aria-label="Loading sessions…">
          {Array.from({ length: 4 }, (_, i) => (
            <li
              key={i}
              className="rounded-xl border border-slate-800 bg-slate-900 p-4 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 bg-slate-800 rounded" />
                  <div className="h-2 w-24 bg-slate-800 rounded" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : sessions.length === 0 ? (
        <EmptyState hasFilter={hasFilter} />
      ) : (
        <>
          <ul className="space-y-3" aria-label="Training sessions">
            {sessions.map((session) => (
              <li key={session.id}>
                <SessionCard
                  session={session}
                  isExpanded={expanded.has(session.id)}
                  onToggle={() => toggleExpanded(session.id)}
                />
              </li>
            ))}
          </ul>

          {/* Session count / load more */}
          <div className="text-center space-y-3 pt-2">
            <p className="text-xs text-slate-600">
              Showing {sessions.length} of {total} session
              {total !== 1 ? "s" : ""}
            </p>

            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:border-slate-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
