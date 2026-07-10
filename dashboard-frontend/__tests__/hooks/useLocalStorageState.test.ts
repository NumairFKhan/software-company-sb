/**
 * Tests for useLocalStorageState hook.
 *
 * Covers:
 *  - Returns defaultValue synchronously before useEffect fires
 *  - Reads an existing localStorage value after mount
 *  - Writes to localStorage when the setter is called
 *  - Gracefully falls back when localStorage.getItem throws (e.g. private mode)
 *  - Gracefully falls back when localStorage.setItem throws (e.g. quota exceeded)
 */

import { renderHook, act } from '@testing-library/react';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';

// ── localStorage mock helpers ─────────────────────────────────────────────────

/**
 * Build a minimal in-memory localStorage stand-in.
 * Individual tests can override `getItem` / `setItem` to simulate failures.
 */
function buildMockStorage(initial: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: jest.fn((k: string) => store[k] ?? null),
    setItem: jest.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn((k: string) => { delete store[k]; }),
    clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    key: jest.fn((i: number) => Object.keys(store)[i] ?? null),
    get length() { return Object.keys(store).length; },
  } as unknown as Storage;
}

describe('useLocalStorageState', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = buildMockStorage();
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Test 1: default value on first (synchronous) render ──────────────────

  it('returns defaultValue synchronously on first render before effects fire', () => {
    // renderHook captures the result BEFORE any useEffect has run.
    // We use a wrapper that lets us peek at the very first render's value.
    let capturedInitial: unknown;

    const { result } = renderHook(() => {
      const hook = useLocalStorageState<string>('test-key', 'initial');
      if (capturedInitial === undefined) capturedInitial = hook[0];
      return hook;
    });

    // The very first value must be defaultValue regardless of localStorage.
    expect(capturedInitial).toBe('initial');
    // After all effects, it might be defaultValue or a stored value.
    // Since no localStorage entry was set, it stays as defaultValue.
    expect(result.current[0]).toBe('initial');
  });

  // ── Test 2: reads the stored value after mount ────────────────────────────

  it('reads and returns the localStorage value after mount when an entry exists', async () => {
    // Pre-populate localStorage before the hook mounts.
    mockStorage = buildMockStorage({ 'theme': JSON.stringify('dark') });
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
    });

    const { result } = renderHook(() =>
      useLocalStorageState<string>('theme', 'light'),
    );

    // Before effects: should be the default.
    // (React 18 batches state updates so after renderHook resolves all
    // effects, result.current reflects the post-mount state.)
    // After effects: the hook should have picked up 'dark'.
    expect(result.current[0]).toBe('dark');
    expect(mockStorage.getItem).toHaveBeenCalledWith('theme');
  });

  // ── Test 3: writes to localStorage and updates in-memory state ───────────

  it('writes to localStorage and updates state when the setter is called', async () => {
    const { result } = renderHook(() =>
      useLocalStorageState<boolean>('collapsed', false),
    );

    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      'collapsed',
      JSON.stringify(true),
    );
  });

  // ── Test 4: graceful fallback when getItem throws ─────────────────────────

  it('returns defaultValue and does not throw when localStorage.getItem throws', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        ...mockStorage,
        getItem: jest.fn(() => { throw new Error('Storage access denied'); }),
        setItem: jest.fn(),
      },
      writable: true,
    });

    const { result } = renderHook(() =>
      useLocalStorageState<number>('counter', 42),
    );

    // Should not throw and should fall back to defaultValue.
    expect(result.current[0]).toBe(42);
  });

  // ── Test 5: graceful fallback when setItem throws ─────────────────────────

  it('updates in-memory state and does not throw when localStorage.setItem throws', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        ...mockStorage,
        getItem: jest.fn(() => null),
        setItem: jest.fn(() => { throw new Error('QuotaExceededError'); }),
      },
      writable: true,
    });

    const { result } = renderHook(() =>
      useLocalStorageState<string>('key', 'default'),
    );

    // Calling the setter should not throw even though setItem throws.
    expect(() => {
      act(() => {
        result.current[1]('new-value');
      });
    }).not.toThrow();

    // In-memory state should still be updated.
    expect(result.current[0]).toBe('new-value');
  });

  // ── Test 6: works with object values (JSON serialisation) ─────────────────

  it('correctly serialises and deserialises object values via JSON', async () => {
    const storedObj = { open: true, count: 3 };
    mockStorage = buildMockStorage({
      'widget-prefs': JSON.stringify(storedObj),
    });
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
    });

    const { result } = renderHook(() =>
      useLocalStorageState<{ open: boolean; count: number }>(
        'widget-prefs',
        { open: false, count: 0 },
      ),
    );

    expect(result.current[0]).toEqual(storedObj);
  });

  // ── Test 7: no value stored → stays at defaultValue ──────────────────────

  it('stays at defaultValue when no localStorage entry exists for the key', () => {
    const { result } = renderHook(() =>
      useLocalStorageState<string>('missing-key', 'default-val'),
    );

    expect(result.current[0]).toBe('default-val');
    // getItem was called but returned null, so setValue was never updated.
    expect(mockStorage.getItem).toHaveBeenCalledWith('missing-key');
  });

  // ── Test 8: setter stores JSON-encoded value ─────────────────────────────

  it('stores the value as a JSON string in localStorage', () => {
    const { result } = renderHook(() =>
      useLocalStorageState<number>('score', 0),
    );

    act(() => {
      result.current[1](99);
    });

    expect(mockStorage.setItem).toHaveBeenCalledWith('score', '99');
  });
});
