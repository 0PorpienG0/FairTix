import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#0b0d14", panel: "#141824", edge: "#232a3d", brand: "#7c5cff", mint: "#2ee6a6" },
    },
  },
  plugins: [],
};
export default config;
