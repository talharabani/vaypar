import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    Modal,
    ScrollView,
    StyleSheet, Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useTheme } from '../../hooks/use-theme';
import * as tailorDb from '../../services/tailorDb';

function formatPKR(n: number) {
  return `PKR ${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export default function TailorOrderDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [order, setOrder] = useState<tailorDb.TailorOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const o = await tailorDb.getTailorOrder(id);
      setOrder(o);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (status: tailorDb.OrderStatus) => {
    if (!order) return;
    try {
      await tailorDb.updateOrderStatus(order.id, status);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleAddPayment = async () => {
    if (!order) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Invalid', 'Enter valid amount.'); return; }
    try {
      const newAdv = order.advancePaid + amt;
      const newBal = Math.max(0, order.totalPrice - newAdv);
      await tailorDb.upsertTailorOrder({
        ...order,
        advancePaid: newAdv,
        balanceDue: newBal,
        lastUpdated: new Date().toISOString(),
      });
      setPaymentModalVisible(false);
      setPaymentAmount('');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Order', `Delete order #${order?.orderNumber}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (order) { await tailorDb.deleteTailorOrder(order.id); router.back(); }
        },
      },
    ]);
  };

  if (loading || !order) {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  const measurements: tailorDb.TailorMeasurement = order.measurements ? JSON.parse(order.measurements) : {};
  const cfg = tailorDb.STATUS_CONFIG[order.status];

  return (
    <ScreenWrapper title={`Order #${order.id.substring(0, 8).toUpperCase()}`}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Order #{order.orderNumber}</Text>
        <TouchableOpacity onPress={handleDelete} style={{ padding: 4 }}>
          <Ionicons name="trash-outline" size={20} color={theme.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Status Pipeline Banner */}
        <View style={[styles.statusCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>CURRENT STATUS</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Ionicons name={cfg.icon as any} size={20} color={cfg.color} style={{ marginRight: 8 }} />
            <Text style={[styles.statusValue, { color: cfg.color }]}>{cfg.label}</Text>
          </View>

          <Text style={[styles.statusLabel, { color: theme.textSecondary, marginTop: 14 }]}>CHANGE STATUS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChips}>
            {(['pending', 'cutting', 'stitching', 'trial', 'ready', 'delivered', 'cancelled'] as const).map(st => {
              const c = tailorDb.STATUS_CONFIG[st];
              const isSelected = order.status === st;
              return (
                <TouchableOpacity
                  key={st}
                  onPress={() => handleStatusChange(st)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? c.color : theme.background,
                      borderColor: isSelected ? c.color : theme.border,
                    },
                  ]}
                >
                  <Text style={{ color: isSelected ? '#FFF' : theme.text, fontWeight: '700', fontSize: 11 }}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Customer & Item */}
        <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>CUSTOMER & SUIT DETAILS</Text>
          <Text style={[styles.custName, { color: theme.text }]}>{order.customerName}</Text>
          <Text style={[styles.custPhone, { color: theme.textSecondary }]}>{order.customerPhone}</Text>
          <View style={styles.itemRow}>
            <Text style={[styles.itemLabel, { color: theme.text }]}>{order.quantity}x {order.itemType}</Text>
            {order.fabric ? <Text style={[styles.itemSub, { color: theme.textSecondary }]}>Fabric: {order.fabric}</Text> : null}
          </View>
          <Text style={[styles.dateText, { color: theme.textSecondary }]}>Delivery Date: {order.deliveryDate}</Text>
          {order.trialDate ? <Text style={[styles.dateText, { color: theme.textSecondary }]}>Trial Date: {order.trialDate}</Text> : null}
        </View>

        {/* Measurements Grid */}
        <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>MEASUREMENTS (INCHES)</Text>
          <View style={styles.measureGrid}>
            {Object.entries(measurements).map(([k, v]) => (
              v ? (
                <View key={k} style={[styles.measureItem, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={[styles.mLabel, { color: theme.textSecondary }]}>{k.replace(/([A-Z])/g, ' $1')}</Text>
                  <Text style={[styles.mVal, { color: theme.primary }]}>{v}"</Text>
                </View>
              ) : null
            ))}
          </View>
        </View>

        {/* Financial Summary */}
        <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>FINANCIALS</Text>
          <View style={styles.finRow}>
            <Text style={[styles.finLabel, { color: theme.textSecondary }]}>Total Price</Text>
            <Text style={[styles.finVal, { color: theme.text }]}>{formatPKR(order.totalPrice)}</Text>
          </View>
          <View style={styles.finRow}>
            <Text style={[styles.finLabel, { color: theme.textSecondary }]}>Advance Paid</Text>
            <Text style={[styles.finVal, { color: theme.success }]}>{formatPKR(order.advancePaid)}</Text>
          </View>
          <View style={styles.finRow}>
            <Text style={[styles.finLabel, { color: theme.textSecondary }]}>Balance Due</Text>
            <Text style={[styles.finVal, { color: order.balanceDue > 0 ? theme.danger : theme.success }]}>
              {formatPKR(order.balanceDue)}
            </Text>
          </View>

          {order.balanceDue > 0 && (
            <TouchableOpacity
              style={[styles.payBtn, { backgroundColor: theme.primary }]}
              onPress={() => setPaymentModalVisible(true)}
            >
              <Ionicons name="cash-outline" size={16} color="#FFF" />
              <Text style={styles.payBtnText}>Record Payment</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Record Payment Modal */}
      <Modal visible={paymentModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Record Payment</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>Balance Due: {formatPKR(order.balanceDue)}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Amount Paid (PKR)"
              placeholderTextColor={theme.textSecondary}
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="numeric"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]} onPress={() => setPaymentModalVisible(false)}>
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.primary }]} onPress={handleAddPayment}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Record</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  statusCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  statusLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  statusValue: { fontSize: 18, fontWeight: '800' },
  statusChips: { gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  infoCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  custName: { fontSize: 18, fontWeight: '800' },
  custPhone: { fontSize: 13, marginTop: 2 },
  itemRow: { marginTop: 8 },
  itemLabel: { fontSize: 14, fontWeight: '700' },
  itemSub: { fontSize: 12 },
  dateText: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  measureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  measureItem: { width: '30%', minWidth: 90, borderRadius: 10, borderWidth: 1, padding: 8, alignItems: 'center' },
  mLabel: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  mVal: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  finRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  finLabel: { fontSize: 13, fontWeight: '600' },
  finVal: { fontSize: 14, fontWeight: '800' },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 10, marginTop: 12 },
  payBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSub: { fontSize: 13, marginBottom: 14 },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 14 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
