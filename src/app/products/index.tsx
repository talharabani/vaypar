import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useAuth } from '../../context/AuthContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useTheme } from '../../hooks/use-theme';
import type { Product } from '../../services/sqlite';

export default function ProductsScreen() {
  const { products, addProduct, editProduct, deleteProduct } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const isCashier = user?.role === 'cashier';
  const isOwner = user?.role === 'owner';

  // ── Search & Filter ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // ── Detail sheet ─────────────────────────────────────────────────────────────
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  // ── Form State ───────────────────────────────────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState('');
  const [boxLocation, setBoxLocation] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [listOnStore, setListOnStore] = useState(false);
  const [formError, setFormError] = useState('');

  // ── Restock State ────────────────────────────────────────────────────────────
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockUnits, setRestockUnits] = useState('10');
  const [restockPurchasePrice, setRestockPurchasePrice] = useState('');
  const [restockSaving, setRestockSaving] = useState(false);
  const [restockError, setRestockError] = useState('');

  const categoriesList = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => { if (p.category) cats.add(p.category.trim()); });
    return ['All', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const ms = p.name.toLowerCase().includes(search.toLowerCase()) ||
                 (p.category || '').toLowerCase().includes(search.toLowerCase()) ||
                 (p.boxLocation || '').toLowerCase().includes(search.toLowerCase());
      const mc = selectedCategory === 'All' || p.category === selectedCategory;
      return ms && mc;
    });
  }, [products, search, selectedCategory]);

  // ── Modal helpers ────────────────────────────────────────────────────────────
  const resetForm = () => {
    setEditingId(null);
    setName(''); setSalePrice(''); setPurchasePrice('');
    setQuantity(''); setCategory(''); setBoxLocation('');
    setLowStockThreshold('5'); setListOnStore(false); setFormError('');
  };

  const handleOpenAddModal = () => { resetForm(); setModalVisible(true); };

  const handleOpenEditModal = (product: Product) => {
    setDetailProduct(null); // close detail sheet first
    setEditingId(product.id);
    setName(product.name);
    setSalePrice(product.price.toString());
    setPurchasePrice((product.purchasePrice !== undefined && product.purchasePrice !== null && product.purchasePrice > 0) ? product.purchasePrice.toString() : '');
    setQuantity(product.quantity.toString());
    setCategory(product.category || '');
    setBoxLocation(product.boxLocation || '');
    setLowStockThreshold(product.lowStockThreshold.toString());
    setListOnStore((product.listOnStore ?? 0) === 1);
    setFormError('');
    setModalVisible(true);
  };

  const handleSaveProduct = async () => {
    setFormError('');
    if (!name.trim()) { setFormError('Product name is required.'); return; }
    const parsedSalePrice = parseFloat(salePrice.replace(/,/g, ''));
    if (isNaN(parsedSalePrice) || parsedSalePrice < 0) { setFormError('Enter a valid sale price.'); return; }
    const parsedPurchasePrice = purchasePrice.trim() ? parseFloat(purchasePrice.replace(/,/g, '')) : 0;
    if (isNaN(parsedPurchasePrice) || parsedPurchasePrice < 0) { setFormError('Enter a valid purchase price.'); return; }
    const parsedQty = parseInt(quantity.replace(/,/g, ''), 10);
    if (isNaN(parsedQty) || parsedQty < 0) { setFormError('Enter a valid stock quantity.'); return; }
    const parsedThreshold = parseInt(lowStockThreshold.replace(/,/g, ''), 10);
    if (isNaN(parsedThreshold) || parsedThreshold < 0) { setFormError('Enter a valid low stock limit.'); return; }

    try {
      if (editingId) {
        await editProduct(editingId, name.trim(), parsedSalePrice, parsedQty,
          category.trim() || 'General', parsedThreshold,
          parsedPurchasePrice, boxLocation.trim() || undefined, listOnStore ? 1 : 0);
      } else {
        await addProduct(name.trim(), parsedSalePrice, parsedQty,
          category.trim() || 'General', parsedThreshold,
          parsedPurchasePrice, boxLocation.trim() || undefined, listOnStore ? 1 : 0);
      }
      setModalVisible(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save product.');
    }
  };

  const handleDeleteProduct = (id: string, productName: string) => {
    const msg = `Delete "${productName}"? This will remove it from inventory.`;
    const doDelete = () => deleteProduct(id).then(() => setDetailProduct(null)).catch(console.error);
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doDelete();
      return;
    }
    Alert.alert('Delete Product', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  const handleQuickQtyAdjust = async (product: Product, delta: number) => {
    const newQty = product.quantity + delta;
    if (newQty < 0) return;
    try {
      await editProduct(product.id, product.name, product.price, newQty,
        product.category || 'General', product.lowStockThreshold,
        product.purchasePrice ?? 0, product.boxLocation ?? undefined, product.listOnStore ?? 0);
      // Refresh detail sheet if open
      if (detailProduct?.id === product.id) {
        setDetailProduct(prev => prev ? { ...prev, quantity: newQty } : prev);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenRestockModal = (product: Product) => {
    setRestockProduct(product);
    setRestockUnits('10');
    setRestockPurchasePrice(
      product.purchasePrice !== undefined && product.purchasePrice !== null && product.purchasePrice > 0
        ? product.purchasePrice.toString()
        : ''
    );
    setRestockError('');
  };

  const handleConfirmRestock = async () => {
    if (!restockProduct) return;
    setRestockError('');
    const addUnits = parseInt(restockUnits.replace(/,/g, ''), 10);
    if (isNaN(addUnits) || addUnits <= 0) {
      setRestockError('Please enter a valid positive number of units to add.');
      return;
    }

    const newPurchasePrice = restockPurchasePrice.trim()
      ? parseFloat(restockPurchasePrice.replace(/,/g, ''))
      : (restockProduct.purchasePrice ?? 0);

    const newTotalQty = restockProduct.quantity + addUnits;

    setRestockSaving(true);
    try {
      await editProduct(
        restockProduct.id,
        restockProduct.name,
        restockProduct.price,
        newTotalQty,
        restockProduct.category || 'General',
        restockProduct.lowStockThreshold,
        newPurchasePrice,
        restockProduct.boxLocation ?? undefined,
        restockProduct.listOnStore ?? 0
      );

      // If detail sheet is open, update it in place
      if (detailProduct?.id === restockProduct.id) {
        setDetailProduct(prev => prev ? {
          ...prev,
          quantity: newTotalQty,
          purchasePrice: newPurchasePrice,
        } : null);
      }

      const addedMsg = `Restocked ${addUnits} units! Total stock is now ${newTotalQty} units.`;
      setRestockProduct(null);
      if (Platform.OS === 'web') {
        window.alert(addedMsg);
      } else {
        Alert.alert('Stock Updated', addedMsg);
      }
    } catch (err: any) {
      setRestockError(err.message || 'Failed to restock product.');
    } finally {
      setRestockSaving(false);
    }
  };

  return (
    <ScreenWrapper title="Products">
      {/* ── Search header ──────────────────────────────────────────────────── */}
      <View style={[styles.searchContainer, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <View style={[styles.searchInputWrapper, { flex: 1, backgroundColor: theme.background, borderColor: theme.border }]}>
            <Ionicons name="search" size={18} color={theme.textSecondary} style={{ marginRight: 8 }} />
            <Input
              placeholder="Search by name, category, box location..."
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              containerStyle={styles.searchInputContainer}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          {!isCashier && (
            <TouchableOpacity
              style={[styles.importBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
              onPress={() => router.push('/products/import')}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={theme.primary} />
              <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>Import</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {categoriesList.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, { backgroundColor: selectedCategory === cat ? theme.primary : theme.background, borderColor: theme.border }]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.chipText, { color: selectedCategory === cat ? '#FFF' : theme.textSecondary }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Product list ──────────────────────────────────────────────────────── */}
      <FlatList
        data={filteredProducts}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={60} color={theme.textSecondary + '60'} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {search || selectedCategory !== 'All'
                ? 'No products match your search.'
                : 'No products yet. Tap + to add your first product.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isLow = item.quantity <= item.lowStockThreshold;
          const pp = item.purchasePrice ?? 0;
          const profit = item.price - pp;
          const margin = pp > 0 ? ((profit / pp) * 100) : null;

          return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setDetailProduct(item)}
            >
              <Card style={styles.productCard}>
                {/* Left: info */}
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.productName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.badgeRow}>
                      {isLow && (
                        <View style={[styles.badge, { backgroundColor: theme.danger + '18', borderColor: theme.danger }]}>
                          <Text style={[styles.badgeText, { color: theme.danger }]}>Low Stock</Text>
                        </View>
                      )}
                      {item.listOnStore === 1 && (
                        <View style={[styles.badge, { backgroundColor: theme.success + '18', borderColor: theme.success }]}>
                          <Ionicons name="storefront-outline" size={10} color={theme.success} />
                          <Text style={[styles.badgeText, { color: theme.success }]}>Listed</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="pricetag-outline" size={12} color={theme.textSecondary} />
                      <Text style={[styles.metaText, { color: theme.textSecondary }]}>{item.category || 'General'}</Text>
                    </View>
                    {item.boxLocation ? (() => {
                      const lower = item.boxLocation.toLowerCase();
                      const boxLabel = (lower.includes('box') || lower.includes('shelf') || lower.includes('rack'))
                        ? item.boxLocation
                        : `Box: ${item.boxLocation}`;
                      return (
                        <View style={[styles.boxBadge, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '35' }]}>
                          <Ionicons name="cube" size={11} color={theme.primary} />
                          <Text style={[styles.boxBadgeText, { color: theme.primary }]}>{boxLabel}</Text>
                        </View>
                      );
                    })() : null}
                  </View>

                  <View style={styles.priceRow}>
                    <View style={styles.priceBlock}>
                      <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Sale</Text>
                      <Text style={[styles.priceValue, { color: theme.primary }]}>PKR {item.price.toFixed(0)}</Text>
                    </View>
                    {(isOwner || user?.role === 'manager' || !user?.role) && (
                      <>
                        <View style={[styles.priceDivider, { backgroundColor: theme.border }]} />
                        <View style={styles.priceBlock}>
                          <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Purchase</Text>
                          <Text style={[styles.priceValue, { color: theme.textSecondary }]}>
                            {pp > 0 ? `PKR ${pp.toLocaleString('en-PK')}` : 'PKR 0'}
                          </Text>
                        </View>
                        {pp > 0 && (
                          <>
                            <View style={[styles.priceDivider, { backgroundColor: theme.border }]} />
                            <View style={styles.priceBlock}>
                              <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Profit</Text>
                              <Text style={[styles.priceValue, { color: profit >= 0 ? theme.success : theme.danger }]}>
                                PKR {profit.toFixed(0)}{margin !== null ? ` (${margin.toFixed(0)}%)` : ''}
                              </Text>
                            </View>
                          </>
                        )}
                      </>
                    )}
                  </View>
                </View>

                {/* Right: stock count + action buttons */}
                <View style={styles.rightCol}>
                  <Text style={[styles.stockText, { color: isLow ? theme.danger : theme.text }]}>
                    {item.quantity} units
                  </Text>
                  
                  {/* Card Quick Actions: Restock, Edit, Delete */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenRestockModal(item);
                      }}
                      style={[styles.cardActionBtn, { backgroundColor: '#10B98118', borderColor: '#10B98150' }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="arrow-up-circle-outline" size={13} color="#10B981" />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#10B981' }}>Restock</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenEditModal(item);
                      }}
                      style={[styles.cardActionIconBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '40' }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="create-outline" size={13} color={theme.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteProduct(item.id, item.name);
                      }}
                      style={[styles.cardActionIconBtn, { backgroundColor: theme.danger + '14', borderColor: theme.danger + '35' }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={13} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── FAB ──────────────────────────────────────────────────────────────── */}
      {!isCashier && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: theme.primary }]} onPress={handleOpenAddModal} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PRODUCT DETAIL BOTTOM SHEET
          ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={!!detailProduct}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailProduct(null)}
      >
        {detailProduct && (() => {
          const p = detailProduct;
          const isLow = p.quantity <= p.lowStockThreshold;
          const pp = p.purchasePrice ?? 0;
          const profit = p.price - pp;
          const margin = pp > 0 ? ((profit / pp) * 100) : null;

          return (
            <View style={styles.sheetOverlay}>
              <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setDetailProduct(null)} />
              <View style={[styles.sheetCard, { backgroundColor: theme.backgroundElement }]}>
                {/* Handle */}
                <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />

                {/* Header */}
                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetIconBox, { backgroundColor: theme.primaryLight }]}>
                    <Ionicons name="cube" size={24} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.sheetTitle, { color: theme.text }]} numberOfLines={2}>{p.name}</Text>
                    <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
                      {p.category || 'General'}{p.boxLocation ? `  ·  ${p.boxLocation}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setDetailProduct(null)} style={styles.sheetCloseBtn}>
                    <Ionicons name="close" size={20} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
                  {/* ── Main Action Bar: Edit, Restock, Delete ── */}
                  <View style={styles.sheetTopActionBar}>
                    <TouchableOpacity
                      style={[styles.sheetTopActionBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
                      onPress={() => handleOpenEditModal(p)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="create-outline" size={16} color={theme.primary} />
                      <Text style={[styles.sheetTopActionText, { color: theme.primary }]}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sheetTopActionBtn, { backgroundColor: '#10B98118', borderColor: '#10B98150' }]}
                      onPress={() => handleOpenRestockModal(p)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="arrow-up-circle-outline" size={16} color="#10B981" />
                      <Text style={[styles.sheetTopActionText, { color: '#10B981' }]}>Restock</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sheetTopActionBtn, { backgroundColor: theme.danger + '14', borderColor: theme.danger + '40' }]}
                      onPress={() => handleDeleteProduct(p.id, p.name)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.danger} />
                      <Text style={[styles.sheetTopActionText, { color: theme.danger }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>

                  {/* ── Status badges ── */}
                  <View style={styles.sheetBadges}>
                    <View style={[styles.sheetBadge, { backgroundColor: isLow ? theme.danger + '15' : theme.success + '15', borderColor: isLow ? theme.danger + '50' : theme.success + '50' }]}>
                      <View style={[styles.sheetBadgeDot, { backgroundColor: isLow ? theme.danger : theme.success }]} />
                      <Text style={[styles.sheetBadgeText, { color: isLow ? theme.danger : theme.success }]}>
                        {isLow ? 'Low Stock' : 'In Stock'}
                      </Text>
                    </View>
                    {p.listOnStore === 1 && (
                      <View style={[styles.sheetBadge, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '50' }]}>
                        <Ionicons name="storefront-outline" size={11} color={theme.primary} />
                        <Text style={[styles.sheetBadgeText, { color: theme.primary }]}>Listed on Store</Text>
                      </View>
                    )}
                    {p.sku ? (
                      <View style={[styles.sheetBadge, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                        <Text style={[styles.sheetBadgeText, { color: theme.textSecondary }]}>SKU: {p.sku}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* ── Price cards ── */}
                  <View style={styles.sheetPriceRow}>
                    <View style={[styles.sheetPriceCard, { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' }]}>
                      <Text style={[styles.sheetPriceCardLabel, { color: theme.primary }]}>Sale Price</Text>
                      <Text style={[styles.sheetPriceCardVal, { color: theme.primary }]}>PKR {p.price.toLocaleString('en-PK')}</Text>
                    </View>

                    {(isOwner || user?.role === 'manager' || !user?.role) && (
                      <>
                        <View style={[styles.sheetPriceCard, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                          <Text style={[styles.sheetPriceCardLabel, { color: theme.textSecondary }]}>Purchase Price</Text>
                          <Text style={[styles.sheetPriceCardVal, { color: theme.text }]}>
                            {pp > 0 ? `PKR ${pp.toLocaleString('en-PK')}` : 'PKR 0'}
                          </Text>
                        </View>

                        {pp > 0 && (
                          <View style={[styles.sheetPriceCard, { backgroundColor: profit >= 0 ? theme.success + '12' : theme.danger + '12', borderColor: profit >= 0 ? theme.success + '30' : theme.danger + '30' }]}>
                            <Text style={[styles.sheetPriceCardLabel, { color: profit >= 0 ? theme.success : theme.danger }]}>Profit / Unit</Text>
                            <Text style={[styles.sheetPriceCardVal, { color: profit >= 0 ? theme.success : theme.danger }]}>
                              PKR {profit.toFixed(0)}
                            </Text>
                            {margin !== null && (
                              <Text style={[styles.sheetMarginText, { color: profit >= 0 ? theme.success : theme.danger }]}>
                                {margin.toFixed(1)}% margin
                              </Text>
                            )}
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  {/* ── Info grid ── */}
                  <View style={[styles.infoGrid, { borderColor: theme.border }]}>
                    <InfoRow icon="layers-outline" label="Stock" value={`${p.quantity} units`} valueColor={isLow ? theme.danger : theme.success} theme={theme} />
                    <InfoRow icon="alert-circle-outline" label="Low Stock Alert" value={`${p.lowStockThreshold} units`} theme={theme} />
                    {p.boxLocation ? <InfoRow icon="cube-outline" label="Box / Shelf" value={p.boxLocation} theme={theme} /> : null}
                    {p.brand ? <InfoRow icon="business-outline" label="Brand" value={p.brand} theme={theme} /> : null}
                    {p.supplier ? <InfoRow icon="people-outline" label="Supplier" value={p.supplier} theme={theme} /> : null}
                    {p.unit ? <InfoRow icon="scale-outline" label="Unit" value={p.unit} theme={theme} /> : null}
                    {p.barcode ? <InfoRow icon="barcode-outline" label="Barcode" value={p.barcode} theme={theme} /> : null}
                    {p.description ? <InfoRow icon="document-text-outline" label="Description" value={p.description} theme={theme} /> : null}
                    <InfoRow icon="time-outline" label="Last Updated" value={new Date(p.lastUpdated).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })} theme={theme} />
                  </View>

                  {/* ── Stock quick adjust ── */}
                  {!isCashier && (
                    <View style={[styles.adjustCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <Text style={[styles.adjustCardTitle, { color: theme.textSecondary }]}>Quick Stock Adjust</Text>
                      <View style={styles.adjustBtnRow}>
                        {[-5, -1, +1, +5, +10].map(delta => (
                          <TouchableOpacity
                            key={delta}
                            style={[styles.deltaBtn, { backgroundColor: delta < 0 ? theme.danger + '15' : theme.success + '15', borderColor: delta < 0 ? theme.danger + '40' : theme.success + '40' }]}
                            onPress={() => handleQuickQtyAdjust(p, delta)}
                          >
                            <Text style={[styles.deltaBtnText, { color: delta < 0 ? theme.danger : theme.success }]}>
                              {delta > 0 ? `+${delta}` : delta}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* ── Bottom Action buttons ── */}
                  <View style={styles.sheetActions}>
                    <TouchableOpacity
                      style={[styles.sheetEditBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
                      onPress={() => handleOpenEditModal(p)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="create-outline" size={16} color={theme.primary} />
                      <Text style={[styles.sheetEditBtnText, { color: theme.primary }]}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sheetEditBtn, { backgroundColor: '#10B98118', borderColor: '#10B98150' }]}
                      onPress={() => handleOpenRestockModal(p)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="arrow-up-circle-outline" size={16} color="#10B981" />
                      <Text style={[styles.sheetEditBtnText, { color: '#10B981' }]}>Restock</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sheetDeleteBtn, { backgroundColor: theme.danger + '12', borderColor: theme.danger + '40' }]}
                      onPress={() => handleDeleteProduct(p.id, p.name)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.danger} />
                      <Text style={[styles.sheetDeleteBtnText, { color: theme.danger }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          );
        })()}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          RESTOCK INVENTORY MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={!!restockProduct}
        animationType="fade"
        transparent
        onRequestClose={() => setRestockProduct(null)}
      >
        {restockProduct && (
          <View style={styles.modalOverlayCenter}>
            <View style={[styles.restockCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.modalHeaderIcon, { backgroundColor: '#10B98118' }]}>
                    <Ionicons name="arrow-up-circle" size={22} color="#10B981" />
                  </View>
                  <View>
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Restock Inventory</Text>
                    <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                      {restockProduct.name}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setRestockProduct(null)}>
                  <Ionicons name="close" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              {restockError ? (
                <View style={[styles.errorBox, { backgroundColor: theme.danger + '15', borderColor: theme.danger }]}>
                  <Ionicons name="alert-circle" size={16} color={theme.danger} />
                  <Text style={[styles.errorText, { color: theme.danger }]}>{restockError}</Text>
                </View>
              ) : null}

              {/* Current Stock vs After Restock Banner */}
              <View style={[styles.stockOverviewBanner, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <View>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600' }}>Current In Stock</Text>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: theme.text, marginTop: 2 }}>
                    {restockProduct.quantity} <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>units</Text>
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={theme.textSecondary} />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600' }}>After Restock</Text>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#10B981', marginTop: 2 }}>
                    {restockProduct.quantity + (parseInt(restockUnits, 10) || 0)} <Text style={{ fontSize: 12, fontWeight: '600', color: '#10B981' }}>units</Text>
                  </Text>
                </View>
              </View>

              {/* Quick Increment Chips */}
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.textSecondary, marginTop: 10, marginBottom: 6 }}>
                QUICK SELECT QUANTITY
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                {[5, 10, 25, 50, 100].map(amt => (
                  <TouchableOpacity
                    key={amt}
                    onPress={() => setRestockUnits(amt.toString())}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor: restockUnits === amt.toString() ? theme.primary : theme.backgroundSelected,
                        borderColor: restockUnits === amt.toString() ? theme.primary : theme.border,
                      }
                    ]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: restockUnits === amt.toString() ? '#FFFFFF' : theme.text }}>
                      +{amt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Units Input */}
              <Input
                label="Units to Add (*)"
                placeholder="e.g. 20"
                value={restockUnits}
                onChangeText={setRestockUnits}
                keyboardType="numeric"
              />

              {/* Optional: Update Purchase Price */}
              <View style={{ marginTop: 10 }}>
                <Input
                  label="Purchase Price / Unit (Optional PKR)"
                  placeholder={restockProduct.purchasePrice ? restockProduct.purchasePrice.toString() : 'e.g. 150'}
                  value={restockPurchasePrice}
                  onChangeText={setRestockPurchasePrice}
                  keyboardType="numeric"
                />
              </View>

              {/* Buttons */}
              <View style={styles.modalButtons}>
                <Button
                  title="Cancel"
                  variant="outline"
                  onPress={() => setRestockProduct(null)}
                  style={{ flex: 1 }}
                />
                <Button
                  title={restockSaving ? 'Updating...' : 'Confirm Restock'}
                  onPress={handleConfirmRestock}
                  disabled={restockSaving}
                  style={{ flex: 1, backgroundColor: '#10B981' }}
                />
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          ADD / EDIT PRODUCT MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════════════
          ADD / EDIT PRODUCT MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <Pressable style={styles.modalBackdrop} onPress={() => setModalVisible(false)} />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={[styles.modalCardNew, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              {/* ── Fixed Modal Header ── */}
              <View style={[styles.modalHeaderNew, { borderBottomColor: theme.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[styles.modalHeaderIconBadge, { backgroundColor: editingId ? theme.primaryLight : '#10B98118' }]}>
                    <Ionicons name={editingId ? 'create-outline' : 'add-circle-outline'} size={22} color={editingId ? theme.primary : '#10B981'} />
                  </View>
                  <View>
                    <Text style={[styles.modalTitleNew, { color: theme.text }]}>
                      {editingId ? 'Edit Product' : 'Add New Product'}
                    </Text>
                    <Text style={[styles.modalSubtitleNew, { color: theme.textSecondary }]}>
                      {editingId ? 'Update pricing, stock count & storefront visibility' : 'Fill details below to add product to catalog'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={[styles.modalCloseBtnNew, { backgroundColor: theme.backgroundSelected }]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* ── Scrollable Form Body ── */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.formScrollNew}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: Platform.OS === 'web' ? ('calc(84vh - 135px)' as any) : undefined }}
              >
                {formError ? (
                  <View style={[styles.errorBox, { backgroundColor: theme.danger + '15', borderColor: theme.danger }]}>
                    <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
                    <Text style={[styles.errorText, { color: theme.danger }]}>{formError}</Text>
                  </View>
                ) : null}

                {/* Section 1: Product Identification */}
                <View style={styles.formSection}>
                  <Text style={[styles.formSectionTitle, { color: theme.textSecondary }]}>PRODUCT DETAILS</Text>
                  <Input
                    label="Product Name *"
                    placeholder="e.g. Bleu de Chanel Eau de Parfum"
                    value={name}
                    onChangeText={setName}
                  />

                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Input
                        label="Category"
                        placeholder="e.g. Men's Fragrances"
                        value={category}
                        onChangeText={setCategory}
                      />
                    </View>
                    <View style={styles.half}>
                      <Input
                        label="Box / Shelf Location"
                        placeholder="e.g. Shelf A3, Box 12"
                        value={boxLocation}
                        onChangeText={setBoxLocation}
                      />
                    </View>
                  </View>
                </View>

                {/* Section 2: Pricing & Profit Margins */}
                <View style={styles.formSection}>
                  <Text style={[styles.formSectionTitle, { color: theme.textSecondary }]}>PRICING & PROFIT</Text>
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Input
                        label="Sale Price (PKR) *"
                        placeholder="e.g. 34,450"
                        value={salePrice}
                        onChangeText={setSalePrice}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.half}>
                      <Input
                        label="Purchase Price (PKR)"
                        placeholder="e.g. 23,000"
                        value={purchasePrice}
                        onChangeText={setPurchasePrice}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {salePrice && purchasePrice && parseFloat(salePrice.replace(/,/g, '')) > 0 && parseFloat(purchasePrice.replace(/,/g, '')) > 0 ? (() => {
                    const sp = parseFloat(salePrice.replace(/,/g, '')) || 0;
                    const pp2 = parseFloat(purchasePrice.replace(/,/g, '')) || 0;
                    const pft = sp - pp2;
                    const mgn = pp2 > 0 ? ((pft / pp2) * 100).toFixed(1) : '0';
                    const pos = pft >= 0;
                    return (
                      <View style={[styles.profitPreviewNew, { backgroundColor: pos ? '#10B98114' : theme.danger + '12', borderColor: pos ? '#10B98135' : theme.danger + '35' }]}>
                        <Ionicons name={pos ? 'trending-up' : 'trending-down'} size={18} color={pos ? '#059669' : theme.danger} />
                        <View style={{ marginLeft: 8, flex: 1 }}>
                          <Text style={{ color: pos ? '#059669' : theme.danger, fontWeight: '800', fontSize: 13 }}>
                            Profit: PKR {pft.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                          </Text>
                          <Text style={{ color: pos ? '#059669' : theme.danger, fontSize: 11, fontWeight: '600', marginTop: 1 }}>
                            {mgn}% profit margin on cost price
                          </Text>
                        </View>
                      </View>
                    );
                  })() : null}
                </View>

                {/* Section 3: Inventory Counts */}
                <View style={styles.formSection}>
                  <Text style={[styles.formSectionTitle, { color: theme.textSecondary }]}>INVENTORY LEVELS</Text>
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Input
                        label="Stock Qty *"
                        placeholder="e.g. 29"
                        value={quantity}
                        onChangeText={setQuantity}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.half}>
                      <Input
                        label="Low Stock Alert"
                        placeholder="e.g. 3"
                        value={lowStockThreshold}
                        onChangeText={setLowStockThreshold}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>

                {/* Section 4: Online Storefront Switch */}
                <View style={[styles.toggleRowNew, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                  <View style={styles.toggleLeft}>
                    <View style={[styles.toggleIconBox, { backgroundColor: listOnStore ? '#10B98118' : theme.backgroundElement }]}>
                      <Ionicons name="storefront-outline" size={20} color={listOnStore ? '#10B981' : theme.textSecondary} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={[styles.toggleLabel, { color: theme.text }]}>List on Online Store</Text>
                      <Text style={[styles.toggleSub, { color: theme.textSecondary }]}>
                        {listOnStore ? 'Visible on public storefront for WhatsApp orders' : 'Hidden from public storefront catalog'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={listOnStore}
                    onValueChange={setListOnStore}
                    trackColor={{ false: theme.border, true: '#10B981' }}
                    thumbColor={listOnStore ? '#FFFFFF' : theme.textSecondary}
                  />
                </View>
              </ScrollView>

              {/* ── Fixed Footer Action Bar ── */}
              <View style={[styles.modalFooterNew, { borderTopColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <Button
                  title="Cancel"
                  variant="outline"
                  size="medium"
                  onPress={() => setModalVisible(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title={editingId ? 'Save Changes' : 'Add to Catalog'}
                  variant="primary"
                  size="medium"
                  onPress={handleSaveProduct}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

// ── Reusable info row ─────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, valueColor, theme }: { icon: string; label: string; value: string; valueColor?: string; theme: any }) {
  return (
    <View style={[infoRowStyles.row, { borderBottomColor: theme.border }]}>
      <View style={infoRowStyles.left}>
        <Ionicons name={icon as any} size={15} color={theme.textSecondary} />
        <Text style={[infoRowStyles.label, { color: theme.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[infoRowStyles.value, { color: valueColor ?? theme.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}
const infoRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 13, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 12 },
});

const styles = StyleSheet.create({
  searchContainer: { padding: 16, borderBottomWidth: 1 },
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 46 },
  searchInputContainer: { flex: 1, marginVertical: 0 },
  searchInput: { fontSize: 14, height: '100%' },
  importBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 46, gap: 6 },
  chipsRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },

  listContent: { padding: 14, paddingBottom: 100 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 12, paddingHorizontal: 32, fontWeight: '500', lineHeight: 20 },

  productCard: { flexDirection: 'row', padding: 14, marginVertical: 5, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  productName: { fontSize: 15, fontWeight: '700', flex: 1 },
  badgeRow: { flexDirection: 'row', gap: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 0.5 },
  badgeText: { fontSize: 9, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' },
  metaText: { fontSize: 11, fontWeight: '600' },
  boxBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, marginLeft: 6 },
  boxBadgeText: { fontSize: 11, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  priceBlock: { alignItems: 'flex-start' },
  priceLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 1 },
  priceValue: { fontSize: 13, fontWeight: '800' },
  priceDivider: { width: 1, height: 24, marginHorizontal: 4 },
  rightCol: { alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  stockText: { fontSize: 13, fontWeight: '700' },

  fab: { position: 'absolute', right: 20, bottom: 96, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },

  // ── Detail sheet ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 17, 21, 0.65)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 24 : 0,
  },
  sheetCard: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 560 : '100%',
    borderRadius: Platform.OS === 'web' ? 20 : 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 40 : 22,
    maxHeight: '90%',
    borderWidth: Platform.OS === 'web' ? 1 : 0,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
        } as any)
      : {}),
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  sheetIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '800', lineHeight: 24 },
  sheetSubtitle: { fontSize: 12, marginTop: 3 },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  sheetBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  sheetBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  sheetBadgeDot: { width: 7, height: 7, borderRadius: 4 },
  sheetBadgeText: { fontSize: 12, fontWeight: '700' },

  sheetPriceRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  sheetPriceCard: { flex: 1, minWidth: 90, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center' },
  sheetPriceCardLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  sheetPriceCardVal: { fontSize: 16, fontWeight: '900' },
  sheetMarginText: { fontSize: 10, fontWeight: '700', marginTop: 2 },

  infoGrid: { borderTopWidth: 1, marginBottom: 16 },

  adjustCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16 },
  adjustCardTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  adjustBtnRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  deltaBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  deltaBtnText: { fontWeight: '800', fontSize: 14 },

  sheetActions: { flexDirection: 'row', gap: 12 },
  sheetEditBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 13 },
  sheetEditBtnText: { fontWeight: '800', fontSize: 14 },
  sheetDeleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingVertical: 13 },
  sheetDeleteBtnText: { fontWeight: '700', fontSize: 14 },

  // ── Add/Edit Modal (Centered, Executive, Theme-aware) ──
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(15, 17, 21, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 24 : 14,
    zIndex: 99999,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 580,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCardNew: {
    width: '100%',
    maxWidth: 580,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: Platform.OS === 'web' ? ('88vh' as any) : '94%',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.04)',
        } as any)
      : {
          elevation: 24,
        }),
  },
  modalHeaderNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalHeaderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleNew: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  modalSubtitleNew: {
    fontSize: 12,
    marginTop: 2,
    maxWidth: 420,
  },
  modalCloseBtnNew: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formScrollNew: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 14,
  },
  formSection: {
    gap: 10,
  },
  formSectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  profitPreviewNew: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 2,
  },
  toggleRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
  },
  toggleIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooterNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 4 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  toggleLabel: { fontSize: 13.5, fontWeight: '700' },
  toggleSub: { fontSize: 11, marginTop: 1 },

  // Card Quick Action Buttons
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  cardActionIconBtn: {
    padding: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sheet Top Action Bar
  sheetTopActionBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sheetTopActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  sheetTopActionText: {
    fontSize: 12.5,
    fontWeight: '800',
  },

  // Restock Modal
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  restockCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
    maxWidth: 260,
  },
  stockOverviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 12,
  },
  quickChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
});
