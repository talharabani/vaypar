import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ReceiptModal } from '../components/ReceiptModal';
import ScreenWrapper from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useTheme } from '../hooks/use-theme';
import * as sqlite from '../services/sqlite';
import { printThermalSlip } from '../services/thermalPrinter';

interface CustomServiceItem {
  id: string;
  name: string;
  fee: number;
}

interface ProductItemUsed {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export default function PersonalizedServicesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const {
    products,
    customers,
    createInvoice,
    invoices,
    addCustomer,
    refreshData,
  } = useDatabase();

  // Customer info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // Selected products/materials
  const [selectedProducts, setSelectedProducts] = useState<ProductItemUsed[]>([]);
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');

  // Custom service tasks / fees
  const [serviceTasks, setServiceTasks] = useState<CustomServiceItem[]>([
    { id: '1', name: 'Service / Labor Fee', fee: 500 },
  ]);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskFee, setNewTaskFee] = useState('');

  // Additional service fee / adjustments
  const [additionalServiceFee, setAdditionalServiceFee] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [jobNotes, setJobNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Completed Invoice Receipt
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<sqlite.Invoice | null>(null);
  const [createdItems, setCreatedItems] = useState<sqlite.InvoiceItem[]>([]);

  // Filtered customer directory
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 15);
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q))
    );
  }, [customers, customerSearch]);

  // Filtered inventory products
  const filteredInventory = useMemo(() => {
    if (!searchProduct.trim()) return products.slice(0, 20);
    const q = searchProduct.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }, [products, searchProduct]);

  // Totals calculations
  const totals = useMemo(() => {
    const productsSubtotal = selectedProducts.reduce((sum, p) => sum + p.total, 0);
    const tasksFeeTotal = serviceTasks.reduce((sum, t) => sum + (t.fee || 0), 0);
    const extraFee = parseFloat(additionalServiceFee.replace(/,/g, '')) || 0;
    const totalServiceCharges = tasksFeeTotal + extraFee;

    const discount = parseFloat(discountInput.replace(/,/g, '')) || 0;
    const gross = productsSubtotal + totalServiceCharges;
    const netTotal = Math.max(0, gross - discount);

    return {
      productsSubtotal,
      totalServiceCharges,
      discount,
      netTotal,
    };
  }, [selectedProducts, serviceTasks, additionalServiceFee, discountInput]);

  // Add Product to Service Bill
  const handleAddProduct = (prod: sqlite.Product) => {
    const existingIndex = selectedProducts.findIndex(p => p.productId === prod.id);
    if (existingIndex > -1) {
      const updated = [...selectedProducts];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].total = updated[existingIndex].quantity * updated[existingIndex].price;
      setSelectedProducts(updated);
    } else {
      setSelectedProducts([
        ...selectedProducts,
        {
          productId: prod.id,
          name: prod.name,
          quantity: 1,
          price: prod.price,
          total: prod.price,
        },
      ]);
    }
  };

  const handleUpdateProductQty = (productId: string, delta: number) => {
    const updated = selectedProducts
      .map(p => {
        if (p.productId === productId) {
          const newQty = p.quantity + delta;
          return newQty > 0 ? { ...p, quantity: newQty, total: newQty * p.price } : null;
        }
        return p;
      })
      .filter(Boolean) as ProductItemUsed[];
    setSelectedProducts(updated);
  };

  // Add Custom Service Task
  const handleAddServiceTask = () => {
    if (!newTaskName.trim()) {
      Alert.alert('Required', 'Please enter a service name (e.g., Screen Repair, Hair Styling, Installation).');
      return;
    }
    const fee = parseFloat(newTaskFee.replace(/,/g, '')) || 0;
    setServiceTasks([
      ...serviceTasks,
      {
        id: Date.now().toString(),
        name: newTaskName.trim(),
        fee,
      },
    ]);
    setNewTaskName('');
    setNewTaskFee('');
  };

  const handleRemoveTask = (id: string) => {
    setServiceTasks(serviceTasks.filter(t => t.id !== id));
  };

  // Submit and Generate Invoice / Slip
  const handleCompleteService = async () => {
    if (selectedProducts.length === 0 && serviceTasks.length === 0) {
      Alert.alert('Empty Job', 'Please add at least one product/part or service fee.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanCustomer = customerName.trim() || 'Valued Customer';
      const cleanPhone = customerPhone.trim();

      // Combine products + service items as invoice items
      const invoiceItemsToSave: { productId: string; productName: string; quantity: number; price: number }[] = [];

      selectedProducts.forEach(p => {
        invoiceItemsToSave.push({
          productId: p.productId,
          productName: p.name,
          quantity: p.quantity,
          price: p.price,
        });
      });

      // Also record service tasks as line items if products exist, or as dedicated service items
      serviceTasks.forEach((task, idx) => {
        if (task.fee > 0) {
          invoiceItemsToSave.push({
            productId: `svc_${Date.now()}_${idx}`,
            productName: `[Service] ${task.name}`,
            quantity: 1,
            price: task.fee,
          });
        }
      });

      const newInvoiceId = await createInvoice(
        cleanCustomer,
        cleanPhone,
        totals.productsSubtotal,
        totals.discount,
        totals.netTotal,
        invoiceItemsToSave as any,
        totals.totalServiceCharges
      );

      // Auto-save customer profile if phone was entered
      if (cleanCustomer && cleanPhone) {
        try {
          await addCustomer(cleanCustomer, cleanPhone);
        } catch (_) {}
      }

      const now = new Date().toISOString();
      const newInv: sqlite.Invoice = {
        id: newInvoiceId,
        userId: user?.id || 'temp',
        businessId: user?.businessId || 'temp',
        createdBy: user?.id || 'temp',
        customerName: cleanCustomer,
        customerPhone: cleanPhone,
        subtotal: totals.productsSubtotal,
        discount: totals.discount,
        serviceCharges: totals.totalServiceCharges,
        total: totals.netTotal,
        createdAt: now,
        lastUpdated: now,
      };

      const savedItems: sqlite.InvoiceItem[] = invoiceItemsToSave.map((it, idx) => ({
        id: `svc_item_${idx}`,
        invoiceId: newInvoiceId,
        productId: it.productId,
        productName: it.productName,
        price: it.price,
        quantity: it.quantity,
        total: it.price * it.quantity,
        createdAt: now,
        lastUpdated: now,
      }));

      setCreatedInvoice(newInv);
      setCreatedItems(savedItems);
      setReceiptVisible(true);

      // Direct Thermal Slip Trigger
      try {
        await printThermalSlip(user || {}, newInv, savedItems, '80mm');
      } catch (err) {
        console.warn('Auto print warning:', err);
      }

      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setSelectedProducts([]);
      setServiceTasks([{ id: '1', name: 'Service / Labor Fee', fee: 500 }]);
      setAdditionalServiceFee('');
      setDiscountInput('');
      setJobNotes('');
      refreshData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to complete service invoice.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenWrapper title="Personalized Services & POS">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={{ maxWidth: 960, width: '100%', alignSelf: 'center', gap: 16 }}>
          
          {/* Header Description */}
          <View style={[styles.infoBanner, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
            <Ionicons name="sparkles" size={20} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.primary }}>
                Custom Service Package & Job Billing
              </Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                Select parts/materials used from inventory, add customized service/labor fees, and print a branded service receipt slip.
              </Text>
            </View>
          </View>

          {/* Section 1: Customer Details */}
          <Card style={{ padding: 16, borderColor: theme.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="person-outline" size={18} color={theme.primary} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>Customer Details</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCustomerModalVisible(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Ionicons name="search" size={14} color={theme.primary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>Pick Existing Customer</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1.2 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>Customer Name</Text>
                <TextInput
                  placeholder="e.g. Asad Khan / Car # LEA-123"
                  placeholderTextColor={theme.textSecondary}
                  value={customerName}
                  onChangeText={setCustomerName}
                  style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>Mobile Number</Text>
                <TextInput
                  placeholder="e.g. 03001234567"
                  placeholderTextColor={theme.textSecondary}
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  keyboardType="phone-pad"
                  style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
              </View>
            </View>
          </Card>

          {/* Section 2: Products & Materials Used */}
          <Card style={{ padding: 16, borderColor: theme.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="cube-outline" size={18} color={theme.primary} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
                  Parts & Products Used from Inventory
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setProductPickerVisible(true)}
                style={[styles.addItemBtn, { backgroundColor: theme.primary }]}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>+ Select Parts</Text>
              </TouchableOpacity>
            </View>

            {selectedProducts.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <Ionicons name="cube-outline" size={28} color={theme.textSecondary} />
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
                  No materials or parts selected yet. (Click "+ Select Parts" to pick from stock)
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {selectedProducts.map(item => (
                  <View
                    key={item.productId}
                    style={[styles.productRow, { borderColor: theme.border, backgroundColor: theme.background }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{item.name}</Text>
                      <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                        Rate: PKR {item.price.toFixed(0)} × {item.quantity} = PKR {item.total.toFixed(0)}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleUpdateProductQty(item.productId, -1)}
                        style={[styles.qtyBtn, { borderColor: theme.border }]}
                      >
                        <Ionicons name="remove" size={14} color={theme.text} />
                      </TouchableOpacity>
                      <Text style={{ fontWeight: '800', fontSize: 14, color: theme.text, minWidth: 20, textAlign: 'center' }}>
                        {item.quantity}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleUpdateProductQty(item.productId, 1)}
                        style={[styles.qtyBtn, { borderColor: theme.border }]}
                      >
                        <Ionicons name="add" size={14} color={theme.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Section 3: Personalized Service & Labor Tasks */}
          <Card style={{ padding: 16, borderColor: theme.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="construct-outline" size={18} color={theme.primary} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
                Personalized Services & Labor Charges
              </Text>
            </View>

            {/* List of current service tasks */}
            <View style={{ gap: 8, marginBottom: 12 }}>
              {serviceTasks.map(task => (
                <View
                  key={task.id}
                  style={[styles.taskRow, { borderColor: theme.border, backgroundColor: theme.background }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{task.name}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: theme.primary, marginRight: 8 }}>
                    PKR {task.fee.toFixed(0)}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveTask(task.id)}>
                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Add new service task inline */}
            <View style={[styles.addTaskBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={{ flex: 1.5 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, marginBottom: 4 }}>
                  Service / Job Description
                </Text>
                <TextInput
                  placeholder="e.g. Fitting Labor, Oil Change, Screen Repair..."
                  placeholderTextColor={theme.textSecondary}
                  value={newTaskName}
                  onChangeText={setNewTaskName}
                  style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, marginBottom: 4 }}>
                  Service Fee (PKR)
                </Text>
                <TextInput
                  placeholder="e.g. 1000"
                  placeholderTextColor={theme.textSecondary}
                  value={newTaskFee}
                  onChangeText={setNewTaskFee}
                  keyboardType="numeric"
                  style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
              </View>

              <TouchableOpacity
                onPress={handleAddServiceTask}
                style={[styles.addTaskBtn, { backgroundColor: theme.primary }]}
              >
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Add Service</Text>
              </TouchableOpacity>
            </View>

            {/* Additional Service Charges & Discount */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                  Additional Service Fee / Tax
                </Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor={theme.textSecondary}
                  value={additionalServiceFee}
                  onChangeText={setAdditionalServiceFee}
                  keyboardType="numeric"
                  style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                  Discount (PKR)
                </Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor={theme.textSecondary}
                  value={discountInput}
                  onChangeText={setDiscountInput}
                  keyboardType="numeric"
                  style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
              </View>
            </View>
          </Card>

          {/* Section 4: Final Calculations & Print Slip */}
          <Card style={{ padding: 18, borderColor: theme.primary, borderWidth: 1.5 }}>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: theme.textSecondary }}>Parts & Products Total:</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                  PKR {totals.productsSubtotal.toFixed(0)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: theme.textSecondary }}>Service & Labor Charges:</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.primary }}>
                  +PKR {totals.totalServiceCharges.toFixed(0)}
                </Text>
              </View>

              {totals.discount > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: theme.danger }}>Discount:</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.danger }}>
                    -PKR {totals.discount.toFixed(0)}
                  </Text>
                </View>
              )}

              <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 6 }} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: theme.text }}>NET TOTAL PAYABLE:</Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: theme.primary }}>
                  PKR {totals.netTotal.toFixed(0)}
                </Text>
              </View>
            </View>

            <Button
              title="Generate & Print Service Slip"
              variant="primary"
              size="large"
              loading={isSubmitting}
              onPress={handleCompleteService}
              icon={<Ionicons name="print-outline" size={18} color="#fff" />}
              style={{ marginTop: 16 }}
            />
          </Card>
        </View>
      </ScrollView>

      {/* Product Selection Modal */}
      <Modal visible={productPickerVisible} animationType="slide" transparent onRequestClose={() => setProductPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>Select Parts / Products from Inventory</Text>
              <TouchableOpacity onPress={() => setProductPickerVisible(false)}>
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchInputWrapper, { backgroundColor: theme.background, borderColor: theme.border, marginBottom: 10 }]}>
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <TextInput
                placeholder="Search products or parts..."
                placeholderTextColor={theme.textSecondary}
                value={searchProduct}
                onChangeText={setSearchProduct}
                style={[styles.searchInput, { color: theme.text }]}
              />
            </View>

            <FlatList
              data={filteredInventory}
              keyExtractor={item => item.id}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    handleAddProduct(item);
                    setProductPickerVisible(false);
                  }}
                  style={[styles.productPickRow, { borderBottomColor: theme.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                      In Stock: {item.quantity} · Category: {item.category || 'General'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: theme.primary }}>
                    PKR {item.price.toFixed(0)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Card>
        </View>
      </Modal>

      {/* Customer Picker Modal */}
      <Modal visible={customerModalVisible} animationType="fade" transparent onRequestClose={() => setCustomerModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border, maxWidth: 440 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>Select Customer</Text>
              <TouchableOpacity onPress={() => setCustomerModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchInputWrapper, { backgroundColor: theme.background, borderColor: theme.border, marginBottom: 10 }]}>
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <TextInput
                placeholder="Search by name or phone..."
                placeholderTextColor={theme.textSecondary}
                value={customerSearch}
                onChangeText={setCustomerSearch}
                style={[styles.searchInput, { color: theme.text }]}
              />
            </View>

            <FlatList
              data={filteredCustomers}
              keyExtractor={item => item.id}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setCustomerName(item.name);
                    setCustomerPhone(item.phone || '');
                    setCustomerModalVisible(false);
                  }}
                  style={[styles.productPickRow, { borderBottomColor: theme.border }]}
                >
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{item.phone || 'No Phone'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            />
          </Card>
        </View>
      </Modal>

      {/* Receipt Modal with Layers Bakeshop style branding */}
      <ReceiptModal
        visible={receiptVisible}
        invoice={createdInvoice}
        items={createdItems}
        onClose={() => {
          setReceiptVisible(false);
          setCreatedInvoice(null);
          setCreatedItems([]);
        }}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  inputField: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  addTaskBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  addTaskBtn: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    height: '100%',
  },
  productPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
