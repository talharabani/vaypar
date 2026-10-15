/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeContext } from '../context/ThemeContext';

export function useTheme() {
  try {
    const { theme } = useThemeContext();
    return theme;
  } catch {
    // Fallback if the theme context is not mounted (e.g. during static build or early splash)
    const scheme = useColorScheme();
    const theme = (!scheme || (scheme as string) === 'unspecified') ? 'light' : scheme;
    return Colors[theme as 'light' | 'dark'] || Colors.light;
  }
}

