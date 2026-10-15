import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CustomerNameInput } from '../../components/CustomerNameInput';
import { CustomerPhoneInput } from '../../components/CustomerPhoneInput';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useAuth } from '../../context/AuthContext';
import { useBusinessCategory } from '../../context/BusinessContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useTheme } from '../../hooks/use-theme';
import * as sqlite from '../../services/sqlite';
import { detectCountryCode, validateCustomerName, validateCustomerPhone } from '../../utils/phoneUtils';

// ─── Categories that support installment plans ───────────────────────────────
const INSTALLMENT_CATEGORIES = new Set([
  'electronics_store', 'mobile_shop', 'mobile_repair', 'solar',
  'hardware_store', 'tyre_shop', 'auto_workshop', 'watch_shop',
  'clothing_boutique', 'shoe_store', 'perfume_store', 'general',
  'furniture_store', 'appliance_store',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uid() {
  return 'crd_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function formatPKR(n: number) {
  return `PKR ${Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

// ─── Small reusable atoms ─────────────────────────────────────────────────────
function InlineInput({
  placeholder,
  value,
  onChangeText,
  keyboardType,
  multiline,
}: {
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: any;
  multiline?: boolean;
}) {
  const theme = useTheme();
  return (
    <TextInput
      style={[
        s.input,
        { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
        multiline && { height: 72, textAlignVertical: 'top' },
      ]}
      placeholder={placeholder}
      placeholderTextColor={theme.textSecondary + '80'}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      multiline={multiline}
    />
  );
}

function ModalActions({
  onCancel,
  onConfirm,
  saving,
  confirmLabel,
  danger,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
  confirmLabel: string;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
      <TouchableOpacity style={[s.outlineBtn, { flex: 1, borderColor: theme.border }]} onPress={onCancel}>
        <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.primaryBtn, { flex: 2, backgroundColor: danger ? theme.danger : theme.primary }]}
        onPress={onConfirm}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color: '#FFF', fontWeight: '800' }}>{confirmLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function StatCard({ label, value, color, theme }: { label: string; value: string; color: string; theme: any }) {
  return (
    <View style={[s.statCard, { backgroundColor: color + '12', borderColor: color + '30' }]}>
      <Text style={{ color, fontWeight: '800', fontSize: 16 }}>{value}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function StatusBadge({ status, overdue, theme }: { status: string; overdue: boolean; theme: any }) {
  const color = overdue ? theme.danger : status === 'completed' ? theme.success : status === 'defaulted' ? theme.danger : theme.primary;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: color + '20', borderWidth: 1, borderColor: color + '40' }}>
      <Text style={{ color, fontSize: 10.5, fontWeight: '800' }}>{overdue ? 'OVERDUE' : status.toUpperCase()}</Text>
    </View>
  );
}

function EmptyState({ icon, text, theme }: { icon: any; text: string; theme: any }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 60 }}>
      <Ionicons name={icon} size={54} color={theme.textSecondary + '40'} />
      <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 16, lineHeight: 22, fontWeight: '500' }}>
        {text}
      </Text>
    </View>
  );
}

// ─── Product Picker Modal ─────────────────────────────────────────────────────
function ProductPickerModal({
  visible,
  products,
  onSelect,
  onClose,
}: {
  visible: boolean;
  products: sqlite.Product[];
  onSelect: (p: sqlite.Product) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.windowOverlay, { zIndex: 100010 }]}>
        <Card style={[s.sheet, { backgroundColor: theme.backgroundElement, maxHeight: '85%' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={[s.sheetTitle, { color: theme.text }]}>Select Product from Catalog</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={theme.text} /></TouchableOpacity>
          </View>
          <View style={[s.searchRow, { backgroundColor: theme.background, borderColor: theme.border, marginBottom: 12 }]}>
            <Ionicons name="search" size={15} color={theme.textSecondary} />
            <TextInput
              style={[s.searchInput, { color: theme.text }]}
              placeholder="Search products..."
              placeholderTextColor={theme.textSecondary}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 24 }}>
                {products.length === 0 ? 'No products in catalog. Add products first.' : 'No products match.'}
              </Text>
            ) : (
              filtered.map(p => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { onSelect(p); setSearch(''); }}
                  activeOpacity={0.7}
                  style={[s.productRow, { borderColor: theme.border, backgroundColor: theme.background }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{p.name}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{p.category || 'General'} · Stock: {p.quantity}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 15 }}>{formatPKR(p.price)}</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} style={{ marginTop: 2 }} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </Card>
      </View>
    </Modal>
  );
}

// ─── Add Customer Modal ───────────────────────────────────────────────────────
function AddCustomerModal({
  visible,
  businessId,
  onClose,
  onSave,
}: {
  visible: boolean;
  businessId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const theme = useTheme();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Enter customer name.');
      return;
    }
    const nameVal = validateCustomerName(name);
    if (!nameVal.isValid) {
      Alert.alert('Invalid Name', nameVal.error || 'Name cannot contain numbers.');
      return;
    }

    let finalPhone = phone.trim();
    if (phone.trim()) {
      const phoneVal = validateCustomerPhone(phone, countryCode);
      if (!phoneVal.isValid) {
        Alert.alert('Invalid Phone', phoneVal.error || 'Please enter a valid phone number.');
        return;
      }
      finalPhone = phoneVal.fullPhone;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const custId = uid();
      await sqlite.upsertCustomer({
        id: custId,
        businessId,
        name: name.trim(),
        phone: finalPhone,
        synced: 0,
        lastUpdated: now,
      });
      await sqlite.upsertCreditAccount({
        id: uid(),
        businessId,
        customerId: custId,
        customerName: name.trim(),
        customerPhone: finalPhone,
        totalDebit: 0,
        totalCredit: 0,
        balance: 0,
        lastTransactionAt: now,
        synced: 0,
        lastUpdated: now,
      });
      setName('');
      setPhone('');
      onSave();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <Card style={[s.sheet, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[s.sheetTitle, { color: theme.text }]}>Open New Credit Account</Text>
          <Text style={[s.sheetSub, { color: theme.textSecondary, marginBottom: 12 }]}>
            Register a verified customer profile for store credit and ledger tracking.
          </Text>
          <CustomerNameInput placeholder="Customer Name *" value={name} onChangeText={setName} required />
          <CustomerPhoneInput label="Phone Number" value={phone} onChangeText={setPhone} selectedCountryCode={countryCode} onCountryCodeChange={setCountryCode} />
          <ModalActions onCancel={onClose} onConfirm={handleSave} saving={saving} confirmLabel="Create Account" />
        </Card>
      </View>
    </Modal>
  );
}

// ─── PROPER TRANSACTION WINDOW / MODAL ────────────────────────────────────────
function AddTransactionModal({
  visible,
  account,
  products,
  onClose,
  onSave,
  userId,
}: {
  visible: boolean;
  account: sqlite.CreditAccount | null;
  products: sqlite.Product[];
  onClose: () => void;
  onSave: () => void;
  userId: string;
}) {
  const theme = useTheme();
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentChannel, setPaymentChannel] = useState<'Cash' | 'Bank Transfer' | 'Online POS' | 'Cheque'>('Cash');
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount('');
      setDescription('');
      setType('debit');
      setPaymentChannel('Cash');
    }
  }, [visible]);

  if (!account) return null;

  const currentBal = account.balance || 0;
  const parsedAmt = parseFloat(amount) || 0;
  const newBal = type === 'debit' ? currentBal + parsedAmt : currentBal - parsedAmt;

  const handleSelectProduct = (prod: sqlite.Product) => {
    setAmount(prod.price.toString());
    setDescription(prod.name);
    setProductPickerVisible(false);
  };

  const handleSave = async () => {
    if (parsedAmt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid transaction amount greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const fullDesc = description.trim()
        ? `${description.trim()} · ${type === 'credit' ? `[Paid via ${paymentChannel}]` : '[Credit Debit]'}`
        : type === 'credit' ? `Payment Received via ${paymentChannel}` : 'Goods Taken on Credit';

      await sqlite.addCreditTransaction(
        {
          id: uid(),
          accountId: account.id,
          businessId: account.businessId,
          type,
          amount: parsedAmt,
          description: fullDesc,
          createdAt: new Date().toISOString(),
          createdBy: userId,
        },
        account
      );
      onSave();
      onClose();
    } catch (e: any) {
      Alert.alert('Transaction Failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.windowOverlay}>
        <View style={[s.windowDialog, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {/* ── Fixed Window Header ── */}
          <View style={[s.windowHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View
                style={[
                  s.windowHeaderIcon,
                  {
                    backgroundColor: type === 'debit' ? '#DC262618' : '#16A34A18',
                    borderColor: type === 'debit' ? '#DC262635' : '#16A34A35',
                  },
                ]}
              >
                <Ionicons
                  name={type === 'debit' ? 'arrow-up-circle' : 'arrow-down-circle'}
                  size={22}
                  color={type === 'debit' ? '#DC2626' : '#16A34A'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={[s.windowTitle, { color: theme.text }]}>Record Credit Transaction</Text>
                  <View style={[s.windowBadge, { backgroundColor: type === 'debit' ? '#DC262615' : '#16A34A15' }]}>
                    <Text style={[s.windowBadgeText, { color: type === 'debit' ? '#DC2626' : '#16A34A' }]}>
                      {type === 'debit' ? 'CREDIT GIVEN' : 'PAYMENT RECEIVED'}
                    </Text>
                  </View>
                </View>
                <Text style={[s.windowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                  Customer: <Text style={{ fontWeight: '700', color: theme.text }}>{account.customerName}</Text>
                  {account.customerPhone ? ` · ${account.customerPhone}` : ''}
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={[s.windowCloseBtn, { backgroundColor: theme.border + '50' }]} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* ── Scrollable Window Body ── */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.windowScrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* Current Balance Status Bar */}
            <View
              style={[
                s.currentBalBar,
                {
                  backgroundColor: currentBal > 0 ? '#DC262610' : '#16A34A10',
                  borderColor: currentBal > 0 ? '#DC262630' : '#16A34A30',
                },
              ]}
            >
              <Ionicons
                name={currentBal > 0 ? 'alert-circle' : 'checkmark-circle'}
                size={18}
                color={currentBal > 0 ? '#DC2626' : '#16A34A'}
              />
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: currentBal > 0 ? '#DC2626' : '#16A34A' }}>
                  Current Outstanding Balance:
                </Text>
                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: '900',
                    color: currentBal > 0 ? '#DC2626' : '#16A34A',
                    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                  }}
                >
                  {formatPKR(Math.abs(currentBal))} {currentBal > 0 ? '(Receivable)' : currentBal < 0 ? '(Advance)' : '(Cleared)'}
                </Text>
              </View>
            </View>

            {/* Transaction Type Selector */}
            <View style={{ marginVertical: 12 }}>
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>TRANSACTION TYPE</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => setType('debit')}
                  style={[
                    s.txTypeTab,
                    {
                      backgroundColor: type === 'debit' ? '#DC2626' : theme.background,
                      borderColor: type === 'debit' ? '#DC2626' : theme.border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <View style={[s.txTypeIconCircle, { backgroundColor: type === 'debit' ? '#FFF' : '#DC262615' }]}>
                    <Ionicons name="arrow-up" size={16} color={type === 'debit' ? '#DC2626' : '#DC2626'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.txTypeTabTitle, { color: type === 'debit' ? '#FFF' : theme.text }]}>
                      Credit Given (Debit)
                    </Text>
                    <Text style={[s.txTypeTabSub, { color: type === 'debit' ? '#FFE4E6' : theme.textSecondary }]}>
                      Customer takes goods/credit (+ balance)
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setType('credit')}
                  style={[
                    s.txTypeTab,
                    {
                      backgroundColor: type === 'credit' ? '#16A34A' : theme.background,
                      borderColor: type === 'credit' ? '#16A34A' : theme.border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <View style={[s.txTypeIconCircle, { backgroundColor: type === 'credit' ? '#FFF' : '#16A34A15' }]}>
                    <Ionicons name="arrow-down" size={16} color={type === 'credit' ? '#16A34A' : '#16A34A'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.txTypeTabTitle, { color: type === 'credit' ? '#FFF' : theme.text }]}>
                      Payment Received (Credit)
                    </Text>
                    <Text style={[s.txTypeTabSub, { color: type === 'credit' ? '#DCFCE7' : theme.textSecondary }]}>
                      Customer settles cash (- balance)
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Amount Input */}
            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>TRANSACTION AMOUNT (PKR) *</Text>
                {type === 'debit' && (
                  <TouchableOpacity
                    onPress={() => setProductPickerVisible(true)}
                    style={[s.windowCatalogBtn, { backgroundColor: theme.primaryLight }]}
                  >
                    <Ionicons name="cube-outline" size={13} color={theme.primary} />
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.primary }}>Pick from Catalog</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={[s.amountBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <View style={[s.amountBadge, { backgroundColor: theme.border + '40' }]}>
                  <Text style={[s.amountPrefix, { color: theme.text }]}>PKR</Text>
                </View>
                <TextInput
                  style={[s.amountInput, { color: theme.text }]}
                  placeholder="0"
                  placeholderTextColor={theme.textSecondary + '70'}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
            </View>

            {/* Quick Pay chips if Payment Received */}
            {type === 'credit' && currentBal > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.fieldLabel, { color: theme.textSecondary, marginBottom: 6 }]}>QUICK SETTLEMENT PRESETS</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setAmount(currentBal.toString())}
                    style={[s.quickAmountChip, { backgroundColor: '#16A34A18', borderColor: '#16A34A' }]}
                  >
                    <Ionicons name="checkmark-done" size={14} color="#16A34A" />
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#16A34A' }}>
                      Pay Full Balance ({formatPKR(currentBal)})
                    </Text>
                  </TouchableOpacity>
                  {[1000, 5000, 10000, 50000].map(val => (
                    <TouchableOpacity
                      key={val}
                      onPress={() => setAmount(val.toString())}
                      style={[s.quickAmountChip, { backgroundColor: theme.background, borderColor: theme.border }]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text }}>+{val.toLocaleString()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Payment Channel selector if Payment Received */}
            {type === 'credit' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>PAYMENT SETTLEMENT CHANNEL</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {(['Cash', 'Bank Transfer', 'Online POS', 'Cheque'] as const).map(ch => {
                    const iconName =
                      ch === 'Cash'
                        ? 'cash-outline'
                        : ch === 'Bank Transfer'
                        ? 'business-outline'
                        : ch === 'Online POS'
                        ? 'card-outline'
                        : 'document-text-outline';
                    const active = paymentChannel === ch;
                    return (
                      <TouchableOpacity
                        key={ch}
                        onPress={() => setPaymentChannel(ch)}
                        style={[
                          s.channelChip,
                          {
                            backgroundColor: active ? theme.primary : theme.background,
                            borderColor: active ? theme.primary : theme.border,
                          },
                        ]}
                      >
                        <Ionicons name={iconName as any} size={13} color={active ? '#FFF' : theme.textSecondary} />
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: active ? '#FFF' : theme.textSecondary }}>
                          {ch}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Particulars / Description */}
            <View style={{ marginBottom: 14 }}>
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>PARTICULARS / ITEM NOTE</Text>
              <View style={[s.noteInputBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Ionicons name="document-text-outline" size={15} color={theme.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[s.noteTextInput, { color: theme.text }]}
                  placeholder={
                    type === 'debit'
                      ? 'e.g. 5 bags Cement, iron bars, Invoice #102'
                      : 'e.g. Cash recovery, bank slip #882, partial settlement'
                  }
                  placeholderTextColor={theme.textSecondary + '70'}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>
            </View>

            {/* Live Balance Impact Preview */}
            <View style={[s.impactBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="calculator-outline" size={14} color={theme.primary} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: theme.primary, letterSpacing: 0.5 }}>
                  LEDGER BALANCE IMPACT PREVIEW
                </Text>
              </View>
              <View style={s.impactRow}>
                <Text style={[s.impactLabel, { color: theme.textSecondary }]}>Current Outstanding:</Text>
                <Text style={[s.impactVal, { color: theme.text }]}>{formatPKR(currentBal)}</Text>
              </View>
              <View style={s.impactRow}>
                <Text style={[s.impactLabel, { color: theme.textSecondary }]}>This Transaction:</Text>
                <Text style={[s.impactVal, { color: type === 'debit' ? '#DC2626' : '#16A34A', fontWeight: '800' }]}>
                  {type === 'debit' ? '+' : '-'}{formatPKR(parsedAmt)}
                </Text>
              </View>
              <View style={[s.divider, { backgroundColor: theme.border }]} />
              <View style={s.impactRow}>
                <Text style={[s.impactGrandLabel, { color: theme.text }]}>New Outstanding Balance:</Text>
                <Text style={[s.impactGrandVal, { color: newBal > 0 ? '#DC2626' : newBal < 0 ? '#16A34A' : theme.text }]}>
                  {formatPKR(Math.abs(newBal))} {newBal > 0 ? '(Receivable)' : newBal < 0 ? '(Advance)' : '(Settled)'}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* ── Fixed Window Footer ── */}
          <View style={[s.windowFooter, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
            <TouchableOpacity style={[s.windowCancelBtn, { borderColor: theme.border }]} onPress={onClose} activeOpacity={0.7}>
              <Text style={[s.windowCancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.windowSubmitBtn,
                { backgroundColor: type === 'debit' ? '#DC2626' : '#16A34A' },
                saving && { opacity: 0.7 },
              ]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name={type === 'debit' ? 'arrow-up-circle' : 'checkmark-circle'} size={18} color="#FFFFFF" />
                  <Text style={s.windowSubmitText}>
                    {type === 'debit' ? 'Record Credit Given' : 'Record Payment Received'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ProductPickerModal
        visible={productPickerVisible}
        products={products}
        onSelect={handleSelectProduct}
        onClose={() => setProductPickerVisible(false)}
      />
    </Modal>
  );
}

// ─── New Installment Modal (with Product Picker) ──────────────────────────────
function NewInstallmentModal({
  visible,
  businessId,
  userId,
  products,
  onClose,
  onSave,
}: {
  visible: boolean;
  businessId: string;
  userId: string;
  products: sqlite.Product[];
  onClose: () => void;
  onSave: () => void;
}) {
  const theme = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [productName, setProductName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState('');
  const [downPayment, setDownPayment] = useState('0');
  const [months, setMonths] = useState('12');
  const [interest, setInterest] = useState('0');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(1);
      setCustomerName('');
      setCustomerPhone('');
      setProductName('');
      setSelectedProductId(null);
      setTotalAmount('');
      setDownPayment('0');
      setMonths('12');
      setInterest('0');
      setStartDate(new Date().toISOString().split('T')[0]);
    }
  }, [visible]);

  const total = parseFloat(totalAmount) || 0;
  const down = parseFloat(downPayment) || 0;
  const principal = Math.max(0, total - down);
  const m = parseInt(months) || 1;
  const rate = parseFloat(interest) || 0;
  const emi = useMemo(() => {
    if (rate === 0 || m === 0) return m > 0 ? principal / m : 0;
    const r = rate / 100 / 12;
    return (principal * r * Math.pow(1 + r, m)) / (Math.pow(1 + r, m) - 1);
  }, [principal, rate, m]);

  const handleSelectProduct = (p: sqlite.Product) => {
    setSelectedProductId(p.id);
    setProductName(p.name);
    setTotalAmount(p.price.toString());
    setProductPickerVisible(false);
  };

  const handleCreate = async () => {
    if (!customerName.trim()) {
      Alert.alert('Required', 'Enter customer name.');
      return;
    }
    if (!productName.trim()) {
      Alert.alert('Required', 'Enter or select a product.');
      return;
    }
    if (total <= 0) {
      Alert.alert('Invalid Total', 'Enter a valid total price.');
      return;
    }
    if (down >= total) {
      Alert.alert('Invalid Down Payment', 'Down payment must be less than total price.');
      return;
    }
    if (m < 1) {
      Alert.alert('Invalid Tenure', 'Enter at least 1 month.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const nextDue = new Date(startDate);
      nextDue.setMonth(nextDue.getMonth() + 1);

      await sqlite.createInstallmentAccount({
        id: uid(),
        userId,
        businessId,
        createdBy: userId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        productName: productName.trim(),
        totalAmount: total,
        downPayment: down,
        monthsTenure: m,
        interestRate: rate,
        monthlyEMI: Math.round(emi),
        remainingAmount: principal,
        status: 'active',
        nextDueDate: nextDue.toISOString().split('T')[0],
        synced: 0,
        lastUpdated: now,
      });

      onSave();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <Card style={[s.sheet, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[s.sheetTitle, { color: theme.text }]}>New Installment Plan</Text>
          <Text style={[s.sheetSub, { color: theme.textSecondary, marginBottom: 12 }]}>
            Step {step} of 2 · {step === 1 ? 'Customer & Product Setup' : 'Financial Repayment Terms'}
          </Text>

          {step === 1 ? (
            <>
              <CustomerNameInput placeholder="Customer Name *" value={customerName} onChangeText={setCustomerName} required />
              <CustomerPhoneInput label="Phone Number" value={customerPhone} onChangeText={setCustomerPhone} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <InlineInput placeholder="Product Name *" value={productName} onChangeText={setProductName} />
                </View>
                <TouchableOpacity
                  onPress={() => setProductPickerVisible(true)}
                  style={[s.catalogPickerBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
                >
                  <Ionicons name="cube-outline" size={16} color={theme.primary} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>Catalog</Text>
                </TouchableOpacity>
              </View>
              <InlineInput placeholder="Total Amount (PKR) *" value={totalAmount} onChangeText={setTotalAmount} keyboardType="numeric" />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={[s.outlineBtn, { flex: 1, borderColor: theme.border }]} onPress={onClose}>
                  <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryBtn, { flex: 1, backgroundColor: theme.primary }]}
                  onPress={() => {
                    if (!customerName.trim() || !productName.trim() || total <= 0) {
                      Alert.alert('Required', 'Please fill name, product, and valid amount.');
                      return;
                    }
                    setStep(2);
                  }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '800' }}>Continue</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <InlineInput placeholder="Down Payment (PKR, default 0)" value={downPayment} onChangeText={setDownPayment} keyboardType="numeric" />
              <InlineInput placeholder="Tenure in Months (e.g. 12)" value={months} onChangeText={setMonths} keyboardType="numeric" />
              <InlineInput placeholder="Annual Interest Rate % (default 0)" value={interest} onChangeText={setInterest} keyboardType="numeric" />
              <InlineInput placeholder="Start Date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} />

              <View style={[s.emiPreviewBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
                <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600' }}>Estimated Monthly EMI:</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: theme.primary, marginTop: 2 }}>
                  {formatPKR(Math.round(emi))}/month
                </Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                  Principal: {formatPKR(principal)} over {m} installments
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={[s.outlineBtn, { flex: 1, borderColor: theme.border }]} onPress={() => setStep(1)}>
                  <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryBtn, { flex: 2, backgroundColor: theme.primary }]}
                  onPress={handleCreate}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color: '#FFF', fontWeight: '800' }}>Activate Plan</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </Card>
      </View>

      <ProductPickerModal
        visible={productPickerVisible}
        products={products}
        onSelect={handleSelectProduct}
        onClose={() => setProductPickerVisible(false)}
      />
    </Modal>
  );
}

// ─── Record EMI Payment Modal ────────────────────────────────────────────────
function RecordPaymentModal({
  visible,
  account,
  onClose,
  onSave,
}: {
  visible: boolean;
  account: sqlite.InstallmentAccount | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const theme = useTheme();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && account) {
      setAmount(account.monthlyEMI.toString());
      setNotes('');
    }
  }, [visible, account]);

  const handleSave = async () => {
    if (!account) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid', 'Enter a valid payment amount.');
      return;
    }
    if (amt > account.remainingAmount + 1) {
      Alert.alert('Overpayment', `Remaining balance is ${formatPKR(account.remainingAmount)}.`);
      return;
    }
    setSaving(true);
    try {
      await sqlite.addInstallmentPayment(
        {
          id: uid(),
          accountId: account.id,
          amountPaid: amt,
          paymentDate: new Date().toISOString().split('T')[0],
          notes: notes.trim() || 'Monthly EMI Payment',
        },
        Math.max(0, account.remainingAmount - amt)
      );
      onSave();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <Card style={[s.sheet, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[s.sheetTitle, { color: theme.text }]}>Record EMI Payment</Text>
          {account && <Text style={[s.sheetSub, { color: theme.textSecondary }]}>{account.customerName} · {account.productName}</Text>}
          {account && (
            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
              <View style={[s.statCard, { flex: 1, backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' }]}>
                <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 14 }}>{formatPKR(account.monthlyEMI)}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>Monthly EMI</Text>
              </View>
              <View style={[s.statCard, { flex: 1, backgroundColor: theme.danger + '12', borderColor: theme.danger + '30' }]}>
                <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 14 }}>{formatPKR(account.remainingAmount)}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>Remaining</Text>
              </View>
            </View>
          )}
          <InlineInput placeholder="Amount Paid (PKR)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <InlineInput placeholder="Notes (optional)" value={notes} onChangeText={setNotes} />
          <ModalActions onCancel={onClose} onConfirm={handleSave} saving={saving} confirmLabel="Record Payment" />
        </Card>
      </View>
    </Modal>
  );
}

// ─── Installment Detail Modal ─────────────────────────────────────────────────
function InstallmentDetailModal({
  visible,
  account,
  payments,
  onClose,
  onPayment,
  onDelete,
}: {
  visible: boolean;
  account: sqlite.InstallmentAccount | null;
  payments: sqlite.InstallmentPayment[];
  onClose: () => void;
  onPayment: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  if (!account) return null;
  const paidSoFar = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  const progressPct = Math.min(100, (paidSoFar / account.totalAmount) * 100);
  const overdue = account.status === 'active' && isOverdue(account.nextDueDate);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[s.detailContainer, { backgroundColor: theme.background }]}>
        <View style={[s.detailHeader, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.detailName, { color: theme.text }]}>{account.customerName}</Text>
            <Text style={[s.detailSub, { color: theme.textSecondary }]}>{account.productName}</Text>
            {account.customerPhone ? <Text style={[s.detailSub, { color: theme.textSecondary }]}>{account.customerPhone}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <StatusBadge status={account.status} overdue={overdue} theme={theme} />
            <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={26} color={theme.textSecondary} /></TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Progress */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>Repayment Progress</Text>
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '800' }}>{progressPct.toFixed(1)}%</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.border, overflow: 'hidden' }}>
              <View style={{ width: `${progressPct}%`, height: '100%', backgroundColor: theme.primary, borderRadius: 4 }} />
            </View>
          </View>

          <View style={[s.statsGrid, { marginBottom: 16 }]}>
            <StatCard label="Total Price" value={formatPKR(account.totalAmount)} color={theme.text} theme={theme} />
            <StatCard label="Down Payment" value={formatPKR(account.downPayment)} color={theme.success} theme={theme} />
            <StatCard label="Monthly EMI" value={formatPKR(account.monthlyEMI)} color={theme.primary} theme={theme} />
            <StatCard label="Remaining" value={formatPKR(account.remainingAmount)} color={account.remainingAmount > 0 ? theme.danger : theme.success} theme={theme} />
            <StatCard label="Tenure" value={`${account.monthsTenure} mo`} color={theme.text} theme={theme} />
            <StatCard label="Interest" value={`${account.interestRate}% p.a.`} color={theme.text} theme={theme} />
          </View>

          {account.status === 'active' && (
            <View style={[s.dueBanner, { backgroundColor: overdue ? theme.danger + '15' : theme.primary + '10', borderColor: overdue ? theme.danger + '40' : theme.primary + '30' }]}>
              <Ionicons name={overdue ? 'warning' : 'calendar'} size={16} color={overdue ? theme.danger : theme.primary} />
              <Text style={{ color: overdue ? theme.danger : theme.primary, fontWeight: '700', marginLeft: 6, fontSize: 13 }}>
                {overdue ? 'OVERDUE · ' : 'Next EMI Due: '}{formatDate(account.nextDueDate)}
              </Text>
            </View>
          )}

          {account.status === 'active' && (
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: theme.primary, marginBottom: 10 }]} onPress={onPayment}>
              <Ionicons name="cash-outline" size={16} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '800', marginLeft: 6 }}>Record EMI Payment</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.outlineBtn, { borderColor: theme.danger + '60', marginBottom: 20 }]}
            onPress={() => Alert.alert('Delete Plan', 'Permanently delete this installment plan?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: onDelete },
            ])}
          >
            <Ionicons name="trash-outline" size={15} color={theme.danger} />
            <Text style={{ color: theme.danger, fontWeight: '700', marginLeft: 6 }}>Delete Plan</Text>
          </TouchableOpacity>

          <Text style={[s.sectionLabel, { color: theme.text }]}>Payment History</Text>
          {payments.length === 0 ? (
            <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 12 }}>No payments recorded yet.</Text>
          ) : (
            payments.map((pmt, idx) => (
              <View key={pmt.id} style={[s.txRow, { borderColor: theme.border }]}>
                <View style={[s.txIcon, { backgroundColor: theme.success + '18' }]}>
                  <Ionicons name="checkmark" size={14} color={theme.success} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>{pmt.notes || `Payment #${payments.length - idx}`}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{formatDate(pmt.paymentDate)}</Text>
                </View>
                <Text style={{ color: theme.success, fontWeight: '800', fontSize: 14 }}>{formatPKR(pmt.amountPaid)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Customer Credit Detail Modal ─────────────────────────────────────────────
function CreditDetailModal({
  visible,
  account,
  transactions,
  onClose,
  onAddTx,
}: {
  visible: boolean;
  account: sqlite.CreditAccount | null;
  transactions: sqlite.CreditTransaction[];
  onClose: () => void;
  onAddTx: () => void;
}) {
  const theme = useTheme();
  const [filterType, setFilterType] = useState<'all' | 'debit' | 'credit'>('all');

  if (!account) return null;

  const filteredTxs = transactions.filter(tx => {
    if (filterType === 'all') return true;
    return tx.type === filterType;
  });

  const handleWhatsApp = () => {
    if (!account.customerPhone) return;
    const cleanPhone = account.customerPhone.replace(/\D/g, '');
    const msg = `Dear ${account.customerName},\n\nThis is a friendly statement regarding your credit ledger balance with us.\n\nOutstanding Balance Due: ${formatPKR(account.balance)}\n\nThank you for your prompt settlement!`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open WhatsApp'));
  };

  const handleCall = () => {
    if (!account.customerPhone) return;
    Linking.openURL(`tel:${account.customerPhone}`).catch(() => Alert.alert('Error', 'Could not dial phone'));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[s.detailContainer, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[s.detailHeader, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.detailName, { color: theme.text }]}>{account.customerName}</Text>
            {account.customerPhone ? (
              <Text style={[s.detailSub, { color: theme.textSecondary }]}>{account.customerPhone}</Text>
            ) : null}
          </View>

          {/* Quick Contact & Close */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {account.customerPhone ? (
              <>
                <TouchableOpacity onPress={handleWhatsApp} style={[s.contactCircle, { backgroundColor: '#25D36620' }]}>
                  <Ionicons name="logo-whatsapp" size={17} color="#25D366" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCall} style={[s.contactCircle, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="call-outline" size={17} color={theme.primary} />
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={26} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 3 Executive Stat Cards */}
        <View style={[s.statsGrid, { margin: 16 }]}>
          <StatCard label="Total Credit Issued" value={formatPKR(account.totalDebit)} color={theme.danger} theme={theme} />
          <StatCard label="Total Repaid" value={formatPKR(account.totalCredit)} color={theme.success} theme={theme} />
          <StatCard
            label={account.balance > 0 ? 'Outstanding Receivable' : account.balance < 0 ? 'Advance Balance' : 'Settled Balance'}
            value={formatPKR(Math.abs(account.balance))}
            color={account.balance > 0 ? theme.danger : account.balance < 0 ? theme.success : theme.textSecondary}
            theme={theme}
          />
        </View>

        {/* Primary Action Button */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: '#1A1A1A', paddingVertical: 13, borderRadius: 12 }]}
            onPress={onAddTx}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle" size={18} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: '800', marginLeft: 8, fontSize: 14 }}>
              Record Credit Transaction
            </Text>
          </TouchableOpacity>
        </View>

        {/* Ledger Filter Tabs */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
          <Text style={[s.sectionLabel, { color: theme.text, marginBottom: 0 }]}>
            Transaction Statement Ledger ({transactions.length})
          </Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['all', 'debit', 'credit'] as const).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilterType(f)}
                style={[
                  s.miniFilterChip,
                  filterType === f && { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: filterType === f ? '#FFF' : theme.textSecondary }}>
                  {f === 'all' ? 'All' : f === 'debit' ? 'Credit Given' : 'Payments'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Itemized Transactions List */}
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {filteredTxs.length === 0 ? (
            <EmptyState icon="receipt-outline" text="No recorded ledger entries found for this customer." theme={theme} />
          ) : (
            filteredTxs.map((tx, idx) => {
              const isDebit = tx.type === 'debit';
              return (
                <View key={tx.id || idx} style={[s.txRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                  <View style={[s.txIcon, { backgroundColor: isDebit ? '#EF444418' : '#10B98118' }]}>
                    <Ionicons
                      name={isDebit ? 'arrow-up-circle' : 'arrow-down-circle'}
                      size={18}
                      color={isDebit ? '#DC2626' : '#16A34A'}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13.5 }}>
                      {tx.description || (isDebit ? 'Credit Goods Issued' : 'Payment Received')}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>
                      {formatDateTime(tx.createdAt)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: isDebit ? '#DC2626' : '#16A34A', fontWeight: '800', fontSize: 15, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                      {isDebit ? '+' : '-'}{formatPKR(tx.amount)}
                    </Text>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: isDebit ? '#DC2626' : '#16A34A', textTransform: 'uppercase' }}>
                      {isDebit ? 'Debit / Owed' : 'Payment Repaid'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function UdharScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { products } = useDatabase();
  const { categoryId } = useBusinessCategory();
  const businessId = user?.businessId ?? '';
  const userId = user?.id ?? '';

  const showInstallments = INSTALLMENT_CATEGORIES.has(categoryId);

  const [tab, setTab] = useState<'udhar' | 'installments'>('udhar');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'cleared'>('all');

  // Customer Credit state
  const [accounts, setAccounts] = useState<sqlite.CreditAccount[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<sqlite.CreditAccount | null>(null);
  const [transactions, setTransactions] = useState<sqlite.CreditTransaction[]>([]);
  const [creditDetailVisible, setCreditDetailVisible] = useState(false);
  const [addCustomerVisible, setAddCustomerVisible] = useState(false);
  const [txModalVisible, setTxModalVisible] = useState(false);

  // Installment state
  const [installments, setInstallments] = useState<sqlite.InstallmentAccount[]>([]);
  const [selectedInstallment, setSelectedInstallment] = useState<sqlite.InstallmentAccount | null>(null);
  const [installmentPayments, setInstallmentPayments] = useState<sqlite.InstallmentPayment[]>([]);
  const [instDetailVisible, setInstDetailVisible] = useState(false);
  const [newInstVisible, setNewInstVisible] = useState(false);
  const [recordPaymentVisible, setRecordPaymentVisible] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const [accs, total, insts] = await Promise.all([
        sqlite.getCreditAccounts(businessId),
        sqlite.getTotalOutstandingBalance(businessId),
        sqlite.getInstallmentAccounts(businessId),
      ]);
      setAccounts(accs);
      setTotalOutstanding(total);
      setInstallments(insts);
    } catch (e) {
      console.error('Credit Ledger load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreditDetail = async (acc: sqlite.CreditAccount) => {
    setSelectedAccount(acc);
    setTransactions(await sqlite.getCreditTransactions(acc.id));
    setCreditDetailVisible(true);
  };

  const openInstallmentDetail = async (inst: sqlite.InstallmentAccount) => {
    setSelectedInstallment(inst);
    setInstallmentPayments(await sqlite.getInstallmentPayments(inst.id));
    setInstDetailVisible(true);
  };

  const refreshInstallmentDetail = async () => {
    if (!selectedInstallment) return;
    const [insts, pmts] = await Promise.all([
      sqlite.getInstallmentAccounts(businessId),
      sqlite.getInstallmentPayments(selectedInstallment.id),
    ]);
    setInstallments(insts);
    setInstallmentPayments(pmts);
    const refreshed = insts.find(i => i.id === selectedInstallment.id);
    if (refreshed) setSelectedInstallment(refreshed);
  };

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      const q = search.toLowerCase();
      const matchesSearch = a.customerName.toLowerCase().includes(q) || a.customerPhone.includes(q);
      if (!matchesSearch) return false;
      if (statusFilter === 'pending') return a.balance > 0;
      if (statusFilter === 'cleared') return a.balance <= 0;
      return true;
    });
  }, [accounts, search, statusFilter]);

  const filteredInstallments = useMemo(() => {
    return installments.filter(i =>
      i.customerName.toLowerCase().includes(search.toLowerCase()) ||
      i.customerPhone.includes(search) ||
      i.productName.toLowerCase().includes(search.toLowerCase())
    );
  }, [installments, search]);

  const overdueCount = installments.filter(i => i.status === 'active' && isOverdue(i.nextDueDate)).length;
  const totalInstOutstanding = installments.filter(i => i.status === 'active').reduce((s, i) => s + i.remainingAmount, 0);
  const pendingAccountsCount = accounts.filter(a => a.balance > 0).length;

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      title="Customer Credit Ledger"
      headerRight={
        <TouchableOpacity
          style={[s.headerActionBtn, { backgroundColor: '#1A1A1A' }]}
          onPress={() => (tab === 'udhar' ? setAddCustomerVisible(true) : setNewInstVisible(true))}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add-outline" size={15} color="#FFFFFF" />
          <Text style={s.headerActionBtnText}>
            {tab === 'udhar' ? 'Open Credit Account' : 'New Installment Plan'}
          </Text>
        </TouchableOpacity>
      }
    >
      {/* ─── Screen Header Title Banner ─────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: theme.text }]}>Customer Credit Ledger</Text>
          <Text style={[s.headerSub, { color: theme.textSecondary }]}>
            {tab === 'udhar'
              ? `${accounts.length} active credit accounts · ${formatPKR(totalOutstanding)} total outstanding receivables`
              : `${installments.length} installment plans · ${overdueCount > 0 ? `${overdueCount} overdue` : 'all active accounts current'}`}
          </Text>
        </View>
      </View>

      {/* ─── Summary Receivables Banner ─────────────────────────────────── */}
      {tab === 'udhar' && totalOutstanding > 0 && (
        <View style={[s.banner, { backgroundColor: '#EF444412', borderColor: '#EF444435' }]}>
          <Ionicons name="alert-circle" size={18} color="#DC2626" />
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerText, { color: '#DC2626' }]}>
              Total Outstanding Receivables: {formatPKR(totalOutstanding)}
            </Text>
            <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1 }}>
              {pendingAccountsCount} customers currently owe credit balances
            </Text>
          </View>
        </View>
      )}

      {/* Installment summary */}
      {tab === 'installments' && showInstallments && (
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12 }}>
          <View style={[s.statCard, { flex: 1, backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' }]}>
            <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 15 }}>{installments.filter(i => i.status === 'active').length}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>Active Plans</Text>
          </View>
          <View style={[s.statCard, { flex: 1, backgroundColor: theme.danger + '12', borderColor: theme.danger + '30' }]}>
            <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 15 }}>{overdueCount}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>Overdue</Text>
          </View>
          <View style={[s.statCard, { flex: 1, backgroundColor: theme.success + '12', borderColor: theme.success + '30' }]}>
            <Text style={{ color: theme.success, fontWeight: '800', fontSize: 13 }}>{formatPKR(totalInstOutstanding)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>Outstanding</Text>
          </View>
        </View>
      )}

      {/* ─── Navigation Tabs (English & Clean) ───────────────────────────── */}
      {showInstallments && (
        <View style={[s.tabBarContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <TouchableOpacity
            onPress={() => { setTab('udhar'); setSearch(''); }}
            style={[s.tabBarBtn, tab === 'udhar' && { backgroundColor: '#C5A880' }]}
            activeOpacity={0.7}
          >
            <Ionicons name="wallet-outline" size={16} color={tab === 'udhar' ? '#16171B' : theme.textSecondary} />
            <Text style={[s.tabBarBtnText, { color: tab === 'udhar' ? '#16171B' : theme.textSecondary }]}>
              Credit Accounts ({accounts.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setTab('installments'); setSearch(''); }}
            style={[s.tabBarBtn, tab === 'installments' && { backgroundColor: '#C5A880' }]}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={16} color={tab === 'installments' ? '#16171B' : theme.textSecondary} />
            <Text style={[s.tabBarBtnText, { color: tab === 'installments' ? '#16171B' : theme.textSecondary }]}>
              Installment Plans ({installments.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Search & Filter Bar ────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, gap: 10 }}>
        <View style={[s.searchRow, { flex: 1, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={15} color={theme.textSecondary} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder={tab === 'udhar' ? 'Search credit customer by name or phone…' : 'Search by name, phone, product…'}
            placeholderTextColor={theme.textSecondary + '80'}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {tab === 'udhar' && (
          <View style={[s.filterGroup, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {(['all', 'pending', 'cleared'] as const).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setStatusFilter(f)}
                style={[s.filterBtn, statusFilter === f && { backgroundColor: theme.primaryLight }]}
              >
                <Text style={[s.filterBtnText, { color: statusFilter === f ? theme.primary : theme.textSecondary }]}>
                  {f === 'all' ? 'All' : f === 'pending' ? 'Pending Due' : 'Cleared'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ─── Accounts List ──────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'udhar' ? (
          filteredAccounts.length === 0 ? (
            <EmptyState
              icon="wallet-outline"
              text={search ? 'No credit accounts match your search.' : 'No customer credit accounts recorded yet.\nTap "Open Credit Account" to get started.'}
              theme={theme}
            />
          ) : (
            filteredAccounts.map(acc => {
              const hasBalance = acc.balance > 0;
              const hasAdvance = acc.balance < 0;
              return (
                <TouchableOpacity key={acc.id} onPress={() => openCreditDetail(acc)} activeOpacity={0.8}>
                  <Card
                    style={[
                      s.listCard,
                      {
                        borderColor: hasBalance ? '#EF444435' : theme.border,
                        backgroundColor: theme.backgroundElement,
                      },
                    ]}
                  >
                    <View style={[s.avatar, { backgroundColor: hasBalance ? '#EF444415' : '#10B98115' }]}>
                      <Text style={{ color: hasBalance ? '#DC2626' : '#16A34A', fontWeight: '900', fontSize: 16 }}>
                        {acc.customerName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
                        {acc.customerName}
                      </Text>
                      {acc.customerPhone ? (
                        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 1 }}>
                          {acc.customerPhone}
                        </Text>
                      ) : null}
                      <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>
                        Last activity: {timeAgo(acc.lastTransactionAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text
                        style={{
                          color: hasBalance ? '#DC2626' : hasAdvance ? '#16A34A' : theme.textSecondary,
                          fontWeight: '800',
                          fontSize: 16,
                          fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                        }}
                      >
                        {formatPKR(Math.abs(acc.balance))}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View
                          style={[
                            s.statusPill,
                            {
                              backgroundColor: hasBalance ? '#EF444415' : hasAdvance ? '#10B98115' : theme.backgroundSelected,
                              borderColor: hasBalance ? '#EF444435' : hasAdvance ? '#10B98135' : theme.border,
                              marginTop: 0,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color: hasBalance ? '#DC2626' : hasAdvance ? '#16A34A' : theme.textSecondary,
                            }}
                          >
                            {hasBalance ? 'RECEIVABLE' : hasAdvance ? 'ADVANCE' : 'CLEARED'}
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={async (e) => {
                            e.stopPropagation();
                            setSelectedAccount(acc);
                            setTransactions(await sqlite.getCreditTransactions(acc.id));
                            setTxModalVisible(true);
                          }}
                          style={[s.quickRecordBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '40' }]}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="add" size={12} color={theme.primary} />
                          <Text style={{ fontSize: 10.5, fontWeight: '800', color: theme.primary }}>Record</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )
        ) : (
          filteredInstallments.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              text={search ? 'No plans match your query.' : 'No installment plans configured yet.\nTap "New Installment Plan" to add one.'}
              theme={theme}
            />
          ) : (
            filteredInstallments.map(inst => {
              const overdue = inst.status === 'active' && isOverdue(inst.nextDueDate);
              const pct = Math.min(100, ((inst.totalAmount - inst.remainingAmount) / inst.totalAmount) * 100);
              return (
                <TouchableOpacity key={inst.id} onPress={() => openInstallmentDetail(inst)} activeOpacity={0.8}>
                  <Card
                    style={[
                      s.listCard,
                      {
                        borderColor: overdue ? theme.danger + '50' : inst.status === 'completed' ? theme.success + '40' : theme.border,
                        flexDirection: 'column',
                        gap: 10,
                        backgroundColor: theme.backgroundElement,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[s.avatar, { backgroundColor: overdue ? theme.danger + '20' : theme.primary + '20' }]}>
                        <Ionicons name="calendar" size={18} color={overdue ? theme.danger : theme.primary} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{inst.customerName}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{inst.productName}</Text>
                        {inst.customerPhone ? <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{inst.customerPhone}</Text> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <StatusBadge status={inst.status} overdue={overdue} theme={theme} />
                        <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 14 }}>{formatPKR(inst.remainingAmount)}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>remaining</Text>
                      </View>
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>EMI: {formatPKR(inst.monthlyEMI)}/mo · {inst.monthsTenure} months</Text>
                        <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>{pct.toFixed(0)}%</Text>
                      </View>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: theme.border, overflow: 'hidden' }}>
                        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: inst.status === 'completed' ? theme.success : theme.primary, borderRadius: 3 }} />
                      </View>
                      {inst.status === 'active' && (
                        <Text style={{ color: overdue ? theme.danger : theme.textSecondary, fontSize: 11, marginTop: 4, fontWeight: overdue ? '700' : '400' }}>
                          {overdue ? 'Overdue · ' : 'Next due: '}{formatDate(inst.nextDueDate)}
                        </Text>
                      )}
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )
        )}
      </ScrollView>

      {/* ─── Modals ─────────────────────────────────────────────────────── */}
      <AddCustomerModal
        visible={addCustomerVisible}
        businessId={businessId}
        onClose={() => setAddCustomerVisible(false)}
        onSave={load}
      />

      <CreditDetailModal
        visible={creditDetailVisible}
        account={selectedAccount}
        transactions={transactions}
        onClose={() => setCreditDetailVisible(false)}
        onAddTx={() => setTxModalVisible(true)}
      />

      <AddTransactionModal
        visible={txModalVisible}
        account={selectedAccount}
        products={products}
        userId={userId}
        onClose={() => setTxModalVisible(false)}
        onSave={async () => {
          await load();
          if (selectedAccount) {
            const [updated, txs] = await Promise.all([
              sqlite.getCreditAccount(selectedAccount.id),
              sqlite.getCreditTransactions(selectedAccount.id),
            ]);
            if (updated) setSelectedAccount(updated);
            setTransactions(txs);
          }
        }}
      />

      <NewInstallmentModal
        visible={newInstVisible}
        businessId={businessId}
        userId={userId}
        products={products}
        onClose={() => setNewInstVisible(false)}
        onSave={load}
      />

      <InstallmentDetailModal
        visible={instDetailVisible}
        account={selectedInstallment}
        payments={installmentPayments}
        onClose={() => setInstDetailVisible(false)}
        onPayment={() => setRecordPaymentVisible(true)}
        onDelete={async () => {
          if (!selectedInstallment) return;
          await sqlite.softDeleteInstallmentAccount(selectedInstallment.id, userId);
          setInstDetailVisible(false);
          load();
        }}
      />

      <RecordPaymentModal
        visible={recordPaymentVisible}
        account={selectedInstallment}
        onClose={() => setRecordPaymentVisible(false)}
        onSave={async () => {
          await load();
          refreshInstallmentDetail();
        }}
      />
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 12.5,
    marginTop: 2,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    cursor: 'pointer',
  } as any,
  headerActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12.5,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  bannerText: {
    fontWeight: '800',
    fontSize: 13,
  },
  tabBarContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  tabBarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabBarBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  filterGroup: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 2,
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  windowOverlay: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 24 : 16,
    zIndex: 100000,
  },
  windowDialog: {
    width: '100%',
    maxWidth: 620,
    maxHeight: Platform.OS === 'web' ? ('88vh' as any) : '90%',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        } as any)
      : {
          elevation: 24,
        }),
  },
  windowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  windowHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  windowSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  windowBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  windowBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  windowCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowScrollContent: {
    padding: 20,
    paddingBottom: 20,
  },
  windowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  windowCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowCancelText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  windowSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  windowSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  txTypeIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowCatalogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  amountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  noteInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  noteTextInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  quickRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 20,
    padding: 20,
  },
  transactionSheet: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 20,
    padding: 22,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sheetSub: {
    fontSize: 12,
    marginTop: 2,
  },
  closeModalBtn: {
    padding: 4,
  },
  currentBalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  txTypeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  txTypeTabTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  txTypeTabSub: {
    fontSize: 10,
    marginTop: 1,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  amountPrefix: {
    fontSize: 15,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    padding: 0,
  },
  quickAmountChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  channelChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  impactBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 10,
    gap: 6,
  },
  impactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  impactLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  impactVal: {
    fontSize: 12.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  impactGrandLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  impactGrandVal: {
    fontSize: 13.5,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  divider: {
    height: 1,
    marginVertical: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    marginTop: 8,
  },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    flexDirection: 'row',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailContainer: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  detailName: {
    fontSize: 20,
    fontWeight: '800',
  },
  detailSub: {
    fontSize: 12,
    marginTop: 2,
  },
  contactCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: 100,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  miniFilterChip: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  txIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  catalogPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  emiPreviewBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  dueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
});
