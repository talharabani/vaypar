import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import { useDatabase } from '../../context/DatabaseContext';
import { NotificationContainer, useToasts } from '../../components/restaurant/NotificationToast';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import {
  RestaurantMenuItem,
  getMenuItems,
  initRestaurantSchema,
  saveOrderHistory,
} from '../../services/restaurantDb';
import ScreenWrapper from '../../components/ScreenWrapper';
import { CustomerNameInput } from '../../components/CustomerNameInput';
import { CustomerPhoneInput } from '../../components/CustomerPhoneInput';
import { validateCustomerName, validateCustomerPhone, detectCountryCode } from '../../utils/phoneUtils';

interface CartItem {
  menuItem: RestaurantMenuItem;
  qty: number;
  notes?: string;
}

export default function PosScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { createInvoice } = useDatabase();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  // Order Settings
  const [orderType, setOrderType] = useState<'Dining' | 'Takeaway'>('Dining');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [countryCode, setCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [discountAmount, setDiscountAmount] = useState('0');

  // Menu Catalog State
  const [menuItems, setMenuItems] = useState<RestaurantMenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutModal, setCheckoutModal] = useState(false);

  // Load Menu Items
  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      await initRestaurantSchema();
      const items = await getMenuItems(user.businessId);
      setMenuItems(items);
    } catch (e) {
      console.error('Failed to load menu items:', e);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return ['All', ...Array.from(set)];
  }, [menuItems]);

  // Filtered Menu Items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch =
        item.productName.toLowerCase().includes(search.toLowerCase()) ||
        (item.category || '').toLowerCase().includes(search.toLowerCase());
      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
      return matchesSearch && matchesCat && item.isAvailable === 1;
    });
  }, [menuItems, search, selectedCategory]);

  // Cart Actions
  const addToCart = (menuItem: RestaurantMenuItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((ci) => ci.menuItem.id === menuItem.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx].qty += 1;
        return updated;
      }
      return [...prev, { menuItem, qty: 1 }];
    });
    pushToast('success', 'Item Added', `Added ${menuItem.productName} to cart`);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((ci) => {
          if (ci.menuItem.id === id) {
            const newQty = ci.qty + delta;
            return newQty > 0 ? { ...ci, qty: newQty } : null;
          }
          return ci;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const clearCart = () => {
    setCart([]);
  };

  // Financial Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.menuItem.price * item.qty, 0);
  }, [cart]);

  const discount = parseFloat(discountAmount) || 0;
  const grandTotal = Math.max(0, subtotal - discount);

  // Complete Order
  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert('Cart Empty', 'Please add items to cart before completing checkout.');
      return;
    }

    if (customerName.trim()) {
      const nameVal = validateCustomerName(customerName);
      if (!nameVal.isValid) {
        Alert.alert('Invalid Customer Name', nameVal.error || 'Name cannot contain numbers.');
        return;
      }
    }

    let finalPhone = customerPhone.trim();
    if (customerPhone.trim()) {
      const phoneVal = validateCustomerPhone(customerPhone, countryCode);
      if (!phoneVal.isValid) {
        Alert.alert('Invalid Phone Number', phoneVal.error || 'Please enter a valid phone number.');
        return;
      }
      finalPhone = phoneVal.fullPhone;
    }

    try {
      // 1. Create Invoice in main system
      const invoiceItems = cart.map((ci) => ({
        productId: ci.menuItem.productId || ci.menuItem.id,
        productName: ci.menuItem.productName,
        price: ci.menuItem.price,
        quantity: ci.qty,
        total: ci.menuItem.price * ci.qty,
      }));

      await createInvoice(
        customerName.trim() || `${orderType} Customer`,
        finalPhone,
        subtotal,
        discount,
        grandTotal,
        invoiceItems
      );

      // 2. Log in Order History
      const mockSession: any = {
        id: 'sess_' + Date.now(),
        tableId: 'pos_' + orderType.toLowerCase(),
        businessId: user?.businessId || 'default',
        openedAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
        guestCount: 1,
        waiterId: user?.id || 'pos',
        totalAmount: grandTotal,
        events: '[]',
      };

      const mockOrder: any = {
        id: 'ord_' + Date.now(),
        businessId: user?.businessId || 'default',
        tableId: mockSession.tableId,
        sessionId: mockSession.id,
        waiterId: user?.id || 'pos',
        waiterName: user?.name || 'POS Cashier',
        status: 'served',
        priority: 'normal',
        course: 'main',
        notes: `${orderType} Order`,
        createdAt: new Date().toISOString(),
        kitchenReceivedAt: null,
        preparingAt: null,
        readyAt: null,
        servedAt: new Date().toISOString(),
        estimatedMinutes: 0,
        lastUpdated: new Date().toISOString(),
        synced: 0,
      };

      const mockItems: any[] = cart.map((ci) => ({
        id: 'itm_' + Math.random().toString(36).substring(2, 9),
        orderId: mockOrder.id,
        productId: ci.menuItem.productId || ci.menuItem.id,
        productName: ci.menuItem.productName,
        price: ci.menuItem.price,
        quantity: ci.qty,
        status: 'served',
        kitchenStation: 'general',
        estimatedMinutes: 0,
        modifiers: '[]',
        course: 'main',
        changeType: 'added',
        lastUpdated: new Date().toISOString(),
      }));

      await saveOrderHistory(mockSession, orderType, [mockOrder], mockItems);

      pushToast('success', 'Order Completed', `Order Completed (${orderType}) - Total: $${grandTotal.toFixed(2)}`);
      clearCart();
      setCustomerName('');
      setCustomerPhone('');
      setDiscountAmount('0');
      setCheckoutModal(false);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e.message || 'Failed to process checkout');
    }
  };

  return (
    <ScreenWrapper title="Sell Products POS">
      <NotificationContainer toasts={toasts} onDismiss={dismissToast} />
      <View style={styles.container}>
        {/* Top Bar: Order Type Selection & Search */}
        <View style={[styles.topBar, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.orderTypeContainer}>
            <TouchableOpacity
              style={[
                styles.orderTypeBtn,
                orderType === 'Dining' && { backgroundColor: theme.primary },
              ]}
              onPress={() => setOrderType('Dining')}
            >
              <Ionicons
                name="restaurant"
                size={16}
                color={orderType === 'Dining' ? '#FFF' : theme.textSecondary}
              />
              <Text
                style={[
                  styles.orderTypeText,
                  { color: orderType === 'Dining' ? '#FFF' : theme.textSecondary },
                ]}
              >
                Dining
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.orderTypeBtn,
                orderType === 'Takeaway' && { backgroundColor: theme.primary },
              ]}
              onPress={() => setOrderType('Takeaway')}
            >
              <Ionicons
                name="bag-handle"
                size={16}
                color={orderType === 'Takeaway' ? '#FFF' : theme.textSecondary}
              />
              <Text
                style={[
                  styles.orderTypeText,
                  { color: orderType === 'Takeaway' ? '#FFF' : theme.textSecondary },
                ]}
              >
                Takeaway
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search food items..."
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
        </View>

        {/* Main Content Layout (Catalog Grid + Cart Panel) */}
        <View style={styles.mainLayout}>
          {/* Left: Category Filters & Product Catalog Grid */}
          <View style={styles.catalogSection}>
            {/* Category Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryContent}
            >
              {categories.map((cat) => {
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

            {/* Products Grid */}
            {filteredMenuItems.length === 0 ? (
              <Card style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="fast-food-outline" size={48} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No products found. Add dishes in the "Products" tab to get started!
                </Text>
              </Card>
            ) : (
              <FlatList
                data={filteredMenuItems}
                keyExtractor={(item) => item.id}
                numColumns={Platform.OS === 'web' ? 3 : 2}
                key={Platform.OS === 'web' ? 'web-3' : 'mobile-2'}
                contentContainerStyle={{ paddingBottom: 100 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.productCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                    onPress={() => addToCart(item)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.categoryBadge, { backgroundColor: theme.primary + '20' }]}>
                      <Text style={[styles.categoryBadgeText, { color: theme.primary }]}>
                        {item.category || 'General'}
                      </Text>
                    </View>
                    <Text style={[styles.productName, { color: theme.text }]} numberOfLines={2}>
                      {item.productName}
                    </Text>
                    <View style={styles.productFooter}>
                      <Text style={[styles.productPrice, { color: theme.primary }]}>
                        ${item.price.toFixed(2)}
                      </Text>
                      <View style={[styles.addBtn, { backgroundColor: theme.primary }]}>
                        <Ionicons name="add" size={18} color="#FFF" />
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          {/* Right: Active Cart Panel */}
          <View style={[styles.cartSection, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.cartHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="cart" size={22} color={theme.primary} />
                <Text style={[styles.cartTitle, { color: theme.text }]}>Order Cart</Text>
              </View>
              <View style={[styles.orderTypeBadge, { backgroundColor: theme.primary + '20' }]}>
                <Text style={[styles.orderTypeBadgeText, { color: theme.primary }]}>{orderType}</Text>
              </View>
            </View>

            {cart.length === 0 ? (
              <View style={styles.emptyCartContainer}>
                <Ionicons name="cart-outline" size={48} color={theme.textSecondary} />
                <Text style={[styles.emptyCartText, { color: theme.textSecondary }]}>
                  Select products to add to current order.
                </Text>
              </View>
            ) : (
              <>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }}>
                  {cart.map((ci) => (
                    <View key={ci.menuItem.id} style={[styles.cartItemRow, { borderBottomColor: theme.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cartItemName, { color: theme.text }]}>
                          {ci.menuItem.productName}
                        </Text>
                        <Text style={[styles.cartItemPrice, { color: theme.primary }]}>
                          ${(ci.menuItem.price * ci.qty).toFixed(2)}
                        </Text>
                      </View>

                      {/* Quantity Selector */}
                      <View style={[styles.qtyBox, { borderColor: theme.border }]}>
                        <TouchableOpacity onPress={() => updateQty(ci.menuItem.id, -1)} style={styles.qtyBtn}>
                          <Ionicons name="remove" size={16} color={theme.text} />
                        </TouchableOpacity>
                        <Text style={[styles.qtyText, { color: theme.text }]}>{ci.qty}</Text>
                        <TouchableOpacity onPress={() => updateQty(ci.menuItem.id, 1)} style={styles.qtyBtn}>
                          <Ionicons name="add" size={16} color={theme.text} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                {/* Billing Summary */}
                <View style={[styles.summaryBox, { borderTopColor: theme.border }]}>
                  <View style={styles.summaryRow}>
                    <Text style={{ color: theme.textSecondary }}>Subtotal</Text>
                    <Text style={{ color: theme.text, fontWeight: '700' }}>${subtotal.toFixed(2)}</Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={{ color: theme.textSecondary }}>Discount ($)</Text>
                    <TextInput
                      style={[styles.discountInput, { color: theme.primary, borderColor: theme.border }]}
                      keyboardType="numeric"
                      value={discountAmount}
                      onChangeText={setDiscountAmount}
                    />
                  </View>

                  <View style={styles.summaryRowGrand}>
                    <Text style={[styles.grandTotalLabel, { color: theme.text }]}>Grand Total</Text>
                    <Text style={[styles.grandTotalValue, { color: theme.primary }]}>
                      ${grandTotal.toFixed(2)}
                    </Text>
                  </View>

                  <Button
                    title={`Complete Order (${orderType})`}
                    onPress={() => setCheckoutModal(true)}
                    style={{ marginTop: 12 }}
                  />
                </View>
              </>
            )}
          </View>
        </View>

        {/* Checkout Modal */}
        <Modal visible={checkoutModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Checkout & Payment</Text>
                <TouchableOpacity onPress={() => setCheckoutModal(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: theme.text }]}>Customer Details (Optional)</Text>
              <CustomerNameInput
                label="Customer Name"
                placeholder="Customer Name"
                value={customerName}
                onChangeText={setCustomerName}
              />
              <CustomerPhoneInput
                label="Phone Number"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                selectedCountryCode={countryCode}
                onCountryCodeChange={setCountryCode}
              />

              <Text style={[styles.inputLabel, { color: theme.text, marginTop: 12 }]}>Payment Method</Text>
              <View style={styles.paymentMethodRow}>
                {(['Cash', 'UPI', 'Card'] as const).map((pm) => (
                  <TouchableOpacity
                    key={pm}
                    style={[
                      styles.pmChip,
                      { borderColor: theme.border },
                      paymentMethod === pm && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                    onPress={() => setPaymentMethod(pm)}
                  >
                    <Text style={[styles.pmChipText, { color: paymentMethod === pm ? '#FFF' : theme.text }]}>
                      {pm}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.checkoutSummaryCard, { backgroundColor: theme.backgroundElement }]}>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Total Amount Due</Text>
                <Text style={{ color: theme.primary, fontSize: 28, fontWeight: '800', marginTop: 4 }}>
                  ${grandTotal.toFixed(2)}
                </Text>
              </View>

              <Button title="Confirm Payment & Complete" onPress={handleCheckout} style={{ marginTop: 16 }} />
            </View>
          </View>
        </Modal>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  topBar: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 16, marginBottom: 12, gap: 12 },
  orderTypeContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.1)', padding: 4, borderRadius: 20 },
  orderTypeBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, gap: 6 },
  orderTypeText: { fontWeight: '700', fontSize: 13 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 42, borderRadius: 20, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  mainLayout: { flex: 1, flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 12 },
  catalogSection: { flex: Platform.OS === 'web' ? 1.6 : 1 },
  categoryScroll: { marginBottom: 12, maxHeight: 40 },
  categoryContent: { gap: 8, paddingRight: 16 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  categoryChipText: { fontSize: 13, fontWeight: '600' },
  productCard: { flex: 1, margin: 6, padding: 14, borderRadius: 16, borderWidth: 1, justifyContent: 'space-between' },
  categoryBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  categoryBadgeText: { fontSize: 11, fontWeight: '700' },
  productName: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  productFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  productPrice: { fontSize: 16, fontWeight: '800' },
  addBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  cartSection: { flex: Platform.OS === 'web' ? 1 : 1, padding: 16, borderRadius: 20, borderWidth: 1 },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cartTitle: { fontSize: 18, fontWeight: '800' },
  orderTypeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  orderTypeBadgeText: { fontSize: 12, fontWeight: '700' },
  emptyCartContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyCartText: { textAlign: 'center', fontSize: 14, marginTop: 12 },
  cartItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  cartItemName: { fontSize: 14, fontWeight: '700' },
  cartItemPrice: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12 },
  qtyBtn: { padding: 8 },
  qtyText: { paddingHorizontal: 10, fontWeight: '700', fontSize: 14 },
  summaryBox: { paddingTop: 12, borderTopWidth: 1, gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  discountInput: { width: 70, height: 32, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  summaryRowGrand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  grandTotalLabel: { fontSize: 16, fontWeight: '800' },
  grandTotalValue: { fontSize: 22, fontWeight: '800' },
  emptyCard: { padding: 32, alignItems: 'center', borderRadius: 16 },
  emptyText: { marginTop: 12, textAlign: 'center', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  modalCard: { borderRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  modalInput: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8, fontSize: 14 },
  paymentMethodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pmChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  pmChipText: { fontSize: 13, fontWeight: '700' },
  checkoutSummaryCard: { padding: 16, borderRadius: 16, alignItems: 'center' },
});
