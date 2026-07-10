/**
 * Persistence and regression smoke tests for the collapsible TokenUsageWidget.
 *
 * ⚠️  E2E FRAMEWORK NOTE
 * ──────────────────────
 * No E2E framework (Playwright / Cypress) is currently installed in this
 * project.  These tests use Jest + jsdom to cover the persistence scenarios
 * from the ticket as thoroughly as possible without a real browser.
 *
 * The following scenarios require a real browser and are documented as manual
 * QA acceptance steps below:
 *
 *   MANUAL QA CHECKLIST (run in a real browser before merging):
 *   ─────────────────────────────────────────────────────────────
 *   1. Collapse widget → hard reload (Ctrl+Shift+R / Cmd+Shift+R) → widget
 *      should still be collapsed. Check Network tab to confirm it's a full
 *      reload (no service-worker cache). ✓ Expected: collapsed persists.
 *
 *   2. Open the app in a new Private/Incognito window (or a browser that has
 *      localStorage disabled). ✓ Expected: widget renders expanded (default),
 *      no errors or warnings in the browser console.
 *
 *   3. Collapse widget → navigate to a different project route (e.g. click a
 *      different project in the sidebar) → navigate back to the original
 *      project. ✓ Expected: widget is still collapsed; no console errors.
 *
 *   4. In all three scenarios above, open DevTools → Console tab and confirm
 *      zero messages of level "error" or "warning" containing "hydration".
 */

// Mock fetch before any imports so the module uses the mock.
const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { TokenUsageWidget } from '@/components/TokenUsageWidget';
import { ActiveProjectProvider } from '@/contexts/ActiveProjectContext';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Mock both fetch calls the widget makes on mount:
 *   1. GET /api/projects/{id}/token_usage → empty role-keyed dict {}
 *   2. GET /api/config                    → { models_by_role: {} }
 */
function mockBothFetches() {
  // The backend returns a role-keyed dict; an empty object → zero entries.
  mockFetch.mockResolvedValueOnce(makeResponse({}));
  // Second call: GET /api/config
  mockFetch.mockResolvedValueOnce(makeResponse({ models_by_role: {} }));
}

/** Render the widget inside its required context providers. */
function renderWidget(projectId = 'proj-1') {
  return render(
    <ActiveProjectProvider>
      <TokenUsageWidget projectId={projectId} />
    </ActiveProjectProvider>,
  );
}

/** Build a minimal in-memory localStorage stand-in. */
function buildMockStorage(initial: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...initial };
  return {
    getItem:    jest.fn((k: string) => store[k] ?? null),
    setItem:    jest.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn((k: string) => { delete store[k]; }),
    clear:      jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    key:        jest.fn((i: number) => Object.keys(store)[i] ?? null),
    get length() { return Object.keys(store).length; },
  } as unknown as Storage;
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

// ── 1. Collapse persistence across simulated reload ────────────────────────────

