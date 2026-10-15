/**
 * Vaypar — Web POS & CRM Design System
 * Inspired by modern teal/mint POS theme
 */

import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    primary: '#1A1A1A',           // Refined Charcoal Primary
    primaryDark: '#0E0E0E',       // Pure Deep Charcoal
    primaryLight: '#F5F2EC',      // Soft Warm Stone Pill Tint
    accent: '#C5A880',            // Champagne Gold / Bronze Accent
    accentLight: '#F7F4EE',       // Delicate Warm Gold Tint
    secondary: '#556B2F',         // Natural Olive Green
    text: '#1A1A1A',              // High-Contrast Deep Charcoal
    textSecondary: '#555555',     // Elegant Refined Body Slate
    textMuted: '#8C8A84',         // Warm Muted Caption
    background: '#FBF9F5',        // Signature Warm Cream Base Canvas
    backgroundElement: '#FFFFFF', // Pure Soft White Card & Panels
    backgroundSelected: '#F5F2EC',// Selected Neutral Pill / Row
    border: '#E8E4DC',            // Warm Stone Mist Border
    success: '#2E7D32',
    warning: '#D97706',
    danger: '#DC2626',
    cardShadow: '#EAE5DB',
    sidebar: '#1A1A1A',           // Deep Charcoal Sidebar
    sidebarText: '#8C8A84',       // Muted Sidebar Item
    sidebarActive: '#C5A880',     // Champagne Gold Active Indicator
    heroCard: '#24221F',          // Deep Warm Obsidian Hero Panel
  },
  dark: {
    primary: '#C5A880',           // Warm Champagne Gold
    primaryDark: '#B0936C',
    primaryLight: '#2C2822',
    accent: '#C5A880',
    accentLight: '#2C2822',
    secondary: '#81C784',
    text: '#FAF7F2',
    textSecondary: '#BDB9B0',
    textMuted: '#7D7A72',
    background: '#121110',        // Deep Warm Charcoal Canvas
    backgroundElement: '#1B1A18', // Warm Dark Stone Card
    backgroundSelected: '#262420',
    border: '#2C2A26',
    success: '#81C784',
    warning: '#FBBF24',
    danger: '#F87171',
    cardShadow: '#0A0A09',
    sidebar: '#161513',
    sidebarText: '#BDB9B0',
    sidebarActive: '#C5A880',
    heroCard: '#1E1D1A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'var(--font-display)', serif: 'var(--font-serif)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' },
});

export const Spacing = {
  half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 1280;

