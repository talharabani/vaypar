import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import type { NavTab } from '../constants/businessCategories';
import { useAuth } from '../context/AuthContext';
import { useBusinessCategory } from '../context/BusinessContext';
import { useImport } from '../context/ImportContext';
import { useTheme } from '../hooks/use-theme';
import { AppLauncherModal } from './AppLauncherModal';
import { VayparLogo } from './VayparLogo';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(text: string) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
}

export function getTabRoute(id: NavTab): string {
  if (id === 'index') return '/';
  const cfg = TAB_CONFIG[id];
  if (!cfg) return '/';
  return '/' + cfg.name.replace(/\/index$/, '');
}

export function isTabActive(id: NavTab, pathname: string): boolean {
  if (id === 'index') {
    return pathname === '/' || pathname === '/index' || pathname === '';
  }
  const route = getTabRoute(id);
  return pathname === route || pathname.startsWith(route + '/');
}

// ─── Tab config ───────────────────────────────────────────────────────────────
const TAB_CONFIG: Record<NavTab, {
  name: string; title: string; label: string; icon: string; iconFocused: string;
  hideFromRoles?: Array<'kitchen' | 'cook' | 'cashier' | 'waiter' | 'employee' | 'receptionist'>;
  requireRoles?: Array<'owner' | 'manager'>;
  headerShown?: boolean; tabBarHidden?: boolean;
}> = {
  index:      { name: 'index',           title: 'Dashboard',      label: 'Dashboard',   icon: 'grid-outline',             iconFocused: 'grid',             hideFromRoles: ['kitchen','cook'] },
  revenue:    { name: 'revenue',         title: 'Revenue Analytics', label: 'Revenue',     icon: 'trending-up-outline',      iconFocused: 'trending-up',      hideFromRoles: ['kitchen','cook','cashier'] },
  products:   { name: 'products/index',  title: 'Products',       label: 'Products',    icon: 'cube-outline',             iconFocused: 'cube',             hideFromRoles: ['kitchen','cook'] },
  bills:      { name: 'bills',           title: 'POS / Billing',  label: 'POS',         icon: 'receipt-outline',          iconFocused: 'receipt',          hideFromRoles: ['kitchen','cook'] },
  expenses:   { name: 'expenses',        title: 'Expenses',       label: 'Expenses',    icon: 'wallet-outline',           iconFocused: 'wallet',           hideFromRoles: ['kitchen','cook','cashier'] },
  staff:      { name: 'staff',           title: 'Staff',          label: 'Staff',       icon: 'people-outline',           iconFocused: 'people',           hideFromRoles: ['kitchen','cook','cashier'], requireRoles: ['owner'] },
  activity:   { name: 'activity',        title: 'Activity',       label: 'Activity',    icon: 'list-outline',             iconFocused: 'list',             hideFromRoles: ['kitchen','cook','cashier'] },
  settings:   { name: 'settings',        title: 'Settings',       label: 'Settings',    icon: 'settings-outline',         iconFocused: 'settings' },
  restaurant: { name: 'restaurant',      title: 'Restaurant',     label: 'Restaurant',  icon: 'restaurant-outline',       iconFocused: 'restaurant',       headerShown: false, tabBarHidden: true },
  udhar:      { name: 'udhar',           title: 'Credit Ledger',  label: 'Credit Ledger',icon: 'wallet-outline',           iconFocused: 'wallet',           hideFromRoles: ['kitchen','cook'] },
  grocery:    { name: 'grocery',         title: 'Inventory',      label: 'Inventory',   icon: 'cube-outline',             iconFocused: 'cube',             hideFromRoles: ['kitchen','cook'] },
  pharmacy:   { name: 'pharmacy',        title: 'Pharmacy',       label: 'Pharmacy',    icon: 'medkit-outline',           iconFocused: 'medkit',           hideFromRoles: ['kitchen','cook'] },
  tailor:     { name: 'tailor',          title: 'Orders',         label: 'Orders',      icon: 'cut-outline',              iconFocused: 'cut',              hideFromRoles: ['kitchen','cook'] },
  gym:        { name: 'gym',             title: 'Members',        label: 'Members',     icon: 'barbell-outline',          iconFocused: 'barbell',          hideFromRoles: ['kitchen','cook'] },
  salon:      { name: 'salon',           title: 'Appointments',   label: 'Salon',       icon: 'calendar-outline',         iconFocused: 'calendar',         hideFromRoles: ['kitchen','cook'] },
  crm:        { name: 'crm',             title: 'CRM',            label: 'CRM',         icon: 'people-circle-outline',    iconFocused: 'people-circle',    hideFromRoles: ['kitchen','cook'] },
  queue:      { name: 'queue/index',     title: 'Queue',          label: 'Queue',       icon: 'people-outline',           iconFocused: 'people',           hideFromRoles: ['kitchen','cook'] },
  warranty:   { name: 'warranty/index',  title: 'Warranty',       label: 'Warranty',    icon: 'shield-checkmark-outline', iconFocused: 'shield-checkmark', hideFromRoles: ['kitchen','cook'] },
  returns:    { name: 'returns',          title: 'Exchange & Refund', label: 'Exchange & Refund', icon: 'repeat-outline',        iconFocused: 'repeat',           hideFromRoles: ['kitchen','cook'] },
  'services-pos': { name: 'services-pos', title: 'Personalized Services', label: 'Custom Services', icon: 'sparkles-outline',   iconFocused: 'sparkles',         hideFromRoles: ['kitchen','cook'] },
};

