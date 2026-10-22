import { Platform, Linking, Alert } from 'react-native';
import { Invoice, InvoiceItem, ReturnExchange, formatOrderNumber } from '../services/sqlite';
import { UserSession } from '../store/useAuthStore';
import { generateInvoiceHTML } from '../services/pdfGenerator';

import { compressToUrlSafe, decompressFromUrlSafe } from './lzCompress';

/**
 * Encodes invoice data payload safely for URL query transport using ultra-compact format + compression
 */
export function encodeInvoicePayload(
  business: Partial<UserSession>,
  invoice: Invoice,
  items: InvoiceItem[]
): string {
  try {
    // Strip heavy base64 data URIs from logo so it doesn't bloat the URL
    const logo = business.logoUri && !business.logoUri.startsWith('data:') ? business.logoUri : '';

    const compactPayload = {
      b: [
        business.businessName || 'Business',
        business.phone || '',
        business.address || '',
        business.email || '',
        logo
      ],
      i: [
        invoice.id,
        invoice.total,
        invoice.createdAt,
        invoice.customerName || '',
        invoice.customerPhone || '',
        invoice.subtotal || invoice.total,
        invoice.discount || 0
      ],
      it: items.map(it => [
        it.productName,
        it.quantity,
        it.price,
        it.total
      ])
    };

    const jsonStr = JSON.stringify(compactPayload);
    return compressToUrlSafe(jsonStr);
  } catch (err) {
    console.warn('Failed to encode invoice payload:', err);
    return '';
  }
}

/**
 * Decodes invoice data payload from URL query transport (supports both compressed and legacy format)
 */
export function decodeInvoicePayload(encoded: string): {
  business: Partial<UserSession>;
  invoice: Invoice;
  items: InvoiceItem[];
} | null {
  try {
    let jsonStr = '';
    // 1. Try LZ decompression
    const decompressed = decompressFromUrlSafe(encoded);
    if (decompressed && decompressed.startsWith('{')) {
      jsonStr = decompressed;
    } else {
      // 2. Fallback to base64 for legacy links
      if (typeof atob !== 'undefined') {
        try {
          jsonStr = decodeURIComponent(escape(atob(encoded)));
        } catch {}
      }
      if (!jsonStr && typeof Buffer !== 'undefined') {
        try {
          jsonStr = Buffer.from(encoded, 'base64').toString('utf-8');
        } catch {}
      }
    }

    if (!jsonStr) return null;
    const data = JSON.parse(jsonStr);

    // If new compact schema:
    if (Array.isArray(data.b) && Array.isArray(data.i)) {
      const [bName, bPhone, bAddress, bEmail, bLogo] = data.b;
      const [invId, invTotal, invDate, custName, custPhone, invSubtotal, invDiscount] = data.i;
      const rawItems = Array.isArray(data.it) ? data.it : [];

      return {
        business: {
          businessName: bName || 'Business',
          phone: bPhone || '',
          address: bAddress || '',
          email: bEmail || '',
          logoUri: bLogo || ''
        },
        invoice: {
          id: invId || 'INV_0000',
          userId: 'public',
          businessId: 'public',
          createdBy: 'public',
          total: Number(invTotal) || 0,
          subtotal: Number(invSubtotal) || Number(invTotal) || 0,
          discount: Number(invDiscount) || 0,
          createdAt: invDate || new Date().toISOString(),
          customerName: custName || 'Customer',
          customerPhone: custPhone || '',
          synced: 0,
          lastUpdated: invDate || new Date().toISOString(),
        },
        items: rawItems.map((it: any) => ({
          id: 'item_' + Math.random().toString(36).substring(2, 7),
          invoiceId: invId || '',
          productId: '',
          productName: it[0] || 'Item',
          quantity: Number(it[1]) || 1,
          price: Number(it[2]) || 0,
          total: Number(it[3]) || 0,
        })) as InvoiceItem[]
      };
    }

    // Legacy schema fallback
    return {
      business: {
        businessName: data.b?.n || 'Business',
        phone: data.b?.p || '',
        address: data.b?.a || '',
        email: data.b?.e || '',
        logoUri: data.b?.l || ''
      },
      invoice: {
        id: data.inv?.id || 'INV_0000',
        userId: 'public',
        businessId: 'public',
        createdBy: 'public',
        total: Number(data.inv?.t) || 0,
        subtotal: Number(data.inv?.st) || Number(data.inv?.t) || 0,
        discount: Number(data.inv?.d) || 0,
        createdAt: data.inv?.dt || new Date().toISOString(),
        customerName: data.inv?.cn || 'Customer',
        customerPhone: data.inv?.cp || '',
        synced: 0,
        lastUpdated: data.inv?.dt || new Date().toISOString(),
      },
      items: (data.items || []).map((it: any) => ({
        id: 'item_' + Math.random().toString(36).substring(2, 7),
        invoiceId: data.inv?.id || '',
        productId: '',
        productName: it.n || 'Item',
        quantity: Number(it.q) || 1,
        price: Number(it.p) || 0,
        total: Number(it.t) || 0,
      })) as InvoiceItem[]
    };
  } catch (err) {
    console.warn('Failed to decode invoice payload:', err);
    return null;
  }
}

