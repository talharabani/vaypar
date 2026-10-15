import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert, Modal,
    RefreshControl,
    ScrollView,
    StyleSheet, Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../hooks/use-theme';
import * as inventoryDb from '../../services/inventoryDb';

function formatPKR(n: number) {
  return `PKR ${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export default function PharmacyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [stats, setStats] = useState<inventoryDb.PharmacyStats | null>(null);
  const [expiringBatches, setExpiringBatches] = useState<inventoryDb.MedicineBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Add Batch Modal
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [productName, setProductName] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      await inventoryDb.initInventoryTables();
      const [s, b] = await Promise.all([
        inventoryDb.getPharmacyStats(businessId),
        inventoryDb.getExpiringBatches(businessId, 90),
      ]);
      setStats(s);
      setExpiringBatches(b);
    } catch (e) {
      console.error('Pharmacy load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleAddBatch = async () => {
    if (!productName.trim() || !batchNumber.trim() || !expiryDate.trim()) {
      Alert.alert('Required', 'Please fill in product name, batch #, and expiry date.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await inventoryDb.upsertMedicineBatch({
        id: 'btc_' + Math.random().toString(36).substring(2, 11),
        businessId,
        productId: 'prod_' + Math.random().toString(36).substring(2, 11),
        productName: productName.trim(),
        batchNumber: batchNumber.trim(),
        expiryDate: expiryDate.trim(),
        quantity: parseInt(quantity) || 0,
        purchasePrice: parseFloat(purchasePrice) || 0,
        manufacturer: manufacturer.trim(),
        lastUpdated: now,
      });
      setBatchModalVisible(false);
      setProductName(''); setBatchNumber(''); setExpiryDate(''); setQuantity(''); setPurchasePrice(''); setManufacturer('');
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = expiringBatches.filter(b =>
    b.productName.toLowerCase().includes(search.toLowerCase()) ||
    b.batchNumber.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Pharmacy Batches...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title="Pharmacy & Expiry">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>💊 Pharmacy & Expiry Control</Text>
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
              {stats?.totalProducts ?? 0} medicines · {stats?.expiringIn30Days ?? 0} expiring within 30d
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary, borderWidth: 1 }]}
              onPress={() => router.push('/products/import')}
            >
              <Ionicons name="cloud-upload-outline" size={20} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: theme.primary }]}
              onPress={() => setBatchModalVisible(true)}
            >
              <Ionicons name="add" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.statVal, { color: theme.primary }]}>{formatPKR(stats?.todaySales ?? 0)}</Text>
            <Text style={[styles.statSub, { color: theme.textSecondary }]}>Today's Sales</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.statVal, { color: theme.warning }]}>{stats?.expiringIn30Days ?? 0}</Text>
            <Text style={[styles.statSub, { color: theme.textSecondary }]}>Expiring in 30 Days</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.statVal, { color: (stats?.expiredBatches ?? 0) > 0 ? theme.danger : theme.text }]}>
              {stats?.expiredBatches ?? 0}
            </Text>
            <Text style={[styles.statSub, { color: theme.textSecondary }]}>Expired Batches</Text>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search medicine or batch number..."
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Expiry Tracking Section */}
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Expiry Alert Batches (Next 90 Days)
          </Text>

          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="medkit-outline" size={64} color={theme.textSecondary + '30'} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {search ? 'No batches match your search.' : 'No medicine batches near expiry.\nTap + to log batch & expiry.'}
              </Text>
            </View>
          ) : (
            filtered.map(b => {
              const daysLeft = inventoryDb.expiryDaysLeft(b.expiryDate);
              const color = inventoryDb.expiryColor(daysLeft);
              return (
                <View key={b.id} style={[styles.batchCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.medName, { color: theme.text }]}>{b.productName}</Text>
                    <Text style={[styles.medSub, { color: theme.textSecondary }]}>
                      Batch: {b.batchNumber} {b.manufacturer ? `· ${b.manufacturer}` : ''}
                    </Text>
                    <Text style={[styles.medSub, { color: theme.textSecondary }]}>
                      Qty: {b.quantity} pcs
                    </Text>
                  </View>

                  <View style={styles.batchRight}>
                    <View style={[styles.daysBadge, { backgroundColor: color + '18' }]}>
                      <Text style={[styles.daysText, { color }]}>
                        {daysLeft < 0 ? 'EXPIRED' : `${daysLeft} days left`}
                      </Text>
                    </View>
                    <Text style={[styles.expDate, { color: theme.textSecondary }]}>Exp: {b.expiryDate}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Add Batch Modal */}
      <Modal visible={batchModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Medicine Batch</Text>

            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Medicine Name *"
              placeholderTextColor={theme.textSecondary}
              value={productName}
              onChangeText={setProductName}
            />

            <View style={styles.rowInputs}>
              <TextInput
                style={[styles.modalInput, { flex: 1, backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Batch Number *"
                placeholderTextColor={theme.textSecondary}
                value={batchNumber}
                onChangeText={setBatchNumber}
              />
              <View style={{ width: 10 }} />
              <TextInput
                style={[styles.modalInput, { flex: 1, backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Expiry (YYYY-MM-DD) *"
                placeholderTextColor={theme.textSecondary}
                value={expiryDate}
                onChangeText={setExpiryDate}
              />
            </View>

            <View style={styles.rowInputs}>
              <TextInput
                style={[styles.modalInput, { flex: 1, backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Quantity"
                placeholderTextColor={theme.textSecondary}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
              />
              <View style={{ width: 10 }} />
              <TextInput
                style={[styles.modalInput, { flex: 1, backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Purchase Price"
                placeholderTextColor={theme.textSecondary}
                value={purchasePrice}
                onChangeText={setPurchasePrice}
                keyboardType="numeric"
              />
            </View>

            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Manufacturer (Optional)"
              placeholderTextColor={theme.textSecondary}
              value={manufacturer}
              onChangeText={setManufacturer}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]} onPress={() => setBatchModalVisible(false)}>
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.primary }]} onPress={handleAddBatch} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color: '#FFF', fontWeight: '700' }}>Save Batch</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  statsGrid: { flexDirection: 'row', gap: 10, padding: 16 },
  statCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '900' },
  statSub: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 14, padding: 12, borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10 },
  batchCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8,
  },
  medName: { fontSize: 14, fontWeight: '700' },
  medSub: { fontSize: 11, marginTop: 2 },
  batchRight: { alignItems: 'flex-end', gap: 4 },
  daysBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  daysText: { fontSize: 11, fontWeight: '800' },
  expDate: { fontSize: 11 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10 },
  rowInputs: { flexDirection: 'row' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
