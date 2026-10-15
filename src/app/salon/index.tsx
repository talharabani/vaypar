import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, FlatList, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import * as salonDb from '../../services/salonDb';

function formatPKR(n: number): string {
  return `PKR ${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3B82F6',
  in_progress: '#F59E0B',
  completed: '#10B981',
  cancelled: '#EF4444',
  no_show: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

export default function SalonScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [stats, setStats] = useState<salonDb.SalonStats | null>(null);
  const [appointments, setAppointments] = useState<salonDb.SalonAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      await salonDb.initSalonTables();
      const [s, a] = await Promise.all([
        salonDb.getSalonStats(businessId),
        salonDb.getAppointments(businessId, selectedDate),
      ]);
      setStats(s);
      setAppointments(a);
    } catch (e) {
      console.error('Failed to load salon data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, selectedDate]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleStatusChange = async (id: string, newStatus: salonDb.AppointmentStatus) => {
    try {
      await salonDb.updateAppointmentStatus(id, newStatus);
      await load();
    } catch (err) {
      Alert.alert('Error', 'Failed to update appointment status');
    }
  };

  const getDateButtons = () => {
    const dates: { label: string; date: string }[] = [];
    for (let i = -1; i <= 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = i === -1 ? 'Yesterday' : i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
        : d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
      dates.push({ label: dayName, date: dateStr });
    }
    return dates;
  };

  const renderAppointment = ({ item }: { item: salonDb.SalonAppointment }) => {
    const statusColor = STATUS_COLORS[item.status] || theme.textSecondary;
    return (
      <TouchableOpacity
        style={[styles.appointmentCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        onPress={() => router.push(`/salon/${item.id}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.appointmentHeader}>
          <View style={styles.timeBlock}>
            <Ionicons name="time-outline" size={14} color={theme.primary} />
            <Text style={[styles.timeText, { color: theme.primary }]}>{item.appointmentTime}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[item.status]}</Text>
          </View>
        </View>

        <Text style={[styles.customerName, { color: theme.text }]} numberOfLines={1}>
          {item.customerName}
        </Text>

        <View style={styles.appointmentMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="cut-outline" size={13} color={theme.textSecondary} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.serviceName}
            </Text>
          </View>
          {item.staffName ? (
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={13} color={theme.textSecondary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.staffName}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.appointmentFooter}>
          <Text style={[styles.priceText, { color: theme.text }]}>{formatPKR(item.price)}</Text>
          <Text style={[styles.durationText, { color: theme.textSecondary }]}>{item.durationMinutes} min</Text>
        </View>

        {/* Quick actions */}
        {item.status === 'scheduled' && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: '#F59E0B' + '20' }]}
              onPress={() => handleStatusChange(item.id, 'in_progress')}
            >
              <Text style={[styles.quickBtnText, { color: '#F59E0B' }]}>Start</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: '#EF4444' + '20' }]}
              onPress={() => handleStatusChange(item.id, 'cancelled')}
            >
              <Text style={[styles.quickBtnText, { color: '#EF4444' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        {item.status === 'in_progress' && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: '#10B981' + '20' }]}
              onPress={() => handleStatusChange(item.id, 'completed')}
            >
              <Text style={[styles.quickBtnText, { color: '#10B981' }]}>Complete</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title="Salon">
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Salon</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.primary + '15' }]}
              onPress={() => router.push('/salon/services' as any)}
            >
              <Ionicons name="list-outline" size={20} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bookBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/salon/book' as any)}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={styles.bookBtnText}>Book</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Cards */}
        {stats && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: '#3B82F6' + '15' }]}>
              <Ionicons name="calendar" size={22} color="#3B82F6" />
              <Text style={[styles.statValue, { color: '#3B82F6' }]}>{stats.todayAppointments}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Today</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#10B981' + '15' }]}>
              <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.completedToday}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Done</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#F59E0B' + '15' }]}>
              <Ionicons name="time" size={22} color="#F59E0B" />
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.upcomingAppointments}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Upcoming</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#8B5CF6' + '15' }]}>
              <Ionicons name="cash" size={22} color="#8B5CF6" />
              <Text style={[styles.statValue, { color: '#8B5CF6' }]}>{formatPKR(stats.todayRevenue)}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Revenue</Text>
            </View>
          </ScrollView>
        )}

        {/* Date Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {getDateButtons().map((d) => (
            <TouchableOpacity
              key={d.date}
              style={[
                styles.dateBtn,
                {
                  backgroundColor: selectedDate === d.date ? theme.primary : theme.backgroundElement,
                  borderColor: selectedDate === d.date ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setSelectedDate(d.date)}
            >
              <Text
                style={[
                  styles.dateBtnText,
                  { color: selectedDate === d.date ? '#FFF' : theme.textSecondary },
                ]}
              >
                {d.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Appointments List */}
        <View style={styles.listSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Appointments ({appointments.length})
          </Text>

          {appointments.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Ionicons name="calendar-outline" size={48} color={theme.textSecondary + '40'} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Appointments</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                No appointments scheduled for this date.
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/salon/book' as any)}
              >
                <Text style={styles.emptyBtnText}>Book Appointment</Text>
              </TouchableOpacity>
            </View>
          ) : (
            appointments.map((apt) => (
              <View key={apt.id}>{renderAppointment({ item: apt })}</View>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
  },
  bookBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  statsRow: { paddingHorizontal: 20, gap: 12, paddingVertical: 12 },
  statCard: {
    width: 110, padding: 14, borderRadius: 16, alignItems: 'center', gap: 6,
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600' },
  dateRow: { paddingHorizontal: 20, gap: 8, paddingVertical: 8 },
  dateBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1,
  },
  dateBtnText: { fontSize: 13, fontWeight: '700' },
  listSection: { paddingHorizontal: 20, paddingTop: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  appointmentCard: {
    padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12,
  },
  appointmentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  timeBlock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 14, fontWeight: '700' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  customerName: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  appointmentMeta: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  metaText: { fontSize: 12, fontWeight: '500' },
  appointmentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceText: { fontSize: 15, fontWeight: '700' },
  durationText: { fontSize: 12, fontWeight: '500' },
  quickActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quickBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  quickBtnText: { fontSize: 13, fontWeight: '700' },
  emptyState: {
    padding: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center' },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 8 },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
