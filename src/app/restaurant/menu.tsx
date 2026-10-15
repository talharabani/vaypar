import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  RefreshControl,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import {
  RestaurantMenuItem,
  getMenuItems,
  upsertMenuItem,
  toggleMenuItemAvailability,
  initRestaurantSchema,
} from '../../services/restaurantDb';

const PRODUCT_CATEGORIES = [
  'Appetizers & Starters',
  'Main Course',
  'Beverages & Drinks',
  'Desserts & Sweets',
  'Snacks & Fast Food',
  'Special Combo',
];

export default function MenuScreen() {
  const theme = useTheme();
  const { user } = useAuth();

  const [menuItems, setMenuItems] = useState<RestaurantMenuItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Modal State for Add/Edit Product
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState(PRODUCT_CATEGORIES[0]);
  const [isAvailable, setIsAvailable] = useState(true);
  const [formError, setFormError] = useState('');

  const loadAll = useCallback(async () => {
    if (!user) return;
    try {
      await initRestaurantSchema();
      const items = await getMenuItems(user.businessId);
      setMenuItems(items);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleToggle = useCallback(
    async (item: RestaurantMenuItem) => {
      try {
        await toggleMenuItemAvailability(item.id, item.isAvailable === 0);
        await loadAll();
      } catch (e) {
        console.error(e);
      }
    },
    [loadAll]
  );

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingId('');
    setProductName('');
    setPrice('');
    setCategory(PRODUCT_CATEGORIES[0]);
    setIsAvailable(true);
    setFormError('');
    setModalVisible(true);
  };

  const openEditModal = (item: RestaurantMenuItem) => {
    setIsEditMode(true);
    setEditingId(item.productId || item.id);
    setProductName(item.productName);
    setPrice(String(item.price));
    setCategory(item.category || PRODUCT_CATEGORIES[0]);
    setIsAvailable(item.isAvailable === 1);
    setFormError('');
    setModalVisible(true);
  };

  const handleSaveProduct = async () => {
    if (!user) return;
    if (!productName.trim()) {
      setFormError('Product name is required');
      return;
    }
    const numPrice = parseFloat(price) || 0;
    if (numPrice < 0) {
      setFormError('Please enter a valid price');
      return;
    }

    try {
      const pId = editingId || 'prod_' + Date.now();
      await upsertMenuItem(
        user.businessId,
        pId,
        productName.trim(),
        numPrice,
        'general',
        10,
        'main',
        isAvailable ? 1 : 0,
        '[]'
      );
      setModalVisible(false);
      await loadAll();
    } catch (e: any) {
      setFormError(e.message || 'Failed to save product');
    }
  };

  const filtered = useMemo(() => {
    return menuItems.filter((m) => {
      const matchesSearch =
        m.productName.toLowerCase().includes(search.toLowerCase()) ||
        (m.category || '').toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || m.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, search, selectedCategory]);

  return (
    <ScreenWrapper title="Products & Menu">
      <View style={styles.container}>
        {/* Top Header Card */}
        <Card style={[styles.headerCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.headerSubTitle, { color: theme.textSecondary }]}>
                Product Catalog & Menu
              </Text>
              <Text style={[styles.headerTitle, { color: theme.primary }]}>
                {menuItems.length} Products
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.primary }]}
              onPress={openAddModal}
            >
              <Ionicons name="add-circle" size={18} color="#FFF" />
              <Text style={styles.addButtonText}>Add Product</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search products by name or category..."
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContent}
        >
          {['All', ...PRODUCT_CATEGORIES].map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  { borderColor: theme.border },
                  isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    { color: isSelected ? '#FFF' : theme.textSecondary },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Product List */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filtered.length === 0 ? (
            <Card style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="restaurant-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No products found in catalog.
              </Text>
              <Button title="Add First Product" onPress={openAddModal} style={{ marginTop: 12 }} />
            </Card>
          ) : (
            filtered.map((item) => (
              <Card key={item.id} style={[styles.productCard, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.productMain}>
                  <View style={[styles.categoryTag, { backgroundColor: theme.primary + '18' }]}>
                    <Text style={[styles.categoryTagText, { color: theme.primary }]}>
                      {item.category || 'General'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.productName, { color: theme.text }]}>{item.productName}</Text>
                    <Text style={[styles.productPrice, { color: theme.primary }]}>
                      ${item.price.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.rightActions}>
                    <View style={styles.toggleRow}>
                      <Text style={[styles.stockLabel, { color: item.isAvailable ? '#10B981' : '#EF4444' }]}>
                        {item.isAvailable ? 'In Stock' : 'Out'}
                      </Text>
                      <Switch
                        value={item.isAvailable === 1}
                        onValueChange={() => handleToggle(item)}
                        trackColor={{ false: '#EF444440', true: '#10B98160' }}
                        thumbColor={item.isAvailable ? '#10B981' : '#EF4444'}
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.editBtn, { borderColor: theme.border }]}
                      onPress={() => openEditModal(item)}
                    >
                      <Ionicons name="create-outline" size={16} color={theme.text} />
                      <Text style={[styles.editBtnText, { color: theme.text }]}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            ))
          )}
        </ScrollView>

        {/* Add/Edit Product Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {isEditMode ? 'Edit Product' : 'Add New Product'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

              <Text style={[styles.inputLabel, { color: theme.text }]}>Product Name</Text>
              <TextInput
                style={[styles.modalInput, { color: theme.text, borderColor: theme.border }]}
                placeholder="e.g. Butter Chicken / Cold Coffee"
                placeholderTextColor={theme.textSecondary}
                value={productName}
                onChangeText={setProductName}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Price ($)</Text>
              <TextInput
                style={[styles.modalInput, { color: theme.text, borderColor: theme.border }]}
                placeholder="e.g. 12.50"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={price}
                onChangeText={setPrice}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.roleChip,
                      { borderColor: theme.border, marginRight: 8 },
                      category === cat && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.roleChipText, { color: category === cat ? '#FFF' : theme.text }]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.modalSwitchRow}>
                <Text style={[styles.inputLabel, { color: theme.text, marginBottom: 0 }]}>Available / In Stock</Text>
                <Switch
                  value={isAvailable}
                  onValueChange={setIsAvailable}
                  trackColor={{ false: '#EF444440', true: '#10B98160' }}
                  thumbColor={isAvailable ? '#10B981' : '#EF4444'}
                />
              </View>

              <Button title={isEditMode ? 'Update Product' : 'Save Product'} onPress={handleSaveProduct} style={{ marginTop: 16 }} />
            </View>
          </View>
        </Modal>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerCard: { padding: 16, borderRadius: 16, marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerSubTitle: { fontSize: 13, fontWeight: '500' },
  headerTitle: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  addButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 6 },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44, borderRadius: 22, borderWidth: 1, marginBottom: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  categoryScroll: { marginBottom: 16 },
  categoryContent: { gap: 8, paddingRight: 16 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  categoryChipText: { fontSize: 12, fontWeight: '600' },
  productCard: { padding: 14, borderRadius: 16, marginBottom: 12 },
  productMain: { flexDirection: 'row', alignItems: 'center' },
  categoryTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignSelf: 'flex-start' },
  categoryTagText: { fontSize: 11, fontWeight: '700' },
  productName: { fontSize: 16, fontWeight: '700' },
  productPrice: { fontSize: 16, fontWeight: '800', marginTop: 6 },
  rightActions: { alignItems: 'flex-end', gap: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockLabel: { fontSize: 11, fontWeight: '700' },
  editBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, gap: 4 },
  editBtnText: { fontSize: 12, fontWeight: '600' },
  emptyCard: { padding: 32, alignItems: 'center', borderRadius: 16 },
  emptyText: { marginTop: 12, textAlign: 'center', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  modalCard: { borderRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  errorText: { color: '#EF4444', fontSize: 13, marginBottom: 10 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  modalInput: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12, fontSize: 14 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  roleChipText: { fontSize: 12, fontWeight: '600' },
  modalSwitchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
});
