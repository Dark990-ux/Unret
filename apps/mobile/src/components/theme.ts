import { useColorScheme } from 'react-native';

/**
 * UNRET palette: ultramarine (brand) + sunflower (highlight), on indigo-tinted neutrals.
 * Semantic colors (success/danger/warning) stay separate from the brand pair.
 */
const light = {
  bg: '#f6f6fb', card: '#ffffff', sunk: '#eeeef8', line: '#e2e2f0', text: '#14143a', soft: '#44466a', muted: '#6e7095',
  brand: '#2b2fd6', brandDark: '#2326ab', brandSoft: '#eeefff', onBrand: '#ffffff',
  sun: '#ffc83d', onSun: '#1b1a3a', sunSoft: '#fff4d1', heroSub: '#ffe39a',
  danger: '#dc2626', amber: '#d97706', star: '#f2b200',
};
const dark: typeof light = {
  bg: '#0c0c1d', card: '#14152b', sunk: '#1b1c36', line: '#2a2c4d', text: '#e9e9f6', soft: '#bfc0dc', muted: '#8d8fb3',
  brand: '#8b8eff', brandDark: '#c5c6ff', brandSoft: '#1e2050', onBrand: '#0c0c1d',
  sun: '#ffc83d', onSun: '#1b1a3a', sunSoft: '#3a3216', heroSub: '#ffe39a',
  danger: '#f87171', amber: '#fbbf24', star: '#ffc83d',
};
export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
/** Hero bands use deep ultramarine in both themes so the sunflower highlight always glows. */
export const hero = { bg: '#2b2fd6', deep: '#1f2387', text: '#ffffff' };
export const radius = { sm: 8, md: 12, lg: 16 };
