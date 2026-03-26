import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        paper: "#f5f1e8",
        accent: "#d95d39"
      }
    }
  },
  plugins: []
};

export default config;
