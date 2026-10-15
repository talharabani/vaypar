import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
import * as inventoryDb from '../../services/smartInventoryDb';
import * as sqlite from '../../services/sqlite';

function formatPKR(n: number): string {
  return `PKR ${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export default function SmartInventoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [products, setProducts] = useState<sqlite.Product[]>([]);
  const [batches, setBatches] = useState<inventoryDb.InventoryBatch[]>([]);
  const [locations, setLocations] = useState<inventoryDb.InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  
  // Selected product details for Supplier Compare modal / details
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [supplierPrices, setSupplierPrices] = useState<inventoryDb.SupplierItem[]>([]);

  // Load Inventory data
  const loadData = useCallback(async () => {
    if (!businessId) return;
    try {
      await inventoryDb.initInventoryTables();
      const [prods, b, locs] = await Promise.all([
        sqlite.getProducts(user?.businessId || user?.id || ''), // sqlite products
        inventoryDb.getBatches(businessId),
        inventoryDb.getLocations(businessId)
      ]);
      setProducts(prods);
      setBatches(b);
      setLocations(locs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Load supplier comparisons on select
  const handleSelectProductCompare = async (productId: string) => {
    setSelectedProductId(productId);
    try {
      const prices = await inventoryDb.getSupplierPrices(productId);
      setSupplierPrices(prices);
    } catch (e) {
      console.error(e);
    }
  };

  // Barcode Scan action
  const handleScanBarcode = () => {
    Alert.alert('Scanner', 'Camera scanner activated! Align Barcode/QR code inside grid box.');
  };

  // Smart suggestions logic
  const reorderSuggestions = products.filter((p) => p.quantity <= (p.lowStockThreshold ?? 5));
  const slowMovingItems = products.filter((p) => p.quantity > 50); // Sample rule: stock > 50 units
  const deadStock = products.filter((p) => p.quantity > 0 && p.price > 1000); // Sample rule: High price, zero sales

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

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
    <ScreenWrapper title="Smart Inventory">
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Smart Inventory</Text>
          <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
            Real-Time Warehouse & Expiry Tracker
          </Text>
        </View>
        <TouchableOpacity style={[styles.scanBtn, { backgroundColor: theme.primary }]} onPress={handleScanBarcode}>
          <Ionicons name="scan-outline" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search catalog items..."
            placeholderTextColor={theme.textSecondary + '80'}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Smart Alerts Cockpit */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Smart Insights & Alerts</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.alertsRow}>
            <View style={[styles.alertCard, { backgroundColor: '#EF4444' + '15', borderColor: '#EF4444' }]}>
              <Ionicons name="alert-circle" size={22} color="#EF4444" />
              <Text style={[styles.alertVal, { color: '#EF4444' }]}>{reorderSuggestions.length}</Text>
              <Text style={[styles.alertLbl, { color: theme.textSecondary }]}>Reorder Alerts</Text>
            </View>
            <View style={[styles.alertCard, { backgroundColor: '#F59E0B' + '15', borderColor: '#F59E0B' }]}>
              <Ionicons name="hourglass" size={22} color="#F59E0B" />
              <Text style={[styles.alertVal, { color: '#F59E0B' }]}>{slowMovingItems.length}</Text>
              <Text style={[styles.alertLbl, { color: theme.textSecondary }]}>Slow Moving</Text>
            </View>
            <View style={[styles.alertCard, { backgroundColor: '#6B7280' + '15', borderColor: '#6B7280' }]}>
              <Ionicons name="archive" size={22} color="#6B7280" />
              <Text style={[styles.alertVal, { color: '#6B7280' }]}>{deadStock.length}</Text>
              <Text style={[styles.alertLbl, { color: theme.textSecondary }]}>Dead Stock</Text>
            </View>
          </ScrollView>
        </View>

        {/* Multi-Location Warehouse Overview */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Warehouses & Locations</Text>
          <View style={styles.locationsList}>
            {locations.map((loc) => (
              <View key={loc.id} style={[styles.locItem, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="business" size={18} color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.locName, { color: theme.text }]}>{loc.name}</Text>
                  <Text style={[styles.locAddress, { color: theme.textSecondary }]}>{loc.address}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Catalog Expiry Batches */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Batch Logs & Expiry</Text>
          <View style={styles.batchesList}>
            {batches.map((bat) => (
              <View key={bat.id} style={[styles.batchCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <View style={styles.batchHeader}>
                  <Text style={[styles.batchCode, { color: theme.text }]}>Batch: {bat.batchCode}</Text>
                  <Text style={[styles.batchExpiry, { color: '#EF4444', fontWeight: '800' }]}>Exp: {bat.expiryDate}</Text>
                </View>
                <View style={styles.batchBody}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Location: {bat.locationName}</Text>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Cost: {formatPKR(bat.costPrice)}</Text>
                  <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '800' }}>Qty: {bat.quantity} Units</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Supplier Price Comparisons */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Supplier Price Comparisons</Text>
          <Text style={[styles.sectionSubText, { color: theme.textSecondary }]}>
            Select a product from your catalog list to compare wholesale supplier rates:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, marginVertical: 8 }}>
            {filteredProducts.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.productChip,
                  {
                    backgroundColor: selectedProductId === p.id ? theme.primary + '15' : theme.backgroundElement,
                    borderColor: selectedProductId === p.id ? theme.primary : theme.border
                  }
                ]}
                onPress={() => handleSelectProductCompare(p.id)}
              >
                <Text style={{ color: selectedProductId === p.id ? theme.primary : theme.text, fontWeight: '700', fontSize: 12 }}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {selectedProductId && (
            <View style={styles.suppliersContainer}>
              {supplierPrices.length === 0 ? (
                <Text style={{ color: theme.textSecondary, textAlign: 'center', marginVertical: 12 }}>
                  No supplier quotes found for this item.
                </Text>
              ) : (
                supplierPrices.map((sp) => (
                  <View key={sp.id} style={[styles.supplierRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.supplierName, { color: theme.text }]}>{sp.supplierName}</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>Delivery: {sp.deliveryDays} Days</Text>
                    </View>
                    <Text style={[styles.supplierCost, { color: theme.primary }]}>{formatPKR(sp.price)}</Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  scanBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchContainer: { paddingHorizontal: 20, marginBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 46, borderRadius: 14, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10, paddingHorizontal: 20 },
  sectionSubText: { fontSize: 12, paddingHorizontal: 20, marginBottom: 4 },
  alertsRow: { paddingHorizontal: 20, gap: 12, paddingVertical: 4 },
  alertCard: { width: 110, padding: 12, borderRadius: 16, borderStyle: 'solid', borderWidth: 1, alignItems: 'center', gap: 4 },
  alertVal: { fontSize: 20, fontWeight: '800' },
  alertLbl: { fontSize: 11, fontWeight: '600' },
  locationsList: { paddingHorizontal: 20, gap: 8 },
  locItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  locName: { fontSize: 14, fontWeight: '700' },
  locAddress: { fontSize: 11, marginTop: 2 },
  batchesList: { paddingHorizontal: 20, gap: 10 },
  batchCard: { padding: 12, borderRadius: 14, borderWidth: 1 },
  batchHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  batchCode: { fontSize: 13, fontWeight: '700' },
  batchExpiry: { fontSize: 12 },
  batchBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  suppliersContainer: { paddingHorizontal: 20, gap: 8, marginTop: 8 },
  supplierRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1 },
  supplierName: { fontSize: 14, fontWeight: '700' },
  supplierCost: { fontSize: 14, fontWeight: '800' }
});
