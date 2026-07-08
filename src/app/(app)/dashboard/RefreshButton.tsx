"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * RefreshButton
 *
 * Client component that POSTs to /api/dashboard/recommendation/refresh,
 * then calls router.refresh() to trigger a server-side re-render and
 * show the newly generated recommendation — all without a full page reload.
 */
export default function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/recommendation/refresh", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      // Trigger Next.js server component re-render
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Re-generate today's recommendation"
      >
        {/* Refresh icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H5.498a.75.75 0 00-.75.75v3.732a.75.75 0 001.5 0v-2.093A7 7 0 0018 10a.75.75 0 00-1.5 0 5.5 5.5 0 01-1.188 3.424zM4.688 8.576a5.5 5.5 0 019.201-2.466l.312.311h-2.433a.75.75 0 000 1.5h3.232a.75.75 0 00.75-.75V3.439a.75.75 0 00-1.5 0v2.093A7 7 0 002 10a.75.75 0 001.5 0 5.5 5.5 0 011.188-3.424z"
            clipRule="evenodd"
          />
        </svg>
        {loading ? "Generating…" : "Refresh"}
      </button>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