/**
 * Generates the clean, compressed public invoice link
 */
export function getInvoicePublicUrl(
  business: Partial<UserSession>,
  invoice: Invoice,
  items: InvoiceItem[]
): string {
  let origin = 'http://localhost:8081';
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    origin = window.location.origin;
  }

  const cleanId = invoice.id.replace(/^inv_/i, '').toUpperCase();
  const compressedData = encodeInvoicePayload(business, invoice, items);

  if (compressedData) {
    return `${origin}/invoice/${cleanId}?d=${compressedData}`;
  }

  return `${origin}/invoice/${cleanId}`;
}

/**
 * Normalizes customer phone numbers to international WhatsApp format (e.g. 923001234567)
 */
export function formatCustomerPhoneForWhatsApp(phone: string): string {
  if (!phone) return '';
  let clean = phone.trim().replace(/\D/g, '');
  if (clean.startsWith('00')) {
    clean = clean.substring(2);
  }
  // Pakistan mobile formatting: 03001234567 -> 923001234567
  if (clean.startsWith('03') && clean.length === 11) {
    clean = '92' + clean.substring(1);
  } else if (clean.startsWith('3') && clean.length === 10) {
    clean = '92' + clean;
  } else if (clean.startsWith('0') && clean.length >= 10) {
    clean = clean.substring(1);
    if (!clean.startsWith('92') && clean.length === 10) {
      clean = '92' + clean;
    }
  } else if (!clean.startsWith('92') && clean.length === 10) {
    clean = '92' + clean;
  }
  return clean;
}

/**
 * Shortens a long URL using TinyURL with timeout and safe fallback
 */
export async function shortenUrl(longUrl: string): Promise<string> {
  if (!longUrl || longUrl.length < 50) return longUrl;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const short = (await res.text()).trim();
      if (short && short.startsWith('http')) {
        return short;
      }
    }
  } catch (err) {
    console.warn('[InvoiceShare] URL shortening fallback to long URL:', err);
  }
  return longUrl;
}

/**
 * Crafts professional WhatsApp message with merchant name, bill total, date, and link
 */
