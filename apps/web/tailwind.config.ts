import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--sb-font)"],
      },
      colors: {
        // STORBIT brand tokens (src/styles/storbit-tokens.css), used directly.
        sb: {
          bg: "var(--sb-bg)",
          surface: "var(--sb-surface)",
          sunken: "var(--sb-surface-sunken)",
          border: "var(--sb-border)",
          "border-strong": "var(--sb-border-strong)",
          text: "var(--sb-text)",
          muted: "var(--sb-text-muted)",
          chip: "var(--sb-chip)",
          action: "var(--sb-action)",
          "action-hover": "var(--sb-action-hover)",
          "action-text": "var(--sb-action-text)",
          link: "var(--sb-link)",
          "nav-active": "var(--sb-nav-active-bg)",
          "nav-active-text": "var(--sb-nav-active-text)",
          success: "var(--sb-success-text)",
          online: "var(--sb-status-online)",
          offline: "var(--sb-status-offline)",
          error: "var(--sb-status-error)",
          "offline-bg": "var(--sb-offline-bg)",
          "offline-border": "var(--sb-offline-border)",
          "offline-text": "var(--sb-offline-text)",
          "error-bg": "var(--sb-error-bg)",
          "error-text": "var(--sb-error-text)",
          "chart-bar": "var(--sb-chart-bar)",
          "chart-track": "var(--sb-chart-track)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        // 12 px buttons/inputs, 16 px cards (--sb-radius-*).
        lg: "var(--sb-radius-md)",
        md: "calc(var(--sb-radius-md) - 2px)",
        sm: "var(--sb-radius-sm)",
        xl: "var(--sb-radius-md)",
        "2xl": "var(--sb-radius-lg)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
