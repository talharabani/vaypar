import { Ionicons } from '@expo/vector-icons';
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
    View
} from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { CustomerNameInput } from '../components/CustomerNameInput';
import { CustomerPhoneInput } from '../components/CustomerPhoneInput';
import { ReceiptModal } from '../components/ReceiptModal';
import { ReturnExchangeReceiptModal } from '../components/ReturnExchangeReceiptModal';
import ScreenWrapper from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useRecentActivity } from '../context/RecentActivityContext';
import { useTheme } from '../hooks/use-theme';
import { useRouter } from 'expo-router';
import { shareSalesReportPDF } from '../services/pdfGenerator';
import * as sqlite from '../services/sqlite';
import { validateCustomerName, validateCustomerPhone, detectCountryCode } from '../utils/phoneUtils';

export default function BillsScreen() {
  const router = useRouter();
  const { 
    products, 
    invoices, 
    customers,
    createInvoice, 
    deleteInvoice,
    refreshData,
    installmentAccounts,
    addInstallmentAccount,
    payInstallment,
    deleteInstallmentAccount,
    returnsExchanges,
    createReturnExchange,
    addCustomer
  } = useDatabase();
  const theme = useTheme();
  const { user } = useAuth();

  // Role helpers
  const isCashier = user?.role === 'cashier';
  const isOwner = user?.role === 'owner';
  const hasReportsAccess = isOwner || user?.role === 'manager';

  // Tab State — cashiers default to create, managers/owners to history
  const [activeTab, setActiveTab] = useState<'history' | 'create' | 'installments'>(isCashier ? 'create' : 'history');
  const [billingPaymentType, setBillingPaymentType] = useState<'cash' | 'credit'>('cash');

  // Search History State
  const [historySearch, setHistorySearch] = useState('');

  // Receipt Modal State
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<sqlite.Invoice | null>(null);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<sqlite.InvoiceItem[]>([]);

  // Service Charges State
  const [serviceChargeInput, setServiceChargeInput] = useState('');
  const [serviceChargeType, setServiceChargeType] = useState<'amount' | 'percentage'>('amount');

  // Return & Exchange states
  const [returnsSegment, setReturnsSegment] = useState<'process' | 'history'>('process');
  const [returnInvoice, setReturnInvoice] = useState<sqlite.Invoice | null>(null);
  const [returnItemsList, setReturnItemsList] = useState<sqlite.InvoiceItem[]>([]);
  const [returnSelectedItemId, setReturnSelectedItemId] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [returnType, setReturnType] = useState<'return' | 'exchange'>('return');
  const [returnCondition, setReturnCondition] = useState<'resellable' | 'damaged'>('resellable');
  const [returnReason, setReturnReason] = useState('Customer Request');
  const [returnReplacementProductId, setReturnReplacementProductId] = useState('');
  const [returnReplacementQty, setReturnReplacementQty] = useState('1');
  const [returnNotes, setReturnNotes] = useState('');
  const [processingReturn, setProcessingReturn] = useState(false);
  const [searchReturnInvoice, setSearchReturnInvoice] = useState('');
  const [searchReturnsHistory, setSearchReturnsHistory] = useState('');
  const [selectedReturnRecord, setSelectedReturnRecord] = useState<sqlite.ReturnExchange | null>(null);
  const [returnReceiptModalVisible, setReturnReceiptModalVisible] = useState(false);

  // Customer Directory Add Customer State
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);

  // Installment Calculator & Plan Form
  const [instCustomer, setInstCustomer] = useState('');
  const [instPhone, setInstPhone] = useState('');
  const [instCountryCode, setInstCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [instProduct, setInstProduct] = useState('');
  const [instPrincipal, setInstPrincipal] = useState('');
  const [instDownPayment, setInstDownPayment] = useState('');
  const [instTenure, setInstTenure] = useState('12');
  const [instInterest, setInstInterest] = useState('0');
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<sqlite.InstallmentAccount | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<sqlite.InstallmentPayment[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [loggingPayment, setLoggingPayment] = useState(false);
  const [searchInstallment, setSearchInstallment] = useState('');

  // Reactive EMI calculations for form preview
  const emiCalc = useMemo(() => {
    const total = parseFloat(instPrincipal) || 0;
    const down = parseFloat(instDownPayment) || 0;
    const tenure = parseInt(instTenure) || 12;
    const rate = parseFloat(instInterest) || 0;
    
    const principal = Math.max(0, total - down);
    let emi = principal / tenure;
    
    if (rate > 0 && principal > 0) {
      const monthlyRate = (rate / 100) / 12;
      const emiFactor = Math.pow(1 + monthlyRate, tenure);
      emi = (principal * monthlyRate * emiFactor) / (emiFactor - 1);
    }
    
    if (isNaN(emi) || !isFinite(emi)) {
      emi = principal / tenure;
    }
    
    const totalCost = emi * tenure;
    const totalInterest = Math.max(0, totalCost - principal);
    const finalCost = totalCost + down;
    
    return {
      principal,
      monthlyEMI: parseFloat(emi.toFixed(2)),
      totalInterest: parseFloat(totalInterest.toFixed(2)),
      totalPayable: parseFloat(totalCost.toFixed(2)),
      finalCost: parseFloat(finalCost.toFixed(2))
    };
  }, [instPrincipal, instDownPayment, instTenure, instInterest]);

  const filteredInstallments = useMemo(() => {
    return installmentAccounts.filter(item => 
      item.customerName.toLowerCase().includes(searchInstallment.toLowerCase()) ||
      item.customerPhone.includes(searchInstallment) ||
      item.productName.toLowerCase().includes(searchInstallment.toLowerCase())
    );
  }, [installmentAccounts, searchInstallment]);

  // ==========================================
  // CUSTOMER DIRECTORY & AUTOCOMPLETE
  // ==========================================
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [invoiceCountryCode, setInvoiceCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [customerDirectoryModalVisible, setCustomerDirectoryModalVisible] = useState(false);
  const [customerDirectorySearch, setCustomerDirectorySearch] = useState('');
  const [phoneDropdownOpen, setPhoneDropdownOpen] = useState(false);
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false);
  const [selectedCustomerMeta, setSelectedCustomerMeta] = useState<{
    name: string;
    phone: string;
    totalVisits: number;
    totalSpend: number;
    lastVisit?: string;
  } | null>(null);

  // Aggregate unified customers by unique phone number from customers, invoices & installments
  const customerDirectory = useMemo(() => {
    const map = new Map<string, {
      name: string;
      phone: string;
      totalVisits: number;
      totalSpend: number;
      lastVisit?: string;
    }>();

    // 1. Database customers
    (customers || []).forEach(c => {
      const cleanPhone = (c.phone || '').trim();
      const cleanName = (c.name || '').trim();
      if (!cleanPhone && !cleanName) return;
      const key = cleanPhone || cleanName.toLowerCase();
      map.set(key, {
        name: cleanName || 'Valued Customer',
        phone: cleanPhone,
        totalVisits: 0,
        totalSpend: 0,
        lastVisit: c.lastUpdated,
      });
    });

    // 2. Invoices (counts repeat visits & total spend)
    (invoices || []).forEach(inv => {
      const cleanPhone = (inv.customerPhone || '').trim();
      const cleanName = (inv.customerName || '').trim();
      if (!cleanPhone && !cleanName) return;
      const key = cleanPhone || cleanName.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.totalVisits += 1;
        existing.totalSpend += inv.total;
        if (cleanName && cleanName.toLowerCase() !== 'walk-in' && (!existing.name || existing.name === 'Valued Customer' || existing.name === 'Walk-in Customer')) {
          existing.name = cleanName;
        }
        if (!existing.lastVisit || inv.createdAt > existing.lastVisit) {
          existing.lastVisit = inv.createdAt;
        }
      } else {
        map.set(key, {
          name: cleanName || 'Customer',
          phone: cleanPhone,
          totalVisits: 1,
          totalSpend: inv.total,
          lastVisit: inv.createdAt,
        });
      }
    });

    // 3. Installment Accounts
    (installmentAccounts || []).forEach(acc => {
      const cleanPhone = (acc.customerPhone || '').trim();
      const cleanName = (acc.customerName || '').trim();
      if (!cleanPhone && !cleanName) return;
      const key = cleanPhone || cleanName.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        if (cleanName && cleanName.toLowerCase() !== 'walk-in') {
          existing.name = cleanName;
        }
      } else {
        map.set(key, {
          name: cleanName || 'Customer',
          phone: cleanPhone,
          totalVisits: 1,
          totalSpend: acc.totalAmount || 0,
        });
      }
    });

    return Array.from(map.values()).filter(c => c.phone || (c.name && c.name.toLowerCase() !== 'walk-in'));
  }, [customers, invoices, installmentAccounts]);

  // Frequent customers (top customers sorted by visits)
  const frequentCustomers = useMemo(() => {
    return [...customerDirectory]
      .filter(c => c.totalVisits > 0 || c.phone)
      .sort((a, b) => b.totalVisits - a.totalVisits || b.totalSpend - a.totalSpend)
      .slice(0, 8);
  }, [customerDirectory]);

  // Phone autocomplete suggestions
  const phoneSuggestions = useMemo(() => {
    const query = customerPhone.trim();
    if (!query || query.length < 2) return [];
    return customerDirectory.filter(c => 
      (c.phone && c.phone.includes(query)) || (c.name && c.name.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 5);
  }, [customerDirectory, customerPhone]);

  // Name autocomplete suggestions
  const nameSuggestions = useMemo(() => {
    const query = customerName.trim();
    if (!query || query.length < 2) return [];
    return customerDirectory.filter(c => 
      c.name.toLowerCase().includes(query.toLowerCase()) || (c.phone && c.phone.includes(query))
    ).slice(0, 5);
  }, [customerDirectory, customerName]);

  // Filtered customer directory for search modal
  const filteredCustomerDirectory = useMemo(() => {
    const q = customerDirectorySearch.trim().toLowerCase();
    if (!q) return customerDirectory;
    return customerDirectory.filter(c => 
      c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
  }, [customerDirectory, customerDirectorySearch]);

  const handleSelectCustomer = (item: { name: string; phone: string; totalVisits: number; totalSpend: number; lastVisit?: string }) => {
    setCustomerPhone(item.phone);
    setCustomerName(item.name);
    setSelectedCustomerMeta(item);
    setPhoneDropdownOpen(false);
    setNameDropdownOpen(false);
    setCustomerDirectoryModalVisible(false);
  };

  const handlePhoneChange = (phone: string) => {
    setCustomerPhone(phone);
    setPhoneDropdownOpen(true);
    const clean = phone.trim();
    if (clean) {
      const match = customerDirectory.find(c => c.phone === clean);
      if (match) {
        if (!customerName || customerName.trim() === '' || customerName.toLowerCase() === 'walk-in') {
          setCustomerName(match.name);
        }
        setSelectedCustomerMeta(match);
      } else {
        setSelectedCustomerMeta(null);
      }
    } else {
      setSelectedCustomerMeta(null);
    }
  };

  const handleNameChange = (name: string) => {
    setCustomerName(name);
    setNameDropdownOpen(true);
  };

  const handleClearCustomer = () => {
    setCustomerPhone('');
    setCustomerName('');
    setSelectedCustomerMeta(null);
    setPhoneDropdownOpen(false);
    setNameDropdownOpen(false);
  };
  
  // Current item being selected/edited
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<sqlite.Product | null>(null);
  const [selectedQty, setSelectedQty] = useState('1');
  const [selectedPrice, setSelectedPrice] = useState('0');

  // Items added to the active invoice so far
  const [invoiceItems, setInvoiceItems] = useState<{
    productId: string;
    productName: string;
    price: number;
    quantity: number;
    total: number;
  }[]>([]);

  const [discountInput, setDiscountInput] = useState('0');
  const [isSavingBill, setIsSavingBill] = useState(false);

  // Filtered invoices history
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const nameMatch = inv.customerName?.toLowerCase().includes(historySearch.toLowerCase());
      const phoneMatch = inv.customerPhone?.includes(historySearch);
      const idMatch = inv.id.toLowerCase().includes(historySearch.toLowerCase());
      return nameMatch || phoneMatch || idMatch;
    });
  }, [invoices, historySearch]);

  // Filtered products list for product picker modal
  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(searchProduct.toLowerCase()))
    );
  }, [products, searchProduct]);

  // Invoice calculations (includes profit for owner — hidden from cashiers)
  const invoiceTotals = useMemo(() => {
    const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
    const discount = parseFloat(discountInput.replace(/,/g, '')) || 0;
    const baseAfterDiscount = Math.max(0, subtotal - discount);

    const scRaw = parseFloat(serviceChargeInput.replace(/,/g, '')) || 0;
    const serviceCharges = serviceChargeType === 'percentage'
      ? (baseAfterDiscount * scRaw) / 100
      : scRaw;

    const total = Math.max(0, baseAfterDiscount + serviceCharges);

    // Profit = sale price − purchase price, per item × qty (owner only)
    let totalPurchaseCost = 0;
    for (const item of invoiceItems) {
      const dbProduct = products.find(p => p.id === item.productId);
      const pp = dbProduct?.purchasePrice ?? 0;
      totalPurchaseCost += pp * item.quantity;
    }
    const grossProfit = total - totalPurchaseCost;
    const profitMargin = totalPurchaseCost > 0 ? ((grossProfit / totalPurchaseCost) * 100) : null;

    return { subtotal, discount, serviceCharges, total, totalPurchaseCost, grossProfit, profitMargin };
  }, [invoiceItems, discountInput, serviceChargeInput, serviceChargeType, products]);

  // Return & Exchange calculations
  const selectedReturnItem = useMemo(() => {
    return returnItemsList.find(i => i.id === returnSelectedItemId) || null;
  }, [returnItemsList, returnSelectedItemId]);

  const selectedReplacementProduct = useMemo(() => {
    return products.find(p => p.id === returnReplacementProductId) || null;
  }, [products, returnReplacementProductId]);

  const returnCalculations = useMemo(() => {
    const q = parseInt(returnQty, 10) || 0;
    const itemPrice = selectedReturnItem ? selectedReturnItem.price : 0;
    const refundVal = q * itemPrice;

    if (returnType === 'return') {
      return {
        refundAmount: refundVal,
        differenceAmount: 0,
        customerPaysExtra: 0,
        storeRefunds: refundVal
      };
    }

    const repQ = parseInt(returnReplacementQty, 10) || 0;
    const repPrice = selectedReplacementProduct ? selectedReplacementProduct.price : 0;
    const replacementVal = repQ * repPrice;
    const diff = replacementVal - refundVal;

    return {
      refundAmount: diff < 0 ? Math.abs(diff) : 0,
      differenceAmount: diff,
      customerPaysExtra: diff > 0 ? diff : 0,
      storeRefunds: diff < 0 ? Math.abs(diff) : 0
    };
  }, [selectedReturnItem, returnQty, returnType, selectedReplacementProduct, returnReplacementQty]);

  // Process Return or Exchange
  const handleProcessReturnExchange = async () => {
    if (!selectedReturnItem) {
      Alert.alert('Selection Required', 'Please select an item to return or exchange.');
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
      const repQ = parseInt(returnReplacementQty, 10);
      if (isNaN(repQ) || repQ <= 0) {
        Alert.alert('Invalid Quantity', 'Please enter replacement product quantity.');
        return;
      }
      if (repQ > selectedReplacementProduct.quantity) {
        Alert.alert('Insufficient Stock', `Only ${selectedReplacementProduct.quantity} units of "${selectedReplacementProduct.name}" in stock.`);
        return;
      }
    }
    setProcessingReturn(true);
    try {
      const createdRecord = await createReturnExchange({
        invoiceId: returnInvoice?.id || undefined,
        customerName: returnInvoice?.customerName || customerName.trim() || 'Customer',
        customerPhone: returnInvoice?.customerPhone || customerPhone.trim() || '',
        type: returnType,
        originalProductId: selectedReturnItem.productId,
        originalProductName: selectedReturnItem.productName,
        quantity: q,
        refundAmount: returnCalculations.storeRefunds,
        replacementProductId: returnType === 'exchange' ? selectedReplacementProduct?.id : undefined,
        replacementProductName: returnType === 'exchange' ? selectedReplacementProduct?.name : undefined,
        replacementQuantity: returnType === 'exchange' ? parseInt(returnReplacementQty, 10) : undefined,
        differenceAmount: returnCalculations.differenceAmount,
        condition: returnCondition,
        reason: returnReason,
        notes: returnNotes.trim() || undefined,
      });

      setReturnSelectedItemId('');
      setReturnQty('1');
      setReturnReplacementProductId('');
      setReturnReplacementQty('1');
      setReturnNotes('');
      setReturnsSegment('history');

      // Open Voucher & Thermal Print Modal directly
      setSelectedReturnRecord(createdRecord);
      setReturnReceiptModalVisible(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to process return/exchange.');
    } finally {
      setProcessingReturn(false);
    }
  };

  // Open Receipt Details from History
  const { logVisit } = useRecentActivity();
  const handleOpenReceipt = async (invoice: sqlite.Invoice) => {
    try {
      const items = await sqlite.getInvoiceItems(invoice.id);
      setSelectedInvoice(invoice);
      setSelectedInvoiceItems(items);
      setReceiptVisible(true);
      logVisit({
        recordId: invoice.id,
        type: 'invoice',
        title: `Invoice #${invoice.id.substring(0, 8).toUpperCase()}`,
        subtitle: `${invoice.customerName || 'Walk-in'} · PKR ${invoice.total.toLocaleString('en-IN')}`,
        icon: 'receipt',
        color: '#10B981',
        route: '/bills',
      });
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to retrieve invoice items.');
    }
  };

  // Delete Invoice from History
  const handleDeleteInvoice = (id: string) => {
    const title = 'Delete Invoice';
    const message = 'Are you sure you want to cancel this invoice? Product stock quantities will be restored back to inventory.';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) {
        deleteInvoice(id)
          .then(() => alert('Invoice deleted and stock restored.'))
          .catch(err => {
            console.error(err);
            alert('Failed to delete invoice.');
          });
      }
      return;
    }

    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Restore Stock & Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInvoice(id);
              Alert.alert('Success', 'Invoice deleted and inventory stock restored.');
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to delete invoice.');
            }
          }
        }
      ]
    );
  };

  const handleShareSalesReport = async () => {
    if (filteredInvoices.length === 0) {
      Alert.alert('Empty Report', 'There are no sales records matching the current view to generate a report.');
      return;
    }
    try {
      await shareSalesReportPDF(user!, filteredInvoices);
    } catch (err: any) {
      Alert.alert('Report Error', err.message || 'Failed to compile or share sales report PDF.');
    }
  };

  // Add Item to active Invoice Form
  const handleAddProductToInvoice = () => {
    if (!selectedProduct) return;
    
    const qty = parseInt(selectedQty, 10);
    const price = parseFloat(selectedPrice);

    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid product quantity.');
      return;
    }

    if (qty > selectedProduct.quantity) {
      Alert.alert(
        'Insufficient Stock',
        `You only have ${selectedProduct.quantity} units of this product in stock. You cannot sell ${qty} units.`
      );
      return;
    }

    if (isNaN(price) || price < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price.');
      return;
    }

    // Check if product already exists in invoice items
    const existingIndex = invoiceItems.findIndex(item => item.productId === selectedProduct.id);
    const itemTotal = price * qty;

    if (existingIndex > -1) {
      // Overwrite/update existing row
      const updated = [...invoiceItems];
      updated[existingIndex] = {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        price,
        quantity: qty,
        total: itemTotal
      };
      setInvoiceItems(updated);
    } else {
      // Push new item row
      setInvoiceItems([
        ...invoiceItems,
        {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          price,
          quantity: qty,
          total: itemTotal
        }
      ]);
    }

    // Reset picker states
    setSelectedProduct(null);
    setSelectedQty('1');
    setSelectedPrice('0');
    setProductPickerVisible(false);
  };

  // Remove Item row from bill
  const handleRemoveItem = (index: number) => {
    const updated = [...invoiceItems];
    updated.splice(index, 1);
    setInvoiceItems(updated);
  };

  // Select Product from Modal
  const handleSelectProduct = (product: sqlite.Product) => {
    setSelectedProduct(product);
    setSelectedPrice(product.price.toString());
    setSelectedQty('1');
  };

  // Save the invoice to SQLite database
  const handleSaveInvoice = async () => {
    if (invoiceItems.length === 0) {
      Alert.alert('Empty Bill', 'Please add at least one product to the invoice.');
      return;
    }

    if (customerName.trim()) {
      const nameVal = validateCustomerName(customerName);
      if (!nameVal.isValid) {
        Alert.alert('Invalid Customer Name', nameVal.error || 'Name cannot contain numbers.');
        return;
      }
    } else if (billingPaymentType === 'credit') {
      Alert.alert('Customer Name Required', 'Please enter customer name to issue an invoice on credit.');
      return;
    }

    let finalCustomerPhone = customerPhone.trim();
    if (customerPhone.trim()) {
      const phoneVal = validateCustomerPhone(customerPhone, invoiceCountryCode);
      if (!phoneVal.isValid) {
        Alert.alert('Invalid Customer Phone', phoneVal.error || 'Please enter a valid phone number.');
        return;
      }
      finalCustomerPhone = phoneVal.fullPhone;
    }

    // Final stock validation check
    for (const item of invoiceItems) {
      const dbProduct = products.find(p => p.id === item.productId);
      if (!dbProduct) {
        Alert.alert('Product Error', `Product "${item.productName}" was not found in database.`);
        return;
      }
      if (item.quantity > dbProduct.quantity) {
        Alert.alert(
          'Insufficient Stock',
          `Cannot create invoice. You only have ${dbProduct.quantity} units of "${item.productName}" in stock but entered ${item.quantity}.`
        );
        return;
      }
    }

    setIsSavingBill(true);
    try {
      const itemsPayload = invoiceItems.map(item => ({
        productId: item.productId,
        productName: item.productName,
        price: item.price,
        quantity: item.quantity,
        total: item.total
      }));

      const newInvoiceId = await createInvoice(
        customerName.trim(),
        finalCustomerPhone,
        invoiceTotals.subtotal,
        invoiceTotals.discount,
        invoiceTotals.total,
        itemsPayload,
        invoiceTotals.serviceCharges
      );

      // Successfully saved! Let's retrieve the newly saved invoice to preview it
      const now = new Date().toISOString();
      const mockInvoice: sqlite.Invoice = {
        id: newInvoiceId,
        userId: user?.id || 'temp',
        businessId: user?.businessId || 'temp',
        createdBy: user?.id || 'temp',
        customerName: customerName.trim(),
        customerPhone: finalCustomerPhone,
        subtotal: invoiceTotals.subtotal,
        discount: invoiceTotals.discount,
        serviceCharges: invoiceTotals.serviceCharges,
        total: invoiceTotals.total,
        createdAt: now,
        lastUpdated: now
      };

      const mockItems: sqlite.InvoiceItem[] = invoiceItems.map((item, idx) => ({
        id: `item_${idx}`,
        invoiceId: newInvoiceId,
        productId: item.productId,
        productName: item.productName,
        price: item.price,
        quantity: item.quantity,
        total: item.total
      }));

      // Reset bill inputs
      setInvoiceItems([]);
      setCustomerName('');
      setCustomerPhone('');
      setDiscountInput('');
      setServiceChargeInput('');

      // If Credit Sale: automatically record in Customer Credit Ledger
      if (billingPaymentType === 'credit' && user?.businessId) {
        try {
          const businessId = user.businessId;
          const existingAccounts = await sqlite.getCreditAccounts(businessId);
          let targetAccount = existingAccounts.find(
            a => a.customerName.trim().toLowerCase() === customerName.trim().toLowerCase() ||
                 (finalCustomerPhone && a.customerPhone === finalCustomerPhone)
          );

          if (!targetAccount) {
            const custId = 'cust_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
            await sqlite.upsertCustomer({
              id: custId,
              businessId,
              name: customerName.trim(),
              phone: finalCustomerPhone,
              synced: 0,
              lastUpdated: now,
            });
            const accountId = 'crd_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
            targetAccount = {
              id: accountId,
              businessId,
              customerId: custId,
              customerName: customerName.trim(),
              customerPhone: finalCustomerPhone,
              totalDebit: 0,
              totalCredit: 0,
              balance: 0,
              lastTransactionAt: now,
              synced: 0,
              lastUpdated: now,
            };
            await sqlite.upsertCreditAccount(targetAccount);
          }

          const tx: sqlite.CreditTransaction = {
            id: 'crd_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
            accountId: targetAccount.id,
            businessId,
            type: 'debit',
            amount: invoiceTotals.total,
            description: `Credit Sale · Invoice #${newInvoiceId.toUpperCase()} (${invoiceItems.length} items)`,
            createdAt: now,
            createdBy: user.id,
          };
          await sqlite.addCreditTransaction(tx, targetAccount);
        } catch (credErr) {
          console.warn('Failed to auto-log credit sale:', credErr);
        }
      }

      // Reset Create Form
      setCustomerName('');
      setCustomerPhone('');
      setInvoiceItems([]);
      setDiscountInput('0');
      setBillingPaymentType('cash');
      
      // Navigate to History Tab
      setActiveTab('history');

      // Trigger preview popup
      setSelectedInvoice(mockInvoice);
      setSelectedInvoiceItems(mockItems);
      setReceiptVisible(true);

    } catch (e: any) {
      Alert.alert('Failed to Save Invoice', e.message || 'SQLite transaction failed.');
    } finally {
      setIsSavingBill(false);
    }
  };

  const handleSaveInstallmentPlan = async () => {
    if (!instCustomer.trim() || !instPhone.trim() || !instProduct.trim()) {
      Alert.alert('Validation Error', 'Customer name, phone, and product name are required.');
      return;
    }
    const nameVal = validateCustomerName(instCustomer);
    if (!nameVal.isValid) {
      Alert.alert('Invalid Customer Name', nameVal.error || 'Name cannot contain numbers.');
      return;
    }
    const phoneVal = validateCustomerPhone(instPhone, instCountryCode);
    if (!phoneVal.isValid) {
      Alert.alert('Invalid Customer Phone', phoneVal.error || 'Please enter a valid phone number.');
      return;
    }
    const total = parseFloat(instPrincipal);
    if (isNaN(total) || total <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid total amount.');
      return;
    }
    const down = parseFloat(instDownPayment) || 0;
    if (down >= total) {
      Alert.alert('Validation Error', 'Down payment cannot be greater than or equal to total amount.');
      return;
    }
    const tenure = parseInt(instTenure);
    if (isNaN(tenure) || tenure <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid tenure in months.');
      return;
    }
    const rate = parseFloat(instInterest) || 0;

    setIsSavingPlan(true);
    try {
      await addInstallmentAccount(
        instCustomer.trim(),
        phoneVal.fullPhone,
        instProduct.trim(),
        total,
        down,
        tenure,
        rate
      );
      Alert.alert('Success', 'Installment plan registered successfully.');
      setInstCustomer('');
      setInstPhone('');
      setInstProduct('');
      setInstPrincipal('');
      setInstDownPayment('');
      setInstTenure('12');
      setInstInterest('0');
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to register installment account.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleOpenPayments = async (account: sqlite.InstallmentAccount) => {
    setSelectedAccount(account);
    try {
      const logs = await sqlite.getInstallmentPayments(account.id);
      setPaymentHistory(logs);
      setPayAmount(account.monthlyEMI.toString());
      setPayNotes(`Installment Payment - ${new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`);
      setShowPaymentModal(true);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to retrieve payment logs.');
    }
  };

  const handleLogPayment = async () => {
    if (!selectedAccount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid payment amount.');
      return;
    }
    setLoggingPayment(true);
    try {
      await payInstallment(selectedAccount.id, amount, payNotes.trim() || 'Log Payment');
      Alert.alert('Success', 'Installment payment recorded.');
      const newRem = Math.max(0, selectedAccount.remainingAmount - amount);
      setSelectedAccount({
        ...selectedAccount,
        remainingAmount: newRem,
        status: newRem <= 0 ? 'completed' : 'active'
      });
      const logs = await sqlite.getInstallmentPayments(selectedAccount.id);
      setPaymentHistory(logs);
      setPayAmount('');
      setPayNotes('');
      setShowPaymentModal(false);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to log payment.');
    } finally {
      setLoggingPayment(false);
    }
  };

  const handleDeletePlan = (id: string) => {
    const title = 'Delete Plan';
    const message = 'Are you sure you want to cancel this installment plan?';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) {
        deleteInstallmentAccount(id)
          .then(() => {
            setShowPaymentModal(false);
            alert('Installment plan cancelled.');
          })
          .catch(err => {
            console.error(err);
            alert('Failed to delete plan.');
          });
      }
      return;
    }

    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInstallmentAccount(id);
              setShowPaymentModal(false);
              Alert.alert('Success', 'Installment plan cancelled.');
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to delete plan.');
            }
          }
        }
      ]
    );
  };

  return (
    <ScreenWrapper title="POS / Billing">
      {/* Top Tab Selector — tabs are role-gated */}
      <View style={[styles.tabBar, { backgroundColor: theme.backgroundElement }]}>
        {/* History: hidden for cashiers */}
        {hasReportsAccess && (
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'history' && { borderBottomColor: theme.primary }]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'history' ? theme.primary : theme.textSecondary }]}>
              Invoice History
            </Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'create' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveTab('create')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'create' ? theme.primary : theme.textSecondary }]}>
            {isCashier ? 'POS Billing' : 'Create Bill'}
          </Text>
        </TouchableOpacity>

        {/* Installments: only owners and managers */}
        {hasReportsAccess && (
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'installments' && { borderBottomColor: theme.primary }]}
            onPress={() => setActiveTab('installments')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'installments' ? theme.primary : theme.textSecondary }]}>
              Installment Finance
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ==========================================
          TAB 1: INVOICE HISTORY LAYOUT
          ========================================== */}
      {activeTab === 'history' && (
        <View style={styles.tabContent}>
          {/* Search invoices */}
          <View style={[styles.searchWrapper, { backgroundColor: theme.backgroundElement, flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
            <View style={[styles.searchInputRow, { backgroundColor: theme.background, borderColor: theme.border, flex: 1 }]}>
              <Ionicons name="search" size={20} color={theme.textSecondary} />
              <Input
                placeholder="Search history by name, phone or ID..."
                value={historySearch}
                onChangeText={setHistorySearch}
                style={styles.searchInput}
                containerStyle={styles.searchInputContainer}
              />
              {historySearch ? (
                <TouchableOpacity onPress={() => setHistorySearch('')}>
                  <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity 
              onPress={handleShareSalesReport}
              style={{ padding: 12, borderRadius: 12, backgroundColor: theme.primaryLight, borderWidth: 1, borderColor: theme.border }}
              activeOpacity={0.7}
            >
              <Ionicons name="download-outline" size={20} color={theme.primary} />
            </TouchableOpacity>
          </View>

          {/* History List */}
          <FlatList
            data={filteredInvoices}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={60} color={theme.textSecondary + '60'} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  {historySearch ? 'No matching invoices found.' : 'No invoices generated yet. Toggle "Create Bill" to issue your first invoice.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const formattedDate = new Date(item.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });
              return (
                <Card style={styles.invoiceCard}>
                  <TouchableOpacity 
                    style={styles.invoiceInfo} 
                    onPress={() => handleOpenReceipt(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.invoiceTitleRow}>
                      <Text style={[styles.invoiceId, { color: theme.text }]}>
                        #{item.id.toUpperCase()}
                      </Text>
                      <Text style={[styles.invoiceDate, { color: theme.textSecondary }]}>
                        {formattedDate}
                      </Text>
                    </View>
                    
                    <Text style={[styles.customerText, { color: theme.textSecondary }]}>
                      Cust: {item.customerName || 'Walk-in Customer'} 
                      {item.customerPhone ? ` (${item.customerPhone})` : ''}
                    </Text>
                    
                    <Text style={[styles.invoiceAmount, { color: theme.primary }]}>
                      Total: PKR {item.total.toFixed(2)}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.invoiceActions}>
                    <TouchableOpacity 
                      style={[styles.invoiceActionBtn, { backgroundColor: theme.primaryLight }]}
                      onPress={() => handleOpenReceipt(item)}
                    >
                      <Ionicons name="print-outline" size={18} color={theme.primary} />
                    </TouchableOpacity>
                    {user?.role !== 'cashier' && (
                      <TouchableOpacity 
                        style={[styles.invoiceActionBtn, { backgroundColor: theme.danger + '15' }]}
                        onPress={() => handleDeleteInvoice(item.id)}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              );
            }}
          />
        </View>
      )}

      {/* ==========================================
          TAB 2: CREATE INVOICE FORM LAYOUT
          ========================================== */}
      {activeTab === 'create' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.formScrollContainer} keyboardShouldPersistTaps="handled">
          <Card style={styles.formCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0, marginBottom: 2 }]}>
                  Customer Details
                </Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '500' }}>
                  Mobile Number is used as unique customer key · Auto-fills regular customers
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: theme.primary + '15',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.primary + '30',
                  }}
                  onPress={() => setCustomerDirectoryModalVisible(true)}
                >
                  <Ionicons name="people-outline" size={14} color={theme.primary} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>
                    Directory ({customerDirectory.length})
                  </Text>
                </TouchableOpacity>

                {(customerName || customerPhone) && (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: theme.backgroundElement,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                    onPress={handleClearCustomer}
                  >
                    <Ionicons name="close-circle-outline" size={14} color={theme.danger} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.danger }}>
                      Walk-in
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Frequent / Repeat Customers Quick Chips Bar */}
            {frequentCustomers.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  ⚡ Quick Regular Customers (1-Tap Select)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
                  {frequentCustomers.map((cust, cIdx) => {
                    const isSelected = cust.phone && customerPhone === cust.phone;
                    return (
                      <TouchableOpacity
                        key={cust.phone || cIdx}
                        onPress={() => handleSelectCustomer(cust)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          backgroundColor: isSelected ? theme.primary : theme.backgroundElement,
                          borderWidth: 1,
                          borderColor: isSelected ? theme.primary : theme.border,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 20,
                        }}
                      >
                        <Ionicons
                          name="person"
                          size={12}
                          color={isSelected ? '#FFFFFF' : theme.primary}
                        />
                        <Text style={{
                          fontSize: 11.5,
                          fontWeight: '700',
                          color: isSelected ? '#FFFFFF' : theme.text,
                        }}>
                          {cust.name}
                        </Text>
                        {cust.phone ? (
                          <Text style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: isSelected ? '#E0E7FF' : theme.textSecondary,
                          }}>
                            ({cust.phone.slice(-4)})
                          </Text>
                        ) : null}
                        {cust.totalVisits > 0 && (
                          <View style={{
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#DCFCE7',
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            borderRadius: 8,
                          }}>
                            <Text style={{
                              fontSize: 9.5,
                              fontWeight: '800',
                              color: isSelected ? '#FFFFFF' : '#16A34A',
                            }}>
                              {cust.totalVisits} {cust.totalVisits === 1 ? 'bill' : 'bills'}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Identified Repeat Customer Info Badge */}
            {selectedCustomerMeta && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#ECFDF5',
                borderWidth: 1,
                borderColor: '#A7F3D0',
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 12,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name="checkmark-circle" size={18} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#065F46' }}>
                      Recognized Customer: {selectedCustomerMeta.name}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: '#047857' }}>
                      Mobile: {selectedCustomerMeta.phone || 'N/A'} · {selectedCustomerMeta.totalVisits} Total Bills · PKR {selectedCustomerMeta.totalSpend.toLocaleString('en-IN')} Spent
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleClearCustomer}>
                  <Ionicons name="close-circle" size={16} color="#059669" />
                </TouchableOpacity>
              </View>
            )}

            {/* Inputs: Customer Name & Customer Phone with live suggestions */}
            <View style={styles.rowInputs}>
              <View style={styles.halfInput}>
                <CustomerPhoneInput
                  label="Customer Phone (Primary Key)"
                  value={customerPhone}
                  onChangeText={handlePhoneChange}
                  selectedCountryCode={invoiceCountryCode}
                  onCountryCodeChange={setInvoiceCountryCode}
                />
                {/* Phone Dropdown Suggestions */}
                {phoneDropdownOpen && phoneSuggestions.length > 0 && (
                  <View style={{
                    backgroundColor: theme.backgroundElement,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    marginTop: 4,
                    padding: 4,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                  }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: theme.textSecondary, paddingHorizontal: 6, paddingVertical: 2 }}>
                      MATCHING REGISTERED CUSTOMERS
                    </Text>
                    {phoneSuggestions.map((item, sIdx) => (
                      <TouchableOpacity
                        key={item.phone || sIdx}
                        onPress={() => handleSelectCustomer(item)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingHorizontal: 8,
                          paddingVertical: 7,
                          borderBottomWidth: sIdx < phoneSuggestions.length - 1 ? 1 : 0,
                          borderBottomColor: theme.border + '50',
                        }}
                      >
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
                            {item.name}
                          </Text>
                          <Text style={{ fontSize: 10.5, color: theme.primary, fontWeight: '600' }}>
                            📞 {item.phone}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#16A34A' }}>
                              {item.totalVisits} Bills
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.halfInput}>
                <CustomerNameInput
                  label="Customer Name"
                  placeholder="e.g. John Doe"
                  value={customerName}
                  onChangeText={handleNameChange}
                />
                {/* Name Dropdown Suggestions */}
                {nameDropdownOpen && nameSuggestions.length > 0 && (
                  <View style={{
                    backgroundColor: theme.backgroundElement,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    marginTop: 4,
                    padding: 4,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                  }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: theme.textSecondary, paddingHorizontal: 6, paddingVertical: 2 }}>
                      EXISTING CUSTOMERS WITH SIMILAR NAME
                    </Text>
                    {nameSuggestions.map((item, sIdx) => (
                      <TouchableOpacity
                        key={item.phone || sIdx}
                        onPress={() => handleSelectCustomer(item)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingHorizontal: 8,
                          paddingVertical: 7,
                          borderBottomWidth: sIdx < nameSuggestions.length - 1 ? 1 : 0,
                          borderBottomColor: theme.border + '50',
                        }}
                      >
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
                            {item.name}
                          </Text>
                          <Text style={{ fontSize: 10.5, color: theme.textSecondary }}>
                            📞 {item.phone || 'No phone'}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primary }}>
                            PKR {item.totalSpend.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </Card>

          {/* Product Items Block */}
          <Card style={styles.formCard}>
            <View style={styles.itemsHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginVertical: 0 }]}>Invoice Items</Text>
              <TouchableOpacity 
                style={[styles.addItemBadge, { backgroundColor: theme.primary }]}
                onPress={() => {
                  setSearchProduct('');
                  setSelectedProduct(null);
                  setProductPickerVisible(true);
                }}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addItemBadgeText}>Add Product</Text>
              </TouchableOpacity>
            </View>

            {/* Table layout of added items */}
            {invoiceItems.length === 0 ? (
              <View style={styles.emptyTableState}>
                <Text style={[styles.emptyTableText, { color: theme.textSecondary }]}>
                  No products added to this invoice yet. Tap &quot;Add Product&quot;.
                </Text>
              </View>
            ) : (
              <View style={styles.table}>
                <View style={[styles.tableHeader, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.thName, { color: theme.textSecondary }]}>Product</Text>
                  <Text style={[styles.thQty, { color: theme.textSecondary }]}>Qty</Text>
                  <Text style={[styles.thPrice, { color: theme.textSecondary }]}>Rate</Text>
                  <Text style={[styles.thTotal, { color: theme.textSecondary }]}>Total</Text>
                  <View style={styles.thAction} />
                </View>

                {invoiceItems.map((item, idx) => (
                  <View key={item.productId} style={[styles.tableRow, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.tdName, { color: theme.text }]} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <Text style={[styles.tdQty, { color: theme.text }]}>
                      {item.quantity}
                    </Text>
                    <Text style={[styles.tdPrice, { color: theme.text }]}>
                      PKR {item.price.toFixed(0)}
                    </Text>
                    <Text style={[styles.tdTotal, { color: theme.text, fontWeight: '700' }]}>
                      PKR {item.total.toFixed(0)}
                    </Text>
                    <TouchableOpacity 
                      style={styles.tdAction}
                      onPress={() => handleRemoveItem(idx)}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Invoice Summary and CTA */}
          <Card style={styles.formCard}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0 }]}>Invoice Summary</Text>
            
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Subtotal:</Text>
              <Text style={[styles.summaryVal, { color: theme.text }]}>PKR {invoiceTotals.subtotal.toFixed(2)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary, flex: 1, flexShrink: 1 }]}>Custom Discount (PKR):</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor={theme.textSecondary + '80'}
                value={discountInput}
                onChangeText={setDiscountInput}
                keyboardType="numeric"
                style={[styles.discountInput, {
                  color: theme.text,
                  borderColor: theme.primary,
                  backgroundColor: theme.backgroundElement,
                }]}
              />
            </View>

            {/* Service Charges Input */}
            <View style={[styles.summaryRow, { alignItems: 'center' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Service Charges:</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => setServiceChargeType('amount')}
                    style={[
                      styles.scBadge,
                      { backgroundColor: serviceChargeType === 'amount' ? theme.primary : theme.backgroundElement, borderColor: theme.border }
                    ]}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: serviceChargeType === 'amount' ? '#fff' : theme.textSecondary }}>Flat PKR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setServiceChargeType('percentage')}
                    style={[
                      styles.scBadge,
                      { backgroundColor: serviceChargeType === 'percentage' ? theme.primary : theme.backgroundElement, borderColor: theme.border }
                    ]}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: serviceChargeType === 'percentage' ? '#fff' : theme.textSecondary }}>Rate %</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TextInput
                placeholder="0"
                placeholderTextColor={theme.textSecondary + '80'}
                value={serviceChargeInput}
                onChangeText={setServiceChargeInput}
                keyboardType="numeric"
                style={[styles.discountInput, {
                  color: theme.text,
                  borderColor: theme.primary,
                  backgroundColor: theme.backgroundElement,
                }]}
              />
            </View>
            {invoiceTotals.serviceCharges > 0 && (
              <View style={[styles.summaryRow, { marginTop: -2, marginBottom: 4 }]}>
                <Text style={{ fontSize: 11, color: theme.primary, fontWeight: '600' }}>
                  Applied {serviceChargeType === 'percentage' ? `${serviceChargeInput}% Fee` : 'Service Fee'}
                </Text>
                <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '700' }}>
                  +PKR {invoiceTotals.serviceCharges.toFixed(2)}
                </Text>
              </View>
            )}

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.summaryRow}>
              <Text style={[styles.grandLabel, { color: theme.text }]}>Net Total Amount:</Text>
              <Text style={[styles.grandVal, { color: theme.primary }]}>PKR {invoiceTotals.total.toFixed(2)}</Text>
            </View>

            {/* ── Owner-only profit breakdown ── */}
            {isOwner && invoiceItems.length > 0 && (
              <View style={[styles.profitBox, { backgroundColor: invoiceTotals.grossProfit >= 0 ? theme.success + '10' : theme.danger + '10', borderColor: invoiceTotals.grossProfit >= 0 ? theme.success + '40' : theme.danger + '40' }]}>
                <View style={styles.profitHeaderRow}>
                  <Ionicons name="lock-closed-outline" size={13} color={theme.textSecondary} />
                  <Text style={[styles.profitHeaderText, { color: theme.textSecondary }]}>Owner Profit Summary (Private)</Text>
                </View>
                <View style={styles.profitRow}>
                  <Text style={[styles.profitLabel, { color: theme.textSecondary }]}>Total Purchase Cost</Text>
                  <Text style={[styles.profitVal, { color: theme.text }]}>PKR {invoiceTotals.totalPurchaseCost.toFixed(0)}</Text>
                </View>
                <View style={styles.profitRow}>
                  <Text style={[styles.profitLabel, { color: theme.textSecondary }]}>Gross Profit</Text>
                  <Text style={[styles.profitVal, { color: invoiceTotals.grossProfit >= 0 ? theme.success : theme.danger, fontWeight: '800' }]}>
                    PKR {invoiceTotals.grossProfit.toFixed(0)}
                    {invoiceTotals.profitMargin !== null ? ` (${invoiceTotals.profitMargin.toFixed(1)}%)` : ''}
                  </Text>
                </View>

                {/* Per-item profit breakdown */}
                {invoiceItems.map((item) => {
                  const dbProduct = products.find(p => p.id === item.productId);
                  const pp = dbProduct?.purchasePrice ?? 0;
                  if (pp <= 0) return null;
                  const itemProfit = (item.price - pp) * item.quantity;
                  return (
                    <View key={item.productId} style={styles.profitItemRow}>
                      <Text style={[styles.profitItemName, { color: theme.textSecondary }]} numberOfLines={1}>
                        {item.productName} ×{item.quantity}
                      </Text>
                      <Text style={[styles.profitItemVal, { color: itemProfit >= 0 ? theme.success : theme.danger }]}>
                        {itemProfit >= 0 ? '+' : ''}PKR {itemProfit.toFixed(0)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Payment Method Selector */}
            <View style={{ marginVertical: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 6 }}>
                Settlement / Payment Method
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setBillingPaymentType('cash')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    backgroundColor: billingPaymentType === 'cash' ? theme.primaryLight : theme.backgroundElement,
                    borderColor: billingPaymentType === 'cash' ? theme.primary : theme.border,
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="cash-outline" size={16} color={billingPaymentType === 'cash' ? theme.primary : theme.textSecondary} />
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: billingPaymentType === 'cash' ? theme.primary : theme.textSecondary }}>
                    Cash / Paid Sale
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setBillingPaymentType('credit')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    backgroundColor: billingPaymentType === 'credit' ? '#EF444415' : theme.backgroundElement,
                    borderColor: billingPaymentType === 'credit' ? '#DC2626' : theme.border,
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="card-outline" size={16} color={billingPaymentType === 'credit' ? '#DC2626' : theme.textSecondary} />
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: billingPaymentType === 'credit' ? '#DC2626' : theme.textSecondary }}>
                    Credit Sale (On Account)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <Button
              title={billingPaymentType === 'credit' ? 'Issue & Charge to Customer Credit' : 'Save & Issue Invoice'}
              variant={billingPaymentType === 'credit' ? 'danger' : 'primary'}
              size="large"
              onPress={handleSaveInvoice}
              loading={isSavingBill}
              style={styles.saveInvoiceBtn}
            />
          </Card>
        </ScrollView>
      )}

      {activeTab === 'installments' && (
        <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Section 1: EMI Calculator Form */}
          <Card style={styles.instCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="calculator-outline" size={20} color={theme.primary} />
              <Text style={[styles.instSectionTitle, { color: theme.text }]}>EMI Calculator & Setup</Text>
            </View>

            <CustomerNameInput
              label="Customer Name"
              placeholder="e.g. John Doe"
              value={instCustomer}
              onChangeText={setInstCustomer}
              required
            />
            <CustomerPhoneInput
              label="Customer Phone"
              value={instPhone}
              onChangeText={setInstPhone}
              selectedCountryCode={instCountryCode}
              onCountryCodeChange={setInstCountryCode}
              required
            />
            <Input
              label="Product / Ref Name"
              placeholder="e.g. iPhone 15 Pro"
              value={instProduct}
              onChangeText={setInstProduct}
              autoCapitalize="words"
            />
            
            <View style={styles.formGridRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Total Value (PKR )"
                  placeholder="e.g. 50000"
                  value={instPrincipal}
                  onChangeText={setInstPrincipal}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Down Payment (PKR )"
                  placeholder="e.g. 10000"
                  value={instDownPayment}
                  onChangeText={setInstDownPayment}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.formGridRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Tenure (Months)"
                  placeholder="e.g. 12"
                  value={instTenure}
                  onChangeText={setInstTenure}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Interest Rate (% p.a.)"
                  placeholder="e.g. 10"
                  value={instInterest}
                  onChangeText={setInstInterest}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Calculations Output Box */}
            <View style={[styles.calcOutputBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.calcTitle, { color: theme.textSecondary }]}>Plan Breakdown</Text>
              
              <View style={styles.calcRow}>
                <Text style={{ color: theme.textSecondary }}>Principal Debt:</Text>
                <Text style={{ fontWeight: '700', color: theme.text }}>PKR {emiCalc.principal.toFixed(2)}</Text>
              </View>
              <View style={styles.calcRow}>
                <Text style={{ color: theme.textSecondary }}>Monthly EMI:</Text>
                <Text style={{ fontWeight: '800', color: theme.primary, fontSize: 16 }}>PKR {emiCalc.monthlyEMI.toFixed(2)} / mo</Text>
              </View>
              <View style={styles.calcRow}>
                <Text style={{ color: theme.textSecondary }}>Total Interest (p.a.):</Text>
                <Text style={{ fontWeight: '600', color: theme.danger }}>PKR {emiCalc.totalInterest.toFixed(2)}</Text>
              </View>
              <View style={styles.calcRow}>
                <Text style={{ color: theme.textSecondary }}>Total Payable:</Text>
                <Text style={{ fontWeight: '700', color: theme.text }}>PKR {emiCalc.totalPayable.toFixed(2)}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: theme.border, marginVertical: 8 }]} />
              <View style={styles.calcRow}>
                <Text style={{ fontWeight: '700', color: theme.text }}>Total Deal Cost:</Text>
                <Text style={{ fontWeight: '700', color: theme.primary }}>PKR {emiCalc.finalCost.toFixed(2)}</Text>
              </View>
            </View>

            <Button
              title="Issue Installment Plan"
              variant="primary"
              size="large"
              onPress={handleSaveInstallmentPlan}
              loading={isSavingPlan}
              style={{ marginTop: 12 }}
            />
          </Card>

          {/* Section 2: Installment Finance Tracker List */}
          <Card style={[styles.instCard, { marginTop: 16 }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="card-outline" size={20} color={theme.primary} />
              <Text style={[styles.instSectionTitle, { color: theme.text }]}>Active Finance Plans</Text>
            </View>

            <View style={[styles.searchWrapper, { backgroundColor: 'transparent', paddingHorizontal: 0 }]}>
              <View style={[styles.searchInputRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Ionicons name="search" size={20} color={theme.textSecondary} />
                <Input
                  placeholder="Search plan by name or phone..."
                  value={searchInstallment}
                  onChangeText={setSearchInstallment}
                  style={styles.searchInput}
                  containerStyle={styles.searchInputContainer}
                />
              </View>
            </View>

            {filteredInstallments.length === 0 ? (
              <View style={[styles.emptyState, { minHeight: 120 }]}>
                <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>No active installment accounts found.</Text>
              </View>
            ) : (
              filteredInstallments.map(item => {
                const isPaid = item.status === 'completed';
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.financeRow, { borderBottomColor: theme.border }]}
                    onPress={() => handleOpenPayments(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.financeHeader}>
                      <Text style={[styles.financeName, { color: theme.text }]}>{item.customerName}</Text>
                      <View style={[
                        styles.statusBadge, 
                        { backgroundColor: isPaid ? theme.success + '20' : theme.warning + '20' }
                      ]}>
                        <Text style={[
                          styles.statusText, 
                          { color: isPaid ? theme.success : theme.textSecondary }
                        ]}>
                          {item.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    
                    <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 2 }}>
                      Product: {item.productName} ({item.monthsTenure} mo @ {item.interestRate}%)
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 4 }}>
                      Phone: {item.customerPhone}
                    </Text>
                    
                    <View style={styles.financeMetrics}>
                      <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 14 }}>
                        EMI: PKR {item.monthlyEMI.toFixed(2)}/mo
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                        Remaining: <Text style={{ color: theme.danger, fontWeight: '600' }}>PKR {item.remainingAmount.toFixed(2)}</Text>
                      </Text>
                    </View>

                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                      Next Due Date: {item.nextDueDate}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </Card>
        </ScrollView>
      )}

      {/* Returns now has dedicated page at /returns accessible via sidebar */}
      {false && (
        <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {/* Sub-segment selector */}
          <View style={{ flexDirection: 'row', backgroundColor: theme.backgroundElement, padding: 4, borderRadius: 12, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setReturnsSegment('process')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: returnsSegment === 'process' ? theme.primary : 'transparent',
              }}
            >
              <Ionicons name="repeat-outline" size={16} color={returnsSegment === 'process' ? '#fff' : theme.textSecondary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: returnsSegment === 'process' ? '#fff' : theme.textSecondary }}>
                Process Return / Exchange
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setReturnsSegment('history')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: returnsSegment === 'history' ? theme.primary : 'transparent',
              }}
            >
              <Ionicons name="time-outline" size={16} color={returnsSegment === 'history' ? '#fff' : theme.textSecondary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: returnsSegment === 'history' ? '#fff' : theme.textSecondary }}>
                Logs ({returnsExchanges.length})
              </Text>
            </TouchableOpacity>
          </View>

          {returnsSegment === 'process' ? (
            <View>
              {/* Step 1: Invoice selection */}
              <Card style={[styles.instCard, { marginBottom: 16 }]}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="receipt-outline" size={20} color={theme.primary} />
                  <Text style={[styles.instSectionTitle, { color: theme.text }]}>1. Select Customer Bill / Invoice</Text>
                </View>

                {returnInvoice ? (() => {
                  const inv = returnInvoice as sqlite.Invoice;
                  return (
                    <View style={{ padding: 12, backgroundColor: theme.primary + '10', borderRadius: 12, borderWidth: 1, borderColor: theme.primary + '30', marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: theme.primary }}>
                          Invoice #{inv.id.substring(0, 8).toUpperCase()}
                        </Text>
                        <TouchableOpacity onPress={() => { setReturnInvoice(null); setReturnItemsList([]); setReturnSelectedItemId(''); }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.danger }}>Change Bill</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={{ color: theme.text, marginTop: 4, fontWeight: '600' }}>
                        Customer: {inv.customerName || 'Walk-in'} {inv.customerPhone ? `(${inv.customerPhone})` : ''}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                        Date: {new Date(inv.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })} · Total: PKR {inv.total.toLocaleString()}
                      </Text>
                    </View>
                  );
                })() : (
                  <View>
                    <Input
                      placeholder="Search recent bills by customer name or phone..."
                      value={searchReturnInvoice}
                      onChangeText={setSearchReturnInvoice}
                    />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 }}>
                      Recent Invoices
                    </Text>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                      {invoices
                        .filter(inv => !searchReturnInvoice || (inv.customerName || '').toLowerCase().includes(searchReturnInvoice.toLowerCase()) || (inv.customerPhone || '').includes(searchReturnInvoice) || inv.id.toLowerCase().includes(searchReturnInvoice.toLowerCase()))
                        .slice(0, 6)
                        .map(inv => (
                          <TouchableOpacity
                            key={inv.id}
                            onPress={async () => {
                              const itms = await sqlite.getInvoiceItems(inv.id);
                              setReturnInvoice(inv);
                              setReturnItemsList(itms);
                              if (itms.length > 0) setReturnSelectedItemId(itms[0].id);
                            }}
                            style={{
                              padding: 10,
                              borderRadius: 8,
                              backgroundColor: theme.background,
                              borderWidth: 1,
                              borderColor: theme.border,
                              marginBottom: 6,
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <View>
                              <Text style={{ fontWeight: '700', color: theme.text, fontSize: 13 }}>
                                #{inv.id.substring(0, 8).toUpperCase()} · {inv.customerName || 'Walk-in'}
                              </Text>
                              <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                                {new Date(inv.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })} {inv.customerPhone ? `· ${inv.customerPhone}` : ''}
                              </Text>
                            </View>
                            <Text style={{ fontWeight: '700', color: theme.primary, fontSize: 13 }}>
                              PKR {inv.total.toLocaleString()}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                )}
              </Card>

              {/* Step 2: Item to return */}
              <Card style={[styles.instCard, { marginBottom: 16 }]}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="cube-outline" size={20} color={theme.primary} />
                  <Text style={[styles.instSectionTitle, { color: theme.text }]}>2. Select Purchased Item to Return</Text>
                </View>

                {returnItemsList.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {returnItemsList.map(item => {
                      const isSel = returnSelectedItemId === item.id;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => { setReturnSelectedItemId(item.id); setReturnQty('1'); }}
                          style={{
                            padding: 12,
                            borderRadius: 10,
                            borderWidth: 1.5,
                            borderColor: isSel ? theme.primary : theme.border,
                            backgroundColor: isSel ? theme.primary + '10' : theme.background,
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700', color: theme.text, fontSize: 14 }}>{item.productName}</Text>
                            <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                              Purchased: {item.quantity} units @ PKR {item.price.toLocaleString()} each
                            </Text>
                          </View>
                          <Ionicons name={isSel ? "radio-button-on" : "radio-button-off"} size={20} color={isSel ? theme.primary : theme.textSecondary} />
                        </TouchableOpacity>
                      );
                    })}

                    <View style={{ marginTop: 8 }}>
                      <Input
                        label={`Return Quantity (Max: ${selectedReturnItem?.quantity || 1})`}
                        value={returnQty}
                        onChangeText={setReturnQty}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                ) : (
                  <Text style={{ color: theme.textSecondary, textAlign: 'center', paddingVertical: 12 }}>
                    Please select an invoice above to view its items.
                  </Text>
                )}
              </Card>

              {/* Step 3: Action Type — Exchange vs Refund */}
              <Card style={[styles.instCard, { marginBottom: 16 }]}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="swap-horizontal-outline" size={20} color={theme.primary} />
                  <Text style={[styles.instSectionTitle, { color: theme.text }]}>3. Action Type & Policy Check</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <TouchableOpacity
                    onPress={() => setReturnType('return')}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: returnType === 'return' ? theme.danger : theme.border,
                      backgroundColor: returnType === 'return' ? theme.danger + '12' : theme.background,
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Ionicons name="cash-outline" size={22} color={returnType === 'return' ? theme.danger : theme.textSecondary} />
                    <Text style={{ fontWeight: '700', fontSize: 13, color: returnType === 'return' ? theme.danger : theme.text }}>
                      Return & Refund
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.textSecondary }}>Refund cash / credit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setReturnType('exchange')}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: returnType === 'exchange' ? theme.primary : theme.border,
                      backgroundColor: returnType === 'exchange' ? theme.primary + '12' : theme.background,
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Ionicons name="repeat-outline" size={22} color={returnType === 'exchange' ? theme.primary : theme.textSecondary} />
                    <Text style={{ fontWeight: '700', fontSize: 13, color: returnType === 'exchange' ? theme.primary : theme.text }}>
                      Product Exchange
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.textSecondary }}>Swap with other item</Text>
                  </TouchableOpacity>
                </View>

                {/* If Exchange: Select replacement product */}
                {returnType === 'exchange' && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 6 }}>
                      Select Replacement Product from Store:
                    </Text>
                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                      {products
                        .filter(p => p.id !== selectedReturnItem?.productId && p.quantity > 0)
                        .slice(0, 10)
                        .map(p => {
                          const isSel = returnReplacementProductId === p.id;
                          return (
                            <TouchableOpacity
                              key={p.id}
                              onPress={() => setReturnReplacementProductId(p.id)}
                              style={{
                                padding: 10,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: isSel ? theme.primary : theme.border,
                                backgroundColor: isSel ? theme.primary + '10' : theme.background,
                                marginBottom: 6,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <View>
                                <Text style={{ fontWeight: '700', color: theme.text, fontSize: 13 }}>{p.name}</Text>
                                <Text style={{ fontSize: 11, color: theme.textSecondary }}>In Stock: {p.quantity} units</Text>
                              </View>
                              <Text style={{ fontWeight: '700', color: theme.primary, fontSize: 13 }}>PKR {p.price.toLocaleString()}</Text>
                            </TouchableOpacity>
                          );
                        })}
                    </ScrollView>

                    <View style={{ marginTop: 8 }}>
                      <Input
                        label="Replacement Quantity"
                        value={returnReplacementQty}
                        onChangeText={setReturnReplacementQty}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                )}

                {/* Product Condition — as highlighted in user image */}
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 6, marginTop: 4 }}>
                  Product Condition (Eligibility Check):
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => setReturnCondition('resellable')}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: returnCondition === 'resellable' ? theme.success : theme.border,
                      backgroundColor: returnCondition === 'resellable' ? theme.success + '15' : theme.background,
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 12, color: returnCondition === 'resellable' ? theme.success : theme.text }}>
                      📦 Good / Resellable
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 2 }}>Restores back to stock</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setReturnCondition('damaged')}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: returnCondition === 'damaged' ? theme.danger : theme.border,
                      backgroundColor: returnCondition === 'damaged' ? theme.danger + '15' : theme.background,
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 12, color: returnCondition === 'damaged' ? theme.danger : theme.text }}>
                      ⚠️ Defective / Damaged
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.textSecondary, marginTop: 2 }}>Does not add to stock</Text>
                  </TouchableOpacity>
                </View>

                {/* Reason tags */}
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 6 }}>Return Reason:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {['Size / Fitting Issue', 'Defective / Damaged', 'Customer Mind Change', 'Wrong Item Delivered', 'Service Dissatisfaction'].map(r => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setReturnReason(r)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: returnReason === r ? theme.primary : theme.border,
                        backgroundColor: returnReason === r ? theme.primaryLight : theme.background,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: returnReason === r ? theme.primary : theme.textSecondary }}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Input
                  label="Additional Notes / Remarks"
                  placeholder="Optional details..."
                  value={returnNotes}
                  onChangeText={setReturnNotes}
                />

                {/* Summary calculation breakdown */}
                <View style={[styles.calcOutputBox, { backgroundColor: theme.background, borderColor: theme.border, marginTop: 14 }]}>
                  <Text style={[styles.calcTitle, { color: theme.textSecondary }]}>Settlement Summary</Text>
                  <View style={styles.calcRow}>
                    <Text style={{ color: theme.textSecondary }}>Returned Items Value:</Text>
                    <Text style={{ fontWeight: '700', color: theme.text }}>
                      PKR {((parseInt(returnQty, 10) || 0) * (selectedReturnItem?.price || 0)).toFixed(2)}
                    </Text>
                  </View>
                  {returnType === 'exchange' && (
                    <>
                      <View style={styles.calcRow}>
                        <Text style={{ color: theme.textSecondary }}>Replacement Product Value:</Text>
                        <Text style={{ fontWeight: '700', color: theme.text }}>
                          PKR {((parseInt(returnReplacementQty, 10) || 0) * (selectedReplacementProduct?.price || 0)).toFixed(2)}
                        </Text>
                      </View>
                      <View style={[styles.divider, { backgroundColor: theme.border, marginVertical: 6 }]} />
                      <View style={styles.calcRow}>
                        <Text style={{ fontWeight: '800', color: theme.text }}>
                          {returnCalculations.customerPaysExtra > 0 ? 'Customer Pays Extra:' : returnCalculations.storeRefunds > 0 ? 'Store Refunds to Customer:' : 'Balance Difference:'}
                        </Text>
                        <Text style={{ fontWeight: '800', fontSize: 16, color: returnCalculations.customerPaysExtra > 0 ? theme.primary : theme.success }}>
                          PKR {Math.abs(returnCalculations.differenceAmount).toFixed(2)}
                        </Text>
                      </View>
                    </>
                  )}
                  {returnType === 'return' && (
                    <>
                      <View style={[styles.divider, { backgroundColor: theme.border, marginVertical: 6 }]} />
                      <View style={styles.calcRow}>
                        <Text style={{ fontWeight: '800', color: theme.danger }}>Total Refund Amount:</Text>
                        <Text style={{ fontWeight: '800', fontSize: 16, color: theme.danger }}>
                          PKR {returnCalculations.refundAmount.toFixed(2)}
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                <Button
                  title={returnType === 'exchange' ? 'Confirm Product Exchange' : 'Confirm Return & Refund'}
                  variant="primary"
                  size="large"
                  onPress={handleProcessReturnExchange}
                  loading={processingReturn}
                  style={{ marginTop: 8 }}
                />
              </Card>
            </View>
          ) : (
            /* History view */
            <View>
              <View style={[styles.searchInputRow, { backgroundColor: theme.background, borderColor: theme.border, marginBottom: 14 }]}>
                <Ionicons name="search" size={18} color={theme.textSecondary} />
                <Input
                  placeholder="Search logs by customer, item, or ID..."
                  value={searchReturnsHistory}
                  onChangeText={setSearchReturnsHistory}
                  style={styles.searchInput}
                  containerStyle={styles.searchInputContainer}
                />
              </View>

              {returnsExchanges.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="repeat-outline" size={54} color={theme.textSecondary + '60'} />
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    No returns or exchanges processed yet.
                  </Text>
                </View>
              ) : (
                returnsExchanges
                  .filter(r => {
                    const q = searchReturnsHistory.toLowerCase();
                    return !q ||
                      (r.customerName || '').toLowerCase().includes(q) ||
                      (r.customerPhone || '').includes(q) ||
                      r.originalProductName.toLowerCase().includes(q) ||
                      (r.replacementProductName || '').toLowerCase().includes(q);
                  })
                  .map(rec => {
                    const isEx = rec.type === 'exchange';
                    return (
                      <Card key={rec.id} style={{ marginBottom: 12, padding: 14 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                            backgroundColor: isEx ? theme.primary + '18' : theme.danger + '18',
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: isEx ? theme.primary : theme.danger, textTransform: 'uppercase' }}>
                              {isEx ? 'Exchange' : 'Return & Refund'}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                            {new Date(rec.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>

                        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                          Customer: {rec.customerName || 'Walk-in'} {rec.customerPhone ? `(${rec.customerPhone})` : ''}
                        </Text>
                        {rec.invoiceId && (
                          <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1 }}>
                            Invoice Ref: #{rec.invoiceId.replace(/^inv_/i, '').toUpperCase()}
                          </Text>
                        )}

                        <View style={{ marginVertical: 8, padding: 8, backgroundColor: theme.background, borderRadius: 8 }}>
                          <Text style={{ fontSize: 12, color: theme.text, fontWeight: '600' }}>
                            Returned: {rec.quantity}x {rec.originalProductName}
                          </Text>
                          <Text style={{ fontSize: 11, color: rec.condition === 'resellable' ? theme.success : theme.danger, marginTop: 2 }}>
                            Condition: {rec.condition === 'resellable' ? 'Restocked to Inventory' : 'Damaged (Not Restocked)'}
                          </Text>

                          {isEx && rec.replacementProductName && (
                            <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '700', marginTop: 4 }}>
                              Replacement: {rec.replacementQuantity}x {rec.replacementProductName}
                            </Text>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                            Reason: {rec.reason || 'Customer request'}
                          </Text>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: isEx ? theme.primary : theme.danger }}>
                            {isEx ? (rec.differenceAmount ? (rec.differenceAmount > 0 ? `+PKR ${rec.differenceAmount.toFixed(0)}` : `-PKR ${Math.abs(rec.differenceAmount).toFixed(0)}`) : 'Even Exchange') : `Refund: PKR ${(rec.refundAmount || 0).toFixed(0)}`}
                          </Text>
                        </View>

                        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end' }}>
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              paddingVertical: 5,
                              paddingHorizontal: 10,
                              backgroundColor: theme.primary + '15',
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: theme.primary + '30',
                            }}
                            onPress={() => {
                              setSelectedReturnRecord(rec);
                              setReturnReceiptModalVisible(true);
                            }}
                          >
                            <Ionicons name="receipt-outline" size={14} color={theme.primary} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>
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
      )}

      {/* ==========================================
          INSTALLMENT PAYMENT HISTORY & LOGGER MODAL
          ========================================== */}
      <Modal
        visible={showPaymentModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerContainer, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>Installment Ledger</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {selectedAccount && (
              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                <Card style={{ marginBottom: 16 }}>
                  <Text style={[styles.invoiceId, { color: theme.text, fontSize: 18, marginBottom: 6 }]}>
                    {selectedAccount.customerName}
                  </Text>
                  <Text style={{ color: theme.textSecondary, marginBottom: 4 }}>
                    Plan Ref: {selectedAccount.productName}
                  </Text>
                  <Text style={{ color: theme.textSecondary, marginBottom: 4 }}>
                    Total Plan Cost: PKR {selectedAccount.totalAmount} (Down: PKR {selectedAccount.downPayment})
                  </Text>
                  <Text style={{ color: theme.textSecondary, marginBottom: 4 }}>
                    Monthly EMI Due: PKR {selectedAccount.monthlyEMI}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: theme.primary, marginTop: 6 }}>
                    Remaining Balance: PKR {selectedAccount.remainingAmount.toFixed(2)}
                  </Text>
                </Card>

                {/* Log Payment Form */}
                {selectedAccount.remainingAmount > 0 && (
                  <Card style={{ marginBottom: 16, borderColor: theme.border, borderWidth: 1 }}>
                    <Text style={{ fontWeight: '700', color: theme.text, marginBottom: 12 }}>Log Customer Payment</Text>
                    <Input
                      label="Amount Paid (PKR )"
                      placeholder="e.g. 5000"
                      value={payAmount}
                      onChangeText={setPayAmount}
                      keyboardType="numeric"
                    />
                    <Input
                      label="Payment Notes"
                      placeholder="e.g. Month 2 EMI Payment"
                      value={payNotes}
                      onChangeText={setPayNotes}
                    />
                    <Button
                      title="Confirm Payment"
                      variant="primary"
                      size="large"
                      onPress={handleLogPayment}
                      loading={loggingPayment}
                      style={{ marginTop: 8 }}
                    />
                  </Card>
                )}

                {/* Payments Log list */}
                <Text style={{ fontWeight: '700', color: theme.text, marginBottom: 8, paddingLeft: 4 }}>Payment Logs</Text>
                {paymentHistory.length === 0 ? (
                  <Text style={{ color: theme.textSecondary, textAlign: 'center', marginVertical: 12 }}>No payments recorded yet.</Text>
                ) : (
                  paymentHistory.map(pmt => (
                    <Card key={pmt.id} style={{ marginBottom: 8, padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontWeight: '700', color: theme.success }}>+ PKR {pmt.amountPaid.toFixed(2)}</Text>
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                          {new Date(pmt.paymentDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>
                      </View>
                      {pmt.notes ? (
                        <Text style={{ fontSize: 13, color: theme.textSecondary }}>{pmt.notes}</Text>
                      ) : null}
                    </Card>
                  ))
                )}

                {user?.role !== 'cashier' && (
                  <Button
                    title="Cancel Installment Plan"
                    variant="outline"
                    size="large"
                    onPress={() => handleDeletePlan(selectedAccount.id)}
                    style={{ marginTop: 24, borderColor: theme.danger }}
                  />
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ==========================================
          CUSTOMER DIRECTORY MODAL
          ========================================== */}
      <Modal
        visible={customerDirectoryModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCustomerDirectoryModalVisible(false)}
      >
        <View style={styles.pickerOverlay}>
          <Card style={[styles.pickerContainer, { backgroundColor: theme.backgroundElement, maxHeight: '85%' }]}>
            <View style={styles.pickerHeader}>
              <View>
                <Text style={[styles.pickerTitle, { color: theme.text }]}>Customer Directory</Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                  {filteredCustomerDirectory.length} Unique Customers Found
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCustomerDirectoryModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Search Customers Bar + Add Customer */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <View style={[styles.pickerSearch, { backgroundColor: theme.background, borderColor: theme.border, flex: 1 }]}>
                <Ionicons name="search" size={18} color={theme.textSecondary} />
                <Input
                  placeholder="Search by name or mobile number..."
                  value={customerDirectorySearch}
                  onChangeText={setCustomerDirectorySearch}
                  style={styles.pickerSearchInput}
                  containerStyle={styles.pickerSearchInputContainer}
                />
              </View>
              <TouchableOpacity
                onPress={() => setShowAddCustomerModal(true)}
                style={{
                  backgroundColor: theme.primary,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 4
                }}
              >
                <Ionicons name="person-add-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>+ New</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Add Customer Modal */}
            {showAddCustomerModal && (
              <Card style={{ marginBottom: 12, borderColor: theme.primary, borderWidth: 1.5, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 8 }}>
                  Create Customer Profile
                </Text>
                <Input
                  label="Customer Name *"
                  placeholder="e.g. Ahmed Raza / Shop 4"
                  value={newCustName}
                  onChangeText={setNewCustName}
                />
                <Input
                  label="Customer Mobile"
                  placeholder="e.g. 03001234567"
                  value={newCustPhone}
                  onChangeText={setNewCustPhone}
                  keyboardType="phone-pad"
                />
                <Input
                  label="Address / Area (Optional)"
                  placeholder="e.g. Saddar, Karachi"
                  value={newCustAddress}
                  onChangeText={setNewCustAddress}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Button
                    title="Cancel"
                    variant="outline"
                    size="small"
                    onPress={() => setShowAddCustomerModal(false)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Save Customer"
                    variant="primary"
                    size="small"
                    onPress={async () => {
                      if (!newCustName.trim()) {
                        Alert.alert('Required', 'Please enter customer name');
                        return;
                      }
                      setAddingCustomer(true);
                      try {
                        const added = await addCustomer(newCustName, newCustPhone, newCustAddress);
                        setCustomerName(added.name);
                        setCustomerPhone(added.phone);
                        setShowAddCustomerModal(false);
                        setCustomerDirectoryModalVisible(false);
                        setNewCustName('');
                        setNewCustPhone('');
                        setNewCustAddress('');
                        if (Platform.OS === 'web') window.alert('Customer profile created successfully!');
                        else Alert.alert('Success', 'Customer profile created successfully!');
                      } catch (e: any) {
                        Alert.alert('Error', e.message || 'Failed to create customer');
                      } finally {
                        setAddingCustomer(false);
                      }
                    }}
                    loading={addingCustomer}
                    style={{ flex: 1.5 }}
                  />
                </View>
              </Card>
            )}

            {/* Customer List */}
            <FlatList
              data={filteredCustomerDirectory}
              keyExtractor={(item, index) => item.phone || String(index)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectCustomer(item)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: theme.backgroundElement,
                    borderWidth: 1,
                    borderColor: theme.border,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: theme.primary + '15',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Ionicons name="person" size={16} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '600', marginTop: 1 }}>
                        📞 {item.phone || 'No phone recorded'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#16A34A' }}>
                        {item.totalVisits} {item.totalVisits === 1 ? 'Bill' : 'Bills'}
                      </Text>
                    </View>
                    {item.totalSpend > 0 && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary }}>
                        PKR {item.totalSpend.toLocaleString('en-IN')}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <Ionicons name="people-outline" size={36} color={theme.textSecondary} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginTop: 8 }}>
                    No matching customers found
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                    New customers are automatically remembered upon billing.
                  </Text>
                </View>
              }
            />
          </Card>
        </View>
      </Modal>

      {/* ==========================================
          PRODUCT PICKER MODAL
          ========================================== */}
      <Modal
        visible={productPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setProductPickerVisible(false)}
      >
        <View style={styles.pickerOverlay}>
          <Card style={[styles.pickerContainer, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>Select Product</Text>
              <TouchableOpacity onPress={() => setProductPickerVisible(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Inline Search Product */}
            <View style={[styles.pickerSearch, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <Input
                placeholder="Search products..."
                value={searchProduct}
                onChangeText={setSearchProduct}
                style={styles.pickerSearchInput}
                containerStyle={styles.pickerSearchInputContainer}
              />
            </View>

            {selectedProduct ? (
              // Quantity & Price configuration screen
              <View style={styles.pickerConfig}>
                <View style={[styles.selectedProductCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={[styles.selectedProdName, { color: theme.text }]}>
                    {selectedProduct.name}
                  </Text>
                  <Text style={[styles.selectedProdStock, { color: selectedProduct.quantity <= selectedProduct.lowStockThreshold ? theme.danger : theme.textSecondary }]}>
                    Stock: {selectedProduct.quantity} units available
                  </Text>
                </View>

                <View style={styles.rowInputs}>
                  <View style={styles.halfInput}>
                    <Input
                      label="Sale Price (PKR )"
                      value={selectedPrice}
                      onChangeText={setSelectedPrice}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Input
                      label="Quantity"
                      value={selectedQty}
                      onChangeText={setSelectedQty}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.pickerActionsRow}>
                  <Button
                    title="Back"
                    variant="outline"
                    onPress={() => setSelectedProduct(null)}
                    style={styles.pickerConfigBackBtn}
                  />
                  <Button
                    title="Add to Invoice"
                    variant="primary"
                    onPress={handleAddProductToInvoice}
                    style={styles.pickerConfigAddBtn}
                  />
                </View>
              </View>
            ) : (
              // Products listing
              <FlatList
                data={filteredProducts}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.pickerList}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Ionicons name="cube-outline" size={40} color={theme.textSecondary + '60'} />
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                      No products found. Add them first in the Products tab.
                    </Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.pickerProductItem, { borderBottomColor: theme.border }]}
                    onPress={() => handleSelectProduct(item)}
                    activeOpacity={0.7}
                  >
                    <View>
                      <Text style={[styles.pickerProdName, { color: theme.text }]}>{item.name}</Text>
                      <Text style={[styles.pickerProdStock, { color: item.quantity <= item.lowStockThreshold ? theme.danger : theme.textSecondary }]}>
                        Stock: {item.quantity} left
                      </Text>
                    </View>
                    <Text style={[styles.pickerProdPrice, { color: theme.primary }]}>
                      PKR {item.price.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </Card>
        </View>
      </Modal>

      {/* Invoice Actions & PDF/Thermal print preview popup */}
      <ReceiptModal
        visible={receiptVisible}
        invoice={selectedInvoice}
        items={selectedInvoiceItems}
        onExchangeReturn={async () => {
          setReceiptVisible(false);
          router.push('/returns' as any);
        }}
        onClose={() => {
          setReceiptVisible(false);
          setSelectedInvoice(null);
          setSelectedInvoiceItems([]);
          refreshData(); // Refresh metrics
        }}
      />

      {/* Return & Exchange Thermal Receipt / Share Modal */}
      <ReturnExchangeReceiptModal
        visible={returnReceiptModalVisible}
        record={selectedReturnRecord}
        onClose={() => {
          setReturnReceiptModalVisible(false);
          setSelectedReturnRecord(null);
        }}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
  },
  tabContent: {
    flex: 1,
  },
  searchWrapper: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
  },
  searchInputContainer: {
    flex: 1,
    marginVertical: 0,
  },
  searchInput: {
    fontSize: 14,
    height: '100%',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
    paddingHorizontal: 32,
    fontWeight: '500',
  },
  invoiceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginVertical: 6,
  },
  invoiceInfo: {
    flex: 1.2,
  },
  invoiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  invoiceId: {
    fontSize: 15,
    fontWeight: '800',
  },
  invoiceDate: {
    fontSize: 11,
    fontWeight: '600',
  },
  customerText: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  invoiceAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  invoiceActions: {
    flexDirection: 'row',
    gap: 8,
  },
  invoiceActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formScrollContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  formCard: {
    padding: 16,
    marginVertical: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  addItemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  addItemBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyTableState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyTableText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  thName: {
    flex: 1.5,
    fontSize: 12,
    fontWeight: '700',
  },
  thQty: {
    flex: 0.5,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  thPrice: {
    flex: 0.8,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  thTotal: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  thAction: {
    width: 30,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tdName: {
    flex: 1.5,
    fontSize: 13,
    fontWeight: '600',
  },
  tdQty: {
    flex: 0.5,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  tdPrice: {
    flex: 0.8,
    fontSize: 13,
    textAlign: 'right',
    fontWeight: '600',
  },
  tdTotal: {
    flex: 1,
    fontSize: 13,
    textAlign: 'right',
  },
  tdAction: {
    width: 30,
    alignItems: 'flex-end',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  discountInputContainer: {
    width: 110,
    marginVertical: 0,
    marginLeft: 8,
    flexShrink: 0,
  },
  discountInput: {
    width: 110,
    height: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 0,
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
      default: {},
    }),
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 12,
  },
  grandLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  grandVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  saveInvoiceBtn: {
    marginTop: 20,
    width: '100%',
  },
  // Profit breakdown (owner only)
  profitBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 6,
  },
  profitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(100,100,100,0.2)',
  },
  profitHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profitLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  profitVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  profitItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 8,
    marginTop: 2,
  },
  profitItemName: {
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  profitItemVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: '75%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 16,
  },
  pickerSearchInputContainer: {
    flex: 1,
    marginVertical: 0,
  },
  pickerSearchInput: {
    fontSize: 14,
    height: '100%',
  },
  pickerList: {
    paddingBottom: 20,
  },
  pickerProductItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickerProdName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  pickerProdStock: {
    fontSize: 12,
    fontWeight: '600',
  },
  pickerProdPrice: {
    fontSize: 15,
    fontWeight: '700',
  },
  pickerConfig: {
    paddingVertical: 8,
  },
  selectedProductCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    backgroundColor: 'rgba(0,0,0,0.02)',
    marginBottom: 16,
  },
  selectedProdName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  selectedProdStock: {
    fontSize: 13,
    fontWeight: '600',
  },
  pickerActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  pickerConfigBackBtn: {
    flex: 1,
  },
  pickerConfigAddBtn: {
    flex: 1.5,
  },
  // Installments stylesheet extensions
  instCard: {
    padding: 16,
    borderRadius: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  instSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  formGridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  calcOutputBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
    marginBottom: 12,
  },
  calcTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  financeRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  financeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  financeName: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  financeMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
});
