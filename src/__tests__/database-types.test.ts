/**
 * Tests for the Database type definitions used throughout the app.
 * These ensure the type contracts are maintained as the codebase evolves.
 */

import type {
  PlayerLevel,
  Handedness,
  BackhandType,
  PlayerProfile,
  PlayerProfileInsert,
  PlayerProfileUpdate,
  Database,
} from "@/types/database";

// ── PlayerLevel ───────────────────────────────────────────────────────────────

describe("PlayerLevel type", () => {
  const validLevels: PlayerLevel[] = [
    "beginner",
    "intermediate",
    "advanced",
    "competitive",
    "professional",
  ];

  it("includes all five expected levels", () => {
    expect(validLevels).toHaveLength(5);
    expect(validLevels).toContain("beginner");
    expect(validLevels).toContain("intermediate");
    expect(validLevels).toContain("advanced");
    expect(validLevels).toContain("competitive");
    expect(validLevels).toContain("professional");
  });
});

// ── Handedness type ───────────────────────────────────────────────────────────

describe("Handedness type", () => {
  it("supports right and left", () => {
    const options: Handedness[] = ["right", "left"];
    expect(options).toHaveLength(2);
  });
});

// ── BackhandType type ─────────────────────────────────────────────────────────

describe("BackhandType type", () => {
  it("supports one_handed and two_handed", () => {
    const options: BackhandType[] = ["one_handed", "two_handed"];
    expect(options).toHaveLength(2);
  });
});

// ── PlayerProfile row shape ───────────────────────────────────────────────────

describe("PlayerProfile row shape", () => {
  it("has all required fields", () => {
    // Build a representative row — TypeScript would error at compile time
    // if the required fields changed, so this acts as a runtime smoke test.
    const row: PlayerProfile = {
      id: "00000000-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-000000000002",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      display_name: "Test Player",
      level: "intermediate",
      handedness: "right",
      backhand_type: "two_handed",
      goals: ["Improve consistency"],
      technical_focus: ["Forehand"],
      available_days: ["Mon", "Wed", "Fri"],
      session_length_minutes: 60,
      known_injuries: null,
    };

    expect(row.id).toBeDefined();
    expect(row.user_id).toBeDefined();
    expect(row.display_name).toBe("Test Player");
    expect(row.level).toBe("intermediate");
    expect(row.handedness).toBe("right");
    expect(row.backhand_type).toBe("two_handed");
    expect(Array.isArray(row.goals)).toBe(true);
    expect(Array.isArray(row.technical_focus)).toBe(true);
    expect(Array.isArray(row.available_days)).toBe(true);
    expect(row.session_length_minutes).toBe(60);
    expect(row.known_injuries).toBeNull();
  });
});

// ── PlayerProfileInsert ───────────────────────────────────────────────────────

describe("PlayerProfileInsert", () => {
  it("allows omission of optional id field", () => {
    const insert: PlayerProfileInsert = {
      user_id: "00000000-0000-0000-0000-000000000002",
      display_name: "New Player",
      level: "beginner",
      handedness: "left",
      backhand_type: "one_handed",
    };
    // id is omitted — no TypeScript error means the type allows it
    expect(insert.user_id).toBeDefined();
    expect(insert.id).toBeUndefined();
  });

  it("allows all optional array fields to be omitted", () => {
    const insert: PlayerProfileInsert = {
      user_id: "00000000-0000-0000-0000-000000000002",
      display_name: "New Player",
      level: "beginner",
      handedness: "right",
      backhand_type: "two_handed",
      // goals, technical_focus, available_days all omitted
    };
    expect(insert.goals).toBeUndefined();
    expect(insert.technical_focus).toBeUndefined();
    expect(insert.available_days).toBeUndefined();
  });
});

// ── PlayerProfileUpdate ───────────────────────────────────────────────────────

describe("PlayerProfileUpdate", () => {
  it("allows partial updates", () => {
    const update: PlayerProfileUpdate = {
      display_name: "Updated Name",
      // all other fields omitted
    };
    expect(update.display_name).toBe("Updated Name");
    expect(update.level).toBeUndefined();
  });
});

// ── Database shape ────────────────────────────────────────────────────────────

describe("Database type structure", () => {
  it("exports a type that TypeScript can reason about at compile time", () => {
    // If the Database type is malformed, the type aliases below would fail
    // to compile. This test proves they resolve correctly at runtime.
    type Tables = Database["public"]["Tables"];
    type ProfileRow = Tables["player_profiles"]["Row"];

    const row: ProfileRow = {
      id: "test",
      user_id: "test",
      created_at: "",
      updated_at: "",
      display_name: "test",
      level: "advanced",
      handedness: "right",
      backhand_type: "two_handed",
      goals: [],
      technical_focus: [],
      available_days: [],
      session_length_minutes: 60,
      known_injuries: null,
    };

    expect(row).toBeDefined();
  });
});
