import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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

const DEFAULT_FEE_KEY = 'vaypar_owner_default_service_fee';

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

  // Service & Labor Fee decided by Owner (Auto-added to totals)
  const [ownerServiceFee, setOwnerServiceFee] = useState('200');
  const [serviceJobDescription, setServiceJobDescription] = useState('Service & Labor Charges');

  // Itemized additional tasks
  const [serviceTasks, setServiceTasks] = useState<CustomServiceItem[]>([]);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskFee, setNewTaskFee] = useState('');
  const [showExtraTaskForm, setShowExtraTaskForm] = useState(false);

  // Additional service fee / adjustments
  const [additionalServiceFee, setAdditionalServiceFee] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [jobNotes, setJobNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Completed Invoice Receipt
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<sqlite.Invoice | null>(null);
  const [createdItems, setCreatedItems] = useState<sqlite.InvoiceItem[]>([]);

  // Load saved default service fee on mount
  useEffect(() => {
    AsyncStorage.getItem(DEFAULT_FEE_KEY)
      .then(saved => {
        if (saved !== null && saved !== undefined && saved.trim() !== '') {
          setOwnerServiceFee(saved);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveDefaultFee = async () => {
    const feeVal = ownerServiceFee.trim() || '0';
    try {
      await AsyncStorage.setItem(DEFAULT_FEE_KEY, feeVal);
      Alert.alert('Default Saved', `PKR ${feeVal} is now your default service fee. It will load automatically on new bills.`);
    } catch {}
  };

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

  // Totals calculations - Automatically includes ownerServiceFee!
  const totals = useMemo(() => {
    const productsSubtotal = selectedProducts.reduce((sum, p) => sum + p.total, 0);
    const directOwnerFee = parseFloat(ownerServiceFee.replace(/,/g, '')) || 0;
    const tasksFeeTotal = serviceTasks.reduce((sum, t) => sum + (t.fee || 0), 0);
    const extraFee = parseFloat(additionalServiceFee.replace(/,/g, '')) || 0;
    
    // Automatically combines owner service fee + any itemized tasks + extra fees
    const totalServiceCharges = directOwnerFee + tasksFeeTotal + extraFee;

    const discount = parseFloat(discountInput.replace(/,/g, '')) || 0;
    const gross = productsSubtotal + totalServiceCharges;
    const netTotal = Math.max(0, gross - discount);

    return {
      productsSubtotal,
      directOwnerFee,
      totalServiceCharges,
      discount,
      netTotal,
    };
  }, [selectedProducts, ownerServiceFee, serviceTasks, additionalServiceFee, discountInput]);

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
    const directFee = parseFloat(ownerServiceFee.replace(/,/g, '')) || 0;

    if (selectedProducts.length === 0 && directFee === 0 && serviceTasks.length === 0) {
      Alert.alert('Empty Job', 'Please add at least one product/part or enter a service fee.');
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

      // 1. Direct Owner Service Fee line item
      if (directFee > 0) {
        invoiceItemsToSave.push({
          productId: `svc_owner_${Date.now()}`,
          productName: `[Service] ${serviceJobDescription.trim() || 'Service & Labor Fee'}`,
          quantity: 1,
          price: directFee,
        });
      }

      // 2. Extra itemized service tasks
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

      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setSelectedProducts([]);
      setServiceTasks([]);
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
          <Card style={{ padding: 16, borderColor: theme.border, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="construct-outline" size={20} color={theme.primary} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
                  Personalized Services & Labor Charges
                </Text>
              </View>
              <View style={{ backgroundColor: theme.primary + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: theme.primary, letterSpacing: 0.5 }}>AUTO-ADDS TO BILL</Text>
              </View>
            </View>

            {/* Direct Service Fee & Description */}
            <View style={{ gap: 10, marginBottom: 12 }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                  Service / Job Description
                </Text>
                <TextInput
                  placeholder="e.g. Fitting Labor, Oil Change, Screen Repair..."
                  placeholderTextColor={theme.textSecondary}
                  value={serviceJobDescription}
                  onChangeText={setServiceJobDescription}
                  style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
              </View>

              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
                    Service Fee (PKR) <Text style={{ color: theme.primary, fontWeight: '600' }}>* Automatically Added</Text>
                  </Text>
                  <TouchableOpacity onPress={handleSaveDefaultFee} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="bookmark-outline" size={13} color={theme.primary} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>Save as Default</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  placeholder="Enter fee (e.g. 200, 500)"
                  placeholderTextColor={theme.textSecondary}
                  value={ownerServiceFee}
                  onChangeText={setOwnerServiceFee}
                  keyboardType="numeric"
                  style={[styles.inputField, { borderColor: theme.primary, color: theme.text, backgroundColor: theme.background, fontSize: 16, fontWeight: '700' }]}
                />
              </View>

              {/* Quick Preset Chips */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                {['100', '200', '300', '500', '1000', '1500'].map(amt => {
                  const isSelected = ownerServiceFee === amt;
                  return (
                    <TouchableOpacity
                      key={amt}
                      onPress={() => setOwnerServiceFee(amt)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderColor: isSelected ? theme.primary : theme.border,
                        backgroundColor: isSelected ? theme.primary + '18' : theme.background,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: isSelected ? theme.primary : theme.textSecondary }}>
                        PKR {amt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => setOwnerServiceFee('0')}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>Clear (0)</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List of additional itemized service tasks if any */}
            {serviceTasks.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                  Extra Tasks ({serviceTasks.length})
                </Text>
                {serviceTasks.map(task => (
                  <View
                    key={task.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: theme.background,
                      borderWidth: 1,
                      borderColor: theme.border,
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{task.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: theme.primary }}>
                        PKR {task.fee.toFixed(0)}
                      </Text>
                      <TouchableOpacity onPress={() => handleRemoveTask(task.id)}>
                        <Ionicons name="trash-outline" size={16} color={theme.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Toggle extra task inline box */}
            <TouchableOpacity
              onPress={() => setShowExtraTaskForm(!showExtraTaskForm)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 6,
                marginBottom: showExtraTaskForm ? 10 : 4,
              }}
            >
              <Ionicons name={showExtraTaskForm ? 'chevron-up-circle-outline' : 'add-circle-outline'} size={18} color={theme.primary} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.primary }}>
                {showExtraTaskForm ? 'Hide Extra Tasks Form' : '+ Add Extra Labor / Itemized Job'}
              </Text>
            </TouchableOpacity>

            {showExtraTaskForm && (
              <View style={[styles.addTaskBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border, marginBottom: 10 }]}>
                <View style={{ flex: 1.5 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, marginBottom: 4 }}>
                    Extra Task Name
                  </Text>
                  <TextInput
                    placeholder="e.g. Extra Inspection"
                    placeholderTextColor={theme.textSecondary}
                    value={newTaskName}
                    onChangeText={setNewTaskName}
                    style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, marginBottom: 4 }}>
                    Fee (PKR)
                  </Text>
                  <TextInput
                    placeholder="0"
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
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Additional Service Charges & Discount */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
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
              title="Generate Service Slip"
              variant="primary"
              size="large"
              loading={isSubmitting}
              onPress={handleCompleteService}
              icon={<Ionicons name="receipt-outline" size={18} color="#fff" />}
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
