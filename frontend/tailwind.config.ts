import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        serif: ["var(--font-serif)", "Fraunces", "Georgia", "serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "Consolas", "monospace"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        // VeriTrust Design System v1.0 Palette Scales
        sand: {
          10: "#FAF8F5",
          50: "#F6F4EE",
          100: "#EDE8DE",
          200: "#E2DCD0",
          300: "#D3CAB8",
          400: "#B8AC94",
          500: "#9B8E75",
          600: "#7D715A",
          700: "#5F5542",
          800: "#423B2E",
          900: "#27221A",
          950: "#181510",
        },
        clay: {
          50: "#F9F6F3",
          100: "#EFE8DF",
          200: "#DDD0C2",
          300: "#C7B29E",
          400: "#AB8E74",
          500: "#8E6E53",
          600: "#745740",
          700: "#594230",
          800: "#3F2E22",
        },
        sage: {
          50: "#F3F6F3",
          100: "#E2EAE2",
          200: "#C5D5C5",
          300: "#9EB99E",
          400: "#779B77",
          500: "#567C56",
          600: "#426142",
          700: "#304730",
        },
        amber: {
          50: "#FDF9EE",
          100: "#FAF1D3",
          200: "#F4DF9E",
          300: "#EBC864",
          400: "#DCAE33",
          500: "#B88E1C",
          600: "#906D14",
          700: "#694F0E",
        },
        terra: {
          50: "#FDF5F3",
          100: "#F9E4DF",
          200: "#F2C4B9",
          300: "#E69D8E",
          400: "#D46E5B",
          500: "#BA4B36",
          600: "#963927",
          700: "#6F281B",
        },
        slate: {
          50: "#F3F5F7",
          100: "#E3E7EC",
          200: "#C4CDD7",
          300: "#9EAEC0",
          400: "#768CA2",
          500: "#556D85",
          600: "#405468",
          700: "#2E3E4E",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "2px",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.15s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
