import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: {
          // Ultramarine
          50: '#eeefff', 100: '#dfe0ff', 200: '#c5c6ff', 300: '#a1a2ff', 400: '#7b7cfa',
          500: '#5557f0', 600: '#3a3de3', 700: '#2b2fd6', 800: '#2326ab', 900: '#1f2387', 950: '#13144f',
        },
        ink: { DEFAULT: '#14143a', soft: '#44466a', muted: '#6e7095' },
        surface: { DEFAULT: '#ffffff', sunk: '#f4f4fa', line: '#e2e2f0' },
        // Sunflower
        accent: { 100: '#fff4d1', 300: '#ffdc7a', 400: '#ffd35e', 500: '#ffc83d', 600: '#e6a817', ink: '#1b1a3a' },
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(20,20,58,.04), 0 2px 8px rgba(20,20,58,.05)' },
    },
  },
  plugins: [],
};
export default config;
