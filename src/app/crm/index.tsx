import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet, Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../hooks/use-theme';
import * as crmDb from '../../services/crmDb';

export default function CrmIndexScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [customers, setCustomers] = useState<crmDb.CrmCustomer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<crmDb.CrmCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Extract all unique tags
  const allTags = React.useMemo(() => {
    const tagsSet = new Set<string>();
    customers.forEach((c) => {
      if (c.tags) {
        c.tags.split(',').forEach((t) => tagsSet.add(t.trim()));
      }
    });
    return Array.from(tagsSet);
  }, [customers]);

  const loadData = useCallback(async () => {
    if (!businessId) return;
    try {
      await crmDb.initCrmTables();
      const list = await crmDb.getCrmCustomers(businessId);
      setCustomers(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Handle Search and Tag Filter
  useEffect(() => {
    let result = customers;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }
    if (selectedTag) {
      result = result.filter((c) =>
        c.tags.split(',').map((t) => t.trim().toLowerCase()).includes(selectedTag.toLowerCase())
      );
    }
    setFilteredCustomers(result);
  }, [search, selectedTag, customers]);

  // Birthday reminder helper
  const getBirthdayReminder = (birthday: string) => {
    if (!birthday) return false;
    try {
      const today = new Date();
      const bdate = new Date(birthday);
      return today.getMonth() === bdate.getMonth() && today.getDate() === bdate.getDate();
    } catch {
      return false;
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= rating ? 'star' : 'star-outline'}
          size={12}
          color={i <= rating ? '#F59E0B' : '#D1D5DB'}
        />
      );
    }
    return <View style={styles.starsRow}>{stars}</View>;
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
    <ScreenWrapper title="CRM — Customers">
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profiles</Text>
          <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
            Customer Profiles & CRM
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={() => router.push('/crm/add' as any)}
        >
          <Ionicons name="person-add" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Search and Filters */}
      <View style={styles.filterSection}>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by name, phone or email..."
            placeholderTextColor={theme.textSecondary + '80'}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Tag Filters */}
        {allTags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagScroll}>
            <TouchableOpacity
              style={[
                styles.tagChip,
                {
                  backgroundColor: !selectedTag ? theme.primary : theme.backgroundElement,
                  borderColor: !selectedTag ? theme.primary : theme.border
                }
              ]}
              onPress={() => setSelectedTag(null)}
            >
              <Text style={{ color: !selectedTag ? '#FFF' : theme.textSecondary, fontSize: 11, fontWeight: '700' }}>
                All Tags
              </Text>
            </TouchableOpacity>
            {allTags.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.tagChip,
                  {
                    backgroundColor: selectedTag === t ? theme.primary : theme.backgroundElement,
                    borderColor: selectedTag === t ? theme.primary : theme.border
                  }
                ]}
                onPress={() => setSelectedTag(t)}
              >
                <Text style={{ color: selectedTag === t ? '#FFF' : theme.textSecondary, fontSize: 11, fontWeight: '700' }}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Customer List */}
      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No Customers Registered"
            description="Start building your client ledger. Add customer tags, WhatsApp chat details, and loyalty point configurations."
            actionLabel="Add Customer Profile"
            onAction={() => router.push('/crm/add' as any)}
          />
        }
        renderItem={({ item }) => {
          const hasBirthdayToday = getBirthdayReminder(item.birthday);
          return (
            <TouchableOpacity
              style={[
                styles.customerCard,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: item.isVip ? '#F59E0B' : theme.border,
                  borderWidth: item.isVip ? 1.5 : 1
                }
              ]}
              onPress={() => router.push(`/crm/${item.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.nameRow}>
                  <Text style={[styles.customerName, { color: theme.text }]}>{item.name}</Text>
                  {item.isVip === 1 ? (
                    <View style={styles.vipBadge}>
                      <Ionicons name="ribbon" size={12} color="#FFF" />
                      <Text style={styles.vipText}>VIP</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.loyaltyText, { color: theme.primary }]}>
                  {item.loyaltyPoints} Pts
                </Text>
              </View>

              <Text style={[styles.phoneText, { color: theme.textSecondary }]}>{item.phone}</Text>

              {/* Badges / Rating Row */}
              <View style={styles.cardFooter}>
                <View style={styles.tagsRow}>
                  {item.tags.split(',').map((tag) => {
                    const cleanTag = tag.trim();
                    if (!cleanTag) return null;
                    return (
                      <View key={cleanTag} style={[styles.tagBadge, { backgroundColor: theme.primary + '10' }]}>
                        <Text style={[styles.tagBadgeText, { color: theme.primary }]}>{cleanTag}</Text>
                      </View>
                    );
                  })}
                </View>
                {renderStars(item.rating)}
              </View>

              {/* Birthday Banner */}
              {hasBirthdayToday && (
                <View style={[styles.birthdayBanner, { backgroundColor: '#10B981' + '15' }]}>
                  <Ionicons name="gift" size={14} color="#10B981" />
                  <Text style={[styles.birthdayText, { color: '#10B981' }]}>
                    Birthday is Today! Wish them on WhatsApp.
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  filterSection: { paddingHorizontal: 20, marginBottom: 12, gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: 1
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  tagScroll: { gap: 8, paddingVertical: 4 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  customerCard: { padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customerName: { fontSize: 17, fontWeight: '800' },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8
  },
  vipText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  loyaltyText: { fontSize: 14, fontWeight: '700' },
  phoneText: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  tagBadgeText: { fontSize: 10, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: 2 },
  birthdayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 10,
    marginTop: 10
  },
  birthdayText: { fontSize: 11, fontWeight: '700' }
});