export async function getWhatsAppInvoiceMessage(
  business: Partial<UserSession>,
  invoice: Invoice,
  items: InvoiceItem[]
): Promise<{
  message: string;
  url: string;
  cleanPhone: string;
  formattedPhone: string;
}> {
  const rawUrl = getInvoicePublicUrl(business, invoice, items);
  const url = await shortenUrl(rawUrl);

  const formattedDate = new Date(invoice.createdAt).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const formattedTotal = 'PKR ' + invoice.total.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const bizName = business.businessName || 'Our Shop';
  const custName = invoice.customerName?.trim() || 'Valued Customer';
  const orderNumber = formatOrderNumber(invoice.id, invoice.createdAt);
  const custPhoneLine = invoice.customerPhone ? `👤 *Customer:* ${custName} (${invoice.customerPhone})\n` : `👤 *Customer:* ${custName}\n`;

  const message =
    `Assalam-o-Alaikum *${custName}*,\n\n` +
    `Thank you for shopping with us at *${bizName}*! 🙏\n\n` +
    `🧾 *ORDER / INVOICE DETAILS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏪 *Business:* ${bizName}\n` +
    `📋 *Order #:* #${orderNumber}\n` +
    custPhoneLine +
    `📅 *Date:* ${formattedDate}\n` +
    `💰 *Total Bill:* *${formattedTotal}*\n` +
    `💳 *Status:* Paid\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📄 *View & Download Official PDF Invoice:*\n` +
    `👉 ${url}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you for your business! JazakAllah Khair.\n` +
    `*${bizName}*\n\n` +
    `_Prepared by Vaypar_`;

  const cleanPhone = invoice.customerPhone ? invoice.customerPhone.trim() : '';
  const formattedPhone = formatCustomerPhoneForWhatsApp(cleanPhone);

  return { message, url, cleanPhone, formattedPhone };
}

/**
 * Copies the complete WhatsApp invoice message and link to the clipboard
 */
export async function copyWhatsAppInvoiceToClipboard(
  business: Partial<UserSession>,
  invoice: Invoice,
  items: InvoiceItem[]
): Promise<boolean> {
  const { message } = await getWhatsAppInvoiceMessage(business, invoice, items);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(message);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard write failed:', err);
  }
  return false;
}

/**
 * Handles opening WhatsApp directly to the customer's chat with pre-filled message
 * @param target 'web' opens web.whatsapp.com directly (skips landing page entirely)
 *               'app' opens native WhatsApp Desktop app (whatsapp://send)
 *               'auto' uses direct WhatsApp Web on desktop web and native app on mobile
 */
export async function openWhatsAppInvoice(
  business: Partial<UserSession>,
  invoice: Invoice,
  items: InvoiceItem[],
  customPhone?: string,
  target: 'web' | 'app' | 'auto' = 'web'
): Promise<void> {
  const phoneToUse = customPhone || invoice.customerPhone;
  const { message } = await getWhatsAppInvoiceMessage(business, invoice, items);
  const formattedPhone = formatCustomerPhoneForWhatsApp(phoneToUse);

  if (!formattedPhone || formattedPhone.length < 10) {
    Alert.alert('Customer Phone Required', 'Bill banatay waqt customer ka valid mobile number enter karein (e.g. 03001234567).');
    return;
  }

  const encodedMsg = encodeURIComponent(message);
  // Direct WhatsApp Web chat URL: goes STRAIGHT into customer chat without intermediate landing page
  const webChatUrl = `https://web.whatsapp.com/send/?phone=${formattedPhone}&text=${encodedMsg}`;
  // Direct Native WhatsApp Windows / Mobile protocol
  const appProtocolUrl = `whatsapp://send?phone=${formattedPhone}&text=${encodedMsg}`;

  if (Platform.OS === 'web') {
    if (target === 'app') {
      try {
        // Attempt to launch Windows WhatsApp Desktop app directly
        window.location.href = appProtocolUrl;
      } catch (err) {
        window.open(webChatUrl, '_blank');
      }
    } else {
      // Direct WhatsApp Web: opens directly into that customer's chat with prefilled message
      window.open(webChatUrl, '_blank');
    }
  } else {
    // Native Mobile: WhatsApp app deep link with fallback
    try {
      const canOpen = await Linking.canOpenURL(appProtocolUrl);
      if (canOpen) {
        await Linking.openURL(appProtocolUrl);
      } else {
        await Linking.openURL(webChatUrl);
      }
    } catch {
      await Linking.openURL(webChatUrl);
    }
  }
}

/**
 * Compiles a clean WhatsApp text message for Return & Exchange Vouchers
 */
