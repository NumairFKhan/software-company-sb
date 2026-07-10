'use client';

/**
 * useLocalStorageState — a generic hook that persists state in localStorage.
 *
 * SSR / hydration safety
 * ──────────────────────
 * Next.js renders components on the server where `localStorage` does not
 * exist.  Even on the first *client* paint the React tree must match the
 * server-rendered HTML, otherwise React emits a hydration error.
 *
 * Strategy:
 *  1. Always initialise React state to `defaultValue` (no localStorage read
 *     in the `useState` initialiser — that would run on the server and also
 *     on the first client render before hydration is complete).
 *  2. Track `mounted` with a separate boolean state.  A `useEffect` with an
 *     empty dependency array sets `mounted = true` after the first paint,
 *     which guarantees we are running client-side only.
 *  3. A second `useEffect` that depends on `[key, mounted]` reads
 *     localStorage once `mounted` is true and syncs the stored value into
 *     React state.
 *
 * This means:
 *  - Server render → `defaultValue`
 *  - First client paint → `defaultValue` (matches server; no hydration error)
 *  - After hydration → localStorage value (if one exists)
 *
 * Error handling
 * ──────────────
 * All localStorage access is wrapped in try/catch.  Browsers in private mode
 * (or when the user has blocked storage access) may throw on `getItem` /
 * `setItem`.  On any failure the hook silently falls back to the in-memory
 * default.
 */

import { useEffect, useState } from 'react';

/**
 * Persist a piece of UI state in localStorage across page reloads.
 *
 * @param key          The localStorage key to read from / write to.
 * @param defaultValue The value used on every server render and on the first
 *                     client paint (before localStorage is consulted).
 * @returns            A `[value, setValue]` tuple.  `setValue` updates both
 *                     the in-memory React state and localStorage atomically.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
): [T, (val: T) => void] {
  // ── 1. Always initialise to defaultValue ───────────────────────────────
  // Never call localStorage here — it must agree with the server render.
  const [value, setValue] = useState<T>(defaultValue);

  // ── 2. Mount guard ─────────────────────────────────────────────────────
  // Flip to true after the first client-side render so we know it is safe
  // to access browser APIs.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // ── 3. Read from localStorage after mount ──────────────────────────────
  // Runs once per key after hydration is complete.
  useEffect(() => {
    if (!mounted) return;

    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // Private-browsing mode or corrupted JSON — silently use defaultValue.
    }
  }, [key, mounted]);

  // ── 4. Setter that updates both localStorage and React state ───────────
  const set = (val: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      // Storage quota exceeded or access denied — keep the in-memory update.
    }
    setValue(val);
  };

  return [value, set];
}
