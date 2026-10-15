import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#09090b",
        panel: "#111113",
        raise: "#18181b",
        edge: "#27272a",
        brand: "#fafafa",
        mint: "#34d399",
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
