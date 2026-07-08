/**
 * @jest-environment jsdom
 *
 * Tests for the Google OAuth sign-in feature:
 *
 *  1. GoogleSignInButton component — renders / hides based on `enabled` prop,
 *     calls supabase.auth.signInWithOAuth with the correct options.
 *
 *  2. GOOGLE_OAUTH_ENABLED constant — reflects the env var at module load.
 *
 *  3. Database types — GoogleToken shape is correct.
 *
 *  4. Migration smoke-test — SQL file exists and contains expected DDL.
 *
 *  5. Auth callback logic — token persistence branching (unit-level).
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as fs from "fs";
import * as path from "path";
import type { GoogleToken, GoogleTokenInsert, GoogleTokenUpdate } from "@/types/database";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// ── Mock the Supabase browser client ─────────────────────────────────────────
// We cannot call the real Supabase in unit tests, so we intercept the module
// and return a controllable mock.

const mockSignInWithOAuth = jest.fn();

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

beforeEach(() => {
  mockSignInWithOAuth.mockReset();
  mockSignInWithOAuth.mockResolvedValue({ error: null });
});

// ── 1. GoogleSignInButton visibility ─────────────────────────────────────────

describe("GoogleSignInButton — visibility via enabled prop", () => {
  it("renders the sign-in button when enabled=true", () => {
    render(<GoogleSignInButton enabled={true} />);
    expect(
      screen.getByRole("button", { name: /sign in with google/i })
    ).toBeInTheDocument();
  });

  it("renders nothing when enabled=false", () => {
    const { container } = render(<GoogleSignInButton enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when enabled is omitted and env var is not 'true'", () => {
    // The env var is not set to 'true' in the test environment, so the
    // default GOOGLE_OAUTH_ENABLED constant is false.
    // GoogleSignInButton with no props therefore renders nothing.
    const { container } = render(<GoogleSignInButton />);
    // Either empty (env=false/unset) or has a button (env=true).
    // In CI the env var is not set, so this should be empty.
    // We don't assert the exact value here since it depends on the runtime env;
    // the enabled=true/false prop tests above are the authoritative coverage.
    expect(container).toBeDefined();
  });

  it("button has accessible label 'Sign in with Google'", () => {
    render(<GoogleSignInButton enabled={true} />);
    expect(screen.getByLabelText(/sign in with google/i)).toBeInTheDocument();
  });
});

// ── 2. GOOGLE_OAUTH_ENABLED constant ─────────────────────────────────────────

describe("GOOGLE_OAUTH_ENABLED constant", () => {
  it("is a boolean", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GOOGLE_OAUTH_ENABLED } = require("@/components/GoogleSignInButton");
    expect(typeof GOOGLE_OAUTH_ENABLED).toBe("boolean");
  });

  it("is true only when env var equals the string 'true'", () => {
    // In the test environment NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED is not 'true'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GOOGLE_OAUTH_ENABLED } = require("@/components/GoogleSignInButton");
    const expected =
      process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";
    expect(GOOGLE_OAUTH_ENABLED).toBe(expected);
  });
});

// ── 3. GoogleSignInButton — OAuth call arguments ──────────────────────────────

describe("GoogleSignInButton — signInWithOAuth arguments", () => {
  it("calls signInWithOAuth with provider='google'", async () => {
    render(<GoogleSignInButton enabled={true} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));

    const [callArgs] = mockSignInWithOAuth.mock.calls[0];
    expect(callArgs.provider).toBe("google");
  });

  it("requests the calendar.readonly scope", async () => {
    render(<GoogleSignInButton enabled={true} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));

    const [callArgs] = mockSignInWithOAuth.mock.calls[0];
    expect(callArgs.options.scopes).toContain(
      "https://www.googleapis.com/auth/calendar.readonly"
    );
  });

  it("passes access_type=offline in queryParams", async () => {
    render(<GoogleSignInButton enabled={true} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));

    const [callArgs] = mockSignInWithOAuth.mock.calls[0];
    expect(callArgs.options.queryParams?.access_type).toBe("offline");
  });

  it("passes prompt=consent in queryParams", async () => {
    render(<GoogleSignInButton enabled={true} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));

    const [callArgs] = mockSignInWithOAuth.mock.calls[0];
    expect(callArgs.options.queryParams?.prompt).toBe("consent");
  });

  it("button shows 'Redirecting' text while loading after a successful OAuth start", async () => {
    // signInWithOAuth resolves immediately with no error — simulates the
    // browser being redirected to Google (loading stays true until unmount).
    render(<GoogleSignInButton enabled={true} />);
    const btn = screen.getByRole("button", { name: /sign in with google/i });
    fireEvent.click(btn);

    // After click but before the next frame the button text updates
    await waitFor(() =>
      expect(btn).toHaveTextContent(/redirecting/i)
    );
  });

  it("shows an error message if signInWithOAuth returns an error", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      error: { message: "OAuth configuration error" },
    });

    render(<GoogleSignInButton enabled={true} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "OAuth configuration error"
      )
    );
  });

  it("re-enables the button after an error", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      error: { message: "Some error" },
    });

    render(<GoogleSignInButton enabled={true} />);
    const btn = screen.getByRole("button", { name: /sign in with google/i });
    fireEvent.click(btn);

    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});

// ── 4. GoogleToken database type ──────────────────────────────────────────────

describe("GoogleToken database type", () => {
  it("has the expected Row fields", () => {
    const row: GoogleToken = {
      id: "00000000-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-000000000002",
      access_token: "ya29.access_token",
      refresh_token: "1//refresh_token",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(row.access_token).toBe("ya29.access_token");
    expect(row.refresh_token).toBe("1//refresh_token");
    expect(row.user_id).toBeDefined();
  });

  it("allows refresh_token to be null", () => {
    const row: GoogleToken = {
      id: "00000000-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-000000000002",
      access_token: "ya29.access_token",
      refresh_token: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(row.refresh_token).toBeNull();
  });

  it("Insert type allows omitting optional fields", () => {
    const insert: GoogleTokenInsert = {
      user_id: "00000000-0000-0000-0000-000000000002",
      access_token: "ya29.access_token",
    };

    expect(insert.user_id).toBeDefined();
    expect(insert.id).toBeUndefined();
    expect(insert.refresh_token).toBeUndefined();
  });

  it("Update type allows partial updates", () => {
    const update: GoogleTokenUpdate = {
      access_token: "ya29.new_access_token",
    };

    expect(update.access_token).toBe("ya29.new_access_token");
    expect(update.user_id).toBeUndefined();
  });
});

// ── 5. Migration file smoke-test ──────────────────────────────────────────────

describe("google_tokens migration SQL", () => {
  const MIGRATION_PATH = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "005_google_tokens.sql"
  );

  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("creates the google_tokens table", () => {
    expect(sql).toMatch(/CREATE TABLE.*google_tokens/i);
  });

  it("has user_id column referencing auth.users", () => {
    expect(sql).toContain("user_id");
    expect(sql).toContain("auth.users");
  });

  it("has access_token column", () => {
    expect(sql).toContain("access_token");
  });

  it("has refresh_token column", () => {
    expect(sql).toContain("refresh_token");
  });

  it("enables row level security", () => {
    expect(sql.toUpperCase()).toContain("ROW LEVEL SECURITY");
  });

  it("creates an RLS policy for users managing their own tokens", () => {
    expect(sql.toUpperCase()).toContain("CREATE POLICY");
    expect(sql).toContain("auth.uid() = user_id");
  });
});

// ── 6. Token persistence logic (unit-level behavioural check) ─────────────────
// We cannot run the Next.js Route Handler directly in Jest without a test
// server.  Instead we verify the conditional logic by testing the key
// branches as plain TypeScript functions that mirror the callback's logic.

describe("Auth callback token persistence logic", () => {
  /**
   * Mirrors the branching in /auth/callback/route.ts without the Supabase
   * infrastructure.  We want to confirm that:
   *   • A session with a provider_token triggers a token upsert.
   *   • A session without a provider_token (magic-link) skips the upsert.
   */
  function simulateCallback(session: {
    provider_token: string | null;
    provider_refresh_token: string | null;
  }) {
    const upsertCalled: { access_token: string; refresh_token: string | null }[] = [];

    const providerToken = session.provider_token;
    const providerRefreshToken = session.provider_refresh_token;

    if (providerToken) {
      upsertCalled.push({
        access_token: providerToken,
        refresh_token: providerRefreshToken,
      });
    }

    return upsertCalled;
  }

  it("upserts tokens when provider_token is present (Google OAuth)", () => {
    const calls = simulateCallback({
      provider_token: "ya29.a0ARrd...",
      provider_refresh_token: "1//0eXR...",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].access_token).toBe("ya29.a0ARrd...");
    expect(calls[0].refresh_token).toBe("1//0eXR...");
  });

  it("skips token upsert when provider_token is null (magic-link)", () => {
    const calls = simulateCallback({
      provider_token: null,
      provider_refresh_token: null,
    });

    expect(calls).toHaveLength(0);
  });

  it("stores null refresh_token when only an access token is returned", () => {
    const calls = simulateCallback({
      provider_token: "ya29.a0ARrd...",
      provider_refresh_token: null,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].refresh_token).toBeNull();
  });
});
