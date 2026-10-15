import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Platform, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import * as tailorDb from '../../services/tailorDb';

function formatPKR(n: number) {
  return `PKR ${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
}

export default function TailorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [stats, setStats] = useState<tailorDb.TailorStats | null>(null);
  const [orders, setOrders] = useState<tailorDb.TailorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<tailorDb.OrderStatus | 'all'>('all');

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      await tailorDb.initTailorTables();
      const [s, o] = await Promise.all([
        tailorDb.getTailorStats(businessId),
        tailorDb.getTailorOrders(businessId),
      ]);
      setStats(s);
      setOrders(o);
    } catch (e) {
      console.error('Tailor load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleNextStatus = async (order: tailorDb.TailorOrder) => {
    const cfg = tailorDb.STATUS_CONFIG[order.status];
    if (!cfg.next) return;
    try {
      await tailorDb.updateOrderStatus(order.id, cfg.next);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const filtered = orders.filter(o => {
    const matchSearch =
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.customerPhone.includes(search) ||
      o.orderNumber.toString().includes(search) ||
      o.itemType.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (selectedStatus !== 'all') return o.status === selectedStatus;
    return true;
  });

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Tailor Orders...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title="Tailor Orders">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>🧵 Tailor Shop</Text>
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
              {orders.length} orders · {formatPKR(stats?.pendingBalance ?? 0)} pending balance
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.push('/tailor/new-order')}
          >
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Pipeline Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pipelineRow}>
          {(['all', 'pending', 'cutting', 'stitching', 'trial', 'ready', 'delivered'] as const).map(st => {
            const isAll = st === 'all';
            const cfg = isAll ? null : tailorDb.STATUS_CONFIG[st];
            const count = isAll ? orders.length : orders.filter(o => o.status === st).length;
            const isSelected = selectedStatus === st;

            return (
              <TouchableOpacity
                key={st}
                onPress={() => setSelectedStatus(st)}
                style={[
                  styles.pipelineChip,
                  {
                    backgroundColor: isSelected ? (cfg?.color ?? theme.primary) : theme.backgroundElement,
                    borderColor: isSelected ? (cfg?.color ?? theme.primary) : theme.border,
                  },
                ]}
              >
                <Text style={{ color: isSelected ? '#FFF' : theme.text, fontWeight: '700', fontSize: 12 }}>
                  {isAll ? 'All' : cfg?.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by customer, phone, or order #..."
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Order Cards */}
        <View style={{ paddingHorizontal: 16 }}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cut-outline" size={64} color={theme.textSecondary + '30'} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {search ? 'No orders match your search.' : 'No orders found.\nTap + to create a new order.'}
              </Text>
            </View>
          ) : (
            filtered.map(order => {
              const cfg = tailorDb.STATUS_CONFIG[order.status];
              return (
                <TouchableOpacity
                  key={order.id}
                  onPress={() => router.push(`/tailor/${order.id}`)}
                  activeOpacity={0.8}
                  style={[styles.orderCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.orderBadge, { backgroundColor: theme.primary + '15' }]}>
                      <Text style={[styles.orderNum, { color: theme.primary }]}>#{order.orderNumber}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.custName, { color: theme.text }]}>{order.customerName}</Text>
                      <Text style={[styles.custPhone, { color: theme.textSecondary }]}>{order.customerPhone}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: cfg.color + '18' }]}>
                      <Ionicons name={cfg.icon as any} size={13} color={cfg.color} style={{ marginRight: 4 }} />
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

                  <View style={styles.cardDetails}>
                    <Text style={[styles.itemText, { color: theme.text }]}>
                      {order.quantity}x {order.itemType} {order.fabric ? `(${order.fabric})` : ''}
                    </Text>
                    <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                      Delivery: {formatDate(order.deliveryDate)}
                    </Text>
                  </View>

                  <View style={styles.cardFooter}>
                    <View>
                      <Text style={[styles.priceText, { color: theme.text }]}>
                        Total: {formatPKR(order.totalPrice)}
                      </Text>
                      {order.balanceDue > 0 ? (
                        <Text style={[styles.balanceText, { color: theme.danger }]}>
                          Due: {formatPKR(order.balanceDue)}
                        </Text>
                      ) : (
                        <Text style={[styles.paidText, { color: theme.success }]}>Fully Paid</Text>
                      )}
                    </View>

                    {cfg.next && (
                      <TouchableOpacity
                        style={[styles.nextBtn, { backgroundColor: cfg.color }]}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleNextStatus(order);
                        }}
                      >
                        <Text style={styles.nextBtnText}>
                          Move to {tailorDb.STATUS_CONFIG[cfg.next].label} →
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 2 },
  headerBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  pipelineRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  pipelineChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  orderCard: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12,
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }, default: { elevation: 2 } }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  orderBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  orderNum: { fontWeight: '800', fontSize: 14 },
  custName: { fontSize: 15, fontWeight: '700' },
  custPhone: { fontSize: 12 },
  statusPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cardDivider: { height: 1, marginVertical: 10 },
  cardDetails: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  itemText: { fontSize: 13, fontWeight: '600' },
  dateText: { fontSize: 12, fontWeight: '500' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceText: { fontSize: 13, fontWeight: '700' },
  balanceText: { fontSize: 12, fontWeight: '700' },
  paidText: { fontSize: 12, fontWeight: '700' },
  nextBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  nextBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
