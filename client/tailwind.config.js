/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#f5f6fa",
          raised: "#eef0f5",
          card: "#ffffff",
          border: "#e7e9f0",
        },
        up: "#16a34a",
        down: "#e11d48",
        accent: "#4f46e5",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(79,70,229,0.12), 0 8px 24px -8px rgba(79,70,229,0.25)",
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        soft: "0 4px 24px -6px rgba(16,24,40,0.08)",
      },
      keyframes: {
        pulseOnce: {
          "0%": { backgroundColor: "rgba(79,70,229,0.14)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        flash: "pulseOnce 1.2s ease-out",
      },
    },
  },
  plugins: [],
};
