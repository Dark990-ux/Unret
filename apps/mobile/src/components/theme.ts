import { useColorScheme } from 'react-native';

const light = {
  bg: '#f7f9f8', card: '#ffffff', sunk: '#eef2f0', line: '#e3e9e6', text: '#0f1a17', soft: '#43524d', muted: '#6b7a75',
  brand: '#047860', brandDark: '#065f4d', brandSoft: '#ecfdf8', onBrand: '#ffffff', danger: '#dc2626', amber: '#d97706', star: '#f59e0b',
};
const dark: typeof light = {
  bg: '#0b1311', card: '#121c19', sunk: '#18241f', line: '#24332e', text: '#e8efec', soft: '#b9c7c2', muted: '#8a9a94',
  brand: '#10b98c', brandDark: '#34d3a6', brandSoft: '#0b3a2f', onBrand: '#02140f', danger: '#f87171', amber: '#fbbf24', star: '#fbbf24',
};
export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
export const radius = { sm: 8, md: 12, lg: 16 };