const ALL_TABS: NavTab[] = [
  'index','revenue','products','bills','services-pos','returns','expenses','staff','activity','settings',
  'restaurant','udhar','grocery','pharmacy','tailor','gym','salon','crm','queue','warranty',
];

// ─── Shared sidebar nav items renderer ───────────────────────────────────────
function SidebarNavItems({
  visibleTabs,
  activeTab,
  onNavigate,
  user,
  onOpenStore,
  onLogout,
}: {
  visibleTabs: NavTab[];
  activeTab: NavTab;
  onNavigate: (route: string) => void;
  user: any;
  onOpenStore: () => void;
  onLogout?: () => void;
}) {
  const isOwner = user?.role === 'owner';

  // Group tabs into MENU and GENERAL
  const generalSet = new Set<NavTab>(['expenses', 'staff', 'activity', 'settings']);
  const menuTabs = visibleTabs.filter(t => !generalSet.has(t));
  const generalTabs = visibleTabs.filter(t => generalSet.has(t));

  const renderTabItem = (id: NavTab) => {
    const cfg = TAB_CONFIG[id];
    const isActive = activeTab === id;
    const route = getTabRoute(id);
    const tourId = id === 'bills' ? 'tour-pos' : id === 'settings' ? 'tour-settings' : undefined;

    return (
      <Pressable
        key={id}
        nativeID={tourId}
        testID={tourId}
        onPress={() => onNavigate(route)}
        style={({ hovered }: any) => [{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 10,
          marginBottom: 3,
          backgroundColor: isActive
            ? 'rgba(197, 168, 128, 0.12)'
            : hovered
              ? 'rgba(255, 255, 255, 0.05)'
              : 'transparent',
          position: 'relative',
          transition: 'all 0.15s ease',
        } as any]}
      >
        {/* Active Left Indicator Bar */}
        {isActive && (
          <View style={{
            position: 'absolute',
            left: 0,
            top: 6,
            bottom: 6,
            width: 3.5,
            backgroundColor: '#C5A880',
            borderTopRightRadius: 3,
            borderBottomRightRadius: 3,
          }} />
        )}
        <Ionicons
          name={(isActive ? cfg.iconFocused : cfg.icon) as any}
          size={18}
          color={isActive ? '#C5A880' : '#888E9B'}
        />
        <Text style={{
          color: isActive ? '#FAF7F2' : '#888E9B',
          fontWeight: isActive ? '700' : '500',
          fontSize: 13.5,
          letterSpacing: -0.1,
          flex: 1,
        }}>
          {cfg.label}
        </Text>
      </Pressable>
    );
  };

  const pathname = usePathname();
  const isAIActive = pathname === '/ai';

  return (
    <>
      {/* ── Vaypar AI Featured Sidebar Item ── */}
      <Pressable
        onPress={() => onNavigate('/ai')}
        style={({ hovered }: any) => [{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 10,
          marginBottom: 12,
          backgroundColor: isAIActive
            ? 'rgba(197, 168, 128, 0.18)'
            : hovered
              ? 'rgba(197, 168, 128, 0.12)'
              : 'rgba(197, 168, 128, 0.08)',
          borderWidth: 1,
          borderColor: isAIActive ? '#C5A880' : 'rgba(197, 168, 128, 0.3)',
          position: 'relative',
        } as any]}
      >
        {isAIActive && (
          <View style={{
            position: 'absolute',
            left: 0,
            top: 6,
            bottom: 6,
            width: 3.5,
            backgroundColor: '#C5A880',
            borderTopRightRadius: 3,
            borderBottomRightRadius: 3,
          }} />
        )}
        <View style={{
          width: 24, height: 24, borderRadius: 6,
          backgroundColor: '#C5A880',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="sparkles" size={13} color="#1A1A1A" />
        </View>
        <Text style={{
          color: isAIActive ? '#C5A880' : '#FAF7F2',
          fontWeight: isAIActive ? '700' : '600',
          fontSize: 13.5,
          letterSpacing: -0.1,
          flex: 1,
        }}>
          Vaypar AI
        </Text>
        <View style={{
          backgroundColor: 'rgba(197, 168, 128, 0.25)',
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 6,
        }}>
          <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#C5A880' }}>
            AI
          </Text>
        </View>
      </Pressable>

      {/* MENU Section */}
      <View nativeID="tour-nav-menu" testID="tour-nav-menu">
        <Text style={{
          fontSize: 10,
          fontWeight: '800',
          color: '#525866',
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          paddingHorizontal: 14,
          marginBottom: 8,
          marginTop: 4,
        }}>
          MENU
        </Text>
        {menuTabs.map(id => renderTabItem(id))}
      </View>

      {/* GENERAL Section */}
      {generalTabs.length > 0 && (
        <>
          <Text style={{
            fontSize: 10,
            fontWeight: '800',
            color: '#525866',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            paddingHorizontal: 14,
            marginBottom: 8,
            marginTop: 18,
          }}>
            GENERAL
          </Text>
          {generalTabs.map(id => renderTabItem(id))}
        </>
      )}

      {/* ── Online Store link (owner only) ── */}
      {isOwner && (
        <Pressable
          nativeID="tour-online-store"
          testID="tour-online-store"
          onPress={onOpenStore}
          style={({ hovered }: any) => [{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            marginTop: 4,
            marginBottom: 3,
            backgroundColor: hovered ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
            transition: 'all 0.15s ease',
          } as any]}
        >
          <Ionicons name="storefront-outline" size={18} color="#C5A880" />
          <Text style={{ color: '#C5A880', fontWeight: '600', fontSize: 13.5, flex: 1 }}>
            Online Store
          </Text>
          <Ionicons name="open-outline" size={13} color="#C5A880" />
        </Pressable>
      )}
    </>
  );
}

// ─── Web Sidebar ──────────────────────────────────────────────────────────────
function WebSidebar({ activeTabs, shouldHide }: { activeTabs: Set<NavTab>; shouldHide: (id: NavTab) => boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { category } = useBusinessCategory();
  const [appLauncherOpen, setAppLauncherOpen] = useState(false);

  const visibleTabs = ALL_TABS.filter(id => activeTabs.has(id) && !shouldHide(id));

  const activeTab = ALL_TABS.find(id => isTabActive(id, pathname)) ?? 'index';

  const handleOpenStore = () => {
    const slug = slugify(user?.businessName || 'my-store');
    if (Platform.OS === 'web') {
      window.open(`/store/${slug}`, '_blank');
    } else {
      router.push(`/store/${slug}` as any);
    }
  };

  return (
    <View
      nativeID="tour-sidebar"
      testID="tour-sidebar"
      style={{
        width: 230,
        height: '100%',
        flexDirection: 'column',
        backgroundColor: '#16171B',
        borderRightWidth: 1,
        borderRightColor: '#23252C',
      } as any}
    >

      {/* ── Brand header ── */}
      <View style={{
        height: 70,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: '#212328',
        justifyContent: 'space-between',
      }}>
        <VayparLogo size={32} showText={true} textColor="#FFFFFF" />

        <TouchableOpacity
          onPress={() => setAppLauncherOpen(true)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            cursor: 'pointer',
          } as any}
          activeOpacity={0.7}
        >
          <Ionicons name="grid-outline" size={16} color="#A0AEC0" />
        </TouchableOpacity>
      </View>

      {/* ── Nav items ── */}
      <View style={{ flex: 1, paddingTop: 14, paddingHorizontal: 10, overflowY: 'auto' } as any}>
        <SidebarNavItems
          visibleTabs={visibleTabs}
          activeTab={activeTab}
          onNavigate={route => router.push(route as any)}
          user={user}
          onOpenStore={handleOpenStore}
          onLogout={logout}
        />
      </View>

      {/* ── User Profile Footer ── */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#212328',
        gap: 10,
      }}>
        <View style={{
          width: 34, height: 34, borderRadius: 17,
          backgroundColor: '#2A2D34',
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: '#C5A880',
        }}>
          <Text style={{ color: '#C5A880', fontWeight: '800', fontSize: 13 }}>
            {(user?.name || user?.businessName || 'B').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12.5 }} numberOfLines={1}>
            {user?.name || user?.businessName || 'Business Owner'}
          </Text>
          <Text style={{ color: '#6C727F', fontSize: 10.5 }}>
            {user?.role ? `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} Admin` : 'Owner Admin'}
          </Text>
        </View>
        <TouchableOpacity onPress={logout} style={{ padding: 4 }}>
          <Ionicons name="log-out-outline" size={16} color="#6C727F" />
        </TouchableOpacity>
      </View>

      <AppLauncherModal
        visible={appLauncherOpen}
        onClose={() => setAppLauncherOpen(false)}
      />
    </View>
  );
}

