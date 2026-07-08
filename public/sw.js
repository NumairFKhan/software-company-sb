/**
 * CourtCoach AI – Service Worker
 *
 * Strategy:
 *   • App-shell resources (icons, fonts, offline page, manifest) → cache-first.
 *   • Next.js static assets (_next/static/**) → cache-first (content-addressed,
 *     so stale-while-revalidate is unnecessary).
 *   • API routes (/api/**) → network-only. Never cache AI responses or auth calls.
 *   • Navigation requests → network-first with offline fallback to /offline.html.
 *   • All other requests → network-first with offline fallback.
 *
 * The cache name is versioned so that a new deploy triggers a fresh install
 * and the old cache is pruned on activation.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `courtcoach-shell-${CACHE_VERSION}`;
const STATIC_CACHE  = `courtcoach-static-${CACHE_VERSION}`;

// Resources to pre-cache on install (app shell)
const SHELL_URLS = [
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      // Pre-cache the app shell; if any resource fails, fail the install so we
      // don't end up with a broken offline experience.
      return cache.addAll(SHELL_URLS);
    }).then(() => {
      // Skip the waiting phase so the new SW activates immediately.
      return self.skipWaiting();
    })
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) =>
            // Delete old versioned caches that no longer match
            (name.startsWith('courtcoach-shell-') && name !== SHELL_CACHE) ||
            (name.startsWith('courtcoach-static-') && name !== STATIC_CACHE)
          )
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Never intercept cross-origin requests (Supabase, Anthropic, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // 2. API routes → always network-only (never cache auth / AI responses)
  if (url.pathname.startsWith('/api/')) {
    return; // let the browser handle it normally
  }

  // 3. Next.js immutable static assets → cache-first
  //    These files have content-addressed names (_next/static/.../<hash>.js)
  //    so a cache hit is always fresh.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request, { cacheName: STATIC_CACHE }).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. App-shell assets → cache-first (pre-cached on install)
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request, { cacheName: SHELL_CACHE }).then(
        (cached) => cached || fetch(request)
      )
    );
    return;
  }

  // 5. Navigation requests (HTML pages) → network-first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline.html', { cacheName: SHELL_CACHE })
      )
    );
    return;
  }

  // 6. Everything else → network-first, silent fail
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
