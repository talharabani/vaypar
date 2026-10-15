import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet, Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../hooks/use-theme';
import * as gymDb from '../../services/gymDb';

function formatPKR(n: number) {
  return `PKR ${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function daysLeft(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

// ─── Stat Widget ─────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub }: {
  icon: string; label: string; value: string | number; color: string; sub?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      {sub ? <Text style={[styles.statSub, { color: color }]}>{sub}</Text> : null}
    </View>
  );
}

// ─── Member Row ───────────────────────────────────────────────────────────────
function MemberRow({ member, onPress }: { member: gymDb.GymMember; onPress: () => void }) {
  const theme = useTheme();
  const days = daysLeft(member.membershipEnd);
  const expiringSoon = days <= 7 && days > 0 && member.status === 'active';
  const isExpired = member.status === 'expired';
  const isDue = member.feeStatus === 'due';

  const statusColor = isExpired
    ? theme.danger
    : isDue
      ? theme.warning
      : theme.success;

  const avatarColor =
    member.gender === 'female' ? '#EC4899' :
    member.gender === 'other' ? '#8B5CF6' : theme.primary;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.memberRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarColor + '20' }]}>
        <Text style={[styles.avatarText, { color: avatarColor }]}>
          {member.name.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Info */}
      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>{member.name}</Text>
        <Text style={[styles.memberPlan, { color: theme.textSecondary }]}>
          {member.planName} · {member.phone}
        </Text>
        {expiringSoon && (
          <Text style={[styles.expireText, { color: theme.warning }]}>
            ⚠ Expires in {days} day{days !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {/* Status */}
      <View style={styles.memberRight}>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {isExpired ? 'Expired' : isDue ? 'Fee Due' : 'Active'}
          </Text>
        </View>
        <Text style={[styles.memberFee, { color: theme.textSecondary }]}>
          {formatPKR(member.planPrice)}/mo
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GymScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [stats, setStats] = useState<gymDb.GymStats | null>(null);
  const [members, setMembers] = useState<gymDb.GymMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'due' | 'expired' | 'active'>('all');

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      await gymDb.initGymTables();
      await gymDb.seedDefaultPlans(businessId);
      await gymDb.refreshMemberFeeStatus(businessId);
      const [s, m] = await Promise.all([
        gymDb.getGymStats(businessId),
        gymDb.getGymMembers(businessId),
      ]);
      setStats(s);
      setMembers(m);
    } catch (e) {
      console.error('Gym load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = members.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.phone.includes(search);
    if (!matchSearch) return false;
    if (filter === 'due') return m.feeStatus === 'due' && m.status === 'active';
    if (filter === 'expired') return m.status === 'expired';
    if (filter === 'active') return m.status === 'active' && m.feeStatus === 'paid';
    return true;
  });

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Gym...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title="Gym Management">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>💪 Gym Management</Text>
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
              {stats?.totalMembers ?? 0} members total
            </Text>
          </View>
          <View style={styles.headerBtns}>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => router.push('/gym/attendance')}
            >
              <Ionicons name="scan-outline" size={18} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/gym/new-member')}
            >
              <Ionicons name="person-add" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard icon="people" label="Active" value={stats?.activeMembers ?? 0} color={theme.success} />
          <StatCard
            icon="warning"
            label="Fee Due"
            value={stats?.dueMembers ?? 0}
            color={theme.warning}
            sub={stats?.dueMembers ? 'Action needed' : undefined}
          />
          <StatCard icon="ban" label="Expired" value={stats?.expiredMembers ?? 0} color={theme.danger} />
          <StatCard icon="calendar" label="Today's Visits" value={stats?.todayAttendance ?? 0} color={theme.primary} />
        </View>

        {/* Monthly Revenue Banner */}
        <TouchableOpacity
          onPress={() => router.push('/gym/plans')}
          style={[styles.revenueBanner, { backgroundColor: theme.primary }]}
        >
          <View>
            <Text style={styles.revenueBannerLabel}>This Month's Revenue</Text>
            <Text style={styles.revenueBannerAmount}>{formatPKR(stats?.monthlyRevenue ?? 0)}</Text>
          </View>
          <View style={styles.revenueBannerRight}>
            <Text style={styles.revenueBannerAction}>Manage Plans →</Text>
          </View>
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            onPress={() => router.push('/gym/attendance')}
          >
            <Ionicons name="scan" size={22} color={theme.primary} />
            <Text style={[styles.quickBtnText, { color: theme.text }]}>Attendance</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            onPress={() => router.push('/gym/plans')}
          >
            <Ionicons name="list" size={22} color={theme.secondary} />
            <Text style={[styles.quickBtnText, { color: theme.text }]}>Plans</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            onPress={() => { setFilter('due'); }}
          >
            <Ionicons name="cash" size={22} color={theme.warning} />
            <Text style={[styles.quickBtnText, { color: theme.text }]}>Fee Due</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            onPress={() => router.push('/gym/new-member')}
          >
            <Ionicons name="add-circle" size={22} color={theme.success} />
            <Text style={[styles.quickBtnText, { color: theme.text }]}>Add Member</Text>
          </TouchableOpacity>
        </View>

        {/* Search & Filter */}
        <View style={[styles.searchRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search members…"
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

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['all', 'active', 'due', 'expired'] as const).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, {
                backgroundColor: filter === f ? theme.primary : theme.backgroundElement,
                borderColor: filter === f ? theme.primary : theme.border,
              }]}
            >
              <Text style={{ color: filter === f ? '#FFF' : theme.textSecondary, fontWeight: '700', fontSize: 12 }}>
                {f === 'all' ? 'All Members' : f === 'active' ? 'Active & Paid' : f === 'due' ? '⚠ Fee Due' : '✕ Expired'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Member List */}
        <View style={{ paddingHorizontal: 16 }}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="barbell-outline" size={64} color={theme.textSecondary + '30'} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {search ? 'No members match your search.' : filter !== 'all' ? `No ${filter} members found.` : 'No members yet.\nTap + to add your first member.'}
              </Text>
              {!search && filter === 'all' && (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
                  onPress={() => router.push('/gym/new-member')}
                >
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Add First Member</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filtered.map(m => (
              <MemberRow
                key={m.id}
                member={m}
                onPress={() => router.push(`/gym/member/${m.id}`)}
              />
            ))
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
  headerBtns: { flexDirection: 'row', gap: 10 },
  headerBtn: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    padding: 16,
  },
  statCard: {
    width: '47%', borderRadius: 14, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 4,
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }, default: { elevation: 2 } }),
  },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 26, fontWeight: '900' },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statSub: { fontSize: 11, fontWeight: '700' },

  revenueBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 16, borderRadius: 16, padding: 18,
    ...Platform.select({ web: { boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }, default: { elevation: 4 } }),
  },
  revenueBannerLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  revenueBannerAmount: { color: '#FFF', fontSize: 26, fontWeight: '900', marginTop: 2 },
  revenueBannerRight: { alignItems: 'flex-end' },
  revenueBannerAction: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' },

  quickRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  quickBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: 1, paddingVertical: 12, gap: 4,
  },
  quickBtnText: { fontSize: 11, fontWeight: '700' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, padding: 12, borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },

  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1,
    padding: 12, marginBottom: 10,
    ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }, default: { elevation: 1 } }),
  },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800' },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 15, fontWeight: '700' },
  memberPlan: { fontSize: 12, marginTop: 2 },
  expireText: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  memberRight: { alignItems: 'flex-end', gap: 4 },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  memberFee: { fontSize: 11 },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
});
