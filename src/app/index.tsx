import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions
} from 'react-native';
import { BusinessLogo } from '../components/BusinessLogo';
import { Card } from '../components/Card';
import { InteractiveRevenueChart } from '../components/InteractiveRevenueChart';
import { ReceiptModal } from '../components/ReceiptModal';
import { RecentActivityPanel } from '../components/RecentActivityPanel';
import ScreenWrapper from '../components/ScreenWrapper';
import { SidebarDrawer } from '../components/SidebarDrawer';
import { ChartSkeleton, ListRowSkeleton, MetricCardSkeleton } from '../components/SkeletonLoader';
import {
    BUSINESS_CATEGORIES,
    BusinessCategoryId,
    CATEGORY_GROUPS,
    getCategoryById
} from '../constants/businessCategories';
import { useAuth } from '../context/AuthContext';
import { useBusinessCategory } from '../context/BusinessContext';
import { useDatabase } from '../context/DatabaseContext';
import { useRecentActivity } from '../context/RecentActivityContext';
import { useThemeContext } from '../context/ThemeContext';
import { useTheme } from '../hooks/use-theme';
import * as gymDb from '../services/gymDb';
import * as inventoryDb from '../services/inventoryDb';
import * as queueDb from '../services/queueDb';
import * as restaurantDb from '../services/restaurantDb';
import * as salonDb from '../services/salonDb';
import * as sqlite from '../services/sqlite';
import * as tailorDb from '../services/tailorDb';
import * as warrantyDb from '../services/warrantyDb';



