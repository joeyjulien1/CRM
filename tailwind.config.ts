import type { Config } from "tailwindcss";

/**
 * Utilities resolve to the semantic layer in app/globals.css. A component that
 * reaches past these to a raw ramp value is a bug — see docs/DESIGN.md.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--surface)",
          sunken: "var(--surface-sunken)",
          raised: "var(--surface-raised)",
          hover: "var(--surface-hover)",
        },
        content: {
          DEFAULT: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          accent: "var(--text-accent)",
        },
        edge: {
          DEFAULT: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          fg: "var(--accent-fg)",
        },
        danger: "var(--danger)",
        success: "var(--success)",
        warning: "var(--warning)",
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
      },
      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "var(--line-body)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--line-body)" }],
        base: ["var(--text-base)", { lineHeight: "var(--line-body)" }],
        lg: ["var(--text-lg)", { lineHeight: "1.25" }],
        xl: ["var(--text-xl)", { lineHeight: "1.15" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "1.05" }],
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      height: {
        control: "var(--control-h)",
        row: "var(--row-h)",
      },
      minHeight: {
        control: "var(--control-h)",
        row: "var(--row-h)",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--ease)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        DEFAULT: "var(--dur)",
      },
    },
  },
  plugins: [],
};

export default config;
