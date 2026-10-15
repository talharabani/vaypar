import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Slot, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '../components/AuthScreen';
import { GuidedTour } from '../components/GuidedTour';
import { NotificationContainer } from '../components/restaurant/NotificationToast';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { BusinessProvider } from '../context/BusinessContext';
import { DatabaseProvider } from '../context/DatabaseContext';
import { ImportProvider } from '../context/ImportContext';
import { NotificationProvider, useNotificationContext } from '../context/NotificationContext';
import { OnboardingProvider } from '../context/OnboardingContext';
import { RecentActivityProvider } from '../context/RecentActivityContext';
import { AppThemeProvider, useThemeContext } from '../context/ThemeContext';
import { useTheme } from '../hooks/use-theme';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const customDefaultTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F5F7FA',
    card: '#FFFFFF',
    text: '#1A2B3C',
    border: '#E8EDF2',
  },
};

const customDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0F1923',
    card: '#172130',
    text: '#F0F4F8',
    border: '#1E3045',
  },
};

// ─── Lightweight wrapper for public /store/* routes ───────────────────────────
// Renders only ThemeProvider + Slot — no SQLite, no auth, no DB providers.
// This prevents the "Database is locked by another tab" error.
function PublicStoreShell() {
  const { isDark } = useThemeContext();
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <ThemeProvider value={isDark ? customDarkTheme : customDefaultTheme}>
      <Slot />
    </ThemeProvider>
  );
}

// ─── Main authenticated app content ──────────────────────────────────────────
function MainAppContent() {
  const { user, loading } = useAuth();
  const theme = useTheme();
  const { isDark } = useThemeContext();
  const { toasts, dismissToast } = useNotificationContext();

  useRealtimeSync(user?.businessId);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const screenContent = !user ? <AuthScreen /> : <AppTabs />;

  return (
    <ThemeProvider value={isDark ? customDarkTheme : customDefaultTheme}>
      <View style={{ flex: 1 }}>
        {screenContent}
        <NotificationContainer toasts={toasts} onDismiss={dismissToast} />
        <GuidedTour />
      </View>
    </ThemeProvider>
  );
}

// ─── Root layout — splits store vs app before any provider mounts ─────────────
function RootLayoutInner() {
  const segments = useSegments();
  const isPublicPage = segments[0] === 'store' || segments[0] === 'invoice';

  if (isPublicPage) {
    // Public store or invoice page: no SQLite providers, no auth
    return <PublicStoreShell />;
  }

  return (
    <AuthProvider>
      <NotificationProvider>
        <DatabaseProvider>
          <ImportProvider>
            <BusinessProvider>
              <RecentActivityProvider>
                <OnboardingProvider>
                  <AnimatedSplashOverlay />
                  <MainAppContent />
                </OnboardingProvider>
              </RecentActivityProvider>
            </BusinessProvider>
          </ImportProvider>
        </DatabaseProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <RootLayoutInner />
      </AppThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
