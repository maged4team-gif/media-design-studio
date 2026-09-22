import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#06080e",
          surface: "#0c111d",
          card: "#111726",
          "card-hover": "#172033",
          border: "#26354a",
          "border-light": "#334155",
          blue: {
            DEFAULT: "#2563eb",
            glow: "#38bdf8",
            subtle: "#1d4ed8",
            dark: "#1e3a8a",
          },
          gold: {
            DEFAULT: "#f59e0b",
            light: "#fbbf24",
            dark: "#b45309",
            subtle: "rgba(245, 158, 11, 0.12)",
          },
          text: {
            primary: "#f8fafc",
            secondary: "#cbd5e1",
            muted: "#94a3b8",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "Cairo", "Tajawal", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.25s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
