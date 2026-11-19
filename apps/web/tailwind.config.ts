import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf8', 100: '#d1faec', 200: '#a7f3da', 300: '#6ee7c3', 400: '#34d3a6',
          500: '#10b98c', 600: '#059673', 700: '#047860', 800: '#065f4d', 900: '#064e40', 950: '#022c25',
        },
        ink: { DEFAULT: '#0f1a17', soft: '#43524d', muted: '#6b7a75' },
        surface: { DEFAULT: '#ffffff', sunk: '#f5f7f6', line: '#e3e9e6' },
        accent: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(15,26,23,.04), 0 2px 8px rgba(15,26,23,.04)' },
    },
  },
  plugins: [],
};
export default config;
