/**
 * Base API client utilities.
 * All fetch calls use NEXT_PUBLIC_API_BASE_URL which defaults to http://localhost:8000.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

/**
 * Derives the WebSocket base URL from the HTTP base URL.
 * Replaces http(s):// with ws(s)://.
 */
export function getWsBaseUrl(): string {
  return API_BASE_URL.replace(/^http/, 'ws');
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    message?: string,
  ) {
    super(message ?? `API error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

/**
 * Typed wrapper around fetch that throws ApiError on non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }

  return response.json() as Promise<T>;
}
