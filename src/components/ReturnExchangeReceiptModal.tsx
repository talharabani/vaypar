import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/use-theme';
import { ReturnExchange } from '../services/sqlite';
import {
  generateReturnExchangeReceipt,
  printReturnExchangeSlip,
  printViaWebBluetooth,
} from '../services/thermalPrinter';
import {
  copyWhatsAppReturnExchangeToClipboard,
  openWhatsAppReturnExchange,
} from '../utils/invoiceShare';
import { Button } from './Button';
import { Card } from './Card';

interface ReturnExchangeReceiptModalProps {
  visible: boolean;
  record: ReturnExchange | null;
  onClose: () => void;
}

export function ReturnExchangeReceiptModal({
  visible,
  record,
  onClose,
}: ReturnExchangeReceiptModalProps) {
  const { user } = useAuth();
  const theme = useTheme();

  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDirectPrinting, setIsDirectPrinting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState('POS-58 Bluetooth Printer');
  const [printSuccess, setPrintSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Slip printed successfully!');
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Generate Receipt Plain Text Layout
  const receiptData = useMemo(() => {
    if (!record || !user) return null;
    return generateReturnExchangeReceipt(user, record);
  }, [record, user]);

  useEffect(() => {
    if (visible) {
      setIsConnected(false);
      setIsPrinting(false);
      setPrintSuccess(false);
      setCopyFeedback(false);
    }
  }, [visible]);

  if (!record || !user || !receiptData) return null;

  const isExchange = record.type === 'exchange';

  // Render receipt lines with formatting based on commands
  const renderedReceiptLines = receiptData.plainText.split('\n').map((line, idx) => {
    let text = line;
    let textStyle: any = {
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      fontSize: 12,
      color: '#111111',
    };

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

  const handlePrintSlip = async () => {
    setIsDirectPrinting(true);
    setPrintSuccess(false);
    try {
      await printReturnExchangeSlip(user, record, paperWidth);
      setSuccessMessage(`${paperWidth} ${isExchange ? 'Exchange' : 'Return'} voucher sent to printer!`);
      setPrintSuccess(true);
      setTimeout(() => setPrintSuccess(false), 3500);
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Could not print voucher slip.');
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
          Alert.alert('Bluetooth Notice', res.message, [
            { text: 'Cancel', style: 'cancel' },
            { text: `Print ${paperWidth} Slip`, onPress: handlePrintSlip },
          ]);
        } else {
          await handlePrintSlip();
        }
      }
    } catch (err: any) {
      Alert.alert('BLE Error', err.message || 'Failed to transmit ESC/POS bytes.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleWhatsApp = async () => {
    try {
      await openWhatsAppReturnExchange(
        user,
        record,
        record.customerPhone || undefined,
        Platform.OS === 'web' ? 'web' : 'app'
      );
    } catch (err: any) {
      Alert.alert('WhatsApp Error', err.message || 'Could not open WhatsApp.');
    }
  };

  const handleCopyMessage = async () => {
    try {
      const ok = await copyWhatsAppReturnExchangeToClipboard(user, record);
      if (ok) {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 3000);
      }
    } catch (err: any) {
      Alert.alert('Copy Error', 'Failed to copy message to clipboard.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Card
          style={[
            styles.container,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: theme.text }]}>
                {isExchange ? 'Exchange Voucher Control' : 'Return Voucher Control'}
              </Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Slip ID: #{record.id.replace(/^ret_/i, '').toUpperCase()}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: theme.backgroundSelected }]}
            >
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.layoutBody}>
            <View style={styles.flexGrid}>
              {/* ESC/POS Layout Preview */}
              <View style={styles.previewCol}>
                <Text style={[styles.colHeader, { color: theme.text }]}>ESC/POS Layout Preview</Text>

                <View style={styles.paperRoll}>
                  <View style={styles.jaggedBorder} />
                  <View style={styles.paperBody}>{renderedReceiptLines}</View>
                  <View style={styles.jaggedBorder} />
                </View>
              </View>

              {/* Hardware Console Column */}
              <View style={styles.controlsCol}>
                <Text style={[styles.colHeader, { color: theme.text }]}>POS Hardware Console</Text>

                <Card
                  style={[
                    styles.hardwareCard,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Text
                      style={[styles.controlLabel, { color: theme.textSecondary, marginBottom: 0 }]}
                    >
                      Thermal Printer (ESC/POS)
                    </Text>
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
                              backgroundColor:
                                paperWidth === opt.id ? theme.primary + '25' : 'transparent',
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: paperWidth === opt.id ? theme.primary : theme.textSecondary,
                            }}
                          >
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
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor: isConnected
                              ? theme.success
                              : isPrinting
                              ? theme.warning
                              : theme.textSecondary,
                          },
                        ]}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: isConnected
                            ? theme.success
                            : isPrinting
                            ? theme.warning
                            : theme.textSecondary,
                        }}
                      >
                        {isConnected ? 'PAIRED' : isPrinting ? 'TRANSMITTING' : 'READY'}
                      </Text>
                    </View>
                  </View>

                  {/* 4 Action Buttons: Print Slip, Pair, WhatsApp, Copy */}
                  <View style={{ gap: 8, marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        title="Print Slip"
                        variant="primary"
                        size="medium"
                        loading={isDirectPrinting}
                        onPress={handlePrintSlip}
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
                        onPress={handleWhatsApp}
                        style={{
                          flex: 1.2,
                          borderColor: '#25D36660',
                          backgroundColor: '#25D36615',
                        }}
                      />
                      <Button
                        title={copyFeedback ? 'Copied!' : 'Copy Slip'}
                        variant="outline"
                        size="medium"
                        icon={<Ionicons name="copy-outline" size={16} color={theme.primary} />}
                        onPress={handleCopyMessage}
                        style={{ flex: 0.8 }}
                      />
                    </View>
                  </View>

                  {printSuccess && (
                    <View
                      style={[
                        styles.successBanner,
                        {
                          backgroundColor: theme.success + '15',
                          borderColor: theme.success,
                          marginTop: 10,
                        },
                      ]}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={16}
                        color={theme.success}
                        style={{ marginRight: 6 }}
                      />
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 820,
    maxHeight: '92%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    padding: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  layoutBody: {
    padding: 16,
  },
  flexGrid: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 20,
    alignItems: 'flex-start',
  },
  previewCol: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  controlsCol: {
    flex: 1,
    width: '100%',
  },
  colHeader: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  paperRoll: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  jaggedBorder: {
    height: 8,
    backgroundColor: '#FFFFFF',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  paperBody: {
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  hardwareCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  printerChip: {
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
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
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
});
