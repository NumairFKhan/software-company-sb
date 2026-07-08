'use client';

/**
 * ServiceWorkerRegistrar
 *
 * A tiny client-side component that registers the CourtCoach AI service worker
 * when the browser supports it. Renders nothing — purely a side-effect hook.
 *
 * Must be a Client Component because it uses browser APIs (navigator.serviceWorker).
 */

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator
    ) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('[SW] Registered, scope:', registration.scope);
        })
        .catch((err) => {
          // Non-fatal: app still works without SW (just no offline support)
          console.warn('[SW] Registration failed:', err);
        });
    }
  }, []);

  return null;
}
