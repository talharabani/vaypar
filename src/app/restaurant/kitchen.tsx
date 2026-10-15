import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import { KitchenTicket } from '../../components/restaurant/KitchenTicket';
import { NotificationContainer, useToasts } from '../../components/restaurant/NotificationToast';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useRestaurantSync } from '../../hooks/useRestaurantSync';
import {
  KitchenStation, RestaurantOrder, OrderItem,
  getActiveKitchenOrders, getOrderItems, updateOrderStatus,
  updateItemStatus, getTables,
  RestaurantTable, initRestaurantSchema,
} from '../../services/restaurantDb';

const STATIONS: { key: KitchenStation; label: string; icon: string; color: string }[] = [
  { key: 'grill',   label: 'Grill',   icon: 'flame',          color: '#EF4444' },
  { key: 'pizza',   label: 'Pizza',   icon: 'pizza',          color: '#F97316' },
  { key: 'chinese', label: 'Chinese', icon: 'restaurant',     color: '#F59E0B' },
  { key: 'bar',     label: 'Bar',     icon: 'wine',           color: '#8B5CF6' },
  { key: 'dessert', label: 'Dessert', icon: 'ice-cream',      color: '#EC4899' },
  { key: 'general', label: 'All',     icon: 'grid',           color: '#6D5DF6' },
];

const playNewOrderSound = async () => {
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://cdn.freesound.org/previews/411/411088_5121236-lq.mp3' }
    );
    await sound.playAsync();
  } catch (e) {
    console.warn('Could not play sound', e);
  }
};

