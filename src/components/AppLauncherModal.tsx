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
    title: 'Customer CRM Directory',
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
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');

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

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return BUSINESS_MODULES.filter(m => {
      const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.subtitle.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [search, selectedCategory]);

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
        <View style={s.windowDialog}>
          {/* ── Fixed Window Header ── */}
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.headerBadge}>
                <Ionicons name="apps" size={20} color="#16171B" />
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.headerTitle}>All Business Apps & Modules</Text>
                  <View style={s.proPill}>
                    <Text style={s.proPillText}>VAYPAR OS</Text>
                  </View>
                </View>
                <Text style={s.headerSub}>
                  Quick launcher to access all store modules, financial ledgers & operations
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* ── Search Bar & Category Filter ── */}
          <View style={s.filterBar}>
            <View style={s.searchBox}>
              <Ionicons name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={s.searchInput}
                placeholder="Search any app, module, or feature (e.g. Udhar, POS, Revenue, Staff)..."
                placeholderTextColor="#64748B"
                value={search}
                onChangeText={setSearch}
                autoFocus={visible}
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
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
                { id: 'industry', label: 'Industry Systems' },
              ].map(cat => {
                const isActive = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setSelectedCategory(cat.id as CategoryFilter)}
                    style={[s.categoryChip, isActive && s.categoryChipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.categoryChipText, isActive && s.categoryChipTextActive]}>
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
            showsVerticalScrollIndicator={true}
          >
            {filteredModules.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="search-outline" size={48} color="#475569" />
                <Text style={s.emptyStateTitle}>No matching business module found</Text>
                <Text style={s.emptyStateSub}>Try searching for "POS", "Udhar", "Revenue", or "Stock"</Text>
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
                        hovered && s.cardHovered,
                        isCurrent && s.cardCurrent,
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                        {/* Module Icon Container */}
                        <View style={[s.iconBox, { backgroundColor: mod.color + '18', borderColor: mod.color + '35' }]}>
                          <Ionicons name={mod.icon} size={22} color={mod.color} />
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text style={s.cardTitle} numberOfLines={1}>
                              {mod.title}
                            </Text>
                            {mod.badge && (
                              <View style={[s.badge, { backgroundColor: mod.color + '20', borderColor: mod.color + '45' }]}>
                                <Text style={[s.badgeText, { color: mod.color }]}>{mod.badge}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.cardSub} numberOfLines={2}>
                            {mod.subtitle}
                          </Text>
                        </View>
                      </View>

                      {/* Bottom row: Status & launch indicator */}
                      <View style={s.cardBottom}>
                        {isCurrent ? (
                          <View style={s.currentIndicator}>
                            <View style={s.currentDot} />
                            <Text style={s.currentText}>Currently Active</Text>
                          </View>
                        ) : (
                          <View />
                        )}
                        <View style={s.arrowBox}>
                          <Ionicons name="arrow-forward" size={13} color="#94A3B8" />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* ── Fixed Window Footer ── */}
          <View style={s.footer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="shield-checkmark" size={14} color="#C5A880" />
              <Text style={s.footerText}>
                {filteredModules.length} Modules Available · Vaypar POS Enterprise Edition
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/settings' as any);
                }}
                style={s.footerBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="settings-outline" size={13} color="#94A3B8" />
                <Text style={s.footerBtnText}>Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={[s.footerBtn, { backgroundColor: '#C5A88020', borderColor: '#C5A88050' }]} activeOpacity={0.7}>
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
    backgroundColor: 'rgba(5, 7, 10, 0.78)',
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
    maxWidth: 780,
    maxHeight: Platform.OS === 'web' ? ('86vh' as any) : '92%',
    backgroundColor: '#16171B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#262932',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
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
    borderBottomColor: '#23262F',
    backgroundColor: '#1A1D23',
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
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 12,
    color: '#888E9B',
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
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#23262F',
    backgroundColor: '#16171B',
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2129',
    borderWidth: 1,
    borderColor: '#2B2F3A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    padding: 0,
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
    backgroundColor: '#1E2129',
    borderWidth: 1,
    borderColor: '#282C37',
  },
  categoryChipActive: {
    backgroundColor: '#C5A880',
    borderColor: '#C5A880',
  },
  categoryChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#888E9B',
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
    minWidth: 220,
    backgroundColor: '#1B1E26',
    borderWidth: 1,
    borderColor: '#262A35',
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
    backgroundColor: '#222631',
    borderColor: '#3D4353',
    transform: [{ translateY: -2 }],
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  } as any,
  cardCurrent: {
    borderColor: '#C5A880',
    backgroundColor: 'rgba(197, 168, 128, 0.08)',
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  cardSub: {
    fontSize: 11,
    color: '#888E9B',
    lineHeight: 15,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
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
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    borderTopColor: '#23262F',
    backgroundColor: '#16171B',
  },
  footerText: {
    fontSize: 11.5,
    color: '#888E9B',
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
    borderColor: '#2D323E',
    backgroundColor: '#1E2129',
  },
  footerBtnText: {
    fontSize: 11,
    color: '#94A3B8',
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
    color: '#FFFFFF',
    marginTop: 8,
  },
  emptyStateSub: {
    fontSize: 12,
    color: '#888E9B',
  },
});