export default function DashboardScreen() {
  const { user } = useAuth();
  
  if (user?.role === 'kitchen' || user?.role === 'cook') {
    return <Redirect href="/restaurant/kitchen" />;
  }

  const { 
    products, 
    invoices, 
    expenses, 
    returnsExchanges,
    loadingData, 
    refreshData, 
    syncing, 
    networkConnected 
  } = useDatabase();

  const theme = useTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 860;
  const { toggleTheme, isDark } = useThemeContext();
  const { category, categoryId, updateCategory } = useBusinessCategory();
  const { logVisit } = useRecentActivity();

  // Role helpers
  const isOwner = user?.role === 'owner';
  const isManager = user?.role === 'manager';
  const hasReportsAccess = isOwner || isManager;

  // Receipt Modal State
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<sqlite.Invoice | null>(null);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<sqlite.InvoiceItem[]>([]);

  // Modals state
  const [showTodayInvoices, setShowTodayInvoices] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('All');
  const [switchingCategory, setSwitchingCategory] = useState(false);

  // Real Database Inventory & Order Filters
  const [activeProductTag, setActiveProductTag] = useState<string>('All');

  // Filtered real products from Database
  const displayedProducts = useMemo(() => {
    if (!products || products.length === 0) return [];
    if (activeProductTag === 'Fast Moving') {
      return [...products].sort((a, b) => (b.quantity || 0) - (a.quantity || 0)).slice(0, 5);
    }
    if (activeProductTag === 'Low Stock' || activeProductTag === 'Low Demand') {
      return products.filter(p => p.quantity <= (p.lowStockThreshold || 5)).slice(0, 5);
    }
    if (activeProductTag === 'Dead Item') {
      return products.filter(p => p.quantity === 0).slice(0, 5);
    }
    if (activeProductTag === 'Discounted') {
      return products.filter(p => (p.purchasePrice || 0) > 0 && p.price > (p.purchasePrice || 0)).slice(0, 5);
    }
    return products.slice(0, 5);
  }, [products, activeProductTag]);

  // Real Low Stock Items for AI Restock & Reorder alerts
  const lowStockItems = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.quantity <= (p.lowStockThreshold || 5));
  }, [products]);

  // Real Recent Sales from Invoices
  const recentSalesList = useMemo(() => {
    if (!invoices || invoices.length === 0) return [];
    return invoices.slice(0, 4);
  }, [invoices]);

  // Industry-specific live states
  const [gymStats, setGymStats] = useState<gymDb.GymStats | null>(null);
  const [gymDueMembers, setGymDueMembers] = useState<gymDb.GymMember[]>([]);
  
  const [salonStats, setSalonStats] = useState<salonDb.SalonStats | null>(null);
  const [salonAppointments, setSalonAppointments] = useState<salonDb.SalonAppointment[]>([]);

  const [tailorStats, setTailorStats] = useState<tailorDb.TailorStats | null>(null);
  const [tailorOrders, setTailorOrders] = useState<tailorDb.TailorOrder[]>([]);

  const [pharmacyStats, setPharmacyStats] = useState<inventoryDb.PharmacyStats | null>(null);
  const [expiringBatches, setExpiringBatches] = useState<inventoryDb.MedicineBatch[]>([]);

  const [restaurantStats, setRestaurantStats] = useState<restaurantDb.RestaurantStats | null>(null);
  const [restaurantTables, setRestaurantTables] = useState<restaurantDb.RestaurantTable[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<restaurantDb.RestaurantOrder[]>([]);

  const [warrantyStats, setWarrantyStats] = useState<warrantyDb.WarrantyStats | null>(null);
  const [queueStats, setQueueStats] = useState<queueDb.QueueStats | null>(null);
  const [totalCreditOutstanding, setTotalCreditOutstanding] = useState<number>(0);
  const [pendingCreditCount, setPendingCreditCount] = useState<number>(0);

  const businessId = user?.businessId || '';

  useEffect(() => {
    if (!businessId) return;
    Promise.all([
      sqlite.getTotalOutstandingBalance(businessId),
      sqlite.getCreditAccounts(businessId),
    ]).then(([out, accs]) => {
      setTotalCreditOutstanding(out);
      setPendingCreditCount(accs.filter(a => a.balance > 0).length);
    }).catch(e => console.warn('Credit load warning:', e));
  }, [businessId, invoices]);

  // Load industry domain data dynamically
  const loadDomainData = useCallback(async () => {
    if (!businessId) return;

    try {
      if (categoryId === 'gym' || categoryId === 'fitness_center') {
        await gymDb.initGymTables();
        await gymDb.seedDefaultPlans(businessId);
        await gymDb.refreshMemberFeeStatus(businessId);
        const [gs, gm] = await Promise.all([
          gymDb.getGymStats(businessId),
          gymDb.getGymMembers(businessId),
        ]);
        setGymStats(gs);
        setGymDueMembers(gm.filter(m => m.feeStatus === 'due' || m.status === 'expired').slice(0, 4));
      } else if (categoryId === 'beauty_salon' || categoryId === 'spa') {
        await salonDb.initSalonTables();
        const svcs = await salonDb.getServices(businessId);
        if (svcs.length === 0) {
          await salonDb.seedDefaultServices(businessId);
        }
        const today = new Date().toISOString().split('T')[0];
        const [ss, sa] = await Promise.all([
          salonDb.getSalonStats(businessId),
          salonDb.getAppointments(businessId, today),
        ]);
        setSalonStats(ss);
        setSalonAppointments(sa.slice(0, 4));
      } else if (categoryId === 'tailor' || categoryId === 'clothing_boutique') {
        await tailorDb.initTailorTables();
        const [ts, to] = await Promise.all([
          tailorDb.getTailorStats(businessId),
          tailorDb.getTailorOrders(businessId),
        ]);
        setTailorStats(ts);
        setTailorOrders(to.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').slice(0, 4));
      } else if (categoryId === 'pharmacy' || categoryId === 'medical_store') {
        await inventoryDb.initInventoryTables();
        const [ps, eb] = await Promise.all([
          inventoryDb.getPharmacyStats(businessId),
          inventoryDb.getExpiringBatches(businessId, 30),
        ]);
        setPharmacyStats(ps);
        setExpiringBatches(eb.slice(0, 4));
      } else if (
        categoryId === 'restaurant' ||
        categoryId === 'cafe' ||
        categoryId === 'dhaba' ||
        categoryId === 'bakery' ||
        categoryId === 'sweet_shop'
      ) {
        await restaurantDb.initRestaurantTables();
        const [rs, rt, ko] = await Promise.all([
          restaurantDb.getRestaurantStats(businessId),
          restaurantDb.getTables(businessId),
          restaurantDb.getKitchenOrders(businessId),
        ]);
        setRestaurantStats(rs);
        setRestaurantTables(rt);
        setKitchenOrders(ko.filter((o: restaurantDb.RestaurantOrder) => o.status === 'pending' || o.status === 'preparing').slice(0, 4));
      } else if (categoryId === 'electronics_store' || categoryId === 'mobile_shop' || categoryId === 'solar') {
        await warrantyDb.initWarrantyTables();
        const ws = await warrantyDb.getWarrantyStats(businessId);
        setWarrantyStats(ws);
      } else if (categoryId === 'clinic') {
        await queueDb.initQueueTables();
        const qs = await queueDb.getQueueStats(businessId);
        setQueueStats(qs);
      }
    } catch (e) {
      console.warn('[Dashboard] Domain load warning:', e);
    }
  }, [businessId, categoryId]);

  useEffect(() => {
    loadDomainData();
  }, [loadDomainData]);

  // Aggregate financial metrics
  const metrics = useMemo(() => {
    let grossSales = 0;
    let totalExpenses = 0;
    let totalRefunds = 0;

    invoices.forEach(inv => {
      grossSales += inv.total || 0;
    });

    expenses.forEach(exp => {
      totalExpenses += exp.amount || 0;
    });

    (returnsExchanges || []).forEach(ret => {
      totalRefunds += Number(ret.refundAmount) || 0;
    });

    const totalSales = Math.max(0, grossSales - totalRefunds);
    const netProfit = totalSales - totalExpenses;

    return {
      grossSales,
      totalRefunds,
      totalSales,
      totalExpenses,
      netProfit,
    };
  }, [invoices, expenses, returnsExchanges]);

  // Today's POS statistics
  const todayStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    let grossTodaySales = 0;
    let todayInvoicesCount = 0;
    let todayRefunds = 0;

    invoices.forEach(inv => {
      if (inv.createdAt.startsWith(todayStr)) {
        grossTodaySales += inv.total || 0;
        todayInvoicesCount++;
      }
    });

    (returnsExchanges || []).forEach(ret => {
      if (ret.createdAt.startsWith(todayStr)) {
        todayRefunds += Number(ret.refundAmount) || 0;
      }
    });

    const todaySales = Math.max(0, grossTodaySales - todayRefunds);

    return {
      grossTodaySales,
      todayRefunds,
      todaySales,
      todayInvoicesCount,
      totalProducts: products.length,
    };
  }, [invoices, products, returnsExchanges]);

  // Filter invoices for today
  const todayInvoices = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return invoices.filter(inv => inv.createdAt.startsWith(todayStr));
  }, [invoices]);

  // Low stock products
  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.quantity <= p.lowStockThreshold);
  }, [products]);

  // Recent Invoices
  const recentInvoices = useMemo(() => {
    return invoices.slice(0, 4);
  }, [invoices]);

  const onRefresh = () => {
    refreshData();
    loadDomainData();
  };

  const handleOpenReceipt = async (invoice: sqlite.Invoice) => {
    try {
      const items = await sqlite.getInvoiceItems(invoice.id);
      setSelectedInvoice(invoice);
      setSelectedInvoiceItems(items);
      setReceiptVisible(true);
      logVisit({
        recordId: invoice.id,
        type: 'invoice',
        title: `Invoice #${invoice.id.substring(0, 8).toUpperCase()}`,
        subtitle: `${invoice.customerName || 'Walk-in'} · PKR ${invoice.total.toLocaleString('en-IN')}`,
        icon: 'receipt',
        color: '#10B981',
        route: '/bills',
      });
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to retrieve invoice items.');
    }
  };

  const handleQuickSwitchCategory = async (catId: BusinessCategoryId) => {
    if (catId === categoryId) return;
    try {
      setSwitchingCategory(true);
      await updateCategory(catId);
    } catch (err) {
      Alert.alert('Error', 'Failed to switch business category.');
    } finally {
      setSwitchingCategory(false);
      setCategoryModalVisible(false);
    }
  };

  const filteredCategories = useMemo(() => {
    return BUSINESS_CATEGORIES.filter(c => {
      const matchesGroup = selectedGroupFilter === 'All' || c.group === selectedGroupFilter;
      const matchesSearch =
        c.label.toLowerCase().includes(categorySearch.toLowerCase()) ||
        c.description.toLowerCase().includes(categorySearch.toLowerCase()) ||
        c.group.toLowerCase().includes(categorySearch.toLowerCase());
      return matchesGroup && matchesSearch;
    });
  }, [categorySearch, selectedGroupFilter]);

  if (loadingData && invoices.length === 0 && products.length === 0) {
    return (
      <ScreenWrapper style={styles.scrollContent}>
        <View style={styles.responsiveContainer}>
          <MetricCardSkeleton />
          <ChartSkeleton />
          <ListRowSkeleton count={3} />
        </View>
      </ScreenWrapper>
    );
  }

  // ─── Dynamic Industry KPI Cards Builder ──────────────────────────────────────────
  const renderDynamicKPICards = () => {
    if (categoryId === 'restaurant' || categoryId === 'dhaba' || categoryId === 'cafe') {
      const occupiedTables = restaurantTables.filter(t => t.status !== 'available').length;
      const totalTables = restaurantTables.length || 8;
      const kitchenPending = kitchenOrders.length;
      return (
        <View style={styles.kpiContainer}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/restaurant' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="restaurant" size={18} color={theme.primary} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Active Tables</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1}>
                {occupiedTables} / {totalTables}
              </Text>
              <Text style={{ fontSize: 10, color: theme.success, fontWeight: '700', marginTop: 2 }}>
                {Math.round((occupiedTables / totalTables) * 100) || 0}% Occupancy
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/restaurant' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.warning + '18' }]}>
                <Ionicons name="flame" size={18} color={theme.warning} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Kitchen Queue</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]}>
                {kitchenPending} KOTs
              </Text>
              <Text style={{ fontSize: 10, color: kitchenPending > 0 ? theme.warning : theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                {kitchenPending > 0 ? 'Orders preparing' : 'All served'}
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowTodayInvoices(true)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.success + '18' }]}>
                <Ionicons name="cash" size={18} color={theme.success} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Today's Sales</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1}>
                {todayStats.todaySales.toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                {todayStats.todayInvoicesCount} bills
              </Text>
            </Card>
          </TouchableOpacity>
        </View>
      );
    }

    if (categoryId === 'gym' || categoryId === 'fitness_center') {
      return (
        <View style={styles.kpiContainer}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/gym' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="barbell" size={18} color={theme.primary} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Active Members</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]}>
                {gymStats?.activeMembers ?? 0}
              </Text>
              <Text style={{ fontSize: 10, color: theme.success, fontWeight: '700', marginTop: 2 }}>
                {gymStats?.totalMembers ?? 0} Total Enrolled
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/gym' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.danger + '18' }]}>
                <Ionicons name="alert-circle" size={18} color={theme.danger} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Fee Due</Text>
              <Text style={[styles.kpiValue, { color: theme.danger }]}>
                {gymStats?.dueMembers ?? 0}
              </Text>
              <Text style={{ fontSize: 10, color: theme.danger, fontWeight: '600', marginTop: 2 }}>
                {gymStats?.expiredMembers ?? 0} Expired
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/gym' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.secondary + '18' }]}>
                <Ionicons name="calendar" size={18} color={theme.secondary} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Today Check-ins</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]}>
                {gymStats?.todayAttendance ?? 0}
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                Daily footfall
              </Text>
            </Card>
          </TouchableOpacity>
        </View>
      );
    }

    if (categoryId === 'beauty_salon' || categoryId === 'spa') {
      return (
        <View style={styles.kpiContainer}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/salon' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="calendar" size={18} color={theme.primary} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Appointments</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]}>
                {salonStats?.todayAppointments ?? 0} Today
              </Text>
              <Text style={{ fontSize: 10, color: theme.success, fontWeight: '700', marginTop: 2 }}>
                {salonStats?.upcomingAppointments ?? 0} Upcoming
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/salon/services' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#EC4899' + '18' }]}>
                <Ionicons name="sparkles" size={18} color="#EC4899" />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Services Menu</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]}>
                {salonStats?.totalServices ?? 8} Items
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                Active salon treatments
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowTodayInvoices(true)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.success + '18' }]}>
                <Ionicons name="cash" size={18} color={theme.success} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Salon Sales</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1}>
                {((salonStats?.todayRevenue ?? 0) + todayStats.todaySales).toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                {todayStats.todayInvoicesCount} checkouts
              </Text>
            </Card>
          </TouchableOpacity>
        </View>
      );
    }

    if (categoryId === 'tailor') {
      return (
        <View style={styles.kpiContainer}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/tailor' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="cut" size={18} color={theme.primary} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>In Progress</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]}>
                {tailorStats?.inProgress ?? 0} Orders
              </Text>
              <Text style={{ fontSize: 10, color: theme.primary, fontWeight: '700', marginTop: 2 }}>
                {tailorStats?.readyToDeliver ?? 0} Ready to Deliver
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/tailor' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.warning + '18' }]}>
                <Ionicons name="time" size={18} color={theme.warning} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Pending</Text>
              <Text style={[styles.kpiValue, { color: theme.warning }]}>
                {tailorStats?.pending ?? 0} Items
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                {tailorStats?.deliveredToday ?? 0} Delivered today
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/tailor' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.success + '18' }]}>
                <Ionicons name="wallet" size={18} color={theme.success} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Uncollected</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1}>
                {(tailorStats?.pendingBalance ?? 0).toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                Customer balance due
              </Text>
            </Card>
          </TouchableOpacity>
        </View>
      );
    }

    if (categoryId === 'pharmacy' || categoryId === 'medical_store') {
      return (
        <View style={styles.kpiContainer}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/pharmacy' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.danger + '18' }]}>
                <Ionicons name="alert" size={18} color={theme.danger} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Expiry Alerts</Text>
              <Text style={[styles.kpiValue, { color: theme.danger }]}>
                {pharmacyStats?.expiringIn30Days ?? 0} Batches
              </Text>
              <Text style={{ fontSize: 10, color: theme.danger, fontWeight: '700', marginTop: 2 }}>
                {pharmacyStats?.expiredBatches ?? 0} Expired already
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/products' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.warning + '18' }]}>
                <Ionicons name="medkit" size={18} color={theme.warning} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Low Stock</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]}>
                {lowStockProducts.length} Items
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                Reorder required
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowTodayInvoices(true)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.success + '18' }]}>
                <Ionicons name="cash" size={18} color={theme.success} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Dispensary Sales</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1}>
                {todayStats.todaySales.toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                {todayStats.todayInvoicesCount} invoices
              </Text>
            </Card>
          </TouchableOpacity>
        </View>
      );
    }

    if (categoryId === 'electronics_store' || categoryId === 'mobile_shop' || categoryId === 'solar') {
      return (
        <View style={styles.kpiContainer}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/warranty' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="shield-checkmark" size={18} color={theme.primary} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Active Warranties</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]}>
                {warrantyStats?.activeCount ?? 0}
              </Text>
              <Text style={{ fontSize: 10, color: theme.primary, fontWeight: '700', marginTop: 2 }}>
                {warrantyStats?.expiringCount ?? 0} Expiring soon
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/warranty' as any)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.warning + '18' }]}>
                <Ionicons name="construct" size={18} color={theme.warning} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Open Claims</Text>
              <Text style={[styles.kpiValue, { color: theme.warning }]}>
                {warrantyStats?.openClaimsCount ?? 0} Tickets
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                Repairs & replacements
              </Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowTodayInvoices(true)} activeOpacity={0.7}>
            <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: theme.success + '18' }]}>
                <Ionicons name="cash" size={18} color={theme.success} />
              </View>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Today's Sales</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1}>
                {todayStats.todaySales.toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '600', marginTop: 2 }}>
                {todayStats.todayInvoicesCount} serial sales
              </Text>
            </Card>
          </TouchableOpacity>
        </View>
      );
    }

    // Default: Retail, Grocery, General Business (Real Live Database Metrics)
    const totalOrdersCount = invoices.length;
    const totalSalesAmount = metrics.totalSales;
    const totalProductsCount = products.length;
    const totalStockUnits = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const lowStockCount = lowStockProducts.length;

    return (
      <View style={[styles.kpiContainer, isMobile && { flexWrap: 'wrap' }]}>
        {/* Card 1: Total Orders (Dark Obsidian Card) */}
        <TouchableOpacity style={{ flex: isMobile ? undefined : 1, width: isMobile ? '48%' : undefined, minWidth: isMobile ? 140 : 160 }} onPress={() => setShowTodayInvoices(true)} activeOpacity={0.85}>
          <View style={{
            backgroundColor: '#18191E',
            borderRadius: 18,
            padding: 16,
            justifyContent: 'space-between',
            minHeight: 128,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: '#C5A880',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="cart" size={16} color="#16171B" />
              </View>
              <View style={{
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: '#25272F',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="arrow-up-outline" size={13} color="#9AA1B0" style={{ transform: [{ rotate: '45deg' }] }} />
              </View>
            </View>
            
            <View style={{ marginVertical: 4 }}>
              <Text style={{ color: '#9AA1B0', fontSize: 11.5, fontWeight: '600' }}>
                Total Orders
              </Text>
              <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 2 }}>
                {totalOrdersCount.toLocaleString('en-US')}
              </Text>
            </View>
            
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: todayStats.todayInvoicesCount > 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.08)',
              alignSelf: 'flex-start',
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 10,
            }}>
              <Ionicons name={todayStats.todayInvoicesCount > 0 ? "trending-up" : "calendar-outline"} size={11} color={todayStats.todayInvoicesCount > 0 ? "#22C55E" : "#9AA1B0"} />
              <Text style={{ color: todayStats.todayInvoicesCount > 0 ? '#22C55E' : '#9AA1B0', fontSize: 10, fontWeight: '700' }}>
                {todayStats.todayInvoicesCount > 0 ? `+${todayStats.todayInvoicesCount} Today` : '0 Today'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Card 2: Total Revenue / Sales (White Card) */}
        <TouchableOpacity style={{ flex: isMobile ? undefined : 1, width: isMobile ? '48%' : undefined, minWidth: isMobile ? 140 : 160 }} onPress={() => router.push('/revenue' as any)} activeOpacity={0.7}>
          <Card style={[styles.kpiCard, { backgroundColor: '#FFFFFF', borderColor: '#EAECEF', borderWidth: 1, borderRadius: 18, minHeight: 128, justifyContent: 'space-between', padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: '#F5F2EC',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="cash-outline" size={16} color="#1A1A1A" />
              </View>
              <View style={{
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: '#F4F5F7',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="arrow-up-outline" size={13} color="#6C727F" style={{ transform: [{ rotate: '45deg' }] }} />
              </View>
            </View>
            
            <View style={{ marginVertical: 4 }}>
              <Text style={{ color: '#6C727F', fontSize: 11.5, fontWeight: '600' }}>
                Total Revenue
              </Text>
              <Text style={{ color: '#111318', fontSize: 24, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                {totalSalesAmount.toLocaleString('en-IN')}
              </Text>
            </View>
            
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: todayStats.todaySales > 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(108, 114, 127, 0.1)',
              alignSelf: 'flex-start',
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 10,
            }}>
              <Ionicons name={todayStats.todaySales > 0 ? "trending-up" : "wallet-outline"} size={11} color={todayStats.todaySales > 0 ? "#22C55E" : "#6C727F"} />
              <Text style={{ color: todayStats.todaySales > 0 ? '#22C55E' : '#6C727F', fontSize: 10, fontWeight: '700' }}>
                {todayStats.todaySales > 0 ? `${todayStats.todaySales.toLocaleString('en-IN')} Today` : '0 Today'}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Card: Customer Credit Receivables */}
        <TouchableOpacity style={{ flex: isMobile ? undefined : 1, width: isMobile ? '48%' : undefined, minWidth: isMobile ? 140 : 160 }} onPress={() => router.push('/udhar' as any)} activeOpacity={0.7}>
          <Card style={[styles.kpiCard, { backgroundColor: '#FFFFFF', borderColor: '#EAECEF', borderWidth: 1, borderRadius: 18, minHeight: 128, justifyContent: 'space-between', padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: totalCreditOutstanding > 0 ? '#FEE2E2' : '#F5F2EC',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="wallet-outline" size={16} color={totalCreditOutstanding > 0 ? '#DC2626' : '#1A1A1A'} />
              </View>
              <View style={{
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: '#F4F5F7',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="arrow-up-outline" size={13} color="#6C727F" style={{ transform: [{ rotate: '45deg' }] }} />
              </View>
            </View>
            
            <View style={{ marginVertical: 4 }}>
              <Text style={{ color: '#6C727F', fontSize: 11.5, fontWeight: '600' }}>
                Customer Credit
              </Text>
              <Text style={{ color: totalCreditOutstanding > 0 ? '#DC2626' : '#111318', fontSize: 24, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                {totalCreditOutstanding.toLocaleString('en-IN')}
              </Text>
            </View>
            
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: totalCreditOutstanding > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(108, 114, 127, 0.1)',
              alignSelf: 'flex-start',
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 10,
            }}>
              <Ionicons name={totalCreditOutstanding > 0 ? "alert-circle-outline" : "checkmark-circle-outline"} size={11} color={totalCreditOutstanding > 0 ? "#DC2626" : "#6C727F"} />
              <Text style={{ color: totalCreditOutstanding > 0 ? '#DC2626' : '#6C727F', fontSize: 10, fontWeight: '700' }}>
                {totalCreditOutstanding > 0 ? `${pendingCreditCount} Due` : 'Cleared'}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Card 3: Products in Catalog (White Card) */}
        <TouchableOpacity style={{ flex: isMobile ? undefined : 1, width: isMobile ? '48%' : undefined, minWidth: isMobile ? 140 : 160 }} onPress={() => router.push('/products' as any)} activeOpacity={0.7}>
          <Card style={[styles.kpiCard, { backgroundColor: '#FFFFFF', borderColor: '#EAECEF', borderWidth: 1, borderRadius: 18, minHeight: 128, justifyContent: 'space-between', padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: '#F5F2EC',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="cube-outline" size={16} color="#1A1A1A" />
              </View>
              <View style={{
                backgroundColor: '#F5F2EC',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 8,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#1A1A1A' }}>
                  {totalStockUnits} Units
                </Text>
              </View>
            </View>
            
            <View style={{ marginVertical: 4 }}>
              <Text style={{ color: '#6C727F', fontSize: 11.5, fontWeight: '600' }}>
                Total Products
              </Text>
              <Text style={{ color: '#111318', fontSize: 24, fontWeight: '800', marginTop: 2 }}>
                {totalProductsCount.toLocaleString('en-US')}
              </Text>
            </View>
            
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: totalProductsCount > 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(108, 114, 127, 0.1)',
              alignSelf: 'flex-start',
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 10,
            }}>
              <Ionicons name="pricetag-outline" size={11} color={totalProductsCount > 0 ? "#22C55E" : "#6C727F"} />
              <Text style={{ color: totalProductsCount > 0 ? '#22C55E' : '#6C727F', fontSize: 10, fontWeight: '700' }}>
                {totalProductsCount > 0 ? `${totalProductsCount} in Catalog` : '0 in Catalog'}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Card 4: Low Stock / Reorder Alerts (White Card) */}
        <TouchableOpacity style={{ flex: isMobile ? undefined : 1, width: isMobile ? '100%' : undefined, minWidth: isMobile ? 140 : 160 }} onPress={() => router.push('/products' as any)} activeOpacity={0.7}>
          <Card style={[styles.kpiCard, { backgroundColor: '#FFFFFF', borderColor: '#EAECEF', borderWidth: 1, borderRadius: 18, minHeight: 128, justifyContent: 'space-between', padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: lowStockCount > 0 ? '#FEE2E2' : '#DCFCE7',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name={lowStockCount > 0 ? "alert-circle-outline" : "checkmark-circle-outline"} size={16} color={lowStockCount > 0 ? "#DC2626" : "#16A34A"} />
              </View>
              <View style={{
                backgroundColor: lowStockCount > 0 ? '#FEE2E2' : '#DCFCE7',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 8,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: lowStockCount > 0 ? '#DC2626' : '#16A34A' }}>
                  {lowStockCount > 0 ? `${lowStockCount} Reorder` : 'Healthy'}
                </Text>
              </View>
            </View>
            
            <View style={{ marginVertical: 4 }}>
              <Text style={{ color: '#6C727F', fontSize: 11.5, fontWeight: '600' }}>
                Low Stock Alerts
              </Text>
              <Text style={{ color: lowStockCount > 0 ? '#DC2626' : '#111318', fontSize: 24, fontWeight: '800', marginTop: 2 }}>
                {lowStockCount.toLocaleString('en-US')}
              </Text>
            </View>
            
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: lowStockCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
              alignSelf: 'flex-start',
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 10,
            }}>
              <Ionicons name={lowStockCount > 0 ? "warning-outline" : "shield-checkmark-outline"} size={11} color={lowStockCount > 0 ? "#DC2626" : "#22C55E"} />
              <Text style={{ color: lowStockCount > 0 ? '#DC2626' : '#22C55E', fontSize: 10, fontWeight: '700' }}>
                {lowStockCount > 0 ? `${lowStockCount} Items Need Restock` : 'All Stock Healthy'}
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Dynamic Industry Quick Actions Grid ──────────────────────────────────────────
  const renderDynamicQuickActions = () => {
    let actions: { label: string; icon: string; route: string; color: string }[] = [];

    if (categoryId === 'restaurant' || categoryId === 'dhaba' || categoryId === 'cafe') {
      actions = [
        { label: 'Dine-In Tables', icon: 'grid', route: '/restaurant', color: theme.primary },
        { label: 'Kitchen KOT', icon: 'flame', route: '/restaurant', color: theme.warning },
        { label: 'New POS Bill', icon: 'cart', route: '/bills', color: theme.success },
        { label: 'Customer Queue', icon: 'people', route: '/queue', color: theme.secondary },
      ];
    } else if (categoryId === 'gym' || categoryId === 'fitness_center') {
      actions = [
        { label: 'Register Member', icon: 'person-add', route: '/gym/new-member', color: theme.primary },
        { label: 'Check-in Attendance', icon: 'checkmark-circle', route: '/gym/attendance', color: theme.success },
        { label: 'Membership Plans', icon: 'card', route: '/gym/plans', color: theme.secondary },
        { label: 'POS Billing', icon: 'receipt', route: '/bills', color: theme.warning },
      ];
    } else if (categoryId === 'beauty_salon' || categoryId === 'spa') {
      actions = [
        { label: 'Book Appointment', icon: 'calendar', route: '/salon/book', color: theme.primary },
        { label: 'Salon Services', icon: 'sparkles', route: '/salon/services', color: '#EC4899' },
        { label: 'Walk-in Queue', icon: 'people', route: '/queue', color: theme.secondary },
        { label: 'Checkout Bill', icon: 'cart', route: '/bills', color: theme.success },
      ];
    } else if (categoryId === 'tailor') {
      actions = [
        { label: 'New Stitch Order', icon: 'cut', route: '/tailor/new-order', color: theme.primary },
        { label: 'Order Pipeline', icon: 'list', route: '/tailor', color: theme.secondary },
        { label: 'Credit Ledger', icon: 'wallet', route: '/udhar', color: theme.warning },
        { label: 'Quick POS Bill', icon: 'receipt', route: '/bills', color: theme.success },
      ];
    } else if (categoryId === 'pharmacy' || categoryId === 'medical_store') {
      actions = [
        { label: 'Dispense POS', icon: 'cart', route: '/bills', color: theme.primary },
        { label: 'Expiry Monitor', icon: 'alert-circle', route: '/pharmacy', color: theme.danger },
        { label: 'Medicine Catalog', icon: 'medkit', route: '/products', color: theme.secondary },
        { label: 'Credit Ledger', icon: 'cash', route: '/udhar', color: theme.success },
      ];
    } else if (categoryId === 'electronics_store' || categoryId === 'mobile_shop' || categoryId === 'solar') {
      actions = [
        { label: 'Warranty POS', icon: 'receipt', route: '/bills', color: theme.primary },
        { label: 'Track Warranty', icon: 'shield-checkmark', route: '/warranty', color: theme.secondary },
        { label: 'Product Serial', icon: 'cube', route: '/products', color: theme.warning },
        { label: 'Customer Credit', icon: 'cash', route: '/udhar', color: theme.success },
      ];
    } else {
      // General / Retail
      actions = [
        { label: 'New POS Bill', icon: 'cart', route: '/bills', color: theme.primary },
        { label: 'Products Catalog', icon: 'cube', route: '/products', color: theme.secondary },
        { label: 'Credit Ledger', icon: 'wallet', route: '/udhar', color: theme.warning },
        { label: 'Expenses', icon: 'card', route: '/expenses', color: theme.danger },
      ];
    }

    return (
      <View style={styles.quickActionsGrid}>
        {actions.map((act, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.quickActionBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            onPress={() => router.push(act.route as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.quickActionIconContainer, { backgroundColor: act.color + '15' }]}>
              <Ionicons name={act.icon as any} size={22} color={act.color} />
            </View>
            <Text style={[styles.quickActionText, { color: theme.text }]} numberOfLines={1}>
              {act.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // ─── Dynamic Industry Live Feed / Activity Section ──────────────────────────────────
  const renderDynamicIndustryFeed = () => {
    // Restaurant Live Table Status
    if (categoryId === 'restaurant' || categoryId === 'dhaba' || categoryId === 'cafe') {
      if (restaurantTables.length === 0) return null;
      return (
        <View style={styles.feedSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>🍽️ Dining Room Tables</Text>
            <TouchableOpacity onPress={() => router.push('/restaurant' as any)}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>Open Floor Map →</Text>
            </TouchableOpacity>
          </View>
          <Card style={styles.domainCard}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
              {restaurantTables.slice(0, 8).map(table => {
                const isVacant = table.status === 'available';
                return (
                  <TouchableOpacity
                    key={table.id}
                    style={{
                      flex: 1,
                      minWidth: '22%',
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: isVacant ? theme.success + '12' : theme.warning + '18',
                      borderColor: isVacant ? theme.success + '40' : theme.warning + '50',
                      borderWidth: 1,
                      alignItems: 'center',
                    }}
                    onPress={() => router.push('/restaurant' as any)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>
                      T-{table.tableNumber}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: isVacant ? theme.success : theme.warning, marginTop: 2 }}>
                      {isVacant ? 'Vacant' : 'Occupied'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        </View>
      );
    }

    // Gym Due / Expiring Members
    if (categoryId === 'gym' || categoryId === 'fitness_center') {
      if (gymDueMembers.length === 0) return null;
      return (
        <View style={styles.feedSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>⚠️ Membership Renewals Due</Text>
            <TouchableOpacity onPress={() => router.push('/gym' as any)}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>View All →</Text>
            </TouchableOpacity>
          </View>
          <Card style={styles.domainCard}>
            {gymDueMembers.map((m, idx) => (
              <View key={m.id}>
                {idx > 0 && <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />}
                <TouchableOpacity
                  style={styles.domainRow}
                  onPress={() => router.push('/gym' as any)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.domainRowTitle, { color: theme.text }]}>{m.name}</Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                      {m.planName} · {m.phone}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.danger }}>
                      {m.feeStatus === 'due' ? 'Fee Overdue' : 'Expired'}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                      PKR {m.planPrice.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </Card>
        </View>
      );
    }

    // Salon Today's Appointments
    if (categoryId === 'beauty_salon' || categoryId === 'spa') {
      if (salonAppointments.length === 0) return null;
      return (
        <View style={styles.feedSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>💅 Today's Salon Schedule</Text>
            <TouchableOpacity onPress={() => router.push('/salon' as any)}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>Appointment Book →</Text>
            </TouchableOpacity>
          </View>
          <Card style={styles.domainCard}>
            {salonAppointments.map((apt, idx) => (
              <View key={apt.id}>
                {idx > 0 && <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />}
                <TouchableOpacity
                  style={styles.domainRow}
                  onPress={() => router.push(`/salon/${apt.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.domainRowTitle, { color: theme.text }]}>{apt.customerName}</Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                      {apt.serviceName} · 🕒 {apt.appointmentTime}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.primary }}>
                      PKR {apt.price.toFixed(0)}
                    </Text>
                    <View style={{ backgroundColor: theme.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: theme.primary, textTransform: 'capitalize' }}>
                        {apt.status}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </Card>
        </View>
      );
    }

    // Tailor In Progress Orders
    if (categoryId === 'tailor') {
      if (tailorOrders.length === 0) return null;
      return (
        <View style={styles.feedSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>🧵 Active Stitching Pipeline</Text>
            <TouchableOpacity onPress={() => router.push('/tailor' as any)}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>Orders Ledger →</Text>
            </TouchableOpacity>
          </View>
          <Card style={styles.domainCard}>
            {tailorOrders.map((ord, idx) => (
              <View key={ord.id}>
                {idx > 0 && <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />}
                <TouchableOpacity
                  style={styles.domainRow}
                  onPress={() => router.push(`/tailor/${ord.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.domainRowTitle, { color: theme.text }]}>
                      #{ord.orderNumber} · {ord.customerName}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                      {ord.itemType} · Delivery: {ord.deliveryDate}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.warning, textTransform: 'capitalize' }}>
                      {ord.status}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                      Due: PKR {ord.balanceDue.toFixed(0)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </Card>
        </View>
      );
    }

    // Pharmacy Expiring Batches
    if (categoryId === 'pharmacy' || categoryId === 'medical_store') {
      if (expiringBatches.length === 0) return null;
      return (
        <View style={styles.feedSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>💊 Critical Expiry Radar (&lt;30 Days)</Text>
            <TouchableOpacity onPress={() => router.push('/pharmacy' as any)}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.danger }}>Manage Batches →</Text>
            </TouchableOpacity>
          </View>
          <Card style={styles.domainCard}>
            {expiringBatches.map((batch, idx) => (
              <View key={batch.id}>
                {idx > 0 && <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />}
                <View style={styles.domainRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.domainRowTitle, { color: theme.text }]}>{batch.productName}</Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                      Batch: {batch.batchNumber} · Qty: {batch.quantity}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.danger }}>
                      Expires {batch.expiryDate}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </View>
      );
    }

    return null;
  };

  return (
    <ScreenWrapper
      title={`Vaypar · ${category.label}`}
      headerRight={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>

          {/* Theme toggle */}
          <TouchableOpacity
            style={[styles.themeToggleBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={15} color={theme.primary} />
          </TouchableOpacity>
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loadingData} onRefresh={onRefresh} colors={[theme.primary]} />}
      >
        <View style={styles.responsiveContainer}>

          {/* Web Dashboard Title Banner */}
          {Platform.OS === 'web' && (
            <View style={{ marginBottom: 18, marginTop: 4 }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>
                Dashboard
              </Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '500', marginTop: 2 }}>
                Real-time sales, inventory, and financial overview for {user?.businessName || 'your store'}.
              </Text>
            </View>
          )}

          {/* Mobile Profile & Business Hero banner */}
          {Platform.OS !== 'web' && (
            <View style={[styles.welcomeContainer, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <TouchableOpacity onPress={() => setDrawerVisible(true)} activeOpacity={0.7}>
                <BusinessLogo size={46} borderRadius={12} fontSize={18} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.welcomeSub, { color: theme.textSecondary }]}>
                  {user?.name || 'Shop Owner'} · {category.group}
                </Text>
                <Text style={[styles.welcomeTitle, { color: theme.text }]} numberOfLines={1}>
                  {user?.businessName || 'My Business'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.themeToggleBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                onPress={() => setProfileMenuVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="person-circle-outline" size={18} color={theme.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Profile Menu Dropdown */}
          <ProfileMenuDropdown
            visible={profileMenuVisible}
            onClose={() => setProfileMenuVisible(false)}
          />

          {/* Mobile sidebar drawer */}
          <SidebarDrawer
            visible={drawerVisible}
            onClose={() => setDrawerVisible(false)}
          />

          {/* Dynamic Industry KPI Metric Cards (4 Vault Cards) */}
          <View nativeID="tour-metrics" testID="tour-metrics">
            {renderDynamicKPICards()}
          </View>

          {/* Middle Row: Stock Volume Chart & Custom Tags Table */}
          <View style={{
            flexDirection: isMobile ? 'column' : 'row',
            gap: 16,
            marginBottom: 16,
          }}>
            {/* Left: Total Stock Volume vs Consume Rate Chart */}
            <View nativeID="tour-revenue-chart" testID="tour-revenue-chart" style={{ flex: isMobile ? undefined : 1.2 }}>
              <InteractiveRevenueChart invoices={invoices} expenses={expenses} />
            </View>

            {/* Right: Custom Tags & Labels Table Card (Real Products from SQLite Database) */}
            <View nativeID="tour-inventory" testID="tour-inventory" style={{ flex: isMobile ? undefined : 1.1, marginVertical: isMobile ? 0 : 14 }}>
              <Card style={{ backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1, borderRadius: 20, padding: 18, height: isMobile ? undefined : '100%', justifyContent: 'space-between' }}>
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text, letterSpacing: -0.3 }}>
                        Product Inventory & Tags
                      </Text>
                      <Text style={{ fontSize: 11, color: '#888E9B', fontWeight: '500' }}>
                        {products.length} Real Registered Items
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push('/products')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F4F5F7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
                    >
                      <Ionicons name="add-circle-outline" size={14} color="#111318" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#111318' }}>Manage</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Filter Tag Pills */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 14 }}>
                    {[
                      { label: 'All', value: 'All' },
                      { label: 'Fast Moving', value: 'Fast Moving' },
                      { label: 'Low Stock', value: 'Low Stock' },
                      { label: 'Dead Item', value: 'Dead Item' },
                      { label: 'Discounted', value: 'Discounted' },
                    ].map((tag) => (
                      <TouchableOpacity
                        key={tag.value}
                        onPress={() => setActiveProductTag(tag.value)}
                        style={{
                          backgroundColor: activeProductTag === tag.value ? '#16171B' : '#F4F5F7',
                          borderWidth: 1,
                          borderColor: activeProductTag === tag.value ? '#16171B' : '#E5E7EB',
                          paddingHorizontal: 11,
                          paddingVertical: 5,
                          borderRadius: 14,
                        }}
                      >
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: activeProductTag === tag.value ? '#FFFFFF' : '#6C727F'
                        }}>
                          {tag.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Table Header */}
                  <View style={{ flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                    <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: '#9AA1B0' }}>Product Details</Text>
                    <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#9AA1B0', textAlign: 'center' }}>Stock Qty</Text>
                    <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#9AA1B0', textAlign: 'center' }}>Min Alert</Text>
                    <Text style={{ flex: 0.9, fontSize: 11, fontWeight: '700', color: '#9AA1B0', textAlign: 'center' }}>Price</Text>
                    <Text style={{ flex: 0.6, fontSize: 11, fontWeight: '700', color: '#9AA1B0', textAlign: 'right' }}>Action</Text>
                  </View>

                  {/* Real Table Rows */}
                  {displayedProducts.length > 0 ? (
                    displayedProducts.map((p, rIdx) => (
                      <View key={p.id || rIdx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: rIdx < displayedProducts.length - 1 ? 1 : 0, borderBottomColor: '#F9FAFB' }}>
                        <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#F4F5F7', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons
                              name={categoryId === 'mobile_shop' ? 'phone-portrait-outline' : categoryId === 'pharmacy' ? 'medkit-outline' : 'cube-outline'}
                              size={13}
                              color="#111318"
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#111318' }} numberOfLines={1}>{p.name}</Text>
                            <Text style={{ fontSize: 10, color: '#9AA1B0' }}>{p.sku ? `SKU: ${p.sku}` : `ID: ${p.id.slice(0, 6)}`}</Text>
                          </View>
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: p.quantity <= (p.lowStockThreshold || 5) ? '#DC2626' : '#111318', textAlign: 'center' }}>
                          {p.quantity} {p.unit || 'pcs'}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#6C727F', textAlign: 'center' }}>
                          {p.lowStockThreshold || 5}
                        </Text>
                        <Text style={{ flex: 0.9, fontSize: 12, fontWeight: '700', color: '#111318', textAlign: 'center' }}>
                          {p.price.toLocaleString('en-IN')}
                        </Text>
                        <View style={{ flex: 0.6, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                          <TouchableOpacity onPress={() => router.push('/products')}>
                            <Ionicons name="create-outline" size={15} color="#888E9B" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                      <Ionicons name="cube-outline" size={36} color="#9AA1B0" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111318', marginTop: 8 }}>
                        {products.length === 0 ? 'No products registered yet' : 'No products match this tag filter'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#888E9B', textAlign: 'center', marginTop: 2, marginBottom: 12 }}>
                        {products.length === 0 ? 'Add your real products to track live stock, sales and billing.' : 'Switch filter tag to view other items.'}
                      </Text>
                      {products.length === 0 && (
                        <TouchableOpacity
                          style={{ backgroundColor: '#16171B', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12 }}
                          onPress={() => router.push('/products')}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>+ Add Real Product</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </Card>
            </View>
          </View>

          {/* Bottom Row: 3 Widget Cards (Sales & Order, AI Restock, Still Not Arrived) */}
          <View style={{
            flexDirection: isMobile ? 'column' : 'row',
            gap: 16,
            marginBottom: 20,
          }}>
            {/* Widget 1: Real Sales & Order */}
            <View style={{ flex: isMobile ? undefined : 1.2 }}>
              <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#EAECEF', borderWidth: 1, borderRadius: 20, padding: 18, height: '100%', justifyContent: 'space-between' }}>
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#111318' }}>Sales & Orders</Text>
                    <TouchableOpacity
                      onPress={() => router.push('/bills')}
                      style={{ backgroundColor: '#F4F5F7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' }}
                    >
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#111318' }}>Open POS ↗</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                    <Text style={{ flex: 1.4, fontSize: 10.5, fontWeight: '700', color: '#9AA1B0' }}>Customer / Order</Text>
                    <Text style={{ flex: 0.9, fontSize: 10.5, fontWeight: '700', color: '#9AA1B0', textAlign: 'center' }}>Amount</Text>
                    <Text style={{ flex: 0.7, fontSize: 10.5, fontWeight: '700', color: '#9AA1B0', textAlign: 'center' }}>Status</Text>
                  </View>

                  {recentSalesList.length > 0 ? (
                    recentSalesList.map((inv, pIdx) => (
                      <View key={inv.id || pIdx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: pIdx < recentSalesList.length - 1 ? 1 : 0, borderBottomColor: '#F9FAFB' }}>
                        <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#F4F5F7', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="receipt-outline" size={14} color="#111318" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#111318' }} numberOfLines={1}>
                              {inv.customerName || `Invoice #${inv.id.slice(0, 6).toUpperCase()}`}
                            </Text>
                            <Text style={{ fontSize: 9.5, color: '#9AA1B0' }}>
                              CASH
                            </Text>
                          </View>
                        </View>
                        <Text style={{ flex: 0.9, fontSize: 11.5, fontWeight: '700', color: '#111318', textAlign: 'center' }}>
                          {inv.total.toLocaleString('en-IN')}
                        </Text>
                        <View style={{ flex: 0.7, alignItems: 'center' }}>
                          <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
                            <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#16A34A' }}>
                              PAID
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))
                  ) : products.length > 0 ? (
                    products.slice(0, 4).map((p, pIdx) => (
                      <View key={p.id || pIdx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: pIdx < 3 ? 1 : 0, borderBottomColor: '#F9FAFB' }}>
                        <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#F4F5F7', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="cube-outline" size={14} color="#111318" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#111318' }} numberOfLines={1}>{p.name}</Text>
                            <Text style={{ fontSize: 9.5, color: p.quantity <= (p.lowStockThreshold || 5) ? '#DC2626' : '#9AA1B0' }}>
                              {p.quantity > 0 ? `${p.quantity} in stock` : 'Out of stock'}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ flex: 0.9, fontSize: 11.5, fontWeight: '700', color: '#111318', textAlign: 'center' }}>
                          {p.price.toLocaleString('en-IN')}
                        </Text>
                        <View style={{ flex: 0.7, alignItems: 'center' }}>
                          <View style={{ backgroundColor: p.quantity > 0 ? '#DCFCE7' : '#FEE2E2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
                            <Text style={{ fontSize: 9.5, fontWeight: '800', color: p.quantity > 0 ? '#16A34A' : '#DC2626' }}>
                              {p.quantity > 0 ? 'READY' : 'LOW'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <Ionicons name="receipt-outline" size={28} color="#9AA1B0" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#111318', marginTop: 4 }}>
                        No sales recorded yet
                      </Text>
                      <Text style={{ fontSize: 10, color: '#888E9B', textAlign: 'center', marginTop: 2 }}>
                        Use POS terminal to generate customer bills.
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            </View>

            {/* Widget 2: Real AI Restock Recommendation */}
            <View style={{ flex: 1 }}>
              <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#EAECEF', borderWidth: 1, borderRadius: 20, padding: 18, height: '100%', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#111318', marginBottom: 10 }}>
                    Restock & Stock Health
                  </Text>

                  {/* Sparkline mini wave container */}
                  <View style={{ height: 80, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 8, justifyContent: 'center', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#9AA1B0' }}>Inventory Health</Text>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: lowStockItems.length === 0 ? '#22C55E' : '#EAB308' }}>
                        {products.length > 0 ? `${Math.round(((products.length - lowStockItems.length) / products.length) * 100)}% Stocked` : '100%'}
                      </Text>
                    </View>
                    <View style={{ height: 4, width: '100%', backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${products.length > 0 ? Math.max(10, Math.round(((products.length - lowStockItems.length) / products.length) * 100)) : 100}%`, backgroundColor: lowStockItems.length === 0 ? '#22C55E' : '#F59E0B' }} />
                    </View>
                  </View>

                  <Text style={{ fontSize: 11, color: '#888E9B', fontWeight: '500' }}>
                    {lowStockItems.length > 0 ? 'Items running low on stock' : 'All inventory levels are healthy'}
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: lowStockItems.length > 0 ? '#DC2626' : '#111318', marginTop: 2, marginBottom: 14 }}>
                    {lowStockItems.length} Low Stock Items
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => router.push('/products')}
                    style={{
                      flex: 1, backgroundColor: '#16171B', paddingVertical: 8, borderRadius: 18, alignItems: 'center'
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>View Inventory</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push('/products')}
                    style={{
                      flex: 1, backgroundColor: '#F4F5F7', borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: 8, borderRadius: 18, alignItems: 'center'
                    }}
                  >
                    <Text style={{ color: '#111318', fontSize: 12, fontWeight: '700' }}>Restock</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            </View>

            {/* Widget 3: Real Low Stock / Reorder Alert */}
            <View style={{ flex: 1 }}>
              <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#EAECEF', borderWidth: 1, borderRadius: 20, padding: 18, height: '100%', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#111318', marginBottom: 10 }}>
                    Reorder & Critical Stock
                  </Text>

                  {lowStockItems.length > 0 ? (
                    lowStockItems.slice(0, 4).map((s, sIdx) => (
                      <View key={s.id || sIdx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="alert-circle-outline" size={13} color="#DC2626" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#111318' }} numberOfLines={1}>{s.name}</Text>
                            <Text style={{ fontSize: 9, color: '#9AA1B0' }}>{s.quantity} {s.unit || 'pcs'} left</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => router.push('/products')}
                          style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}
                        >
                          <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#DC2626' }}>Reorder</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <Ionicons name="checkmark-circle-outline" size={32} color="#22C55E" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#111318', marginTop: 6 }}>
                        All Stock Up to Date
                      </Text>
                      <Text style={{ fontSize: 10.5, color: '#888E9B', textAlign: 'center', marginTop: 2 }}>
                        No critical reorders or shortages detected.
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => router.push('/products')}
                  style={{
                    backgroundColor: '#16171B', paddingVertical: 8, borderRadius: 18, alignItems: 'center', marginTop: 10
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>All Products ({products.length})</Text>
                </TouchableOpacity>
              </Card>
            </View>
          </View>

          {/* Industry Tailored Quick Actions Cockpit */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
              {category.label} Cockpit
            </Text>
            <View style={{ backgroundColor: theme.primary + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ color: theme.primary, fontSize: 10, fontWeight: '700' }}>
                {category.group}
              </Text>
            </View>
          </View>
          {renderDynamicQuickActions()}

          {/* Specialized Domain Live Feeds (Table occupancy, appointments, tailor orders, etc.) */}
          {renderDynamicIndustryFeed()}

          {/* Core Financial summary ledger (Owners & Managers only) */}
          {hasReportsAccess && (
            <Card style={[styles.metricsCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={[styles.metricsTitle, { color: theme.textSecondary }]}>Net Ledger Profit</Text>
                <View style={{ backgroundColor: (metrics.netProfit >= 0 ? theme.success : theme.danger) + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ color: metrics.netProfit >= 0 ? theme.success : theme.danger, fontSize: 11, fontWeight: '700' }}>
                    {metrics.netProfit >= 0 ? 'Profitable' : 'Deficit'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.metricsValue, { color: theme.text }]}>
                {metrics.netProfit >= 0 ? '+' : ''}{metrics.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
              
              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <View style={styles.metricsBreakdown}>
                <TouchableOpacity 
                  style={[styles.metricsBox, { cursor: 'pointer' } as any]} 
                  onPress={() => router.push('/revenue' as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.metricLabelRow}>
                    <View style={[styles.dot, { backgroundColor: theme.success }]} />
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Total Revenue</Text>
                  </View>
                  <Text style={[styles.metricSubValue, { color: theme.text }]}>
                    {metrics.totalSales.toLocaleString('en-IN')}
                  </Text>
                </TouchableOpacity>
                
                <View style={[styles.verticalDivider, { backgroundColor: theme.border }]} />

                <View style={styles.metricsBox}>
                  <View style={styles.metricLabelRow}>
                    <View style={[styles.dot, { backgroundColor: theme.danger }]} />
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Operational Cost</Text>
                  </View>
                  <Text style={[styles.metricSubValue, { color: theme.text }]}>
                    {metrics.totalExpenses.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            </Card>
          )}

          {/* Recent Activity Panel */}
          <RecentActivityPanel maxItems={4} />

          {/* Recent Sales / Transactions List */}
          <View style={styles.ledgerSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Recent Sales Feed</Text>
              <TouchableOpacity onPress={() => router.push('/bills')}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>View POS History →</Text>
              </TouchableOpacity>
            </View>
            <Card style={styles.ledgerCard}>
              {recentInvoices.length === 0 ? (
                <View style={styles.emptyLedger}>
                  <Ionicons name="document-text-outline" size={38} color={theme.textSecondary + '55'} />
                  <Text style={[styles.emptyLedgerText, { color: theme.textSecondary }]}>
                    No sales recorded yet. Tap New POS Bill!
                  </Text>
                </View>
              ) : (
                recentInvoices.map((item, index) => {
                  const formattedDate = new Date(item.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <View key={item.id}>
                      {index > 0 && <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />}
                      <TouchableOpacity 
                        style={styles.ledgerRow}
                        onPress={() => handleOpenReceipt(item)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.ledgerInfo}>
                          <Text style={[styles.ledgerClient, { color: theme.text }]}>
                            {item.customerName || 'Walk-in Customer'}
                          </Text>
                          <Text style={[styles.ledgerDate, { color: theme.textSecondary }]}>
                            #{item.id.substring(0, 8).toUpperCase()} • {formattedDate}
                          </Text>
                        </View>
                        <View style={styles.ledgerAmountRow}>
                          <Text style={[styles.ledgerAmountText, { color: theme.success }]}>
                            {item.total.toFixed(2)}
                          </Text>
                          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} style={{ marginLeft: 6 }} />
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </Card>
          </View>

          {/* Low Stock Alerts */}
          {lowStockProducts.length > 0 && (
            <View style={styles.alertSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Low Stock Radar</Text>
                <View style={[styles.alertCountBadge, { backgroundColor: theme.danger }]}>
                  <Text style={styles.alertCountText}>{lowStockProducts.length} Reorder</Text>
                </View>
              </View>
              
              <Card style={styles.alertCard}>
                {lowStockProducts.slice(0, 3).map((item, index) => (
                  <View key={item.id}>
                    {index > 0 && <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />}
                    <TouchableOpacity 
                      style={styles.alertItemRow}
                      onPress={() => router.push('/products')}
                      activeOpacity={0.7}
                    >
                      <View style={styles.alertItemInfo}>
                        <Text style={[styles.alertItemName, { color: theme.text }]}>{item.name}</Text>
                        <Text style={[styles.alertItemCategory, { color: theme.textSecondary }]}>
                          Category: {item.category || 'General'}
                        </Text>
                      </View>
                      <View style={styles.alertItemStock}>
                        <Text style={[styles.alertStockText, { color: theme.danger }]}>
                          {item.quantity} left
                        </Text>
                        <Text style={[styles.alertThresholdText, { color: theme.textSecondary }]}>
                          Limit: {item.lowStockThreshold}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}
              </Card>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Styled Receipts Modal */}
      <ReceiptModal 
        visible={receiptVisible}
        invoice={selectedInvoice}
        items={selectedInvoiceItems}
        onClose={() => {
          setReceiptVisible(false);
          setSelectedInvoice(null);
          setSelectedInvoiceItems([]);
        }}
      />

      {/* Category Selection Modal */}
      <Modal
        visible={categoryModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.categoryModalContainer, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.modalHeaderRow, { borderBottomColor: theme.border }]}>
              <View>
                <Text style={[styles.modalHeading, { color: theme.text }]}>Switch Industry Mode</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Instantly reconfigure dashboard, modules, & tools for any business.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={[styles.modalSearchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="search" size={16} color={theme.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.modalSearchInput, { color: theme.text }]}
                placeholder="Search 36 industry categories..."
                placeholderTextColor={theme.textSecondary + '80'}
                value={categorySearch}
                onChangeText={setCategorySearch}
              />
              {categorySearch ? (
                <TouchableOpacity onPress={() => setCategorySearch('')}>
                  <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Industry Group Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {['All', ...CATEGORY_GROUPS].map(grp => {
                const isSelected = selectedGroupFilter === grp;
                return (
                  <TouchableOpacity
                    key={grp}
                    style={[
                      styles.groupFilterChip,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.background,
                        borderColor: isSelected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setSelectedGroupFilter(grp)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : theme.textSecondary }}>
                      {grp}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Categories List */}
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {filteredCategories.map(cat => {
                const isActive = cat.id === categoryId;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryOptionRow,
                      {
                        backgroundColor: isActive ? theme.primary + '12' : theme.background,
                        borderColor: isActive ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => handleQuickSwitchCategory(cat.id)}
                    disabled={switchingCategory}
                  >
                    <Text style={{ fontSize: 28, marginRight: 12 }}>{cat.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.categoryOptionTitle, { color: theme.text }]}>{cat.label}</Text>
                        <View style={{ backgroundColor: theme.primary + '18', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: theme.primary }}>{cat.group}</Text>
                        </View>
                      </View>
                      <Text style={[styles.categoryOptionDesc, { color: theme.textSecondary }]}>
                        {cat.description}
                      </Text>
                    </View>
                    {isActive ? (
                      <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={theme.border} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Card>
        </View>
      </Modal>

      {/* Today's Invoices Detail Modal */}
      <Modal
        visible={showTodayInvoices}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTodayInvoices(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.detailModalContainer, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.modalHeaderRow, { borderBottomColor: theme.border }]}>
              <View>
                <Text style={[styles.modalHeading, { color: theme.text }]}>{"Today's Sales Invoices"}</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Total Revenue: {todayStats.todaySales.toLocaleString('en-IN')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTodayInvoices(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {todayInvoices.length === 0 ? (
                <View style={styles.emptyLedger}>
                  <Ionicons name="receipt-outline" size={40} color={theme.textSecondary + '60'} />
                  <Text style={[styles.emptyLedgerText, { color: theme.textSecondary }]}>
                    No invoices generated today yet.
                  </Text>
                </View>
              ) : (
                todayInvoices.map((item) => {
                  const timeStr = new Date(item.createdAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <TouchableOpacity 
                      key={item.id}
                      style={[styles.modalItemRow, { borderBottomColor: theme.border }]}
                      onPress={() => {
                        setShowTodayInvoices(false);
                        handleOpenReceipt(item);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1.5 }}>
                        <Text style={[styles.modalItemTitle, { color: theme.text }]} numberOfLines={1}>
                          {item.customerName || 'Walk-in Customer'}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                          #{item.id.substring(0, 8).toUpperCase()} • {timeStr}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: theme.success, flex: 1, textAlign: 'right' }}>
                        {item.total.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Card>
        </View>
      </Modal>

      {/* Catalog Items Modal */}
      <Modal
        visible={showCatalog}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCatalog(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.detailModalContainer, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.modalHeaderRow, { borderBottomColor: theme.border }]}>
              <View>
                <Text style={[styles.modalHeading, { color: theme.text }]}>Product Catalog Items</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Distinct items: {todayStats.totalProducts} registered
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCatalog(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {products.length === 0 ? (
                <View style={styles.emptyLedger}>
                  <Ionicons name="cube-outline" size={40} color={theme.textSecondary + '60'} />
                  <Text style={[styles.emptyLedgerText, { color: theme.textSecondary }]}>
                    No products cataloged yet.
                  </Text>
                </View>
              ) : (
                products.map((item) => {
                  const isLow = item.quantity <= item.lowStockThreshold;
                  return (
                    <View 
                      key={item.id}
                      style={[styles.modalItemRow, { borderBottomColor: theme.border }]}
                    >
                      <View style={{ flex: 1.5 }}>
                        <Text style={[styles.modalItemTitle, { color: theme.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                          Category: {item.category || 'General'}
                        </Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.primary }}>
                          {item.price.toFixed(2)}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: isLow ? theme.danger : theme.success }}>
                          Stock: {item.quantity} left
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </Card>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

function ProfileMenuDropdown({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  if (!visible || !user) return null;

  const handleAction = (path: string) => {
    onClose();
    if (path === 'logout') {
      Alert.alert('Sign Out', 'Are you sure you want to sign out from Vaypar?', [
        { text: 'Cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout }
      ]);
      return;
    }
    router.push(path as any);
  };

  const menuItems = [
    { label: 'My Profile & Business Info', icon: 'business-outline', action: '/settings' },
    { label: 'Switch Category', icon: 'swap-horizontal-outline', action: '/settings' },
    { label: 'Staff Management', icon: 'people-outline', action: '/staff' },
    { label: 'Theme & Preferences', icon: 'color-palette-outline', action: '/settings' },
    { label: 'Logout', icon: 'log-out-outline', action: 'logout', danger: true },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.dropdownContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.dropdownHeader}>
            <BusinessLogo size={44} borderRadius={10} fontSize={18} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.dropdownBizName, { color: theme.text }]} numberOfLines={1}>
                {user.businessName || 'My Business'}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary, textTransform: 'uppercase' }}>
                {user.role} · Multi-Business POS
              </Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
            {menuItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.dropdownItem}
                onPress={() => handleAction(item.action)}
              >
                <Ionicons
                  name={item.icon as any}
                  size={18}
                  color={item.danger ? '#EF4444' : theme.textSecondary}
                  style={{ marginRight: 12 }}
                />
                <Text style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: item.danger ? '#EF4444' : theme.text,
                  flex: 1
                }}>
                  {item.label}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={item.danger ? '#EF4444' + '80' : theme.border}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
  },
  responsiveContainer: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },

  welcomeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  welcomeSub: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  categoryHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  categoryHeaderPillText: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 120,
  },
  syncBadge: {
    padding: 6,
    borderRadius: 16,
  },
  themeToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  kpiContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    alignItems: 'flex-start',
  },
  kpiIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  metricsCard: {
    padding: 18,
    borderRadius: 20,
    marginBottom: 16,
  },
  metricsTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricsValue: {
    fontSize: 26,
    fontWeight: '800',
    marginVertical: 6,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 12,
  },
  metricsBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricsBox: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  metricSubValue: {
    fontSize: 15,
    fontWeight: '700',
    paddingLeft: 14,
  },
  verticalDivider: {
    width: 1,
    height: '100%',
    marginHorizontal: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  quickActionIconContainer: {
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  quickActionText: {
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  feedSection: {
    marginBottom: 16,
  },
  domainCard: {
    padding: 4,
    borderRadius: 16,
  },
  domainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  domainRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  ledgerSection: {
    marginBottom: 16,
  },
  ledgerCard: {
    padding: 0,
    borderRadius: 18,
    overflow: 'hidden',
  },
  emptyLedger: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyLedgerText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  ledgerInfo: {
    flex: 1.5,
  },
  ledgerClient: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  ledgerDate: {
    fontSize: 11,
    fontWeight: '600',
  },
  ledgerAmountRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  ledgerAmountText: {
    fontSize: 14,
    fontWeight: '800',
  },
  alertSection: {
    marginBottom: 16,
  },
  alertCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  alertCountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  alertCard: {
    padding: 0,
    borderRadius: 18,
    overflow: 'hidden',
  },
  rowDivider: {
    height: 1,
  },
  alertItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  alertItemInfo: {
    flex: 1,
  },
  alertItemName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  alertItemCategory: {
    fontSize: 11,
    fontWeight: '500',
  },
  alertItemStock: {
    alignItems: 'flex-end',
  },
  alertStockText: {
    fontSize: 13,
    fontWeight: '700',
  },
  alertThresholdText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  categoryModalContainer: {
    width: '100%',
    maxHeight: '85%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  detailModalContainer: {
    width: '100%',
    maxHeight: '80%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    paddingBottom: 12,
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  groupFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  categoryOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  categoryOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  categoryOptionDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  modalScroll: {
    flexGrow: 0,
    marginBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownContainer: {
    width: 290,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    marginBottom: 8,
  },
  dropdownBizName: {
    fontSize: 15,
    fontWeight: '800',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.03)',
  },
});
