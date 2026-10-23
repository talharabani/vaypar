import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useBusinessCategory } from '../context/BusinessContext';
import { useTheme } from '../hooks/use-theme';

// Map industry modules to matching business categories
const INDUSTRY_CATEGORY_MAP: Record<string, string[]> = {
  restaurant: ['restaurant', 'cafe', 'dhaba', 'bakery', 'sweet_shop', 'coffee_shop', 'juice_bar'],
  pharmacy: ['pharmacy', 'medical_store', 'clinic'],
  salon: ['beauty_salon', 'spa'],
  tailor: ['tailor', 'clothing_boutique'],
  gym: ['gym', 'fitness_center'],
};

interface AppLauncherModalProps {
  visible: boolean;
  onClose: () => void;
}

export interface BusinessModule {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  category: 'commerce' | 'finance' | 'operations' | 'industry';
  badge?: string;
  isExternal?: boolean;
}

export const BUSINESS_MODULES: BusinessModule[] = [
  // ─── AI Co-Pilot ───
  {
    id: 'ai',
    title: 'Vaypar AI Co-Pilot',
    subtitle: 'Ask stock levels, top sales, profit margins & POS settings',
    route: '/ai',
    icon: 'sparkles',
    color: '#8B5CF6',
    category: 'commerce',
    badge: 'AI ASSISTANT',
  },
  // ─── Core Commerce ───
  {
    id: 'dashboard',
    title: 'Executive Dashboard',
    subtitle: 'Daily KPIs, stock volume & live revenue graphs',
    route: '/',
    icon: 'grid',
    color: '#3B82F6',
    category: 'commerce',
  },
  {
    id: 'bills',
    title: 'POS Billing & Checkout',
    subtitle: 'Fast cashier counter, barcode scan & thermal receipts',
    route: '/bills',
    icon: 'receipt',
    color: '#10B981',
    category: 'commerce',
    badge: 'FAST POS',
  },
  {
    id: 'products',
    title: 'Products & Inventory',
    subtitle: 'Stock levels, catalog, barcode labeling & alerts',
    route: '/products',
    icon: 'cube',
    color: '#F59E0B',
    category: 'commerce',
  },
  {
    id: 'udhar',
    title: 'Customer Credit Ledger',
    subtitle: 'Credit accounts, debits & repayment statements',
    route: '/udhar',
    icon: 'wallet',
    color: '#EF4444',
    category: 'commerce',
    badge: 'CREDIT',
  },
  {
    id: 'store',
    title: 'Digital E-Storefront',
    subtitle: 'Public web store & WhatsApp ordering catalog',
    route: '/store',
    icon: 'globe',
    color: '#8B5CF6',
    category: 'commerce',
    isExternal: true,
  },

  // ─── Finance & Ledger ───
  {
    id: 'revenue',
    title: 'Revenue & Analytics',
    subtitle: 'Daily, weekly, monthly graphs & bank statement PDF export',
    route: '/revenue',
    icon: 'trending-up',
    color: '#059669',
    category: 'finance',
    badge: 'NEW',
  },
  {
    id: 'expenses',
    title: 'Expense Tracker',
    subtitle: 'Daily business cash outflow, bills & category splits',
    route: '/expenses',
    icon: 'cash',
    color: '#DC2626',
    category: 'finance',
  },
  {
    id: 'activity',
    title: 'Transaction Audit Trail',
    subtitle: 'Complete chronological history of cashier sales & logs',
    route: '/activity',
    icon: 'list',
    color: '#64748B',
    category: 'finance',
  },

  // ─── Operations & Customers ───
  {
    id: 'staff',
    title: 'Staff & Shift Logins',
    subtitle: 'Employee roles, access control, attendance & PINs',
    route: '/staff',
    icon: 'people',
    color: '#6366F1',
    category: 'operations',
  },
  {
    id: 'crm',
    title: 'Customers Directory',
    subtitle: 'Customer database, lifetime purchases & debt profiles',
    route: '/crm',
    icon: 'people-circle',
    color: '#EC4899',
    category: 'operations',
  },
  {
    id: 'queue',
    title: 'Customer Queue Dispenser',
    subtitle: 'Token ticketing, digital queue call & counter display',
    route: '/queue',
    icon: 'hourglass',
    color: '#06B6D4',
    category: 'operations',
  },
  {
    id: 'warranty',
    title: 'Warranty & Claims',
    subtitle: 'Serial number warranties, guarantee periods & claims',
    route: '/warranty',
    icon: 'shield-checkmark',
    color: '#14B8A6',
    category: 'operations',
  },
  {
    id: 'import',
    title: 'Excel Bulk Import',
    subtitle: 'Fast spreadsheet import for inventory & products',
    route: '/products/import',
    icon: 'cloud-upload',
    color: '#15803D',
    category: 'operations',
  },

  // ─── Industry Specific ───
  {
    id: 'restaurant',
    title: 'Restaurant & Dining',
    subtitle: 'Table layout, Kitchen Display System (KDS) & food POS',
    route: '/restaurant',
    icon: 'restaurant',
    color: '#F97316',
    category: 'industry',
    badge: 'DINE-IN',
  },
  {
    id: 'pharmacy',
    title: 'Pharmacy & Drug Batches',
    subtitle: 'Medicine batches, expiry dates & formula inventory',
    route: '/pharmacy',
    icon: 'medkit',
    color: '#0284C7',
    category: 'industry',
    badge: 'BATCHES',
  },
  {
    id: 'salon',
    title: 'Salon & Spa Appointments',
    subtitle: 'Stylist schedule, service catalog & client booking',
    route: '/salon',
    icon: 'cut',
    color: '#A855F7',
    category: 'industry',
  },
  {
    id: 'tailor',
    title: 'Tailoring & Boutique',
    subtitle: 'Customer body measurements & custom stitching orders',
    route: '/tailor',
    icon: 'shirt',
    color: '#E11D48',
    category: 'industry',
  },
  {
    id: 'gym',
    title: 'Gym & Memberships',
    subtitle: 'Member subscription plans, trainers & renewal alerts',
    route: '/gym',
    icon: 'barbell',
    color: '#4F46E5',
    category: 'industry',
  },
  {
    id: 'settings',
    title: 'Business Settings',
    subtitle: 'Store profile, tax rate, receipt header & printers',
    route: '/settings',
    icon: 'settings',
    color: '#475569',
    category: 'operations',
  },
];

