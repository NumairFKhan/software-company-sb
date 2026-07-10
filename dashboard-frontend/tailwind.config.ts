import type { Config } from "tailwindcss";

// tailwindcss/colors is a CJS module; require() is safe here because
// tailwind.config.ts is executed by ts-node in CommonJS mode (see tsconfig.json
// ts-node.compilerOptions.module = "CommonJS").
// eslint-disable-next-line @typescript-eslint/no-require-imports
const colors = require("tailwindcss/colors");

/**
 * Design Token Audit — Semantic Color Palette (v2, dark-first)
 * ─────────────────────────────────────────────────────────────
 * Dark-mode-first "AI control room" aesthetic: near-black surfaces with a
 * violet→cyan brand gradient reserved for primary actions, live/active
 * states, and branding — not scattered everywhere. Status/role colors stay
 * semantically mapped (see below) but use vivid 400/500 shades tuned to pop
 * against dark surfaces rather than the pale 100/800 pairs a light-mode
 * admin panel would use.
 *
 * Mapping reference
 * ─────────────────
 * Status tokens:
 *   status-planning    = amber
 *   status-awaiting    = orange
 *   status-building    = blue
 *   status-reviewing   = violet
 *   status-done        = emerald
 *   status-failed      = rose
 *   status-interrupted = slate
 *
 * Role tokens:
 *   role-pm            = amber    (product_manager)
 *   role-architect     = blue
 *   role-planner       = violet   (ticket_planner)
 *   role-developer      = indigo
 *   role-reviewer       = cyan    (code_reviewer)
 *   role-qa             = emerald (qa_tester)
 *   role-improver       = orange
 *   role-comm            = fuchsia (communicator / user)
 *
 * Surface tokens:
 *   surface            = near-black neutral scale, bluish tint
 *   brand              = signature violet→cyan gradient stops
 */

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./contexts/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Safelist classes that are constructed dynamically and may not be detected
  // by the JIT scanner during a production build.
  safelist: [
    // Used in TokenUsageWidget chevron rotation lookup:
    //   const chevronClass = { true: 'rotate-0', false: 'rotate-180' }
    // rotate-0 is already a Tailwind base utility; rotate-180 is safelisted
    // here as a belt-and-suspenders guarantee it survives purging even if the
    // scanner misses the string-literal object.
    'rotate-180',
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        // ── Brand gradient stops ────────────────────────────────────────────────
        brand: {
          violet: "#8b5cf6",
          fuchsia: "#d946ef",
          cyan: "#22d3ee",
          DEFAULT: "#8b5cf6",
        },

        // ── Status semantic tokens ──────────────────────────────────────────────
        "status-planning":    colors.amber,
        "status-awaiting":    colors.orange,
        "status-building":    colors.blue,
        "status-reviewing":   colors.violet,
        "status-done":        colors.emerald,
        "status-failed":      colors.rose,
        "status-interrupted": colors.slate,

        // ── Role semantic tokens ────────────────────────────────────────────────
        "role-pm":            colors.amber,
        "role-architect":     colors.blue,
        "role-planner":       colors.violet,
        "role-developer":     colors.indigo,
        "role-reviewer":      colors.cyan,
        "role-qa":            colors.emerald,
        "role-improver":      colors.orange,
        "role-comm":          colors.fuchsia,
        "role-orchestrator":  colors.slate,

        // ── Surface tokens ──────────────────────────────────────────────────────
        // Near-black neutral scale with a faint blue-violet tint, darkest to
        // lightest: 950 (page bg) -> 900 (panels) -> 800 (cards/hover) ->
        // 700 (borders) -> 400/300 (muted text) -> 50 (rare bright text-on-dark).
        surface: {
          50:  "#f4f4f7",
          100: "#e7e7ee",
          200: "#c7c7d6",
          300: "#9a9ab3",
          400: "#71718f",
          500: "#54546b",
          600: "#3f3f52",
          700: "#2c2c3c",
          800: "#1c1c28",
          900: "#131320",
          950: "#0b0b14",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #8b5cf6 0%, #d946ef 50%, #22d3ee 100%)",
        "brand-gradient-subtle": "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(217,70,239,0.12) 50%, rgba(34,211,238,0.15) 100%)",
        "radial-glow": "radial-gradient(circle at top left, rgba(139,92,246,0.25), transparent 60%)",
      },
      boxShadow: {
        "glow-violet": "0 0 0 1px rgba(139,92,246,0.4), 0 0 24px -4px rgba(139,92,246,0.5)",
        "glow-cyan": "0 0 0 1px rgba(34,211,238,0.4), 0 0 20px -4px rgba(34,211,238,0.45)",
        "glow-emerald": "0 0 0 1px rgba(16,185,129,0.4), 0 0 20px -4px rgba(16,185,129,0.45)",
        "glow-rose": "0 0 0 1px rgba(244,63,94,0.4), 0 0 20px -4px rgba(244,63,94,0.45)",
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(0.85)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 1.8s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.25s ease-out",
        shimmer: "shimmer 2s linear infinite",
        "gradient-x": "gradient-x 6s ease infinite",
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
