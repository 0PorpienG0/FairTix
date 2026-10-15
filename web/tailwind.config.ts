import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#09070f",
        panel: "#14101f",
        raise: "#1b1629",
        edge: "#2b2342",
        brand: "#ff3d7f",
        sun: "#ff8a3d",
        violet: "#8b6cff",
        mint: "#2ee6a6",
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