type CategoryFilter = 'all' | 'commerce' | 'finance' | 'operations' | 'industry';

export function AppLauncherModal({ visible, onClose }: AppLauncherModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { categoryId } = useBusinessCategory();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // ESC key to close on web
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  // Check if current business has an active industry-specific module
  const hasIndustryModule = Object.entries(INDUSTRY_CATEGORY_MAP).some(([_, cats]) =>
    cats.includes(categoryId)
  );

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return BUSINESS_MODULES.filter(m => {
      // Industry module filter: only show if relevant to current business category!
      if (m.category === 'industry') {
        const allowedCategories = INDUSTRY_CATEGORY_MAP[m.id];
        if (!allowedCategories || !allowedCategories.includes(categoryId)) {
          return false;
        }
      }

      const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.subtitle.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [search, selectedCategory, categoryId]);

  const handleLaunch = (mod: BusinessModule) => {
    onClose();
    if (mod.id === 'store') {
      const slug = (user?.businessName || 'my-store')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '');
      if (Platform.OS === 'web') {
        window.open(`/store/${slug}`, '_blank');
      } else {
        router.push(`/store/${slug}` as any);
      }
      return;
    }
    router.push(mod.route as any);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        {/* Backdrop dismiss */}
        <Pressable style={s.backdrop} onPress={onClose} />

        {/* Modal Window Dialog */}
        <View style={[s.windowDialog, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {/* ── Fixed Window Header ── */}
          <View style={[s.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[s.headerBadge, { backgroundColor: '#C5A880' }]}>
                <Ionicons name="apps" size={20} color="#16171B" />
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.headerTitle, { color: theme.text }]}>All Business Apps & Modules</Text>
                  <View style={[s.proPill, { backgroundColor: '#C5A88022', borderColor: '#C5A88050' }]}>
                    <Text style={s.proPillText}>VAYPAR OS</Text>
                  </View>
                </View>
                <Text style={[s.headerSub, { color: theme.textSecondary }]}>
                  Quick launcher to access all store modules, financial ledgers & operations
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={[s.closeBtn, { backgroundColor: theme.backgroundSelected }]} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ── Search Bar & Category Filter ── */}
          <View style={[s.filterBar, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
            <View style={[
              s.searchBox,
              {
                backgroundColor: theme.backgroundSelected,
                borderColor: isSearchFocused ? '#C5A880' : theme.border,
              }
            ]}>
              <Ionicons
                name="search"
                size={16}
                color={isSearchFocused ? '#C5A880' : theme.textSecondary}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={[s.searchInput, { color: theme.text }]}
                placeholder="Search any app, module, or feature (e.g. Udhar, POS, Revenue, Staff)..."
                placeholderTextColor={theme.textMuted}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                autoFocus={visible}
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Category tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryScroll}>
              {[
                { id: 'all', label: 'All Modules' },
                { id: 'commerce', label: 'Sales & POS' },
                { id: 'finance', label: 'Finance & Ledger' },
                { id: 'operations', label: 'Operations' },
                ...(hasIndustryModule ? [{ id: 'industry', label: 'Industry Systems' }] : []),
              ].map(cat => {
                const isActive = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setSelectedCategory(cat.id as CategoryFilter)}
                    style={[
                      s.categoryChip,
                      {
                        backgroundColor: isActive ? '#C5A880' : theme.backgroundElement,
                        borderColor: isActive ? '#C5A880' : theme.border,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        s.categoryChipText,
                        { color: isActive ? '#16171B' : theme.textSecondary },
                        isActive && s.categoryChipTextActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Scrollable Modules Grid ── */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.gridContainer}
            showsVerticalScrollIndicator={false}
          >
            {filteredModules.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="search-outline" size={48} color={theme.textMuted} />
                <Text style={[s.emptyStateTitle, { color: theme.text }]}>No matching business module found</Text>
                <Text style={[s.emptyStateSub, { color: theme.textSecondary }]}>Try searching for "POS", "Udhar", "Revenue", or "Stock"</Text>
              </View>
            ) : (
              <View style={s.grid}>
                {filteredModules.map(mod => {
                  const isCurrent =
                    pathname === mod.route ||
                    (mod.route !== '/' && pathname.startsWith(mod.route));

                  return (
                    <Pressable
                      key={mod.id}
                      onPress={() => handleLaunch(mod)}
                      style={({ hovered }: any) => [
                        s.card,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.border,
                        },
                        hovered && [
                          s.cardHovered,
                          {
                            borderColor: '#C5A880',
                            backgroundColor: theme.backgroundSelected,
                          },
                        ],
                        isCurrent && [
                          s.cardCurrent,
                          {
                            borderColor: '#C5A880',
                            backgroundColor: '#C5A88015',
                          },
                        ],
                      ]}
                    >
                      {/* Top Row: Icon on left, Badge on right */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={[s.iconBox, { backgroundColor: mod.color + '15', borderColor: mod.color + '30' }]}>
                          <Ionicons name={mod.icon} size={20} color={mod.color} />
                        </View>
                        {mod.badge && (
                          <View style={[s.badge, { backgroundColor: mod.color + '18', borderColor: mod.color + '40' }]}>
                            <Text style={[s.badgeText, { color: mod.color }]}>{mod.badge}</Text>
                          </View>
                        )}
                      </View>

                      {/* Content: Title & Subtitle with full card width */}
                      <View style={{ flex: 1, minHeight: 56 }}>
                        <Text style={[s.cardTitle, { color: theme.text }]} numberOfLines={1}>
                          {mod.title}
                        </Text>
                        <Text style={[s.cardSub, { color: theme.textSecondary }]} numberOfLines={2}>
                          {mod.subtitle}
                        </Text>
                      </View>

                      {/* Bottom row: Status & launch indicator */}
                      <View style={[s.cardBottom, { borderTopColor: theme.border }]}>
                        {isCurrent ? (
                          <View style={s.currentIndicator}>
                            <View style={s.currentDot} />
                            <Text style={s.currentText}>Currently Active</Text>
                          </View>
                        ) : (
                          <View />
                        )}
                        <View style={[s.arrowBox, { backgroundColor: theme.backgroundSelected }]}>
                          <Ionicons name="arrow-forward" size={13} color={theme.textSecondary} />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* ── Fixed Window Footer ── */}
          <View style={[s.footer, { backgroundColor: theme.backgroundSelected, borderTopColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="shield-checkmark" size={14} color="#C5A880" />
              <Text style={[s.footerText, { color: theme.textSecondary }]}>
                {filteredModules.length} Modules Available · Vaypar POS Enterprise Edition
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/settings' as any);
                }}
                style={[s.footerBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                activeOpacity={0.7}
              >
                <Ionicons name="settings-outline" size={13} color={theme.textSecondary} />
                <Text style={[s.footerBtnText, { color: theme.text }]}>Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                style={[s.footerBtn, { backgroundColor: '#C5A88022', borderColor: '#C5A88050' }]}
                activeOpacity={0.7}
              >
                <Text style={[s.footerBtnText, { color: '#C5A880', fontWeight: '800' }]}>Close (Esc)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 17, 21, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 24 : 12,
    zIndex: 100000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  windowDialog: {
    width: '100%',
    maxWidth: 880,
    maxHeight: Platform.OS === 'web' ? ('86vh' as any) : '92%',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.25)',
        } as any)
      : {
          elevation: 25,
        }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#C5A880',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  proPill: {
    backgroundColor: '#C5A88022',
    borderColor: '#C5A88050',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  proPillText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#C5A880',
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'web'
      ? ({
          outline: 'none',
          outlineStyle: 'none',
          outlineWidth: 0,
          borderStyle: 'none',
          boxShadow: 'none',
        } as any)
      : {}),
  },
  categoryScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 2,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryChipActive: {
    backgroundColor: '#C5A880',
    borderColor: '#C5A880',
  },
  categoryChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  categoryChipTextActive: {
    color: '#16171B',
  },
  gridContainer: {
    padding: 20,
    paddingBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: Platform.OS === 'web' ? ('calc(33.333% - 8px)' as any) : '100%',
    minWidth: 230,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-between',
    ...(Platform.OS === 'web'
      ? ({
          transition: 'all 0.15s ease',
          cursor: 'pointer',
        } as any)
      : {}),
  },
  cardHovered: {
    transform: [{ translateY: -2 }],
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
  } as any,
  cardCurrent: {
    borderColor: '#C5A880',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  currentIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  currentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C5A880',
  },
  currentText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C5A880',
  },
  arrowBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  footerBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
  },
  emptyStateSub: {
    fontSize: 12,
  },
});
