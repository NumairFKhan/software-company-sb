import type { Config } from "tailwindcss";

// tailwindcss/colors is a CJS module; require() is safe here because
// tailwind.config.ts is executed by ts-node in CommonJS mode (see tsconfig.json
// ts-node.compilerOptions.module = "CommonJS").
// eslint-disable-next-line @typescript-eslint/no-require-imports
const colors = require("tailwindcss/colors");

/**
 * Design Token Audit — Semantic Color Palette
 * ─────────────────────────────────────────────
 * All pipeline statuses, agent roles, and surface layers are mapped to
 * semantic token names below.  Components should use STATUS_CONFIG (from
 * StatusBadge.tsx) and ROLE_CONFIG (from ActivityFeed.tsx) as the runtime
 * source of truth; these Tailwind extensions generate the CSS for every shade
 * of those tokens so that computed class names (e.g. `bg-status-planning-100`)
 * are included in the output bundle.
 *
 * Mapping reference
 * ─────────────────
 * Status tokens:
 *   status-planning    = yellow   (bg-status-planning-100, text-status-planning-800 …)
 *   status-awaiting    = orange
 *   status-building    = blue
 *   status-reviewing   = purple
 *   status-done        = green
 *   status-failed      = red
 *   status-interrupted = slate
 *
 * Role tokens:
 *   role-pm            = yellow   (product_manager)
 *   role-architect     = blue
 *   role-planner       = purple   (ticket_planner)
 *   role-developer     = indigo
 *   role-reviewer      = cyan     (code_reviewer)
 *   role-qa            = green    (qa_tester)
 *   role-improver      = orange
 *   role-comm          = slate    (communicator / user)
 *
 * Surface tokens:
 *   surface            = gray     (bg-surface-50, border-surface-200 …)
 */

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./contexts/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        // ── Status semantic tokens ──────────────────────────────────────────────
        "status-planning":    colors.yellow,
        "status-awaiting":    colors.orange,
        "status-building":    colors.blue,
        "status-reviewing":   colors.purple,
        "status-done":        colors.green,
        "status-failed":      colors.red,
        "status-interrupted": colors.slate,

        // ── Role semantic tokens ────────────────────────────────────────────────
        "role-pm":            colors.yellow,
        "role-architect":     colors.blue,
        "role-planner":       colors.purple,
        "role-developer":     colors.indigo,
        "role-reviewer":      colors.cyan,
        "role-qa":            colors.green,
        "role-improver":      colors.orange,
        "role-comm":          colors.slate,

        // ── Surface tokens ──────────────────────────────────────────────────────
        // Generic panel / card / border layers.
        // Usage: bg-surface-50, bg-surface-100, border-surface-200, etc.
        "surface":            colors.gray,
      },
    },
  },
  plugins: [],
};
export default config;
