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
    } catch (e) { console.error(e); }
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

                {/* Right: stock count + chevron */}
                <View style={styles.rightCol}>
                  <Text style={[styles.stockText, { color: isLow ? theme.danger : theme.text }]}>
                    {item.quantity} units
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} style={{ marginTop: 4 }} />
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

                  {/* ── Action buttons ── */}
                  {!isCashier && (
                    <View style={styles.sheetActions}>
                      <TouchableOpacity
                        style={[styles.sheetEditBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
                        onPress={() => handleOpenEditModal(p)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="create-outline" size={18} color={theme.primary} />
                        <Text style={[styles.sheetEditBtnText, { color: theme.primary }]}>Edit Product</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.sheetDeleteBtn, { backgroundColor: theme.danger + '12', borderColor: theme.danger + '40' }]}
                        onPress={() => handleDeleteProduct(p.id, p.name)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.danger} />
                        <Text style={[styles.sheetDeleteBtnText, { color: theme.danger }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          );
        })()}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          ADD / EDIT PRODUCT MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <Card style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {editingId ? 'Edit Product' : 'Add New Product'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              {formError ? (
                <View style={[styles.errorBox, { backgroundColor: theme.danger + '15', borderColor: theme.danger }]}>
                  <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
                  <Text style={[styles.errorText, { color: theme.danger }]}>{formError}</Text>
                </View>
              ) : null}

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
                <Input label="Product Name *" placeholder="e.g. Samsung LED 55 inch" value={name} onChangeText={setName} />

                <View style={styles.row}>
                  <View style={styles.half}>
                    <Input label="Sale Price (PKR) *" placeholder="e.g. 85,000" value={salePrice} onChangeText={setSalePrice} keyboardType="numeric" />
                  </View>
                  <View style={styles.half}>
                    <Input label="Purchase Price (PKR)" placeholder="e.g. 72,000" value={purchasePrice} onChangeText={setPurchasePrice} keyboardType="numeric" />
                  </View>
                </View>

                {salePrice && purchasePrice && parseFloat(salePrice.replace(/,/g, '')) > 0 && parseFloat(purchasePrice.replace(/,/g, '')) > 0 ? (() => {
                  const sp = parseFloat(salePrice.replace(/,/g, '')) || 0;
                  const pp2 = parseFloat(purchasePrice.replace(/,/g, '')) || 0;
                  const pft = sp - pp2;
                  const mgn = pp2 > 0 ? ((pft / pp2) * 100).toFixed(1) : '0';
                  const pos = pft >= 0;
                  return (
                    <View style={[styles.profitPreview, { backgroundColor: pos ? theme.success + '12' : theme.danger + '12', borderColor: pos ? theme.success + '40' : theme.danger + '40' }]}>
                      <Ionicons name={pos ? 'trending-up' : 'trending-down'} size={16} color={pos ? theme.success : theme.danger} />
                      <Text style={{ color: pos ? theme.success : theme.danger, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>
                        Profit: PKR {pft.toFixed(0)} ({mgn}% margin)
                      </Text>
                    </View>
                  );
                })() : null}

                <View style={styles.row}>
                  <View style={styles.half}>
                    <Input label="Stock Qty *" placeholder="e.g. 10" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
                  </View>
                  <View style={styles.half}>
                    <Input label="Low Stock Alert" placeholder="e.g. 3" value={lowStockThreshold} onChangeText={setLowStockThreshold} keyboardType="numeric" />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.half}>
                    <Input label="Category" placeholder="e.g. Fans, Wiring" value={category} onChangeText={setCategory} />
                  </View>
                  <View style={styles.half}>
                    <Input label="Box / Shelf Location" placeholder="e.g. Shelf A3, Box 12" value={boxLocation} onChangeText={setBoxLocation} />
                  </View>
                </View>

                <View style={[styles.toggleRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <View style={styles.toggleLeft}>
                    <Ionicons name="storefront-outline" size={20} color={listOnStore ? theme.primary : theme.textSecondary} />
                    <View style={{ marginLeft: 10 }}>
                      <Text style={[styles.toggleLabel, { color: theme.text }]}>List on Online Store</Text>
                      <Text style={[styles.toggleSub, { color: theme.textSecondary }]}>
                        {listOnStore ? 'Visible to customers' : 'Hidden from public store'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={listOnStore}
                    onValueChange={setListOnStore}
                    trackColor={{ false: theme.border, true: theme.primary + '80' }}
                    thumbColor={listOnStore ? theme.primary : theme.textSecondary}
                  />
                </View>

                <Button title={editingId ? 'Save Changes' : 'Add to Catalog'} variant="primary" size="large" onPress={handleSaveProduct} style={{ marginTop: 16 }} />
              </ScrollView>
            </Card>
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
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '90%' },
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

  // ── Add/Edit modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalCard: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  formScroll: { paddingBottom: 8 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  profitPreview: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8, marginTop: -4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 4 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '700' },
  toggleSub: { fontSize: 11, marginTop: 1 },
});
