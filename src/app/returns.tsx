import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { ReturnExchangeReceiptModal } from '../components/ReturnExchangeReceiptModal';
import ScreenWrapper from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useTheme } from '../hooks/use-theme';
import * as sqlite from '../services/sqlite';

export default function ReturnsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const {
    products,
    invoices,
    returnsExchanges,
    createReturnExchange,
    refreshData,
  } = useDatabase();

  const [activeSegment, setActiveSegment] = useState<'process' | 'history'>('process');

  // Receipt Modal State
  const [selectedReturnRecord, setSelectedReturnRecord] = useState<sqlite.ReturnExchange | null>(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);

  // Process form states
  const [selectedInvoice, setSelectedInvoice] = useState<sqlite.Invoice | null>(null);
  const [invoiceItemsList, setInvoiceItemsList] = useState<sqlite.InvoiceItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [returnType, setReturnType] = useState<'return' | 'exchange'>('return');
  const [returnCondition, setReturnCondition] = useState<'resellable' | 'damaged'>('resellable');
  const [returnReason, setReturnReason] = useState('Customer Request');
  const [replacementProductId, setReplacementProductId] = useState('');
  const [replacementQty, setReplacementQty] = useState('1');
  const [returnNotes, setReturnNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  // Search states
  const [searchInvoiceQuery, setSearchInvoiceQuery] = useState('');
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('');

  // Manual Customer fallback (if invoice is not found)
  const [customCustomerName, setCustomCustomerName] = useState('');
  const [customCustomerPhone, setCustomCustomerPhone] = useState('');

  // Filtered invoices for selection
  const filteredInvoices = useMemo(() => {
    if (!searchInvoiceQuery.trim()) return invoices.slice(0, 10);
    const q = searchInvoiceQuery.toLowerCase();
    return invoices.filter(inv =>
      inv.id.toLowerCase().includes(q) ||
      (inv.customerName && inv.customerName.toLowerCase().includes(q)) ||
      (inv.customerPhone && inv.customerPhone.includes(q))
    ).slice(0, 20);
  }, [invoices, searchInvoiceQuery]);

  // Selected item from the active invoice
  const selectedReturnItem = useMemo(() => {
    return invoiceItemsList.find(i => i.id === selectedItemId) || null;
  }, [invoiceItemsList, selectedItemId]);

  // Selected replacement product
  const selectedReplacementProduct = useMemo(() => {
    return products.find(p => p.id === replacementProductId) || null;
  }, [products, replacementProductId]);

  // Real-time calculations
  const returnCalculations = useMemo(() => {
    const q = parseInt(returnQty, 10) || 0;
    const itemPrice = selectedReturnItem ? selectedReturnItem.price : 0;
    const refundVal = q * itemPrice;

    if (returnType === 'return') {
      return {
        refundAmount: refundVal,
        differenceAmount: 0,
        customerPaysExtra: 0,
        storeRefunds: refundVal,
      };
    }

    const repQ = parseInt(replacementQty, 10) || 0;
    const repPrice = selectedReplacementProduct ? selectedReplacementProduct.price : 0;
    const replacementVal = repQ * repPrice;
    const diff = replacementVal - refundVal;

    return {
      refundAmount: diff < 0 ? Math.abs(diff) : 0,
      differenceAmount: diff,
      customerPaysExtra: diff > 0 ? diff : 0,
      storeRefunds: diff < 0 ? Math.abs(diff) : 0,
    };
  }, [selectedReturnItem, returnQty, returnType, selectedReplacementProduct, replacementQty]);

  // Handle invoice select
  const handleSelectInvoice = async (inv: sqlite.Invoice) => {
    setSelectedInvoice(inv);
    try {
      const items = await sqlite.getInvoiceItems(inv.id);
      setInvoiceItemsList(items);
      if (items.length > 0) {
        setSelectedItemId(items[0].id);
        setReturnQty('1');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load items for this invoice.');
    }
  };

  // Submit return or exchange
  const handleProcessSubmit = async () => {
    if (!selectedReturnItem) {
      Alert.alert('Selection Required', 'Please select an invoice item to return or exchange.');
      return;
    }
    const q = parseInt(returnQty, 10);
    if (isNaN(q) || q <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid return quantity.');
      return;
    }
    if (q > selectedReturnItem.quantity) {
      Alert.alert('Quantity Exceeded', `Cannot return more than ${selectedReturnItem.quantity} units.`);
      return;
    }
    if (returnType === 'exchange') {
      if (!selectedReplacementProduct) {
        Alert.alert('Replacement Required', 'Please select a replacement product from inventory.');
        return;
      }
      const repQ = parseInt(replacementQty, 10);
      if (isNaN(repQ) || repQ <= 0) {
        Alert.alert('Invalid Quantity', 'Please enter replacement product quantity.');
        return;
      }
      if (repQ > selectedReplacementProduct.quantity) {
        Alert.alert('Insufficient Stock', `Only ${selectedReplacementProduct.quantity} units of "${selectedReplacementProduct.name}" in stock.`);
        return;
      }
    }

    setProcessing(true);
    try {
      const custName = selectedInvoice?.customerName || customCustomerName.trim() || 'Valued Customer';
      const custPhone = selectedInvoice?.customerPhone || customCustomerPhone.trim() || '';

      const createdRecord = await createReturnExchange({
        invoiceId: selectedInvoice?.id || undefined,
        customerName: custName,
        customerPhone: custPhone,
        type: returnType,
        originalProductId: selectedReturnItem.productId,
        originalProductName: selectedReturnItem.productName,
        quantity: q,
        refundAmount: returnCalculations.storeRefunds,
        replacementProductId: returnType === 'exchange' ? selectedReplacementProduct?.id : undefined,
        replacementProductName: returnType === 'exchange' ? selectedReplacementProduct?.name : undefined,
        replacementQuantity: returnType === 'exchange' ? parseInt(replacementQty, 10) : undefined,
        differenceAmount: returnCalculations.differenceAmount,
        condition: returnCondition,
        reason: returnReason,
        notes: returnNotes.trim() || undefined,
      });

      // Reset form
      setSelectedItemId('');
      setReturnQty('1');
      setReplacementProductId('');
      setReplacementQty('1');
      setReturnNotes('');
      setActiveSegment('history');
      refreshData();

      // Open Voucher & Thermal Print Modal directly
      setSelectedReturnRecord(createdRecord);
      setReceiptModalVisible(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to process return/exchange.');
    } finally {
      setProcessing(false);
    }
  };

  // Filtered history records
  const filteredHistory = useMemo(() => {
    if (!searchHistoryQuery.trim()) return returnsExchanges;
    const q = searchHistoryQuery.toLowerCase();
    return returnsExchanges.filter(r =>
      (r.customerName && r.customerName.toLowerCase().includes(q)) ||
      (r.customerPhone && r.customerPhone.includes(q)) ||
      (r.originalProductName && r.originalProductName.toLowerCase().includes(q)) ||
      (r.replacementProductName && r.replacementProductName.toLowerCase().includes(q)) ||
      (r.reason && r.reason.toLowerCase().includes(q)) ||
      (r.id && r.id.toLowerCase().includes(q))
    );
  }, [returnsExchanges, searchHistoryQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    let totalRefundsToday = 0;
    let totalReturnsCountToday = 0;
    let allTimeRefunds = 0;

    returnsExchanges.forEach(r => {
      const isToday = r.createdAt.startsWith(todayStr);
      const amt = r.refundAmount || 0;
      allTimeRefunds += amt;
      if (isToday) {
        totalRefundsToday += amt;
        totalReturnsCountToday++;
      }
    });

    return { totalRefundsToday, totalReturnsCountToday, allTimeRefunds };
  }, [returnsExchanges]);

  return (
    <ScreenWrapper title="Exchange & Refund Management">
      {/* Top Banner / Metrics */}
      <View style={[styles.metricsRow, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <View style={styles.metricCard}>
          <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '700', textTransform: 'uppercase' }}>
            Today's Refunds (Cash Out)
          </Text>
          <Text style={{ fontSize: 20, fontWeight: '900', color: theme.danger, marginTop: 4 }}>
            PKR {stats.totalRefundsToday.toLocaleString('en-PK')}
          </Text>
          <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
            {stats.totalReturnsCountToday} requests processed today
          </Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '700', textTransform: 'uppercase' }}>
            All-Time Refund Deductions
          </Text>
          <Text style={{ fontSize: 20, fontWeight: '900', color: theme.primary, marginTop: 4 }}>
            PKR {stats.allTimeRefunds.toLocaleString('en-PK')}
          </Text>
          <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
            {returnsExchanges.length} total return/exchange logs
          </Text>
        </View>
      </View>

      {/* Segment Selector: Process Form vs History Logs */}
      <View style={[styles.segmentContainer, { backgroundColor: theme.backgroundElement }]}>
        <TouchableOpacity
          style={[styles.segmentButton, activeSegment === 'process' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveSegment('process')}
        >
          <Ionicons name="repeat-outline" size={17} color={activeSegment === 'process' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.segmentText, { color: activeSegment === 'process' ? theme.primary : theme.textSecondary }]}>
            Process New Return / Exchange
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentButton, activeSegment === 'history' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveSegment('history')}
        >
          <Ionicons name="time-outline" size={17} color={activeSegment === 'history' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.segmentText, { color: activeSegment === 'history' ? theme.primary : theme.textSecondary }]}>
            Return & Exchange History ({returnsExchanges.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        {activeSegment === 'process' ? (
          <View style={{ maxWidth: 840, width: '100%', alignSelf: 'center', gap: 16 }}>
            {/* Step 1: Search & Pick Invoice */}
            <Card style={{ padding: 16, borderColor: theme.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <View style={[styles.stepBadge, { backgroundColor: theme.primary }]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>1</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
                  Find Original Invoice / Bill
                </Text>
              </View>

              <View style={[styles.searchInputWrapper, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Ionicons name="search" size={18} color={theme.textSecondary} />
                <TextInput
                  placeholder="Search invoice by ID, customer name, or mobile..."
                  placeholderTextColor={theme.textSecondary}
                  value={searchInvoiceQuery}
                  onChangeText={setSearchInvoiceQuery}
                  style={[styles.searchInput, { color: theme.text }]}
                />
              </View>

              {/* Invoice selection chips / list */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {filteredInvoices.map(inv => {
                    const isSelected = selectedInvoice?.id === inv.id;
                    return (
                      <TouchableOpacity
                        key={inv.id}
                        onPress={() => handleSelectInvoice(inv)}
                        style={[
                          styles.invoiceChip,
                          {
                            borderColor: isSelected ? theme.primary : theme.border,
                            backgroundColor: isSelected ? theme.primary + '15' : theme.background,
                          },
                        ]}
                      >
                        <Text style={{ fontWeight: '800', fontSize: 13, color: isSelected ? theme.primary : theme.text }}>
                          #{inv.id.substring(0, 8).toUpperCase()}
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                          {inv.customerName || 'Walk-in'} · PKR {inv.total.toFixed(0)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {selectedInvoice && (
                <View style={[styles.selectedInvoiceCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>
                    Selected: #{selectedInvoice.id.toUpperCase()} · Customer: {selectedInvoice.customerName || 'Walk-in'} ({selectedInvoice.customerPhone || 'No Phone'})
                  </Text>
                </View>
              )}
            </Card>

            {/* Step 2: Choose Item & Quantity */}
            <Card style={{ padding: 16, borderColor: theme.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={[styles.stepBadge, { backgroundColor: theme.primary }]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>2</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
                  Select Item to Return / Exchange
                </Text>
              </View>

              {invoiceItemsList.length > 0 ? (
                <View style={{ gap: 8 }}>
                  {invoiceItemsList.map(item => {
                    const isPicked = selectedItemId === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => {
                          setSelectedItemId(item.id);
                          setReturnQty('1');
                        }}
                        style={[
                          styles.itemSelectRow,
                          {
                            borderColor: isPicked ? theme.primary : theme.border,
                            backgroundColor: isPicked ? theme.primary + '12' : theme.background,
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                            {item.productName}
                          </Text>
                          <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                            Sold Qty: {item.quantity} · Rate: PKR {item.price.toFixed(0)} · Total: PKR {item.total.toFixed(0)}
                          </Text>
                        </View>
                        <Ionicons
                          name={isPicked ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={isPicked ? theme.primary : theme.textSecondary}
                        />
                      </TouchableOpacity>
                    );
                  })}

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                        Return Quantity (Max: {selectedReturnItem?.quantity || 1})
                      </Text>
                      <TextInput
                        keyboardType="numeric"
                        value={returnQty}
                        onChangeText={setReturnQty}
                        style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                        Item Condition
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => setReturnCondition('resellable')}
                          style={[
                            styles.conditionBtn,
                            {
                              borderColor: returnCondition === 'resellable' ? theme.success : theme.border,
                              backgroundColor: returnCondition === 'resellable' ? theme.success + '20' : theme.background,
                            },
                          ]}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: returnCondition === 'resellable' ? theme.success : theme.text }}>
                            Resellable
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => setReturnCondition('damaged')}
                          style={[
                            styles.conditionBtn,
                            {
                              borderColor: returnCondition === 'damaged' ? theme.danger : theme.border,
                              backgroundColor: returnCondition === 'damaged' ? theme.danger + '20' : theme.background,
                            },
                          ]}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: returnCondition === 'damaged' ? theme.danger : theme.text }}>
                            Damaged
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: theme.textSecondary, fontStyle: 'italic', paddingVertical: 10 }}>
                  Please select an invoice from Step 1 above to load products.
                </Text>
              )}
            </Card>

            {/* Step 3: Choose Mode (Return vs Exchange) */}
            <Card style={{ padding: 16, borderColor: theme.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={[styles.stepBadge, { backgroundColor: theme.primary }]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>3</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
                  Transaction Type
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <TouchableOpacity
                  onPress={() => setReturnType('return')}
                  style={[
                    styles.typeBtn,
                    {
                      borderColor: returnType === 'return' ? theme.danger : theme.border,
                      backgroundColor: returnType === 'return' ? theme.danger + '18' : theme.background,
                    },
                  ]}
                >
                  <Ionicons name="cash-outline" size={20} color={returnType === 'return' ? theme.danger : theme.textSecondary} />
                  <Text style={{ fontWeight: '800', fontSize: 14, color: returnType === 'return' ? theme.danger : theme.text }}>
                    Return & Cash Refund
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setReturnType('exchange')}
                  style={[
                    styles.typeBtn,
                    {
                      borderColor: returnType === 'exchange' ? theme.primary : theme.border,
                      backgroundColor: returnType === 'exchange' ? theme.primary + '18' : theme.background,
                    },
                  ]}
                >
                  <Ionicons name="swap-horizontal-outline" size={20} color={returnType === 'exchange' ? theme.primary : theme.textSecondary} />
                  <Text style={{ fontWeight: '800', fontSize: 14, color: returnType === 'exchange' ? theme.primary : theme.text }}>
                    Product Exchange
                  </Text>
                </TouchableOpacity>
              </View>

              {returnType === 'exchange' && (
                <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginBottom: 8 }}>
                    Select Replacement Product from Inventory:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {products.slice(0, 15).map(prod => {
                        const isRepPicked = replacementProductId === prod.id;
                        return (
                          <TouchableOpacity
                            key={prod.id}
                            onPress={() => setReplacementProductId(prod.id)}
                            style={[
                              styles.invoiceChip,
                              {
                                borderColor: isRepPicked ? theme.primary : theme.border,
                                backgroundColor: isRepPicked ? theme.primary + '15' : theme.background,
                              },
                            ]}
                          >
                            <Text style={{ fontWeight: '800', fontSize: 13, color: isRepPicked ? theme.primary : theme.text }}>
                              {prod.name}
                            </Text>
                            <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                              Stock: {prod.quantity} · PKR {prod.price.toFixed(0)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                        Replacement Qty
                      </Text>
                      <TextInput
                        keyboardType="numeric"
                        value={replacementQty}
                        onChangeText={setReplacementQty}
                        style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Reason and Notes */}
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>Reason for Return / Exchange</Text>
                <TextInput
                  placeholder="e.g. Size mismatch, defective item, changed mind..."
                  placeholderTextColor={theme.textSecondary}
                  value={returnReason}
                  onChangeText={setReturnReason}
                  style={[styles.inputField, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
              </View>

              {/* Financial Summary Box */}
              <View style={[styles.summaryBox, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                {returnType === 'return' ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: theme.danger }}>
                      Cash Refund to Customer:
                    </Text>
                    <Text style={{ fontWeight: '900', fontSize: 18, color: theme.danger }}>
                      PKR {returnCalculations.refundAmount.toFixed(0)}
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: theme.textSecondary }}>Returned Item Value:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>
                        PKR {(parseInt(returnQty, 10) * (selectedReturnItem?.price || 0)).toFixed(0)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: theme.textSecondary }}>Replacement Item Value:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>
                        PKR {(parseInt(replacementQty, 10) * (selectedReplacementProduct?.price || 0)).toFixed(0)}
                      </Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '800', fontSize: 14, color: returnCalculations.customerPaysExtra > 0 ? theme.primary : theme.danger }}>
                        {returnCalculations.customerPaysExtra > 0 ? 'Customer Pays Difference:' : 'Store Refunds Difference:'}
                      </Text>
                      <Text style={{ fontWeight: '900', fontSize: 18, color: returnCalculations.customerPaysExtra > 0 ? theme.primary : theme.danger }}>
                        PKR {Math.abs(returnCalculations.differenceAmount).toFixed(0)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              <Button
                title={returnType === 'exchange' ? 'Confirm Product Exchange' : 'Confirm Return & Deduct from Daily Cash'}
                variant={returnType === 'exchange' ? 'primary' : 'danger'}
                size="large"
                loading={processing}
                onPress={handleProcessSubmit}
                style={{ marginTop: 14 }}
              />
            </Card>
          </View>
        ) : (
          /* History View */
          <View style={{ maxWidth: 880, width: '100%', alignSelf: 'center', gap: 12 }}>
            <View style={[styles.searchInputWrapper, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <TextInput
                placeholder="Search history by customer name, phone, item, or reason..."
                placeholderTextColor={theme.textSecondary}
                value={searchHistoryQuery}
                onChangeText={setSearchHistoryQuery}
                style={[styles.searchInput, { color: theme.text }]}
              />
            </View>

            {filteredHistory.length === 0 ? (
              <Card style={{ padding: 32, alignItems: 'center' }}>
                <Ionicons name="document-text-outline" size={40} color={theme.textSecondary} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text, marginTop: 10 }}>
                  No Return or Exchange Logs Found
                </Text>
                <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
                  Processed return and exchange logs will appear here.
                </Text>
              </Card>
            ) : (
              filteredHistory.map(rec => {
                const isEx = rec.type === 'exchange';
                const dateStr = new Date(rec.createdAt).toLocaleDateString('en-PK', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <Card key={rec.id} style={{ padding: 14, borderColor: theme.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.typeBadge, { backgroundColor: isEx ? theme.primary + '20' : theme.danger + '20' }]}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: isEx ? theme.primary : theme.danger, textTransform: 'uppercase' }}>
                            {isEx ? 'EXCHANGE' : 'RETURN & REFUND'}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>{dateStr}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: theme.textSecondary, fontFamily: 'monospace' }}>
                        #{rec.id.substring(0, 8).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ marginVertical: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                        Customer: {rec.customerName} {rec.customerPhone ? `(${rec.customerPhone})` : ''}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.text, fontWeight: '600', marginTop: 4 }}>
                        Returned: {rec.quantity}x {rec.originalProductName}
                      </Text>
                      <Text style={{ fontSize: 11, color: rec.condition === 'resellable' ? theme.success : theme.danger, marginTop: 2 }}>
                        Condition: {rec.condition === 'resellable' ? 'Restocked to Inventory' : 'Damaged (Discarded)'}
                      </Text>
                      {isEx && rec.replacementProductName && (
                        <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '700', marginTop: 3 }}>
                          Replacement: {rec.replacementQuantity}x {rec.replacementProductName}
                        </Text>
                      )}
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 6 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                        Reason: {rec.reason || 'Customer request'}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: isEx ? theme.primary : theme.danger }}>
                        {isEx ? (rec.differenceAmount ? (rec.differenceAmount > 0 ? `+PKR ${rec.differenceAmount.toFixed(0)}` : `-PKR ${Math.abs(rec.differenceAmount).toFixed(0)}`) : 'Even Exchange') : `Refund: PKR ${(rec.refundAmount || 0).toFixed(0)}`}
                      </Text>
                    </View>

                    <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end' }}>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          backgroundColor: theme.primary + '15',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: theme.primary + '30',
                        }}
                        onPress={() => {
                          setSelectedReturnRecord(rec);
                          setReceiptModalVisible(true);
                        }}
                      >
                        <Ionicons name="receipt-outline" size={15} color={theme.primary} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>
                          View & Print Slip
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Return & Exchange Thermal Receipt / Share Modal */}
      <ReturnExchangeReceiptModal
        visible={receiptModalVisible}
        record={selectedReturnRecord}
        onClose={() => setReceiptModalVisible(false)}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  segmentContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  segmentText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    height: '100%',
  },
  invoiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectedInvoiceCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  inputField: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  conditionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBtn: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  summaryBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