export default function KitchenScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  const [activeStation, setActiveStation] = useState<KitchenStation>('general');
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [itemsMap, setItemsMap] = useState<Record<string, OrderItem[]>>({});
  const [tablesMap, setTablesMap] = useState<Record<string, string>>({}); // tableId → tableNumber
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const prevOrdersLenRef = React.useRef(0);

  // Live tick for timers every second
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadTables = useCallback(async () => {
    if (!user) return;
    const tbls = await getTables(user.businessId);
    const map: Record<string, string> = {};
    tbls.forEach((t: RestaurantTable) => { map[t.id] = t.tableNumber; });
    setTablesMap(map);
  }, [user]);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    const allOrders = await getActiveKitchenOrders(user.businessId);
    let filtered = allOrders;
    if (activeStation !== 'general') {
      const ordersWithStation: RestaurantOrder[] = [];
      for (const o of allOrders) {
        const items = await getOrderItems(o.id);
        if (items.some(i => i.kitchenStation === activeStation)) {
          ordersWithStation.push(o);
        }
      }
      filtered = ordersWithStation;
    }
    setOrders(filtered);
    const map: Record<string, OrderItem[]> = {};
    for (const o of filtered) {
      let items = await getOrderItems(o.id);
      if (activeStation !== 'general') {
        items = items.filter(i => i.kitchenStation === activeStation);
      }
      map[o.id] = items;
    }
    setItemsMap(map);
    
    // Play sound if new orders arrived
    if (filtered.length > prevOrdersLenRef.current && prevOrdersLenRef.current > 0) {
      playNewOrderSound();
    }
    prevOrdersLenRef.current = filtered.length;
  }, [user, activeStation]);

  const loadAll = useCallback(async () => {
    await loadTables();
    await loadOrders();
  }, [loadTables, loadOrders]);

  useEffect(() => {
    initRestaurantSchema().then(loadAll);
  }, [loadAll]);

  useRestaurantSync(loadAll);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleAcceptOrder = useCallback(async (order: RestaurantOrder) => {
    await updateOrderStatus(order.id, 'accepted', order.sessionId);
    pushToast('new_order', 'Order Accepted', `${tablesMap[order.tableId] ?? 'Table'} order has been accepted.`);
    await loadOrders();
  }, [tablesMap, loadOrders, pushToast]);

  const handleStartPreparing = useCallback(async (order: RestaurantOrder) => {
    await updateOrderStatus(order.id, 'preparing', order.sessionId);
    pushToast('new_order', 'Preparing', `${tablesMap[order.tableId] ?? 'Table'} order is now being prepared.`);
    await loadOrders();
  }, [tablesMap, loadOrders, pushToast]);

  const handleMarkReady = useCallback(async (order: RestaurantOrder) => {
    await updateOrderStatus(order.id, 'ready', order.sessionId);
    pushToast('order_ready', 'Order Ready!', `${tablesMap[order.tableId] ?? 'Table'} — Food is ready for service.`);
    await loadOrders();
  }, [tablesMap, loadOrders, pushToast]);

  const handleMarkItemReady = useCallback(async (itemId: string) => {
    await updateItemStatus(itemId, 'ready');
    await loadOrders();
  }, [loadOrders]);

  const stationCfg = STATIONS.find(s => s.key === activeStation)!;
  const waitingCount = orders.filter(o => o.status === 'pending' || o.status === 'accepted').length;
  const preparingCount = orders.filter(o => o.status === 'preparing').length;
  const readyCount = orders.filter(o => o.status === 'ready').length;

  return (
    <View style={[styles.kdsContainer, { backgroundColor: theme.background }]}>
      <NotificationContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Station Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stationBar} contentContainerStyle={styles.stationBarContent}>
        {STATIONS.map(s => (
          <TouchableOpacity
            key={s.key}
            onPress={() => { setActiveStation(s.key); }}
            style={[
              styles.stationTab,
              {
                backgroundColor: activeStation === s.key ? s.color : theme.backgroundElement,
                borderColor: activeStation === s.key ? s.color : theme.border,
              },
            ]}
          >
            <Ionicons name={s.icon as any} size={16} color={activeStation === s.key ? '#FFFFFF' : s.color} />
            <Text style={[styles.stationLabel, { color: activeStation === s.key ? '#FFFFFF' : s.color }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={[styles.statPill, { backgroundColor: '#F97316' + '20', borderColor: theme.border }]}>
          <Text style={[styles.statNum, { color: '#F97316' }]}>{waitingCount}</Text>
          <Text style={[styles.statLabel, { color: '#F97316' }]}>Waiting</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: '#F59E0B' + '20', borderColor: theme.border }]}>
          <Text style={[styles.statNum, { color: '#F59E0B' }]}>{preparingCount}</Text>
          <Text style={[styles.statLabel, { color: '#F59E0B' }]}>Preparing</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: '#22C55E' + '20', borderColor: theme.border }]}>
          <Text style={[styles.statNum, { color: '#22C55E' }]}>{readyCount}</Text>
          <Text style={[styles.statLabel, { color: '#22C55E' }]}>Ready</Text>
        </View>
      </View>

      {/* Orders */}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {orders.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🍳</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Kitchen is clear!</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {activeStation === 'general' ? 'No active orders right now.' : `No orders for ${stationCfg.label} station.`}
            </Text>
          </View>
        ) : (
          orders.map(order => (
            <KitchenTicket
              key={order.id + tick}
              order={order}
              items={itemsMap[order.id] ?? []}
              tableNumber={tablesMap[order.tableId] ?? `Table`}
              onAcceptOrder={() => handleAcceptOrder(order)}
              onStartPreparing={() => handleStartPreparing(order)}
              onMarkReady={() => handleMarkReady(order)}
              onMarkItemReady={handleMarkItemReady}
              readOnly={!(user?.role === 'kitchen' || user?.role === 'cook')}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  kdsContainer: { flex: 1 },
  stationBar: { flexGrow: 0 },
  stationBarContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  stationTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    marginRight: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2
  },
  stationLabel: { fontSize: 14, fontWeight: '800' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 12 },
  statPill: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  statNum: { fontSize: 26, fontWeight: '900' },
  statLabel: { fontSize: 12, fontWeight: '800', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  content: { padding: 16, paddingBottom: 120 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 24, fontWeight: '800', marginTop: 16 },
  emptySubtitle: { fontSize: 16, fontWeight: '500', marginTop: 8 },
});
