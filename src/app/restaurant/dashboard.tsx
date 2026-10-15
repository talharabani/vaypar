import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import { useDatabase } from '../../context/DatabaseContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import { Card } from '../../components/Card';
import { initRestaurantSchema, getOrderHistory } from '../../services/restaurantDb';

function StatCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: string;
}) {
  const theme = useTheme();
  return (
    <Card
      style={[
        styles.statCard,
        { backgroundColor: theme.backgroundElement, borderColor: color + '30' },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.text }]}>{label}</Text>
      {sub && <Text style={[styles.statSub, { color: theme.textSecondary }]}>{sub}</Text>}
    </Card>
  );
}

export default function DashboardScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { invoices, expenses, staffList } = useDatabase();

  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const loadAll = useCallback(async () => {
    if (!user) return;
    try {
      await initRestaurantSchema();
      const history = await getOrderHistory('ALL', 50);
      setOrderHistory(history);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // Financial Aggregations
  const totalRevenue = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  }, [invoices]);

  const totalExpensesSum = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  }, [expenses]);

  const totalMonthlyPayroll = useMemo(() => {
    return staffList.reduce((sum, s) => sum + (s.salary || 0), 0);
  }, [staffList]);

  const netProfit = totalRevenue - totalExpensesSum - totalMonthlyPayroll;

  // Order Breakdown (Dining vs Takeaway)
  const diningSales = useMemo(() => {
    return orderHistory
      .filter((o) => o.tableNumber === 'Dining')
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [orderHistory]);

  const takeawaySales = useMemo(() => {
    return orderHistory
      .filter((o) => o.tableNumber === 'Takeaway')
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [orderHistory]);

  return (
    <ScreenWrapper title="Restaurant Stats">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Live Status Row */}
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={[styles.liveText, { color: theme.textSecondary }]}>
            LIVE STATS • Updated{' '}
            {lastRefreshed.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </Text>
        </View>

        {/* Primary Financial Overview Grid */}
        <View style={styles.kpiGrid}>
          <StatCard
            label="Total Revenue"
            value={`$${totalRevenue.toLocaleString()}`}
            color="#10B981"
            icon="wallet"
            sub="All product sales"
          />
          <StatCard
            label="Net Profit"
            value={`$${netProfit.toLocaleString()}`}
            color={netProfit >= 0 ? '#10B981' : '#EF4444'}
            icon="trending-up"
            sub="Revenue - Expenses - Salaries"
          />
          <StatCard
            label="Total Expenses"
            value={`$${totalExpensesSum.toLocaleString()}`}
            color="#EF4444"
            icon="receipt"
            sub="Operational expenses"
          />
          <StatCard
            label="Staff Payroll"
            value={`$${totalMonthlyPayroll.toLocaleString()}`}
            color="#6D5DF6"
            icon="people"
            sub="Monthly salaries"
          />
        </View>

        {/* Dining vs Takeaway Sales Split */}
        <Card style={[styles.sectionCard, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Sales Channel Breakdown
          </Text>
          <View style={styles.channelRow}>
            <View style={[styles.channelBox, { borderColor: theme.border }]}>
              <View style={[styles.channelIcon, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="restaurant" size={24} color={theme.primary} />
              </View>
              <Text style={[styles.channelValue, { color: theme.text }]}>
                ${diningSales.toLocaleString()}
              </Text>
              <Text style={[styles.channelLabel, { color: theme.textSecondary }]}>Dining Sales</Text>
            </View>

            <View style={[styles.channelBox, { borderColor: theme.border }]}>
              <View style={[styles.channelIcon, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="bag-handle" size={24} color="#F59E0B" />
              </View>
              <Text style={[styles.channelValue, { color: theme.text }]}>
                ${takeawaySales.toLocaleString()}
              </Text>
              <Text style={[styles.channelLabel, { color: theme.textSecondary }]}>
                Takeaway Sales
              </Text>
            </View>
          </View>
        </Card>

        {/* Recent Transactions List */}
        <Card style={[styles.sectionCard, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Recent Order Transactions
          </Text>
          {orderHistory.length === 0 ? (
            <Text style={{ color: theme.textSecondary, marginVertical: 12 }}>
              No orders completed yet today.
            </Text>
          ) : (
            orderHistory.slice(0, 10).map((ord) => (
              <View key={ord.id} style={[styles.transRow, { borderBottomColor: theme.border }]}>
                <View style={[styles.transBadge, { backgroundColor: ord.tableNumber === 'Dining' ? theme.primary + '20' : '#F59E0B20' }]}>
                  <Ionicons
                    name={ord.tableNumber === 'Dining' ? 'restaurant' : 'bag-handle'}
                    size={16}
                    color={ord.tableNumber === 'Dining' ? theme.primary : '#F59E0B'}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.transTitle, { color: theme.text }]}>
                    Order #{ord.id.slice(-6).toUpperCase()} • {ord.tableNumber || 'Sale'}
                  </Text>
                  <Text style={[styles.transDate, { color: theme.textSecondary }]}>
                    {ord.closedAt ? new Date(ord.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Completed'}
                  </Text>
                </View>
                <Text style={[styles.transAmount, { color: theme.primary }]}>
                  +${ord.totalAmount?.toFixed(2) || '0.00'}
                </Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100 },
  liveRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  liveText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, minWidth: '45%', padding: 14, borderRadius: 16, borderWidth: 1 },
  statIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  statSub: { fontSize: 11, marginTop: 2 },
  sectionCard: { padding: 16, borderRadius: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  channelRow: { flexDirection: 'row', gap: 12 },
  channelBox: { flex: 1, padding: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  channelIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  channelValue: { fontSize: 20, fontWeight: '800' },
  channelLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  transRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  transBadge: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  transTitle: { fontSize: 14, fontWeight: '700' },
  transDate: { fontSize: 12, marginTop: 2 },
  transAmount: { fontSize: 15, fontWeight: '800' },
});
