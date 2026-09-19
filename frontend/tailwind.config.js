/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B2430",
        paper: "#F7F5F0",
        registry: {
          DEFAULT: "#2F5D50",
          light: "#EAF1EE",
        },
        seal: {
          DEFAULT: "#8C3B2E",
          light: "#F7ECE9",
        },
        brass: "#B08D57",
        line: "#D8D3C7",
        muted: "#8A8577",
      },
      fontFamily: {
        serif: ["\"Source Serif 4\"", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["\"IBM Plex Mono\"", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
      },
    },
  },
  plugins: [],
};
