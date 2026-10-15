import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    Linking,
    ScrollView,
    StyleSheet, Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useAuth } from '../../context/AuthContext';
import { useRecentActivity } from '../../context/RecentActivityContext';
import { useTheme } from '../../hooks/use-theme';
import * as crmDb from '../../services/crmDb';

export default function CustomerProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';
  const { id } = useLocalSearchParams<{ id: string }>();

  const [customer, setCustomer] = useState<crmDb.CrmCustomer | null>(null);
  const [whatsappLogs, setWhatsappLogs] = useState<crmDb.WhatsappLog[]>([]);
  const [loyaltyTx, setLoyaltyTx] = useState<crmDb.LoyaltyTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // WhatsApp chat simulation input
  const [message, setMessage] = useState('');
  const [pointsAmount, setPointsAmount] = useState('');

  const loadData = async () => {
    if (!id) return;
    try {
      const c = await crmDb.getCrmCustomerById(id);
      if (c) {
        setCustomer(c);
        const [wLogs, lTx] = await Promise.all([
          crmDb.getWhatsappLogs(id),
          crmDb.getLoyaltyTransactions(id)
        ]);
        setWhatsappLogs(wLogs);
        setLoyaltyTx(lTx);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const { logVisit } = useRecentActivity();
  useEffect(() => {
    if (customer) {
      logVisit({
        recordId: customer.id,
        type: 'customer',
        title: customer.name,
        subtitle: `${customer.phone}${customer.tags ? ` · ${customer.tags.split(',')[0]}` : ''}`,
        icon: 'person',
        color: '#3B82F6',
        route: `/crm/${customer.id}`,
      });
    }
  }, [customer]);

  const handleSendSimulationMsg = async () => {
    if (!message.trim() || !customer) return;
    try {
      await crmDb.logWhatsappMessage(customer.id, businessId, 'business', message.trim());
      setMessage('');
      const logs = await crmDb.getWhatsappLogs(customer.id);
      setWhatsappLogs(logs);
      
      // Auto reply simulation after 1.5 seconds
      setTimeout(async () => {
        await crmDb.logWhatsappMessage(customer.id, businessId, 'customer', 'JazakAllah! Thank you for the update.');
        const updatedLogs = await crmDb.getWhatsappLogs(customer.id);
        setWhatsappLogs(updatedLogs);
      }, 1500);

    } catch (err) {
      Alert.alert('Error', 'Failed to log message');
    }
  };

  const handleUpdatePoints = async (type: 'earn' | 'redeem') => {
    if (!pointsAmount || !customer) return;
    const pts = parseInt(pointsAmount, 10);
    if (isNaN(pts) || pts <= 0) {
      Alert.alert('Invalid', 'Please enter a valid positive number.');
      return;
    }

    const finalPts = type === 'earn' ? pts : -pts;
    const desc = type === 'earn' ? 'Earned on purchase' : 'Redeemed points';

    try {
      await crmDb.addLoyaltyPoints(customer.id, businessId, finalPts, desc);
      setPointsAmount('');
      Alert.alert('Success', `${pts} points ${type === 'earn' ? 'added' : 'redeemed'}!`);
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to update points');
    }
  };

  const launchRealWhatsapp = () => {
    if (!customer) return;
    const formattedPhone = customer.phone.replace(/[^0-9]/g, '');
    const url = `whatsapp://send?phone=${formattedPhone}&text=Dear ${customer.name}, greeting from Vaypar.`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'WhatsApp is not installed on this device');
    });
  };

  const handleDelete = async () => {
    if (!customer) return;
    Alert.alert('Delete profile', 'Are you sure you want to delete this customer profile?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await crmDb.deleteCrmCustomer(customer.id);
          router.back();
        }
      }
    ]);
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

  if (!customer) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>Customer not found.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title={customer.name}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Profile Overview</Text>
        <TouchableOpacity onPress={handleDelete} style={styles.backBtn}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Customer VIP Card */}
        <View style={[styles.vipCard, { backgroundColor: customer.isVip ? '#F59E0B' : theme.primary }]}>
          <View style={styles.vipHeader}>
            <Text style={styles.vipTag}>{customer.isVip ? 'PREMIUM VIP' : 'CUSTOMER MEMBER'}</Text>
            <Ionicons name={customer.isVip ? 'ribbon' : 'card'} size={24} color="#FFF" />
          </View>
          <Text style={styles.vipName}>{customer.name}</Text>
          <Text style={styles.vipPhone}>{customer.phone}</Text>
          <View style={styles.vipFooter}>
            <View>
              <Text style={styles.footerLabel}>LOYALTY BALANCE</Text>
              <Text style={styles.footerValue}>{customer.loyaltyPoints} Points</Text>
            </View>
            <TouchableOpacity style={styles.waBtn} onPress={launchRealWhatsapp}>
              <Ionicons name="logo-whatsapp" size={16} color="#FFF" />
              <Text style={styles.waBtnText}>WhatsApp Chat</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile details */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Basic Details</Text>
          <View style={[styles.detailBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {customer.email ? (
              <View style={styles.detailRow}>
                <Ionicons name="mail" size={16} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>{customer.email}</Text>
              </View>
            ) : null}
            {customer.address ? (
              <View style={styles.detailRow}>
                <Ionicons name="location" size={16} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>{customer.address}</Text>
              </View>
            ) : null}
            {customer.birthday ? (
              <View style={styles.detailRow}>
                <Ionicons name="gift" size={16} color={theme.textSecondary} />
                <Text style={[styles.detailText, { color: theme.text }]}>Birthday: {customer.birthday}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Notes */}
        {customer.notes ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Customer Notes</Text>
            <View style={[styles.detailBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border, padding: 14 }]}>
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>{customer.notes}</Text>
            </View>
          </View>
        ) : null}

        {/* Loyalty Point Management */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Manage Loyalty Points</Text>
          <View style={[styles.detailBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border, padding: 14, gap: 10 }]}>
            <TextInput
              style={[styles.pointsInput, { color: theme.text, borderColor: theme.border }]}
              placeholder="Enter Points Amount"
              placeholderTextColor={theme.textSecondary + '80'}
              value={pointsAmount}
              onChangeText={setPointsAmount}
              keyboardType="numeric"
            />
            <View style={styles.pointsActions}>
              <TouchableOpacity style={[styles.ptsBtn, { backgroundColor: '#10B981' }]} onPress={() => handleUpdatePoints('earn')}>
                <Text style={styles.ptsBtnText}>Earn Points</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ptsBtn, { backgroundColor: '#EF4444' }]} onPress={() => handleUpdatePoints('redeem')}>
                <Text style={styles.ptsBtnText}>Redeem Points</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Simulated WhatsApp Chat History */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>WhatsApp History (Simulated)</Text>
          <View style={[styles.chatContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ScrollView style={{ height: 180, padding: 10 }} nestedScrollEnabled>
              {whatsappLogs.length === 0 ? (
                <Text style={{ color: theme.textSecondary, textAlign: 'center', marginVertical: 20 }}>No messages yet</Text>
              ) : (
                whatsappLogs.map((log) => {
                  const isBiz = log.sender === 'business';
                  return (
                    <View
                      key={log.id}
                      style={[
                        styles.msgBubble,
                        isBiz ? styles.msgBiz : styles.msgCust,
                        { backgroundColor: isBiz ? theme.primary : '#E5E7EB' }
                      ]}
                    >
                      <Text style={{ color: isBiz ? '#FFF' : '#111827', fontSize: 13 }}>
                        {log.message}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <View style={[styles.chatInputRow, { borderTopColor: theme.border }]}>
              <TextInput
                style={[styles.chatInput, { color: theme.text }]}
                placeholder="Type messages to simulate WhatsApp..."
                placeholderTextColor={theme.textSecondary + '80'}
                value={message}
                onChangeText={setMessage}
              />
              <TouchableOpacity style={[styles.sendBtn, { backgroundColor: theme.primary }]} onPress={handleSendSimulationMsg}>
                <Ionicons name="send" size={14} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  container: { flex: 1, padding: 20 },
  vipCard: { padding: 20, borderRadius: 20, gap: 14, marginBottom: 20 },
  vipHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vipTag: { color: '#FFF', fontWeight: '800', fontSize: 11, letterSpacing: 1.5 },
  vipName: { color: '#FFF', fontWeight: '800', fontSize: 22 },
  vipPhone: { color: '#FFF', opacity: 0.8, fontSize: 14, fontWeight: '600' },
  vipFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  footerLabel: { color: '#FFF', opacity: 0.7, fontSize: 10, fontWeight: '700' },
  footerValue: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  waBtnText: { color: '#FFF', fontWeight: '700', fontSize: 11 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 },
  detailBox: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailText: { fontSize: 14, fontWeight: '500' },
  pointsInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14 },
  pointsActions: { flexDirection: 'row', gap: 10 },
  ptsBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  ptsBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  chatContainer: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  msgBubble: { padding: 10, borderRadius: 14, marginVertical: 4, maxWidth: '80%', alignSelf: 'flex-start' },
  msgBiz: { alignSelf: 'flex-end' },
  msgCust: { alignSelf: 'flex-start' },
  chatInputRow: { flexDirection: 'row', padding: 8, borderTopWidth: 1, alignItems: 'center', gap: 8 },
  chatInput: { flex: 1, fontSize: 13, height: 38, paddingHorizontal: 10 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }
});