// ─── Mobile Drawer Sidebar ────────────────────────────────────────────────────
function MobileDrawer({
  open,
  onClose,
  activeTabs,
  shouldHide,
}: {
  open: boolean;
  onClose: () => void;
  activeTabs: Set<NavTab>;
  shouldHide: (id: NavTab) => boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { category } = useBusinessCategory();

  const slideAnim = useRef(new Animated.Value(-260)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -260, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [open]);

  const visibleTabs = ALL_TABS.filter(id => activeTabs.has(id) && !shouldHide(id));
  const activeTab = ALL_TABS.find(id => isTabActive(id, pathname)) ?? 'index';

  const navigate = (route: string) => {
    onClose();
    setTimeout(() => router.push(route as any), 50);
  };

  const handleOpenStore = () => {
    onClose();
    const slug = slugify(user?.businessName || 'my-store');
    setTimeout(() => router.push(`/store/${slug}` as any), 50);
  };

  if (!open) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: backdropAnim }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[styles.drawer, { backgroundColor: '#16171B', borderRightColor: '#23252C', transform: [{ translateX: slideAnim }] }]}
        pointerEvents="auto"
      >
        {/* Brand */}
        <View style={[styles.drawerBrand, { borderBottomColor: '#212328' }]}>
          <VayparLogo size={28} showText={false} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 17, letterSpacing: -0.3 }} numberOfLines={1}>
              vaypar
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <Text style={{ fontSize: 10 }}>{category.emoji}</Text>
              <Text style={{ color: '#888E9B', fontSize: 10.5, fontWeight: '700' }} numberOfLines={1}>
                {category.label}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={20} color="#888E9B" />
          </TouchableOpacity>
        </View>

        {/* Nav items */}
        <View style={{ flex: 1, paddingTop: 12, paddingHorizontal: 10 }}>
          <SidebarNavItems
            visibleTabs={visibleTabs}
            activeTab={activeTab}
            onNavigate={navigate}
            user={user}
            onOpenStore={handleOpenStore}
          />
        </View>

        {/* User footer */}
        <View style={[styles.drawerFooter, { borderTopColor: '#212328' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: '#2A2D34',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: '#C5A880',
            }}>
              <Text style={{ color: '#C5A880', fontWeight: '800', fontSize: 13 }}>
                {(user?.name || user?.businessName || 'B').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }} numberOfLines={1}>{user?.name || user?.businessName || 'Business Owner'}</Text>
              <Text style={{ color: '#888E9B', fontSize: 10 }}>{user?.email || 'Owner Admin'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => { onClose(); logout(); }} style={{ padding: 6 }}>
            <Ionicons name="log-out-outline" size={18} color="#888E9B" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Mobile Top Bar ───────────────────────────────────────────────────────────
