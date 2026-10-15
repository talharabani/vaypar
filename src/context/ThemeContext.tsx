import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themeMode: ThemeMode;
  theme: Record<keyof typeof Colors.light, string>;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  primaryColor: string | null;
  accentColor: string | null;
  setCustomColors: (primary: string | null, accent: string | null) => Promise<void>;
  fontSize: number;
  setFontSize: (size: number) => Promise<void>;
  sidebarStyle: 'minimal' | 'premium' | 'classic';
  setSidebarStyle: (style: 'minimal' | 'premium' | 'classic') => Promise<void>;
  compactMode: boolean;
  setCompactMode: (compact: boolean) => Promise<void>;
  roundedCornerStyle: 'sharp' | 'rounded' | 'pill';
  setRoundedCornerStyle: (style: 'sharp' | 'rounded' | 'pill') => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'vyapar_theme_preference';
const PRIMARY_COLOR_KEY = 'vyapar_primary_color';
const ACCENT_COLOR_KEY = 'vyapar_accent_color';
const FONT_SIZE_KEY = 'vyapar_font_size';
const SIDEBAR_STYLE_KEY = 'vyapar_sidebar_style';
const COMPACT_MODE_KEY = 'vyapar_compact_mode';
const ROUNDED_CORNER_KEY = 'vyapar_rounded_corner';

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [primaryColor, setPrimaryColor] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState<string | null>(null);

  // Expanded theme customizations
  const [fontSize, setFontSizeState] = useState<number>(14);
  const [sidebarStyle, setSidebarStyleState] = useState<'minimal' | 'premium' | 'classic'>('premium');
  const [compactMode, setCompactModeState] = useState<boolean>(false);
  const [roundedCornerStyle, setRoundedCornerStyleState] = useState<'sharp' | 'rounded' | 'pill'>('rounded');

  useEffect(() => {
    // Load theme settings from AsyncStorage
    Promise.all([
      AsyncStorage.getItem(THEME_STORAGE_KEY),
      AsyncStorage.getItem(PRIMARY_COLOR_KEY),
      AsyncStorage.getItem(ACCENT_COLOR_KEY),
      AsyncStorage.getItem(FONT_SIZE_KEY),
      AsyncStorage.getItem(SIDEBAR_STYLE_KEY),
      AsyncStorage.getItem(COMPACT_MODE_KEY),
      AsyncStorage.getItem(ROUNDED_CORNER_KEY),
    ])
      .then(([savedMode, savedPrimary, savedAccent, savedSize, savedSidebar, savedCompact, savedRounded]) => {
        if (savedMode === 'light' || savedMode === 'dark') {
          setThemeModeState(savedMode);
        } else {
          setThemeModeState('light');
        }
        if (savedPrimary) setPrimaryColor(savedPrimary);
        if (savedAccent) setAccentColor(savedAccent);
        if (savedSize) setFontSizeState(parseInt(savedSize, 10));
        if (savedSidebar) setSidebarStyleState(savedSidebar as any);
        if (savedCompact) setCompactModeState(savedCompact === 'true');
        if (savedRounded) setRoundedCornerStyleState(savedRounded as any);
      })
      .catch(err => {
        console.error('[ThemeContext] Failed to load theme preferences:', err);
      });
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (err) {
      console.error('[ThemeContext] Failed to save theme preference:', err);
    }
  };

  const setCustomColors = async (primary: string | null, accent: string | null) => {
    setPrimaryColor(primary);
    setAccentColor(accent);
    try {
      if (primary) await AsyncStorage.setItem(PRIMARY_COLOR_KEY, primary);
      else await AsyncStorage.removeItem(PRIMARY_COLOR_KEY);

      if (accent) await AsyncStorage.setItem(ACCENT_COLOR_KEY, accent);
      else await AsyncStorage.removeItem(ACCENT_COLOR_KEY);
    } catch (err) {
      console.error('[ThemeContext] Failed to save custom colors:', err);
    }
  };

  const setFontSize = async (size: number) => {
    setFontSizeState(size);
    try {
      await AsyncStorage.setItem(FONT_SIZE_KEY, size.toString());
    } catch (err) {
      console.error(err);
    }
  };

  const setSidebarStyle = async (style: 'minimal' | 'premium' | 'classic') => {
    setSidebarStyleState(style);
    try {
      await AsyncStorage.setItem(SIDEBAR_STYLE_KEY, style);
    } catch (err) {
      console.error(err);
    }
  };

  const setCompactMode = async (compact: boolean) => {
    setCompactModeState(compact);
    try {
      await AsyncStorage.setItem(COMPACT_MODE_KEY, compact ? 'true' : 'false');
    } catch (err) {
      console.error(err);
    }
  };

  const setRoundedCornerStyle = async (style: 'sharp' | 'rounded' | 'pill') => {
    setRoundedCornerStyleState(style);
    try {
      await AsyncStorage.setItem(ROUNDED_CORNER_KEY, style);
    } catch (err) {
      console.error(err);
    }
  };

  const activeTheme = themeMode === 'system'
    ? 'light'
    : themeMode;

  const baseTheme = Colors[activeTheme];
  const isDark = activeTheme === 'dark';

  // Merge custom brand colors
  const theme = {
    ...baseTheme,
    primary: primaryColor || baseTheme.primary,
    secondary: accentColor || baseTheme.secondary,
  };

  const toggleTheme = () => {
    const nextMode = isDark ? 'light' : 'dark';
    setThemeMode(nextMode);
  };

  return (
    <ThemeContext.Provider value={{
      themeMode,
      theme,
      isDark,
      setThemeMode,
      toggleTheme,
      primaryColor,
      accentColor,
      setCustomColors,
      fontSize,
      setFontSize,
      sidebarStyle,
      setSidebarStyle,
      compactMode,
      setCompactMode,
      roundedCornerStyle,
      setRoundedCornerStyle
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within an AppThemeProvider');
  }
  return context;
}
