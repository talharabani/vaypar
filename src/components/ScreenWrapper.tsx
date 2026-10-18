import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, ViewStyle, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNotificationContext } from '../context/NotificationContext';
import { useTheme } from '../hooks/use-theme';
import { CommandPalette } from './CommandPalette';
import { NotificationsModal } from './NotificationsModal';
import { SyncStatusBar } from './SyncStatusBar';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Optional title shown in the web top bar */
  title?: string;
  /** Optional right-side actions for the web top bar */
  headerRight?: React.ReactNode;
  /** Hide top web header bar and floating search */
  hideHeader?: boolean;
  /** Hide the top 'Add New Product' button */
  hideAddProduct?: boolean;
}

export default function ScreenWrapper({ children, style, title, headerRight, hideHeader, hideAddProduct }: ScreenWrapperProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { user } = useAuth();
  const { unreadCount } = useNotificationContext();
  const [paletteVisible, setPaletteVisible] = useState(false);
  const [notifVisible, setNotifVisible] = useState(false);
  const showHeader = !hideHeader && !!user && !isMobile;

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteVisible(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={[{ flex: 1, backgroundColor: theme.background }, style]}>

        {/* ── Web top bar ─────────────────────────────────────────────────── */}
        {showHeader && (
          <View style={{
            height: 68,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 24,
            backgroundColor: theme.backgroundElement,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            gap: 14,
          } as any}>

            {title ? (
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20, letterSpacing: -0.4 }}>
                  {title.includes('·') ? title.split('·')[1].trim() : title}
                </Text>
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {/* Search here box */}
            <TouchableOpacity
              id="tour-search"
              testID="tour-search"
              onPress={() => setPaletteVisible(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: theme.backgroundSelected,
                borderWidth: 1, borderColor: theme.border,
                borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8,
                minWidth: 240,
                cursor: 'pointer',
              } as any}
            >
              <Ionicons name="search-outline" size={15} color="#888E9B" />
              <Text style={{ color: '#888E9B', fontSize: 13, flex: 1 }}>Search here</Text>
            </TouchableOpacity>

            {/* Notifications button */}
            <TouchableOpacity
              style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: notifVisible ? theme.primary + '18' : '#F4F5F7',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: notifVisible ? theme.primary : '#E5E7EB',
                position: 'relative',
              }}
              onPress={() => setNotifVisible(prev => !prev)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
                size={17}
                color={unreadCount > 0 ? theme.primary : theme.text}
              />
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute', top: -3, right: -3,
                  minWidth: 18, height: 18, borderRadius: 9,
                  backgroundColor: '#EF4444',
                  alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 4,
                  borderWidth: 2, borderColor: theme.backgroundElement || '#FFFFFF',
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {headerRight}

            {/* + Add New Product button */}
            {!hideAddProduct && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: '#1A1A1A',
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 22,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                }}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    window.location.href = '/products';
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12.5 }}>
                  Add New Product
                </Text>
                <Ionicons name="add-circle" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Sync progress banner — slides in when syncing */}
        {showHeader && <SyncStatusBar />}

        {/* Page content */}
        <View style={{ flex: 1, overflow: 'auto' } as any}>
          {children}
        </View>

        {showHeader && <CommandPalette visible={paletteVisible} onClose={() => setPaletteVisible(false)} />}
        {showHeader && <NotificationsModal visible={notifVisible} onClose={() => setNotifVisible(false)} />}
      </View>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }, style]}>
      {/* Sync banner for mobile too */}
      {showHeader && <SyncStatusBar />}

      <View style={styles.content}>{children}</View>

      {/* Floating search FAB */}
      {showHeader && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }]}
          onPress={() => setPaletteVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="search" size={20} color={theme.primary} />
        </TouchableOpacity>
      )}

      {showHeader && <CommandPalette visible={paletteVisible} onClose={() => setPaletteVisible(false)} />}
      {showHeader && <NotificationsModal visible={notifVisible} onClose={() => setNotifVisible(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative', overflow: 'hidden' },
  content: { flex: 1, zIndex: 1 },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', zIndex: 99,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
});
