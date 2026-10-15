import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import * as gymDb from '../../services/gymDb';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

export default function AttendanceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [todayLog, setTodayLog] = useState<gymDb.GymAttendance[]>([]);
  const [members, setMembers] = useState<gymDb.GymMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  const today = new Date().toLocaleDateString('en-PK', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const load = useCallback(async () => {
    try {
      await gymDb.initGymTables();
      const [log, mem] = await Promise.all([
        gymDb.getTodayAttendance(businessId),
        gymDb.getGymMembers(businessId),
      ]);
      setTodayLog(log);
      setMembers(mem.filter(m => m.status === 'active'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleCheckIn = async (member: gymDb.GymMember) => {
    setCheckingIn(member.id);
    try {
      await gymDb.checkInMember(businessId, member, user?.id ?? '');
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setCheckingIn(null); }
  };

  const handleCheckOut = async (attId: string) => {
    await gymDb.checkOutMember(attId);
    load();
  };

  // Filter members for quick-search check-in
  const filteredMembers = search
    ? members.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.phone.includes(search)
      )
    : [];

  // Which memberIds are already checked in (without checkout) today?
  const checkedInIds = new Set(
    todayLog.filter(a => !a.checkOut).map(a => a.memberId)
  );

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title="Gym Attendance">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Attendance</Text>
          <Text style={[styles.headerSub, { color: theme.textSecondary }]}>{today}</Text>
        </View>
        <View style={[styles.countPill, { backgroundColor: theme.primary + '18' }]}>
          <Text style={[styles.countText, { color: theme.primary }]}>{todayLog.length} today</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Quick Check-In Search */}
        <View style={{ padding: 16 }}>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>Quick Check-In</Text>
          <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="search" size={16} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Type member name or phone…"
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

          {/* Search results */}
          {search !== '' && (
            <View style={[styles.searchResults, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              {filteredMembers.length === 0 ? (
                <Text style={[{ color: theme.textSecondary, padding: 12, fontSize: 13 }]}>No active members found.</Text>
              ) : (
                filteredMembers.map(m => {
                  const alreadyIn = checkedInIds.has(m.id);
                  const isLoading = checkingIn === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => !alreadyIn && handleCheckIn(m)}
                      style={[
                        styles.searchResultRow,
                        { borderBottomColor: theme.border },
                        alreadyIn && { opacity: 0.6 },
                      ]}
                    >
                      <View style={[styles.resultAvatar, { backgroundColor: theme.primary + '20' }]}>
                        <Text style={{ color: theme.primary, fontWeight: '800' }}>
                          {m.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[{ color: theme.text, fontWeight: '700' }]}>{m.name}</Text>
                        <Text style={[{ color: theme.textSecondary, fontSize: 12 }]}>{m.phone} · {m.planName}</Text>
                      </View>
                      {isLoading
                        ? <ActivityIndicator size="small" color={theme.primary} />
                        : alreadyIn
                          ? <View style={[styles.inPill, { backgroundColor: theme.success + '18' }]}>
                              <Ionicons name="checkmark" size={14} color={theme.success} />
                              <Text style={{ color: theme.success, fontSize: 12, fontWeight: '700', marginLeft: 3 }}>In</Text>
                            </View>
                          : <View style={[styles.checkInBtn, { backgroundColor: theme.primary }]}>
                              <Ionicons name="enter" size={14} color="#FFF" />
                              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700', marginLeft: 3 }}>Check In</Text>
                            </View>
                      }
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
        </View>

        {/* Today's Log */}
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>
            Today's Log · {todayLog.length} visit{todayLog.length !== 1 ? 's' : ''}
          </Text>

          {todayLog.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={56} color={theme.textSecondary + '40'} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No one checked in yet today.{'\n'}Use the search above to check in members.
              </Text>
            </View>
          ) : (
            todayLog.map(att => {
              const stillInside = !att.checkOut;
              return (
                <View key={att.id} style={[styles.attCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <View style={[styles.attAvatar, { backgroundColor: stillInside ? theme.success + '20' : theme.backgroundElement }]}>
                    <Ionicons
                      name={stillInside ? 'person' : 'person-outline'}
                      size={18}
                      color={stillInside ? theme.success : theme.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.attName, { color: theme.text }]}>{att.memberName}</Text>
                    <Text style={[styles.attTime, { color: theme.textSecondary }]}>
                      In: {formatTime(att.checkIn)}
                      {att.checkOut ? ` · Out: ${formatTime(att.checkOut)}` : ''}
                    </Text>
                  </View>
                  <View style={styles.attRight}>
                    {stillInside ? (
                      <>
                        <View style={[styles.inPill, { backgroundColor: theme.success + '18' }]}>
                          <View style={[styles.dot, { backgroundColor: theme.success }]} />
                          <Text style={{ color: theme.success, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>Inside</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.checkOutBtn, { borderColor: theme.danger, borderWidth: 1 }]}
                          onPress={() => handleCheckOut(att.id)}
                        >
                          <Text style={{ color: theme.danger, fontSize: 11, fontWeight: '700' }}>Check Out</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <View style={[styles.inPill, { backgroundColor: theme.border }]}>
                        <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>Left</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 2 },
  countPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  countText: { fontWeight: '800', fontSize: 14 },

  sectionLabel: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, padding: 12,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },

  searchResults: {
    borderWidth: 1, borderRadius: 12, marginTop: 8, overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultAvatar: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },

  inPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  checkInBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },

  attCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1,
    padding: 12, marginBottom: 10,
  },
  attAvatar: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  attName: { fontSize: 14, fontWeight: '700' },
  attTime: { fontSize: 12, marginTop: 2 },
  attRight: { alignItems: 'flex-end', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  checkOutBtn: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 22 },
});