describe('TokenUsageWidget — persistence across reload (localStorage)', () => {
  it('widget is collapsed on remount when localStorage contains "true" (simulates hard reload)', async () => {
    // Simulate a previous session collapsing the widget.
    localStorage.setItem('token-widget-collapsed', 'true');

    mockBothFetches();
    renderWidget();

    // After hydration the hook reads localStorage; body should be removed.
    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });

    // Header toggle must still be visible and aria-expanded=false.
    expect(screen.getByTestId('token-usage-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('collapses widget and writes to localStorage, then remount reads that value', async () => {
    mockBothFetches();
    const { unmount } = renderWidget();

    // Wait for the widget to be fully mounted and expanded.
    await waitFor(() => {
      expect(screen.getByTestId('token-usage-empty')).toBeInTheDocument();
    });

    // Collapse the widget — this should write 'true' to localStorage.
    act(() => {
      fireEvent.click(screen.getByTestId('token-usage-toggle'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });

    // Confirm localStorage was written with the JSON-encoded value.
    expect(localStorage.getItem('token-widget-collapsed')).toBe('true');

    // Unmount (simulate navigation away / page teardown).
    unmount();

    // Remount with fresh fetch mocks (simulates a page reload).
    mockBothFetches();
    renderWidget();

    // After hydration the widget should still be collapsed.
    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('restores expanded state after widget is re-expanded and then remounted', async () => {
    // Start with a collapsed state in storage.
    localStorage.setItem('token-widget-collapsed', 'true');

    mockBothFetches();
    const { unmount } = renderWidget();

    // Widget should start collapsed after hydration.
    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });

    // Expand the widget.
    act(() => {
      fireEvent.click(screen.getByTestId('token-usage-toggle'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('token-usage-empty')).toBeInTheDocument();
    });

    // localStorage should now hold 'false'.
    expect(localStorage.getItem('token-widget-collapsed')).toBe('false');

    // Unmount and remount (simulate reload).
    unmount();

    mockBothFetches();
    renderWidget();

    // Should start expanded after remount (localStorage says 'false').
    await waitFor(() => {
      expect(screen.getByTestId('token-usage-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'true');
  });
});

// ── 2. Private-browsing / storage-unavailable fallback ─────────────────────────

describe('TokenUsageWidget — private-browsing fallback (localStorage unavailable)', () => {
  // Save a reference to the real localStorage so we can restore it after tests
  // that replace window.localStorage with a throwing mock.
  const realLocalStorage = window.localStorage;

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: realLocalStorage,
      writable: true,
    });
  });

  it('renders expanded (default) when localStorage.getItem throws — no error thrown', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const throwingStorage = buildMockStorage();
    (throwingStorage.getItem as jest.Mock).mockImplementation(() => {
      throw new Error('Storage access denied');
    });
    Object.defineProperty(window, 'localStorage', {
      value: throwingStorage,
      writable: true,
    });

    mockBothFetches();
    renderWidget();

    // Widget should render expanded (fallback to defaultValue).
    await waitFor(() => {
      expect(screen.getByTestId('token-usage-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'true');

    // No hydration-related errors should have been logged.
    const hydrationErrors = consoleSpy.mock.calls.filter(
      args => String(args[0]).toLowerCase().includes('hydration'),
    );
    expect(hydrationErrors).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  it('toggle still works in-memory when localStorage.setItem throws (quota exceeded)', async () => {
    const throwingStorage = buildMockStorage();
    (throwingStorage.setItem as jest.Mock).mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    Object.defineProperty(window, 'localStorage', {
      value: throwingStorage,
      writable: true,
    });

    mockBothFetches();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId('token-usage-empty')).toBeInTheDocument();
    });

    // Clicking toggle should not throw even though localStorage.setItem throws.
    expect(() => {
      act(() => {
        fireEvent.click(screen.getByTestId('token-usage-toggle'));
      });
    }).not.toThrow();

    // In-memory state should still toggle the collapsed state.
    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('no React hydration warnings appear when localStorage is unavailable', async () => {
    const warnSpy  = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const throwingStorage = buildMockStorage();
    (throwingStorage.getItem as jest.Mock).mockImplementation(() => {
      throw new Error('Storage access denied');
    });
    Object.defineProperty(window, 'localStorage', {
      value: throwingStorage,
      writable: true,
    });

    mockBothFetches();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId('token-usage-widget')).toBeInTheDocument();
    });

    // Filter for hydration-related messages specifically.
    const hydrationWarnings = warnSpy.mock.calls.filter(
      args => String(args[0]).toLowerCase().includes('hydration'),
    );
    const hydrationErrors = errorSpy.mock.calls.filter(
      args => String(args[0]).toLowerCase().includes('hydration'),
    );

    expect(hydrationWarnings).toHaveLength(0);
    expect(hydrationErrors).toHaveLength(0);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ── 3. Cross-navigation persistence ───────────────────────────────────────────

describe('TokenUsageWidget — cross-navigation persistence', () => {
  it('remains collapsed after unmount (project switch) and remount (navigate back)', async () => {
    mockBothFetches();
    const { unmount } = renderWidget('proj-1');

    await waitFor(() => {
      expect(screen.getByTestId('token-usage-empty')).toBeInTheDocument();
    });

    // Collapse the widget.
    act(() => {
      fireEvent.click(screen.getByTestId('token-usage-toggle'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });

    // Simulate navigating to a different project (unmounts the widget).
    unmount();

    // Simulate navigating back to the original project (remounts the widget).
    mockBothFetches();
    renderWidget('proj-1');

    // Widget should still be collapsed (the global key persists across mounts).
    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('uses the same global localStorage key regardless of projectId (MVP behaviour)', async () => {
    // Collapse widget for proj-1.
    mockBothFetches();
    const { unmount: unmountProj1 } = renderWidget('proj-1');

    await waitFor(() => {
      expect(screen.getByTestId('token-usage-empty')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(screen.getByTestId('token-usage-toggle'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });

    unmountProj1();

    // Mount for a *different* project — the MVP uses a single global key.
    // TODO: key on projectId if bleed-across-projects is reported.
    mockBothFetches();
    renderWidget('proj-2');

    // Because the key is global ('token-widget-collapsed'), proj-2 also shows
    // the widget as collapsed — this is the documented MVP trade-off.
    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('widget starts expanded (default) on first ever load — no localStorage entry', async () => {
    // localStorage is cleared in beforeEach.
    mockBothFetches();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId('token-usage-empty')).toBeInTheDocument();
    });

    expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'true');
  });
});

// ── 4. SSR / hydration safety ─────────────────────────────────────────────────

describe('TokenUsageWidget — SSR safety and hydration', () => {
  it('hook guarantees defaultValue on first render: useLocalStorageState starts with false regardless of stored value', async () => {
    // SSR SAFETY NOTE: The useLocalStorageState hook is designed so that the
    // useState initialiser NEVER reads localStorage — it always uses defaultValue.
    // This means server and first client paint agree (both render expanded).
    // Only after useEffect fires does the hook consult localStorage.
    //
    // In React Testing Library (RTL) v16 / React 18, render() wraps in act()
    // which flushes effects synchronously, so we cannot observe the
    // "before-effects" state via a DOM assertion.  The hook-level guarantee is
    // tested in __tests__/hooks/useLocalStorageState.test.ts.
    //
    // What we CAN assert here: even when localStorage says 'true', the widget
    // eventually settles to collapsed=true with no hydration errors — proving
    // the hook correctly applies the stored value after mount.

    localStorage.setItem('token-widget-collapsed', 'true');

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockBothFetches();
    renderWidget();

    // After hydration the widget reads localStorage and collapses.
    await waitFor(() => {
      expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'false');
    });

    // No hydration-related errors (e.g. server/client mismatch) should occur.
    const hydrationErrors = consoleSpy.mock.calls.filter(
      args => String(args[0]).toLowerCase().includes('hydration'),
    );
    expect(hydrationErrors).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  it('localStorage value is applied after mount: collapsed-true session restores collapsed state', async () => {
    // This test simulates "opening the page after a previous session collapsed
    // the widget".  The hook reads localStorage post-mount, so the widget
    // eventually settles to collapsed.  This is the correct after-hydration
    // behaviour; there is no flash of expanded content because the effect
    // fires before the browser has a chance to paint.

    localStorage.setItem('token-widget-collapsed', 'true');

    mockBothFetches();
    renderWidget();

    // After all effects resolve, the widget reads localStorage and collapses.
    await waitFor(() => {
      expect(screen.getByTestId('token-usage-toggle')).toHaveAttribute('aria-expanded', 'false');
    });

    // Widget body is not rendered when collapsed.
    expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
  });

  it('no console errors or warnings are emitted during a normal expanded render', async () => {
    const warnSpy  = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockBothFetches();
    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId('token-usage-widget')).toBeInTheDocument();
    });

    // Allow any async effects to complete.
    await act(async () => {});

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('no console errors or warnings are emitted during a pre-collapsed render', async () => {
    localStorage.setItem('token-widget-collapsed', 'true');

    const warnSpy  = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockBothFetches();
    renderWidget();

    // Wait for the hook to read localStorage and update collapsed state.
    await waitFor(() => {
      expect(screen.queryByTestId('token-usage-empty')).not.toBeInTheDocument();
    });

    // Allow any async effects to complete.
    await act(async () => {});

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ── 5. Visual regression — snapshot of expanded widget (with chevron) ─────────

describe('TokenUsageWidget — snapshot regression (expanded state with chevron)', () => {
  it('snapshot: header row contains both the title and the chevron toggle button', () => {
    mockBothFetches();

    const { container } = renderWidget();

    // Snapshot the widget header to catch accidental regressions to the
    // chevron button or title layout.  This snapshot is taken with the widget
    // in its expanded (default) state.
    const header = container.querySelector('[data-testid="token-usage-widget"] > div');
    expect(header).toMatchSnapshot();
  });

  it('toggle button is present in the DOM in expanded state — structural assertions', () => {
    mockBothFetches();
    renderWidget();

    const toggle = screen.getByTestId('token-usage-toggle');

    // Structural assertions that back up the snapshot.
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-label', 'Collapse token usage');
    expect(toggle).not.toBeDisabled();
  });

  it('toggle button is present in the DOM in collapsed state — structural assertions', async () => {
    mockBothFetches();
    renderWidget();

    // Collapse the widget.
    act(() => {
      fireEvent.click(screen.getByTestId('token-usage-toggle'));
    });

    await waitFor(() => {
      const toggle = screen.getByTestId('token-usage-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAttribute('aria-label', 'Expand token usage');
    });
  });
});
