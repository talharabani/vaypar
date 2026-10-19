import React, { useMemo } from 'react';
import { View, StyleSheet, Platform, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { generateInvoiceHTML } from '../../services/pdfGenerator';
import { decodeInvoicePayload } from '../../utils/invoiceShare';
import { Invoice, InvoiceItem } from '../../services/sqlite';

export default function PublicInvoiceScreen() {
  const params = useLocalSearchParams<{
    id: string;
    biz?: string;
    total?: string;
    date?: string;
    c?: string;
    p?: string;
    data?: string;
    d?: string;
  }>();

  const invoiceData = useMemo(() => {
    // 1. Try decoding compressed or legacy payload if provided
    const payload = params.d || params.data;
    if (payload) {
      const decoded = decodeInvoicePayload(payload);
      if (decoded) return decoded;
    }

    // 2. Fallback using individual query params
    const totalNum = parseFloat(params.total || '0') || 0;
    const cleanId = (params.id || 'INV_0001').toUpperCase();

    const mockInvoice: Invoice = {
      id: cleanId.startsWith('INV_') ? cleanId : `INV_${cleanId}`,
      userId: 'public',
      businessId: 'public',
      createdBy: 'public',
      total: totalNum,
      subtotal: totalNum,
      discount: 0,
      createdAt: new Date().toISOString(),
      customerName: params.c || 'Valued Customer',
      customerPhone: params.p || '',
      synced: 0,
      lastUpdated: new Date().toISOString(),
    };

    const mockItems: InvoiceItem[] = [
      {
        id: 'item_1',
        invoiceId: mockInvoice.id,
        productId: '',
        productName: 'Invoice Items',
        quantity: 1,
        price: totalNum,
        total: totalNum,
      }
    ];

    return {
      business: {
        businessName: params.biz || 'Business',
        phone: '',
        address: '',
      },
      invoice: mockInvoice,
      items: mockItems,
    };
  }, [params.data, params.id, params.biz, params.total, params.c, params.p]);

  const htmlContent = useMemo(() => {
    return generateInvoiceHTML({
      business: invoiceData.business,
      invoice: invoiceData.invoice,
      items: invoiceData.items,
      paymentStatus: 'Paid',
      includeToolbar: true,
      autoPrint: false,
    });
  }, [invoiceData]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        {/* On web, iframe renders the exact print-ready invoice with zero CSS conflicts */}
        <iframe
          srcDoc={htmlContent}
          title={`Invoice #${invoiceData.invoice.id}`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          } as any}
        />
      </View>
    );
  }

  // Mobile native view fallback
  return (
    <ScrollView contentContainerStyle={styles.mobileContainer}>
      <View style={styles.mobileCard}>
        <Text style={styles.mobileBizTitle}>{invoiceData.business.businessName || 'Business'}</Text>
        <Text style={styles.mobileInvBadge}>OFFICIAL INVOICE</Text>
        
        <View style={styles.mobileMetaRow}>
          <Text style={styles.mobileLabel}>Invoice #:</Text>
          <Text style={styles.mobileValue}>#{invoiceData.invoice.id}</Text>
        </View>
        <View style={styles.mobileMetaRow}>
          <Text style={styles.mobileLabel}>Customer:</Text>
          <Text style={styles.mobileValue}>{invoiceData.invoice.customerName}</Text>
        </View>
        <View style={styles.mobileMetaRow}>
          <Text style={styles.mobileLabel}>Total Amount:</Text>
          <Text style={styles.mobileTotal}>PKR {invoiceData.invoice.total.toFixed(2)}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.itemsHeader}>Purchased Items</Text>
        {invoiceData.items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.productName}</Text>
              <Text style={styles.itemSub}>{item.quantity} x PKR {item.price.toFixed(2)}</Text>
            </View>
            <Text style={styles.itemTotal}>PKR {item.total.toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        <Text style={styles.thankYou}>Thank you for your business!</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
  },
  mobileContainer: {
    padding: 16,
    backgroundColor: '#F1F5F9',
    flexGrow: 1,
    justifyContent: 'center',
  },
  mobileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  mobileBizTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1b4998',
    textAlign: 'center',
    marginBottom: 4,
  },
  mobileInvBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 1,
  },
  mobileMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mobileLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  mobileValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  mobileTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1b4998',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 16,
  },
  itemsHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1b4998',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1b4998',
  },
  thankYou: {
    textAlign: 'center',
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
  },
});
