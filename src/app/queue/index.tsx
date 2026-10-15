import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import { useBusinessCategory } from '../../context/BusinessContext';
import { useDatabase } from '../../context/DatabaseContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { CustomerNameInput } from '../../components/CustomerNameInput';
import { CustomerPhoneInput } from '../../components/CustomerPhoneInput';
import * as queueDb from '../../services/queueDb';
import { validateCustomerName, validateCustomerPhone, detectCountryCode } from '../../utils/phoneUtils';

const STATUS_COLORS = {
  waiting: '#3B82F6',   // Blue
  serving: '#F59E0B',   // Yellow/Orange
  completed: '#10B981', // Green
  cancelled: '#EF4444', // Red
};

export default function QueueScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { categoryId } = useBusinessCategory();
  const { staffList } = useDatabase();
  const businessId = user?.businessId ?? '';

  // Dynamic Terminology Config
  const terminology = useMemo(() => {
    switch (categoryId) {
      case 'restaurant':
      case 'cafe':
      case 'dhaba':
        return {
          customerSingular: 'Guest',
          customerPlural: 'Guests',
          waitingStatus: 'Awaiting Table',
          activeStatus: 'Dining',
          statsWaiting: 'Waiting Parties',
          statsActive: 'Active Tables',
          avgWaitLabel: 'Avg Dining Wait',
          serviceFieldLabel: 'Preferred Section / Table Notes',
        };
      case 'beauty_salon':
      case 'spa':
        return {
          customerSingular: 'Client',
          customerPlural: 'Clients',
          waitingStatus: 'Awaiting Stylist',
          activeStatus: 'Undergoing Service',
          statsWaiting: 'Waiting Clients',
          statsActive: 'Active Sessions',
          avgWaitLabel: 'Avg Styling Wait',
          serviceFieldLabel: 'Service (e.g. Haircut, Facial)',
        };
      case 'clinic':
        return {
          customerSingular: 'Patient',
          customerPlural: 'Patients',
          waitingStatus: 'Awaiting Doctor',
          activeStatus: 'In Consultation',
          statsWaiting: 'Waiting Patients',
          statsActive: 'Active Consultations',
          avgWaitLabel: 'Avg Consult Wait',
          serviceFieldLabel: 'Reason for Visit / Treatment',
        };
      default:
        return {
          customerSingular: 'Customer',
          customerPlural: 'Customers',
          waitingStatus: 'Waiting',
          activeStatus: 'Serving',
          statsWaiting: 'Waiting Customers',
          statsActive: 'Active Sessions',
          avgWaitLabel: 'Avg Service Wait',
          serviceFieldLabel: 'Service Name',
        };
    }
  }, [categoryId]);

  // States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [queueItems, setQueueItems] = useState<queueDb.QueueItem[]>([]);
  const [stats, setStats] = useState<queueDb.QueueStats | null>(null);
  const [activeTab, setActiveTab] = useState<'waiting' | 'serving' | 'completed'>('waiting');
  
  // Add Customer Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [countryCode, setCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [serviceName, setServiceName] = useState('');
  const [partySize, setPartySize] = useState('1');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedStaffName, setSelectedStaffName] = useState('');
  const [estDuration, setEstDuration] = useState('30');
  const [custNotes, setCustNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Live Timer tick
  const [timeTick, setTimeTick] = useState(Date.now());

  const loadData = useCallback(async () => {
    if (!businessId) return;
    try {
      await queueDb.initQueueTables();
      const [items, s] = await Promise.all([
        queueDb.getQueueItems(businessId),
        queueDb.getQueueStats(businessId),
      ]);
      setQueueItems(items);
      setStats(s);
    } catch (e) {
      console.error('Failed to load queue database:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set up live timer tick every 15s to update wait durations
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Add customer to queue database
  const handleAddToQueue = async () => {
    setFormError('');
    if (!custName.trim()) {
      setFormError(`Please enter a ${terminology.customerSingular.toLowerCase()} name.`);
      return;
    }
    const nameVal = validateCustomerName(custName);
    if (!nameVal.isValid) {
      setFormError(nameVal.error || 'Customer name cannot contain numbers.');
      return;
    }

    let finalPhone = custPhone.trim();
    if (custPhone.trim()) {
      const phoneVal = validateCustomerPhone(custPhone, countryCode);
      if (!phoneVal.isValid) {
        setFormError(phoneVal.error || 'Please enter a valid phone number.');
        return;
      }
      finalPhone = phoneVal.fullPhone;
    }

    const pSize = parseInt(partySize, 10);
    if (isNaN(pSize) || pSize <= 0) {
      setFormError('Please enter a valid party size.');
      return;
    }

    const dur = parseInt(estDuration, 10);
    if (isNaN(dur) || dur <= 0) {
      setFormError('Please enter a valid estimated duration.');
      return;
    }

    try {
      const nowStr = new Date().toISOString();
      const newItem: queueDb.QueueItem = {
        id: 'q_' + Math.random().toString(36).substring(2, 11),
        businessId,
        customerName: custName.trim(),
        customerPhone: finalPhone,
        serviceName: serviceName.trim(),
        partySize: pSize,
        staffId: selectedStaffId,
        staffName: selectedStaffName,
        status: 'waiting',
        notes: custNotes.trim(),
        checkInTime: nowStr,
        servedAt: null,
        completedAt: null,
        estimatedDuration: dur,
        synced: 0,
        lastUpdated: nowStr,
        deleted: 0,
      };

      await queueDb.upsertQueueItem(newItem);
      setAddModalVisible(false);
      
      // Reset inputs
      setCustName('');
      setCustPhone('');
      setServiceName('');
      setPartySize('1');
      setSelectedStaffId('');
      setSelectedStaffName('');
      setEstDuration('30');
      setCustNotes('');

      await loadData();
    } catch (e) {
      setFormError('Failed to save to database.');
    }
  };

  const handleUpdateStatus = async (id: string, nextStatus: queueDb.QueueStatus) => {
    try {
      await queueDb.updateQueueStatus(id, nextStatus);
      await loadData();
    } catch (e) {
      Alert.alert('Error', 'Failed to update customer status');
    }
  };

  const handleDeleteItem = async (id: string) => {
    Alert.alert(
      'Delete Queue Entry',
      `Are you sure you want to remove this ${terminology.customerSingular.toLowerCase()} from the records?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await queueDb.deleteQueueItem(id);
              await loadData();
            } catch (e) {
              Alert.alert('Error', 'Failed to remove queue entry.');
            }
          },
        },
      ]
    );
  };

  // Filter items to show inside tabs
  const filteredQueueItems = useMemo(() => {
    return queueItems.filter((item) => {
      if (activeTab === 'waiting') return item.status === 'waiting';
      if (activeTab === 'serving') return item.status === 'serving';
      // Completed includes completed and cancelled for history
      return item.status === 'completed' || item.status === 'cancelled';
    });
  }, [queueItems, activeTab]);

  // Elapsed wait time formatting for card display
  const getElapsedTimeInfo = (item: queueDb.QueueItem) => {
    const checkIn = new Date(item.checkInTime).getTime();
    const served = item.servedAt ? new Date(item.servedAt).getTime() : null;
    const completed = item.completedAt ? new Date(item.completedAt).getTime() : null;

    if (item.status === 'waiting') {
      const elapsed = Math.max(0, timeTick - checkIn);
      const mins = Math.floor(elapsed / 60000);
      return `Waiting: ${mins} min${mins !== 1 ? 's' : ''}`;
    }

    if (item.status === 'serving') {
      const waitMins = served ? Math.round(Math.max(0, served - checkIn) / 60000) : 0;
      const serviceMins = served ? Math.round(Math.max(0, timeTick - served) / 60000) : 0;
      return `Waited: ${waitMins}m • Serving: ${serviceMins}m`;
    }

    if (item.status === 'completed') {
      const waitMins = served ? Math.round(Math.max(0, served - checkIn) / 60000) : 0;
      const serviceMins = served && completed ? Math.round(Math.max(0, completed - served) / 60000) : 0;
      return `Waited: ${waitMins}m • Served: ${serviceMins}m`;
    }

    return 'Cancelled';
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title="Queue OS">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Header Block */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Queue OS</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Manage flow of incoming {terminology.customerPlural.toLowerCase()}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            onPress={() => setAddModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.addButtonText}>Add {terminology.customerSingular}</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.statIconBadge, { backgroundColor: '#3B82F615' }]}>
                <Ionicons name="time" size={20} color="#3B82F6" />
              </View>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.waitingCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{terminology.statsWaiting}</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.statIconBadge, { backgroundColor: '#F59E0B15' }]}>
                <Ionicons name="people" size={20} color="#F59E0B" />
              </View>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.servingCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{terminology.statsActive}</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.statIconBadge, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.completedToday}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Completed Today</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.statIconBadge, { backgroundColor: '#8B5CF615' }]}>
                <Ionicons name="hourglass-outline" size={20} color="#8B5CF6" />
              </View>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.avgWaitMinutes}m</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{terminology.avgWaitLabel}</Text>
            </View>
          </View>
        )}

        {/* Tab Filters */}
        <View style={[styles.tabBar, { backgroundColor: theme.backgroundSelected }]}>
          {(['waiting', 'serving', 'completed'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const count = tab === 'waiting' ? stats?.waitingCount : tab === 'serving' ? stats?.servingCount : stats?.completedToday;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.tabButton,
                  isActive && { backgroundColor: theme.backgroundElement, borderColor: theme.border }
                ]}
                onPress={() => setActiveTab(tab)}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    { color: isActive ? theme.primary : theme.textSecondary }
                  ]}
                >
                  {tab === 'waiting' 
                    ? terminology.waitingStatus 
                    : tab === 'serving' 
                      ? terminology.activeStatus 
                      : 'History / Logs'}
                </Text>
                {count !== undefined && count > 0 && (
                  <View style={[styles.tabBadge, { backgroundColor: isActive ? theme.primary : theme.border }]}>
                    <Text style={[styles.tabBadgeText, { color: isActive ? '#FFF' : theme.textSecondary }]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Items List */}
        <View style={styles.listSection}>
          {filteredQueueItems.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Ionicons name="people-outline" size={48} color={theme.textSecondary + '40'} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Queue Empty</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                No customers are registered under this status.
              </Text>
              {activeTab === 'waiting' && (
                <Button
                  title={`Add First ${terminology.customerSingular}`}
                  onPress={() => setAddModalVisible(true)}
                  style={{ marginTop: 12 }}
                />
              )}
            </View>
          ) : (
            filteredQueueItems.map((item) => {
              const statusColor = STATUS_COLORS[item.status] || theme.textSecondary;
              const hasNotes = !!item.notes;
              
              return (
                <Card
                  key={item.id}
                  style={[styles.itemCard, { borderColor: theme.border }]}
                  hoverable
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.customerMeta}>
                      <Text style={[styles.customerName, { color: theme.text }]} numberOfLines={1}>
                        {item.customerName}
                      </Text>
                      {item.customerPhone ? (
                        <Text style={[styles.customerPhone, { color: theme.textSecondary }]}>
                          <Ionicons name="call-outline" size={12} /> {item.customerPhone}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[styles.statusText, { color: statusColor }]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Body Content */}
                  <View style={styles.cardBody}>
                    {item.serviceName ? (
                      <View style={styles.bodyRow}>
                        <Ionicons name="construct-outline" size={14} color={theme.textSecondary} />
                        <Text style={[styles.bodyText, { color: theme.text }]}>{item.serviceName}</Text>
                      </View>
                    ) : null}

                    <View style={styles.metaRow}>
                      <View style={styles.metaBadge}>
                        <Ionicons name="people-outline" size={13} color={theme.textSecondary} />
                        <Text style={[styles.metaBadgeText, { color: theme.text }]}>Party of {item.partySize}</Text>
                      </View>

                      {item.staffName ? (
                        <View style={styles.metaBadge}>
                          <Ionicons name="person-outline" size={13} color={theme.textSecondary} />
                          <Text style={[styles.metaBadgeText, { color: theme.text }]}>{item.staffName}</Text>
                        </View>
                      ) : null}

                      <View style={styles.metaBadge}>
                        <Ionicons name="alarm-outline" size={13} color={theme.textSecondary} />
                        <Text style={[styles.metaBadgeText, { color: theme.text }]}>{item.estimatedDuration}m est.</Text>
                      </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.border }]} />

                    <View style={styles.timerRow}>
                      <View style={styles.timerBlock}>
                        <Ionicons name="timer-outline" size={14} color={theme.primary} />
                        <Text style={[styles.timerText, { color: theme.text }]}>
                          {getElapsedTimeInfo(item)}
                        </Text>
                      </View>

                      {hasNotes && (
                        <TouchableOpacity
                          style={styles.notesIndicator}
                          onPress={() => Alert.alert('Queue Notes', item.notes)}
                        >
                          <Ionicons name="chatbox-ellipses-outline" size={16} color={theme.primary} />
                          <Text style={[styles.notesIndicatorText, { color: theme.primary }]} numberOfLines={1}>
                            Read Notes
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Actions Bar */}
                  <View style={styles.actionsBar}>
                    {item.status === 'waiting' && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: theme.primary + '15' }]}
                          onPress={() => handleUpdateStatus(item.id, 'serving')}
                        >
                          <Ionicons name="play" size={14} color={theme.primary} />
                          <Text style={[styles.actionBtnText, { color: theme.primary }]}>Serve</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#EF444415' }]}
                          onPress={() => handleUpdateStatus(item.id, 'cancelled')}
                        >
                          <Ionicons name="close" size={14} color="#EF4444" />
                          <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Cancel</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {item.status === 'serving' && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#10B98115' }]}
                          onPress={() => handleUpdateStatus(item.id, 'completed')}
                        >
                          <Ionicons name="checkmark" size={14} color="#10B981" />
                          <Text style={[styles.actionBtnText, { color: '#10B981' }]}>Complete</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#EF444415' }]}
                          onPress={() => handleUpdateStatus(item.id, 'cancelled')}
                        >
                          <Ionicons name="close" size={14} color="#EF4444" />
                          <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Cancel</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: theme.border }]}
                      onPress={() => handleDeleteItem(item.id)}
                    >
                      <Ionicons name="trash-outline" size={14} color={theme.textSecondary} />
                      <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ==========================================
          ADD TO QUEUE DIALOG MODAL
          ========================================== */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalHeading, { color: theme.text }]}>Add to Queue</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 24 }}>
              {formError ? <Text style={[styles.formErrorText, { color: theme.danger }]}>{formError}</Text> : null}

              <CustomerNameInput
                label={`${terminology.customerSingular} Name`}
                placeholder="Enter customer name..."
                value={custName}
                onChangeText={setCustName}
              />

              <CustomerPhoneInput
                label="Phone Number"
                value={custPhone}
                onChangeText={setCustPhone}
                selectedCountryCode={countryCode}
                onCountryCodeChange={setCountryCode}
              />

              <Input
                label={terminology.serviceFieldLabel}
                placeholder="Description of visit..."
                value={serviceName}
                onChangeText={setServiceName}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Input
                    label="Party Size"
                    keyboardType="numeric"
                    value={partySize}
                    onChangeText={setPartySize}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Input
                    label="Est. Duration (mins)"
                    keyboardType="numeric"
                    value={estDuration}
                    onChangeText={setEstDuration}
                  />
                </View>
              </View>

              {/* Staff Select Cards List */}
              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>Assign Staff Member</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.staffSelectRow}>
                <TouchableOpacity
                  style={[
                    styles.staffSelectCard,
                    {
                      backgroundColor: !selectedStaffId ? theme.primary + '15' : theme.backgroundElement,
                      borderColor: !selectedStaffId ? theme.primary : theme.border,
                    }
                  ]}
                  onPress={() => {
                    setSelectedStaffId('');
                    setSelectedStaffName('');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="person-outline" size={18} color={!selectedStaffId ? theme.primary : theme.textSecondary} />
                  <Text style={[styles.staffSelectName, { color: !selectedStaffId ? theme.primary : theme.text }]}>Anyone</Text>
                </TouchableOpacity>

                {staffList.filter(s => s.status === 'active').map((staff) => (
                  <TouchableOpacity
                    key={staff.id}
                    style={[
                      styles.staffSelectCard,
                      {
                        backgroundColor: selectedStaffId === staff.id ? theme.primary + '15' : theme.backgroundElement,
                        borderColor: selectedStaffId === staff.id ? theme.primary : theme.border,
                      }
                    ]}
                    onPress={() => {
                      setSelectedStaffId(staff.id);
                      setSelectedStaffName(staff.name);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="person" size={18} color={selectedStaffId === staff.id ? theme.primary : theme.textSecondary} />
                    <Text style={[styles.staffSelectName, { color: selectedStaffId === staff.id ? theme.primary : theme.text }]} numberOfLines={1}>
                      {staff.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Input
                label="Check-In Notes"
                placeholder="Special instructions or requests..."
                multiline
                numberOfLines={3}
                value={custNotes}
                onChangeText={setCustNotes}
                style={{ height: 64, textAlignVertical: 'top' }}
              />

              <Button
                title="Add Customer to Queue"
                onPress={handleAddToQueue}
                style={{ marginTop: 16 }}
              />
            </ScrollView>
          </Card>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSubtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: 100,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  statIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600' },

  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 20,
    marginBottom: 20,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  tabButtonText: { fontSize: 13, fontWeight: '700' },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabBadgeText: { fontSize: 10, fontWeight: '700' },

  listSection: { gap: 12 },
  emptyState: {
    padding: 36,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center' },

  itemCard: {
    padding: 16,
    marginVertical: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  customerMeta: { flex: 1 },
  customerName: { fontSize: 18, fontWeight: '800' },
  customerPhone: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },

  cardBody: { gap: 10 },
  bodyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bodyText: { fontSize: 14, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00000008',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  metaBadgeText: { fontSize: 11, fontWeight: '600' },

  divider: { height: 1, marginVertical: 4 },
  timerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timerBlock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { fontSize: 13, fontWeight: '700' },
  notesIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notesIndicatorText: { fontSize: 12, fontWeight: '700', maxWidth: 120 },

  actionsBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flex: 1,
    minWidth: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    borderWidth: 1,
    padding: 0,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalHeading: { fontSize: 18, fontWeight: '800' },
  modalCloseBtn: { padding: 4 },
  modalScroll: { paddingHorizontal: 20, paddingTop: 12 },
  modalLabel: { fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 8, marginLeft: 6 },
  formErrorText: { fontSize: 13, fontWeight: '600', marginBottom: 12, marginLeft: 6 },
  formRow: { flexDirection: 'row', justifyContent: 'space-between' },
  
  staffSelectRow: { flexDirection: 'row', marginBottom: 12 },
  staffSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 90,
  },
  staffSelectName: { fontSize: 12, fontWeight: '700' },
});
