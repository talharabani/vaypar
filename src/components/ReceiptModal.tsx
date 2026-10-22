/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Image,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/use-theme';
import { shareInvoicePDF } from '../services/pdfGenerator';
import * as sqlite from '../services/sqlite';
import { Invoice, InvoiceItem } from '../services/sqlite';
import { generateThermalBacksideHTML, generateThermalReceipt, generateThermalSlipHTML, openThermalPrintWindow, printThermalBacksideSlip, printThermalSlip, printViaWebBluetooth, simulatePrint } from '../services/thermalPrinter';
import { openWhatsAppInvoice, copyWhatsAppInvoiceToClipboard } from '../utils/invoiceShare';
import { Button } from './Button';
import { Card } from './Card';

interface ReceiptModalProps {
  visible: boolean;
  invoice: Invoice | null;
  items: InvoiceItem[];
  onClose: () => void;
  onExchangeReturn?: (invoice: Invoice, items: InvoiceItem[]) => void;
}

const MOCK_PRINTERS = [
  'XP-58 Mobile Printer (BLE)',
  'POS-58 Bluetooth Printer',
  'Star L200 Mobile POS'
];

export function ReceiptModal({ visible, invoice, items, onClose, onExchangeReturn }: ReceiptModalProps) {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  // Printer Simulator & Hardware States
  const [selectedPrinter, setSelectedPrinter] = useState(MOCK_PRINTERS[0]);
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDirectPrinting, setIsDirectPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Receipt printed successfully!');
  const [addingToUdhar, setAddingToUdhar] = useState(false);
  const [phonePromptVisible, setPhonePromptVisible] = useState(false);
  const [tempPhone, setTempPhone] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<'web' | 'app'>('web');

  // Generate Receipt Plain Text Layout
  const receiptData = useMemo(() => {
    if (!invoice || !user) return null;
    return generateThermalReceipt(user, invoice, items);
  }, [invoice, items, user]);

  // Reset printer state on modal open
  useEffect(() => {
    if (visible) {
      setIsConnected(false);
      setIsPrinting(false);
      setPrintSuccess(false);
    }
  }, [visible]);

  if (!invoice || !user || !receiptData) return null;

  // Render receipt lines with formatting based on commands
  const renderedReceiptLines = receiptData.plainText.split('\n').map((line, idx) => {
    let text = line;
    let textStyle: any = { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, color: '#111111' };

    if (line.startsWith('[CENTER, DOUBLE-SIZE]')) {
      text = line.replace('[CENTER, DOUBLE-SIZE] ', '');
      textStyle = { ...textStyle, textAlign: 'center', fontSize: 16, fontWeight: '800' };
    } else if (line.startsWith('[CENTER]')) {
      text = line.replace('[CENTER] ', '');
      textStyle = { ...textStyle, textAlign: 'center' };
    } else if (line.startsWith('[RIGHT]')) {
      text = line.replace('[RIGHT] ', '');
      textStyle = { ...textStyle, textAlign: 'right' };
    } else if (line.startsWith('[BOLD, RIGHT]')) {
      text = line.replace('[BOLD, RIGHT] ', '');
      textStyle = { ...textStyle, textAlign: 'right', fontWeight: '700' };
    } else if (line.startsWith('[LEFT]')) {
      text = line.replace('[LEFT] ', '');
      textStyle = { ...textStyle, textAlign: 'left' };
    }

    return (
      <Text key={idx} style={textStyle}>
        {text}
      </Text>
    );
  });

  const handlePrintThermalSlip = async () => {
    setIsDirectPrinting(true);
    setPrintSuccess(false);
    try {
      await printThermalSlip(user, invoice, items, paperWidth);
      setSuccessMessage(`${paperWidth} Thermal receipt sent to printer!`);
      setPrintSuccess(true);
      setTimeout(() => setPrintSuccess(false), 3500);
    } catch (err: any) {
      Alert.alert('Thermal Print Error', err.message || 'Could not print thermal slip.');
    } finally {
      setIsDirectPrinting(false);
    }
  };

  const handleBluetoothPrint = async () => {
    if (!receiptData) return;
    setIsPrinting(true);
    setPrintSuccess(false);
    try {
      const res = await printViaWebBluetooth(receiptData);
      if (res.success) {
        setIsConnected(true);
        setSelectedPrinter(res.deviceName);
        setSuccessMessage(`Printed to ${res.deviceName}!`);
        setPrintSuccess(true);
        setTimeout(() => setPrintSuccess(false), 3500);
      } else {
        if (Platform.OS === 'web') {
          Alert.alert(
            'Bluetooth Notice',
            res.message,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: `Print ${paperWidth} Thermal Slip`, onPress: handlePrintThermalSlip }
            ]
          );
        } else {
          await handlePrintThermalSlip();
        }
      }
    } catch (err: any) {
      Alert.alert('BLE Error', err.message || 'Failed to transmit ESC/POS bytes.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleWhatsAppRedirection = async (overridePhone?: string, target: 'web' | 'app' = 'web') => {
    const rawPhone = overridePhone || invoice.customerPhone?.trim() || '';
    if (!rawPhone || rawPhone.replace(/\D/g, '').length < 9) {
      setTempPhone(rawPhone);
      setPendingTarget(target);
      setPhonePromptVisible(true);
      return;
    }
    try {
      await openWhatsAppInvoice(user, invoice, items, rawPhone, target);
    } catch (err: any) {
      Alert.alert('WhatsApp Error', err.message || 'Could not open WhatsApp.');
    }
  };

  const handleCopyMessage = async () => {
    try {
      const ok = await copyWhatsAppInvoiceToClipboard(user, invoice, items);
      if (ok) {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 3000);
      }
    } catch (err: any) {
      Alert.alert('Copy Error', 'Failed to copy message to clipboard.');
    }
  };

  const handleSharePDF = async () => {
    try {
      await shareInvoicePDF(user, invoice, items);
    } catch (err: any) {
      Alert.alert('PDF Sharing Error', err.message || 'Could not compile or share PDF invoice.');
    }
  };

  const handleAddToUdhar = async () => {
    if (!invoice || !user) return;
    setAddingToUdhar(true);
    try {
      const businessId = user.businessId ?? user.id;
      const now = new Date().toISOString();

      // Check if a customer with this phone already exists
      let existingAccounts = await sqlite.getCreditAccounts(businessId);
      const existing = existingAccounts.find(
        a => a.customerName.toLowerCase() === invoice.customerName.toLowerCase() ||
          (invoice.customerPhone && a.customerPhone === invoice.customerPhone.trim())
      );

      if (existing) {
        // Already has an udhar account — just add this invoice as a debit transaction
        const tx: sqlite.CreditTransaction = {
          id: 'crd_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
          accountId: existing.id,
          businessId,
          type: 'debit',
          amount: invoice.total,
          description: `Invoice #${invoice.id.toUpperCase()} — ${invoice.customerName}`,
          createdAt: now,
          createdBy: user.id,
        };
        await sqlite.addCreditTransaction(tx, existing);
        onClose();
        router.push('/udhar' as any);
        return;
      }

      // Create new customer + credit account
      const custId = 'cust_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      await sqlite.upsertCustomer({
        id: custId,
        businessId,
        name: invoice.customerName || 'Customer',
        phone: invoice.customerPhone || '',
        synced: 0,
        lastUpdated: now,
      });

      const accountId = 'crd_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      const account: sqlite.CreditAccount = {
        id: accountId,
        businessId,
        customerId: custId,
        customerName: invoice.customerName || 'Customer',
        customerPhone: invoice.customerPhone || '',
        totalDebit: invoice.total,
        totalCredit: 0,
        balance: invoice.total,
        lastTransactionAt: now,
        synced: 0,
        lastUpdated: now,
      };
      await sqlite.upsertCreditAccount(account);

      // Add the invoice amount as first debit transaction
      const tx: sqlite.CreditTransaction = {
        id: 'crd_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
        accountId,
        businessId,
        type: 'debit',
        amount: invoice.total,
        description: `Invoice #${invoice.id.toUpperCase()} — ${invoice.customerName}`,
        createdAt: now,
        createdBy: user.id,
      };
      await sqlite.addCreditTransaction(tx, account);

      onClose();
      router.push('/udhar' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not add to Udhar.');
    } finally {
      setAddingToUdhar(false);
    }
  };

  const hasPhone = invoice.customerPhone && invoice.customerPhone.trim().replace(/\D/g, '').length >= 10;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Card style={[styles.container, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.title, { color: theme.text }]}>POS Terminal Control</Text>
                {((invoice as any).paymentMethod === 'credit' || (invoice as any).isCreditSale) && (
                  <View style={{ backgroundColor: '#EF444420', borderColor: '#EF4444', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626' }}>
                      ON CREDIT / UNPAID
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Order No: #{sqlite.formatOrderNumber(invoice.id, invoice.createdAt)}
                {(invoice as any).customerBalance !== undefined ? ` · Khata Balance: PKR ${Number((invoice as any).customerBalance).toLocaleString('en-IN')}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.layoutBody}
          >
            {/* Grid layout for Web, Stack for Mobile */}
            <View style={styles.flexGrid}>
              
              {/* Monospace 58mm Paper Roll Preview */}
              <View style={styles.previewCol}>
                <Text style={[styles.colHeader, { color: theme.text }]}>ESC/POS Layout Preview</Text>
                
                <View style={styles.paperRoll}>
                  {/* Jagged Top effect */}
                  <View style={styles.jaggedBorder} />
                  
                  <View style={styles.paperBody}>
                    {user.logoUri ? (
                      <View style={{ alignItems: 'center', marginBottom: 10 }}>
                        <Image
                          source={{ uri: user.logoUri }}
                          style={{ width: 68, height: 48, resizeMode: 'contain' }}
                        />
                      </View>
                    ) : null}
                    {renderedReceiptLines}
                  </View>
                  
                  {/* Jagged Bottom effect */}
                  <View style={styles.jaggedBorder} />
                </View>
              </View>

              {/* Hardware Actions Column */}
              <View style={styles.controlsCol}>
                <Text style={[styles.colHeader, { color: theme.text }]}>POS Hardware Console</Text>
                
                {/* Thermal Printer Hardware Card */}
                <Card style={[styles.hardwareCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={[styles.controlLabel, { color: theme.textSecondary, marginBottom: 0 }]}>Thermal Printer (ESC/POS)</Text>
                    {/* Paper Size Selector */}
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[
                        { id: '80mm', label: 'Standard (80mm)' },
                        { id: '58mm', label: 'Compact (58mm)' },
                      ].map(opt => (
                        <TouchableOpacity
                          key={opt.id}
                          onPress={() => setPaperWidth(opt.id as any)}
                          style={[
                            styles.printerChip,
                            {
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderColor: paperWidth === opt.id ? theme.primary : theme.border,
                              backgroundColor: paperWidth === opt.id ? theme.primary + '25' : 'transparent',
                            }
                          ]}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: paperWidth === opt.id ? theme.primary : theme.textSecondary }}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Device Status Block */}
                  <View style={styles.statusBlock}>
                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                      {isConnected ? selectedPrinter : 'USB Cable / Bluetooth Thermal'}
                    </Text>
                    <View style={styles.statusLabelRow}>
                      <View style={[
                        styles.statusDot, 
                        { backgroundColor: isConnected ? theme.success : isPrinting ? theme.warning : theme.textSecondary }
                      ]} />
                      <Text style={{ 
                        fontSize: 12, 
                        fontWeight: '800', 
                        color: isConnected ? theme.success : isPrinting ? theme.warning : theme.textSecondary 
                      }}>
                        {isConnected ? 'PAIRED' : isPrinting ? 'TRANSMITTING' : 'READY'}
                      </Text>
                    </View>
                  </View>

                  {/* 4 Action Buttons: Print Slip, Pair, WhatsApp, Export */}
                  <View style={{ gap: 8, marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        title="Print Slip"
                        variant="primary"
                        size="medium"
                        loading={isDirectPrinting}
                        onPress={handlePrintThermalSlip}
                        style={{ flex: 1.2 }}
                        icon={<Ionicons name="print" size={16} color="#FFFFFF" />}
                      />
                      <Button
                        title="Pair"
                        variant="outline"
                        size="medium"
                        loading={isPrinting}
                        onPress={handleBluetoothPrint}
                        style={{ flex: 0.8 }}
                        icon={<Ionicons name="bluetooth" size={16} color={theme.primary} />}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        title="WhatsApp"
                        variant="secondary"
                        size="medium"
                        icon={<Ionicons name="logo-whatsapp" size={18} color="#25D366" />}
                        onPress={() => handleWhatsAppRedirection(undefined, Platform.OS === 'web' ? 'web' : 'app')}
                        style={{ flex: 1.2, borderColor: '#25D36660', backgroundColor: '#25D36615' }}
                      />
                      <Button
                        title="Export"
                        variant="outline"
                        size="medium"
                        icon={<Ionicons name="share-outline" size={16} color={theme.primary} />}
                        onPress={handleSharePDF}
                        style={{ flex: 0.8 }}
                      />
                    </View>
                  </View>

                  {printSuccess && (
                    <View style={[styles.successBanner, { backgroundColor: theme.success + '15', borderColor: theme.success, marginTop: 10 }]}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={theme.success} style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.success }}>
                        {successMessage}
                      </Text>
                    </View>
                  )}
                </Card>
              </View>

            </View>
          </ScrollView>

        </Card>
      </View>

      {/* Quick Customer Phone Modal if bill was created without phone */}
      {phonePromptVisible && (
        <Modal visible={phonePromptVisible} transparent animationType="fade" onRequestClose={() => setPhonePromptVisible(false)}>
          <View style={styles.promptOverlay}>
            <Card style={[styles.promptCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Ionicons name="logo-whatsapp" size={24} color="#25D366" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>Customer WhatsApp Number</Text>
              </View>
              <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 12 }}>
                Is bill me customer ka mobile number mojood nahi tha. Number darj karein:
              </Text>
              <TextInput
                placeholder="e.g. 03001234567"
                placeholderTextColor={theme.textSecondary}
                value={tempPhone}
                onChangeText={setTempPhone}
                keyboardType="phone-pad"
                style={[styles.phoneInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Button
                  title="Cancel"
                  variant="outline"
                  size="small"
                  style={{ flex: 1 }}
                  onPress={() => setPhonePromptVisible(false)}
                />
                <Button
                  title="Open WhatsApp"
                  variant="primary"
                  size="small"
                  style={{ flex: 1.5, backgroundColor: '#25D366' }}
                  onPress={() => {
                    if (!tempPhone.trim() || tempPhone.replace(/\D/g, '').length < 9) {
                      Alert.alert('Invalid Number', 'Please enter a valid mobile number (e.g. 03001234567)');
                      return;
                    }
                    const p = tempPhone.trim();
                    setPhonePromptVisible(false);
                    handleWhatsAppRedirection(p, pendingTarget);
                  }}
                />
              </View>
            </Card>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 40 : 0,
  },
  container: {
    width: '100%',
    maxWidth: 800,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layoutBody: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  flexGrid: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 20,
    marginTop: 8,
  },
  previewCol: {
    flex: Platform.OS === 'web' ? 1 : undefined,
    alignItems: 'center',
  },
  controlsCol: {
    flex: Platform.OS === 'web' ? 1.2 : undefined,
  },
  colHeader: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    width: '100%',
  },
  paperRoll: {
    backgroundColor: '#FAFAFA',
    width: 270,
    borderRadius: 4,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
      }
    })
  },
  jaggedBorder: {
    height: 6,
    backgroundColor: '#FAFAFA',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    marginHorizontal: 0,
    opacity: 0.8,
  },
  paperBody: {
    padding: 16,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
    minHeight: 300,
    gap: 2,
  },
  hardwareCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  printerSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  printerChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
  },
  statusBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  statusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginTop: 12,
  },
  shareRow: {
    flexDirection: 'row',
    gap: 10,
  },
  promptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  promptCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  phoneInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
});