export function getWhatsAppReturnExchangeMessage(
  business: Partial<UserSession>,
  record: ReturnExchange
): { message: string; formattedPhone: string } {
  const formattedDate = new Date(record.createdAt).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const bizName = business.businessName || 'Our Shop';
  const custName = record.customerName?.trim() || 'Valued Customer';
  const isExchange = record.type === 'exchange';
  const cleanId = record.id.replace(/^ret_/i, '').toUpperCase();
  const diff = record.differenceAmount || 0;

  let settlementText = '';
  if (isExchange) {
    if (diff > 0) {
      settlementText = `💵 *Customer Paid Difference:* PKR ${diff.toFixed(0)}`;
    } else if (diff < 0) {
      settlementText = `💵 *Store Refunded Difference:* PKR ${Math.abs(diff).toFixed(0)}`;
    } else {
      settlementText = `⚖️ *Even Exchange:* PKR 0`;
    }
  } else {
    settlementText = `💵 *Cash Refunded:* PKR ${(record.refundAmount || 0).toFixed(0)}`;
  }

  const message =
    `Assalam-o-Alaikum *${custName}*,\n\n` +
    `*${bizName}* - ${isExchange ? 'Product Exchange Voucher' : 'Return & Refund Voucher'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *Voucher #:* #${cleanId}\n` +
    `📅 *Date:* ${formattedDate}\n` +
    `👤 *Customer:* ${custName}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔄 *Returned Item:*\n` +
    `• ${record.quantity}x ${record.originalProductName} (${record.condition === 'resellable' ? 'Restocked' : 'Damaged'})\n` +
    (isExchange ? `\n🎁 *Replacement Item:*\n• ${record.replacementQuantity || 1}x ${record.replacementProductName || 'Item'}\n` : '') +
    `\n${settlementText}\n` +
    (record.reason ? `📝 *Reason:* ${record.reason}\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you for shopping with us! JazakAllah Khair.\n` +
    `*${bizName}*`;

  const cleanPhone = record.customerPhone ? record.customerPhone.trim() : '';
  const formattedPhone = formatCustomerPhoneForWhatsApp(cleanPhone);

  return { message, formattedPhone };
}

/**
 * Copies the complete WhatsApp return/exchange message to the clipboard
 */
export async function copyWhatsAppReturnExchangeToClipboard(
  business: Partial<UserSession>,
  record: ReturnExchange
): Promise<boolean> {
  const { message } = getWhatsAppReturnExchangeMessage(business, record);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(message);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard write failed:', err);
  }
  return false;
}

/**
 * Handles opening WhatsApp directly to the customer's chat for Return & Exchange
 */
export async function openWhatsAppReturnExchange(
  business: Partial<UserSession>,
  record: ReturnExchange,
  customPhone?: string,
  target: 'web' | 'app' | 'auto' = 'web'
): Promise<void> {
  const phoneToUse = customPhone || record.customerPhone;
  const { message } = getWhatsAppReturnExchangeMessage(business, record);
  const formattedPhone = formatCustomerPhoneForWhatsApp(phoneToUse || '');

  if (!formattedPhone || formattedPhone.length < 10) {
    Alert.alert('Customer Phone Required', 'Customer ka valid mobile number enter karein (e.g. 03001234567).');
    return;
  }

  const encodedMsg = encodeURIComponent(message);
  const webChatUrl = `https://web.whatsapp.com/send/?phone=${formattedPhone}&text=${encodedMsg}`;
  const appProtocolUrl = `whatsapp://send?phone=${formattedPhone}&text=${encodedMsg}`;

  if (Platform.OS === 'web') {
    if (target === 'app') {
      try {
        window.location.href = appProtocolUrl;
      } catch {
        window.open(webChatUrl, '_blank');
      }
    } else {
      window.open(webChatUrl, '_blank');
    }
  } else {
    try {
      const canOpen = await Linking.canOpenURL(appProtocolUrl);
      if (canOpen) {
        await Linking.openURL(appProtocolUrl);
      } else {
        await Linking.openURL(webChatUrl);
      }
    } catch {
      await Linking.openURL(webChatUrl);
    }
  }
}


