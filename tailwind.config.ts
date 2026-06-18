import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1A73E8",
          dark: "#0B1F3A",
          navy: "#0D2540",
          red: "#E8232F",
        },
      },
    },
  },
  plugins: [],
};
export default config;
