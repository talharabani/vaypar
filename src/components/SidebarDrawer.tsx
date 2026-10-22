import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/use-theme';
import { useAuth } from '../context/AuthContext';
import { useBusinessCategory } from '../context/BusinessContext';
import { BusinessLogo } from './BusinessLogo';
import { RecentChipStrip } from './RecentActivityPanel';

interface SidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function SidebarDrawer({ visible, onClose }: SidebarDrawerProps) {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { categoryId, category } = useBusinessCategory();

  if (!visible || !user) return null;

  const handleNavigate = (path: string) => {
    onClose();
    router.push(path as any);
  };

  // Determine Category-based menu options
  const getCategoryItems = () => {
    switch (categoryId) {
      case 'restaurant':
      case 'cafe':
      case 'dhaba':
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Restaurant Menu', icon: 'restaurant-outline', route: '/restaurant' },
          { label: 'Dine-In Tables', icon: 'grid-outline', route: '/restaurant' },
          { label: 'Kitchen Queue', icon: 'flame-outline', route: '/restaurant' },
          { label: 'Customer Queue', icon: 'people-outline', route: '/queue' },
          { label: 'POS Orders', icon: 'receipt-outline', route: '/bills' },
          { label: 'Customers', icon: 'people-outline', route: '/crm' },
          { label: 'Sales Reports', icon: 'bar-chart-outline', route: '/activity' },
        ];
      case 'beauty_salon':
      case 'spa':
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Appointments Book', icon: 'calendar-outline', route: '/salon' },
          { label: 'Customer Queue', icon: 'people-outline', route: '/queue' },
          { label: 'Services List', icon: 'cut-outline', route: '/salon/services' },
          { label: 'POS Billing', icon: 'receipt-outline', route: '/bills' },
          { label: 'Expenses Tracker', icon: 'wallet-outline', route: '/expenses' },
          { label: 'Sales Reports', icon: 'bar-chart-outline', route: '/activity' },
        ];
      case 'pharmacy':
      case 'medical_store':
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Medicine & Batches', icon: 'medkit-outline', route: '/pharmacy' },
          { label: 'Products Catalog', icon: 'cube-outline', route: '/products' },
          { label: 'Dispense / POS', icon: 'receipt-outline', route: '/bills' },
          { label: 'Udhar / Credit', icon: 'cash-outline', route: '/udhar' },
          { label: 'Expenses Tracker', icon: 'wallet-outline', route: '/expenses' },
          { label: 'Sales Reports', icon: 'bar-chart-outline', route: '/activity' },
        ];
      case 'clinic':
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Patient Queue', icon: 'people-outline', route: '/queue' },
          { label: 'Billing / Invoicing', icon: 'receipt-outline', route: '/bills' },
          { label: 'Clinic Expenses', icon: 'wallet-outline', route: '/expenses' },
          { label: 'Staff Roster', icon: 'people-circle-outline', route: '/staff' },
          { label: 'Operating Reports', icon: 'bar-chart-outline', route: '/activity' },
        ];
      case 'gym':
      case 'fitness_center':
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Gym Members', icon: 'barbell-outline', route: '/gym' },
          { label: 'Membership Plans', icon: 'card-outline', route: '/gym' },
          { label: 'Fee Collection', icon: 'cash-outline', route: '/gym' },
          { label: 'Attendance logs', icon: 'calendar-outline', route: '/gym' },
          { label: 'Performance Reports', icon: 'trending-up-outline', route: '/activity' },
        ];
      case 'tailor':
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Measurements Ledger', icon: 'resize-outline', route: '/tailor' },
          { label: 'Tailor Orders', icon: 'cut-outline', route: '/tailor' },
          { label: 'Stitching Stages', icon: 'construct-outline', route: '/tailor' },
          { label: 'Order Deliveries', icon: 'send-outline', route: '/tailor' },
          { label: 'Revenue Reports', icon: 'analytics-outline', route: '/activity' },
        ];
      case 'electronics_store':
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Products Catalog', icon: 'cube-outline', route: '/products' },
          { label: 'Warranty Manager', icon: 'shield-checkmark-outline', route: '/warranty' },
          { label: 'Sale Invoices', icon: 'receipt-outline', route: '/bills' },
          { label: 'Udhar / Credit', icon: 'cash-outline', route: '/udhar' },
          { label: 'Expenses Tracker', icon: 'wallet-outline', route: '/expenses' },
          { label: 'Operating Reports', icon: 'bar-chart-outline', route: '/activity' },
        ];
      case 'mobile_shop':
      case 'mobile_repair':
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Products Catalog', icon: 'cube-outline', route: '/products' },
          { label: 'Warranty Manager', icon: 'shield-checkmark-outline', route: '/warranty' },
          { label: 'Sale Invoices', icon: 'receipt-outline', route: '/bills' },
          { label: 'Udhar / Credit', icon: 'cash-outline', route: '/udhar' },
          { label: 'Expenses Tracker', icon: 'wallet-outline', route: '/expenses' },
          { label: 'Sales Reports', icon: 'bar-chart-outline', route: '/activity' },
        ];
      case 'solar':
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Products Catalog', icon: 'cube-outline', route: '/products' },
          { label: 'Warranty Manager', icon: 'shield-checkmark-outline', route: '/warranty' },
          { label: 'Sale Invoices', icon: 'receipt-outline', route: '/bills' },
          { label: 'Udhar / Credit', icon: 'cash-outline', route: '/udhar' },
          { label: 'Expenses Tracker', icon: 'wallet-outline', route: '/expenses' },
          { label: 'Installation Reports', icon: 'analytics-outline', route: '/activity' },
        ];
      default:
        // Grocery / General category
        return [
          { label: 'Dashboard', icon: 'home-outline', route: '/' },
          { label: 'Smart Inventory', icon: 'cube-outline', route: '/grocery' },
          { label: 'Products Catalog', icon: 'shirt-outline', route: '/products' },
          { label: 'Sale Invoices', icon: 'receipt-outline', route: '/bills' },
          { label: 'Custom Services', icon: 'sparkles-outline', route: '/services-pos' },
          { label: 'Exchange & Refund', icon: 'repeat-outline', route: '/returns' },
          { label: 'Expenses Tracker', icon: 'wallet-outline', route: '/expenses' },
          { label: 'Customers', icon: 'people-circle-outline', route: '/crm' },
          { label: 'Operating Reports', icon: 'bar-chart-outline', route: '/activity' },
        ];
    }
  };

  const navItems = getCategoryItems();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Background Click dismiss */}
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        {/* Left Side Panel */}
        <View style={[styles.drawerContainer, { backgroundColor: '#F7FAF8', borderColor: '#E2E8E4' }] as any}>
          
          {/* Brand Header */}
          <View style={[styles.drawerHeader, { borderBottomColor: '#EAEFEA' }] as any}>
            <View style={{
              width: 38, height: 38, borderRadius: 10,
              backgroundColor: '#0D5C3A',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="restaurant-outline" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bizName, { color: '#0D5C3A' }] as any} numberOfLines={1}>
                pikbites
              </Text>
              <Text style={[styles.branchText, { color: '#64748B' }] as any}>
                {user.businessName || category.label}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Navigation Items */}
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Recent Activity chip strip */}
            <RecentChipStrip maxItems={6} onNavigate={onClose} />

            {/* Vaypar AI Assistant Featured Item */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#0D5C3A15',
                borderWidth: 1,
                borderColor: '#0D5C3A35',
                paddingVertical: 9,
                paddingHorizontal: 12,
                borderRadius: 10,
                marginTop: 6,
                marginBottom: 12,
                gap: 10,
              }}
              onPress={() => handleNavigate('/ai')}
              activeOpacity={0.75}
            >
              <View style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: '#0D5C3A',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="sparkles" size={15} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0D5C3A' }}>Vaypar AI</Text>
                <Text style={{ fontSize: 10.5, color: '#64748B' }}>Smart Business Co-Pilot</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#0D5C3A" />
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { color: '#8A9E94' }] as any}>
              MENU
            </Text>
            {navItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.navItem, { backgroundColor: 'transparent' }] as any}
                onPress={() => handleNavigate(item.route)}
                activeOpacity={0.7}
              >
                <Ionicons name={item.icon as any} size={18} color="#5A6E64" style={{ marginRight: 12 }} />
                <Text style={[styles.navText, { color: '#111827' }] as any}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Footer branding */}
          <View style={[styles.drawerFooter, { borderTopColor: '#EAEFEA' }] as any}>
            <Ionicons name="apps-outline" size={16} color="#0D5C3A" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
              Vaypar Pakistan OS · v2.0
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawerContainer: {
    width: 280,
    height: '100%',
    borderRightWidth: 1,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    borderBottomWidth: 1,
    gap: 12,
  },
  bizName: {
    fontSize: 16,
    fontWeight: '800',
  },
  branchText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  scrollContent: {
    padding: 16,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingLeft: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 2,
  },
  navText: {
    fontSize: 14,
    fontWeight: '600',
  },
  drawerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 16,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
  },
});