function MobileTopBar({ onMenuPress }: { onMenuPress: () => void }) {
  const theme = useTheme();
  const { user } = useAuth();
  const pathname = usePathname();

  // Derive current page title from pathname
  const activeTabId = ALL_TABS.find(id => isTabActive(id, pathname));
  const title = activeTabId ? TAB_CONFIG[activeTabId].title : 'Vaypar';

  return (
    <View style={[styles.topBar, { backgroundColor: '#FFFFFF', borderBottomColor: theme.border }]}>
      <TouchableOpacity
        id="tour-mobile-menu"
        testID="tour-mobile-menu"
        onPress={onMenuPress}
        style={styles.menuBtn}
        activeOpacity={0.7}
      >
        <Ionicons name="menu" size={24} color={theme.text} />
      </TouchableOpacity>
      <Text style={[styles.topBarTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
      <View style={styles.menuBtn} />
    </View>
  );
}

// ─── Main AppTabs ─────────────────────────────────────────────────────────────
export default function AppTabs() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { category, loadingCategory } = useBusinessCategory();
  const { activeImport } = useImport();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isKitchen = user?.role === 'kitchen' || user?.role === 'cook';
  const activeTabs = new Set<NavTab>(loadingCategory ? ['index','revenue','settings','crm','returns','services-pos'] : [...category.navTabs, 'revenue', 'crm', 'returns', 'services-pos']);

  function shouldHide(tabId: NavTab): boolean {
    const cfg = TAB_CONFIG[tabId];
    if (!cfg) return true;
    const userRole = user?.role;
    if (!userRole) return false;
    if (cfg.hideFromRoles && (cfg.hideFromRoles as string[]).includes(userRole)) return true;
    if (cfg.requireRoles && !cfg.requireRoles.some(r => userRole === r)) return true;
    return false;
  }

  const progressPercent = activeImport ? Math.round((activeImport.importedCount / activeImport.totalCount) * 100) : 0;

  // Tabs node — bottom bar hidden on both web (sidebar) and mobile (drawer)
  const tabsNode = (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        // Hide tab bar everywhere — navigation is via sidebar/drawer
        tabBarStyle: { display: 'none' },
        headerStyle: {
          backgroundColor: theme.backgroundElement,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          ...(Platform.OS !== 'web' ? { shadowOpacity: 0, elevation: 0 } : {}),
        },
        // Hide default header on mobile too — we use MobileTopBar instead
        headerShown: false,
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
      }}
    >
      {ALL_TABS.map(tabId => {
        const cfg = TAB_CONFIG[tabId];
        const isActive = activeTabs.has(tabId);
        const hidden = shouldHide(tabId) || !isActive;
        return (
          <Tabs.Screen
            key={tabId}
            name={cfg.name}
            options={{
              title: cfg.title,
              tabBarLabel: cfg.label,
              href: hidden ? null : undefined,
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={(focused ? cfg.iconFocused : cfg.icon) as any} size={22} color={color} />
              ),
            }}
          />
        );
      })}
      <Tabs.Screen name="products/import" options={{ href: null }} />
    </Tabs>
  );

  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 768;

  // ── Desktop layout (sidebar) ──────────────────────────────────────────────
  if (!isMobile) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.background } as any}>
        {!isKitchen && <WebSidebar activeTabs={activeTabs} shouldHide={shouldHide} />}
        <View style={{ flex: 1, overflow: 'hidden' } as any}>
          {tabsNode}
        </View>

        {activeImport && activeImport.status === 'importing' && (
          <TouchableOpacity
            style={{ position: 'fixed' as any, bottom: 24, right: 24, width: 300, backgroundColor: theme.backgroundElement, borderColor: theme.primary, borderWidth: 1.5, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 9999 } as any}
            onPress={() => router.push('/products/import')}
          >
            <View style={{ marginRight: 10, backgroundColor: theme.primaryLight, padding: 8, borderRadius: 8 }}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>Importing Products…</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{progressPercent}%</Text>
              </View>
              <View style={{ height: 4, backgroundColor: theme.border, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ height: '100%', backgroundColor: theme.primary, width: `${progressPercent}%` }} />
              </View>
              <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 4 }} numberOfLines={1}>
                {activeImport.importedCount} / {activeImport.totalCount} ({activeImport.currentProductName})
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Mobile layout — top bar + drawer (works on mobile screens and small viewports) ───
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {!isKitchen && <MobileTopBar onMenuPress={() => setDrawerOpen(true)} />}
      <View style={{ flex: 1, overflow: 'hidden' } as any}>
        {tabsNode}
      </View>

      {activeImport && activeImport.status === 'importing' && (
        <TouchableOpacity
          style={{ position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: theme.backgroundElement, borderColor: theme.primary, borderWidth: 1.5, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 }}
          onPress={() => router.push('/products/import')}
        >
          <View style={{ marginRight: 10, backgroundColor: theme.primaryLight, padding: 8, borderRadius: 8 }}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>Importing Products…</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{progressPercent}%</Text>
            </View>
            <View style={{ height: 4, backgroundColor: theme.border, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ height: '100%', backgroundColor: theme.primary, width: `${progressPercent}%` }} />
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      )}

      {!isKitchen && (
        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          activeTabs={activeTabs}
          shouldHide={shouldHide}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: 260,
    borderRightWidth: 1,
    zIndex: 1000,
    flexDirection: 'column',
  },
  drawerBrand: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  drawerBrandIcon: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  drawerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
  },
  drawerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  menuBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
});
