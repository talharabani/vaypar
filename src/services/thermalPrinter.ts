import { Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import { Invoice, InvoiceItem, ReturnExchange, formatOrderNumber } from './sqlite';
import { UserSession } from '../store/useAuthStore';
import { isFoodBusiness } from '../constants/businessCategories';

export interface ThermalReceipt {
  plainText: string;
  escposBytes: Uint8Array;
}

// ESC/POS Commands
const ESC = 0x1b;
const GS = 0x1d;

const COMMANDS = {
  RESET: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0],
  ALIGN_CENTER: [ESC, 0x61, 1],
  ALIGN_RIGHT: [ESC, 0x61, 2],
  FONT_NORMAL: [ESC, 0x4d, 0],
  TEXT_SIZE_NORMAL: [GS, 0x21, 0x00],
  TEXT_SIZE_DOUBLE: [GS, 0x21, 0x11], // Double height and double width
  BOLD_ON: [ESC, 0x45, 1],
  BOLD_OFF: [ESC, 0x45, 0],
  LINE_FEED: [0x0a],
  PAPER_CUT: [GS, 0x56, 66, 0], // Cut paper
};

/**
 * Formats columns to fit a 32-character line width (standard 58mm printer)
 * Columns layout: Name (12 chars), Qty (4 chars), Rate (7 chars), Total (9 chars)
 * Total width: 12 + 4 + 7 + 9 = 32
 */
function formatRow(name: string, qty: string, price: string, amount: string): string {
  const colNameWidth = 14;
  const colQtyWidth = 4;
  const colPriceWidth = 6;
  const colAmountWidth = 8;

  let paddedName = name;
  if (name.length > colNameWidth) {
    paddedName = name.substring(0, colNameWidth - 2) + '..';
  } else {
    paddedName = name.padEnd(colNameWidth, ' ');
  }

  const paddedQty = qty.padStart(colQtyWidth, ' ');
  const paddedPrice = price.padStart(colPriceWidth, ' ');
  const paddedAmount = amount.padStart(colAmountWidth, ' ');

  return `${paddedName}${paddedQty}${paddedPrice}${paddedAmount}`;
}

/**
 * Generates raw ESC/POS command bytes and plain text matching standard thermal slip rolls
 */
export function generateThermalReceipt(
  business: Partial<UserSession>,
  invoice: Invoice,
  items: InvoiceItem[]
): ThermalReceipt {
  const plainLines: string[] = [];
  const byteArrays: number[][] = [];

  const addLine = (text: string, formatCmds: number[] = []) => {
    let alignTag = '[LEFT] ';
    if (formatCmds === COMMANDS.ALIGN_CENTER) {
      alignTag = '[CENTER] ';
    } else if (formatCmds === COMMANDS.ALIGN_RIGHT) {
      alignTag = '[RIGHT] ';
    }
    plainLines.push(alignTag + text);

    const textBytes = Array.from(text).map(char => char.charCodeAt(0));
    byteArrays.push(formatCmds);
    byteArrays.push(textBytes);
    byteArrays.push(COMMANDS.LINE_FEED);
  };

  const d = new Date(invoice.createdAt);
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeStr = d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const cleanId = invoice.id.replace(/^inv_/i, '').toUpperCase();
  const orderNumber = formatOrderNumber(invoice.id, invoice.createdAt);
  const tokenNo = (invoice as any).tokenNumber || orderNumber.slice(-4) || '0000';
  const tableNo = (invoice as any).tableNumber || (invoice as any).tableId || '';
  const cashier = (invoice as any).cashierName || business.name || 'biller';
  const orderType = (invoice as any).paymentMethod ? (invoice as any).paymentMethod.toUpperCase() : 'COUNTER';
  const customer = invoice.customerName || 'Walk-In';
  const totalQty = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const taxId = (business as any).taxNumber || (business as any).ntnNumber || (business as any).gstin || '';
  const isFoodBiz = isFoodBusiness(business.businessCategory);

  // 1. Initialize Printer
  byteArrays.push(COMMANDS.RESET);

  // 2. Header (Center, Double Size, Bold)
  const busName = business.businessName || business.name || 'MY BUSINESS';
  plainLines.push(`[CENTER, DOUBLE-SIZE] ${busName}`);
  byteArrays.push(COMMANDS.ALIGN_CENTER);
  byteArrays.push(COMMANDS.TEXT_SIZE_DOUBLE);
  byteArrays.push(COMMANDS.BOLD_ON);
  byteArrays.push(Array.from(busName).map(c => c.charCodeAt(0)));
  byteArrays.push(COMMANDS.LINE_FEED);
  byteArrays.push(COMMANDS.TEXT_SIZE_NORMAL);
  byteArrays.push(COMMANDS.BOLD_OFF);

  // 3. Business details
  if (business.address) {
    addLine(business.address, COMMANDS.ALIGN_CENTER);
  }
  if (business.phone) {
    addLine(`Tel: ${business.phone}`, COMMANDS.ALIGN_CENTER);
  }
  if (taxId) {
    addLine(`GST/NTN: ${taxId}`, COMMANDS.ALIGN_CENTER);
  }

  // Dividing Line
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 4. Customer Name & Phone
  addLine(`Customer: ${customer}`, COMMANDS.ALIGN_LEFT);
  if (invoice.customerPhone && invoice.customerPhone.trim()) {
    addLine(`Phone:    ${invoice.customerPhone.trim()}`, COMMANDS.ALIGN_LEFT);
  }
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 5. Metadata (business-aware: dine-in/tables only for food businesses)
  addLine(`Date: ${dateStr}  Time: ${timeStr}`, COMMANDS.ALIGN_LEFT);
  addLine(`Order No: #${orderNumber}`, COMMANDS.ALIGN_LEFT);
  if (isFoodBiz) {
    const foodType = tableNo ? `Dine In: Table ${tableNo}` : `Order: ${orderType.substring(0, 10)}`;
    addLine(`${foodType.padEnd(16, ' ')} Token: ${tokenNo}`, COMMANDS.ALIGN_LEFT);
  }
  addLine(`Cashier:  ${cashier.substring(0, 20)}`, COMMANDS.ALIGN_LEFT);
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 6. Items Table Header
  addLine('Item           Qty. Price Amount', COMMANDS.ALIGN_LEFT);
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 7. Items Details
  items.forEach(item => {
    addLine(
      formatRow(
        item.productName,
        item.quantity.toString(),
        item.price.toFixed(0),
        item.total.toFixed(2)
      ),
      COMMANDS.ALIGN_LEFT
    );
  });

  // Dividing Line
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 8. Summary
  addLine(`Total Qty: ${totalQty.toString().padEnd(4, ' ')} Sub Total ${invoice.subtotal.toFixed(2).padStart(8, ' ')}`, COMMANDS.ALIGN_LEFT);

  if (invoice.discount > 0) {
    addLine(`              Discount -${invoice.discount.toFixed(2).padStart(8, ' ')}`, COMMANDS.ALIGN_LEFT);
  }

  if (invoice.serviceCharges && invoice.serviceCharges > 0) {
    addLine(`           Service Fee +${invoice.serviceCharges.toFixed(2).padStart(8, ' ')}`, COMMANDS.ALIGN_LEFT);
  }

  // 9. Grand Total (Bold, aligned right)
  const totalStr = `Grand Total  Rs. ${invoice.total.toFixed(2)}`;
  plainLines.push(`[BOLD, RIGHT] ${totalStr}`);
  byteArrays.push(COMMANDS.ALIGN_RIGHT);
  byteArrays.push(COMMANDS.BOLD_ON);
  byteArrays.push(Array.from(totalStr).map(c => c.charCodeAt(0)));
  byteArrays.push(COMMANDS.LINE_FEED);
  byteArrays.push(COMMANDS.BOLD_OFF);

  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 10. Footer
  if (taxId) {
    addLine(`Lic / NTN: ${taxId}`, COMMANDS.ALIGN_CENTER);
  }
  addLine('Thank You, Visit Again!', COMMANDS.ALIGN_CENTER);
  addLine('Prepared by Vaypar', COMMANDS.ALIGN_CENTER);

  // Feeds and paper cut
  byteArrays.push(COMMANDS.LINE_FEED);
  byteArrays.push(COMMANDS.LINE_FEED);
  byteArrays.push(COMMANDS.PAPER_CUT);

  const flatBytes: number[] = [];
  byteArrays.forEach(arr => {
    flatBytes.push(...arr);
  });

  return {
    plainText: plainLines.join('\n'),
    escposBytes: new Uint8Array(flatBytes),
  };
}

/**
 * Generates an exact 58mm or 80mm single-sided thermal receipt slip HTML matching real POS paper rolls
 */
export function generateThermalSlipHTML(
  business: Partial<UserSession>,
  invoice: Invoice,
  items: InvoiceItem[],
  paperWidth: '58mm' | '80mm' = '80mm'
): string {
  const is58mm = paperWidth === '58mm';
  const widthMm = is58mm ? '58mm' : '80mm';
  const contentWidthMm = is58mm ? '52mm' : '74mm';

  const orderNumber = formatOrderNumber(invoice.id, invoice.createdAt);
  const tokenNo = (invoice as any).tokenNumber || orderNumber.slice(-4) || '0000';
  const tableNo = (invoice as any).tableNumber || (invoice as any).tableId || '';

  const d = new Date(invoice.createdAt);
  const dateFormatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeFormatted = d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });

  const cashierName = (invoice as any).cashierName || business.name || 'biller';
  const orderType = (invoice as any).paymentMethod ? (invoice as any).paymentMethod.toUpperCase() : 'COUNTER';
  const customerName = invoice.customerName || '';
  const isFoodBiz = isFoodBusiness(business.businessCategory);

  const totalQty = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const taxId = (business as any).taxNumber || (business as any).ntnNumber || (business as any).gstin || '';

  const itemsRows = items.map(item => `
    <tr>
      <td style="text-align: left; padding: 2px 0; word-break: break-word; font-weight: 600; color: #000;">${item.productName}</td>
      <td style="text-align: center; padding: 2px 2px; font-weight: 600; color: #000; white-space: nowrap;">${item.quantity}</td>
      <td style="text-align: right; padding: 2px 2px; font-weight: 500; color: #000; white-space: nowrap;">${item.price.toFixed(0)}</td>
      <td style="text-align: right; padding: 2px 0; font-weight: 700; color: #000; white-space: nowrap;">${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt - #${orderNumber}</title>
        <style>
          @page {
            size: ${widthMm} auto;
            margin: 0mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .receipt {
            width: ${contentWidthMm} !important;
            max-width: ${contentWidthMm} !important;
            margin: 0 auto;
            padding: ${is58mm ? '3mm 1mm' : '5mm 2mm'};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace, sans-serif;
            font-size: ${is58mm ? '11.5px' : '13px'};
            line-height: 1.25;
            color: #000000;
          }
          .store-name {
            font-size: ${is58mm ? '15px' : '18px'};
            font-weight: 900;
            text-align: center;
            margin-bottom: 2px;
            letter-spacing: 0.2px;
            text-transform: uppercase;
          }
          .store-sub {
            font-size: ${is58mm ? '10px' : '11.5px'};
            text-align: center;
            font-weight: 600;
            margin: 1px 0;
            color: #111;
          }
          .store-tax {
            font-size: ${is58mm ? '10px' : '11.5px'};
            text-align: center;
            font-weight: 700;
            margin: 2px 0 3px 0;
          }
          .divider-solid {
            border-top: 1.5px solid #000000;
            margin: 4px 0;
          }
          .customer-line {
            font-size: ${is58mm ? '11px' : '12.5px'};
            font-weight: 700;
            padding: 1px 0;
          }
          .meta-grid {
            display: flex;
            justify-content: space-between;
            font-size: ${is58mm ? '10.5px' : '12px'};
            font-weight: 600;
            line-height: 1.3;
          }
          .meta-col-left {
            text-align: left;
          }
          .meta-col-right {
            text-align: right;
          }
          table.items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: inherit;
            margin: 2px 0;
          }
          table.items-table th {
            font-weight: 700;
            padding: 3px 0;
            border-bottom: 1.5px solid #000000;
            font-size: ${is58mm ? '11px' : '12.5px'};
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            font-weight: 700;
            font-size: ${is58mm ? '11px' : '12.5px'};
            margin: 3px 0;
          }
          .summary-sub-row {
            display: flex;
            justify-content: space-between;
            font-size: ${is58mm ? '10.5px' : '12px'};
            margin: 2px 0;
          }
          .grand-total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: ${is58mm ? '15px' : '18px'};
            font-weight: 900;
            margin: 5px 0 3px 0;
          }
          .footer-section {
            text-align: center;
            font-size: ${is58mm ? '10.5px' : '11.5px'};
            margin-top: 4px;
            line-height: 1.35;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          ${business.logoUri ? `
            <div style="text-align: center; margin-bottom: 6px;">
              <img src="${business.logoUri}" style="max-height: 50px; max-width: 140px; object-fit: contain;" alt="Logo" />
            </div>
          ` : ''}
          <!-- Business Header -->
          <div class="store-name">${business.businessName || business.name || 'MY BUSINESS'}</div>
          ${business.address ? `<div class="store-sub">${business.address}</div>` : ''}
          ${business.phone ? `<div class="store-sub">Tel: ${business.phone}</div>` : ''}
          ${taxId ? `<div class="store-tax">GST / NTN: ${taxId}</div>` : ''}
          
          <div class="divider-solid"></div>

          <!-- Customer Name & Phone -->
          <div class="customer-line">
            <div><strong>Customer:</strong> ${customerName || 'Walk-In'}</div>
            ${invoice.customerPhone ? `<div style="font-weight: 500; font-size: ${is58mm ? '10px' : '11px'}; margin-top: 1px;"><strong>Phone:</strong> ${invoice.customerPhone}</div>` : ''}
          </div>

          <div class="divider-solid"></div>

          <!-- 2-Column Metadata (business-aware) -->
          <div class="meta-grid">
            <div class="meta-col-left">
              <div>Date: ${dateFormatted}</div>
              <div>Time: ${timeFormatted}</div>
              <div>Cashier: ${cashierName}</div>
              ${isFoodBiz ? `<div>Token: ${tokenNo}</div>` : ''}
            </div>
            <div class="meta-col-right">
              <div>Order No:</div>
              <div style="font-weight: 800; font-size: ${is58mm ? '10px' : '11px'};">#${orderNumber}</div>
              ${isFoodBiz ? `
                <div style="margin-top: 2px;">Order: ${orderType}</div>
                ${tableNo ? `<div>Table: ${tableNo}</div>` : ''}
              ` : `
                <div style="margin-top: 2px;">Payment: ${(invoice as any).paymentMethod ? (invoice as any).paymentMethod.toUpperCase() : 'PAID'}</div>
              `}
            </div>
          </div>

          <div class="divider-solid"></div>

          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="text-align: left; width: 44%;">Item</th>
                <th style="text-align: center; width: 14%;">Qty.</th>
                <th style="text-align: right; width: 20%;">Price</th>
                <th style="text-align: right; width: 22%;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="divider-solid"></div>

          <!-- Total Qty & Sub Total -->
          <div class="summary-row">
            <span>Total Qty: ${totalQty}</span>
            <span>Sub Total&nbsp;&nbsp;${invoice.subtotal.toFixed(2)}</span>
          </div>

          ${(invoice.serviceCharges && invoice.serviceCharges > 0) ? `
          <div class="summary-sub-row">
            <span>Service / Labor Fee</span>
            <span>+${invoice.serviceCharges.toFixed(2)}</span>
          </div>` : ''}

          ${(invoice.discount > 0) ? `
          <div class="summary-sub-row">
            <span>Discount / Round off</span>
            <span>-${invoice.discount.toFixed(2)}</span>
          </div>` : ''}

          <!-- Grand Total -->
          <div class="grand-total-row">
            <span>Grand Total</span>
            <span>Rs. ${invoice.total.toFixed(2)}</span>
          </div>

          <div class="divider-solid"></div>

          <!-- Footer -->
          <div class="footer-section">
            ${taxId ? `<div>Lic / NTN: ${taxId}</div>` : ''}
            <div style="font-weight: 700; margin-top: 2px;">Thank You, Visit Again!</div>
            <div style="font-size: 10px; color: #555555; margin-top: 5px; font-weight: 600; letter-spacing: 0.5px;">Prepared by Vaypar</div>
          </div>
          <br/>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generates exact Layers Bakeshop style Luxury Backside Branding Slip
 */
export function generateThermalBacksideHTML(
  business: Partial<UserSession>,
  paperWidth: '58mm' | '80mm' = '80mm'
): string {
  const is58mm = paperWidth === '58mm';
  const widthMm = is58mm ? '58mm' : '80mm';
  const contentWidthMm = is58mm ? '54mm' : '76mm';
  const busName = (business.businessName || 'MY BUSINESS').toUpperCase();
  const spacedName = busName.split('').join(' ');
  const socialHandle = (business.businessName || 'vaypar').toLowerCase().replace(/\s+/g, '.');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Backside Branding - ${busName}</title>
        <style>
          @page {
            size: ${widthMm} auto;
            margin: 0mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .backside-container {
            width: ${contentWidthMm} !important;
            max-width: ${contentWidthMm} !important;
            margin: 0 auto;
            padding: ${is58mm ? '6mm 2mm' : '10mm 4mm'};
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Georgia, serif;
            color: #000000;
          }
          .top-tag {
            font-size: ${is58mm ? '10px' : '12px'};
            font-weight: 800;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin-bottom: 18px;
            color: #000000;
          }
          .social-block {
            font-size: ${is58mm ? '9px' : '11px'};
            font-weight: 700;
            line-height: 1.5;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
            color: #000000;
          }
          .address-block {
            font-size: ${is58mm ? '8.5px' : '10.5px'};
            font-weight: 800;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-bottom: 14px;
            color: #000000;
          }
          .brand-logo-title {
            font-size: ${is58mm ? '18px' : '25px'};
            font-weight: 900;
            letter-spacing: ${is58mm ? '4px' : '6px'};
            margin: 12px 0 20px 0;
            text-transform: uppercase;
            color: #000000;
          }
          .thank-you-script-container {
            margin: 10px 0 14px 0;
            line-height: 0.85;
          }
          .script-thank {
            font-family: 'Playfair Display', 'Brush Script MT', 'Georgia', cursive, serif;
            font-size: ${is58mm ? '44px' : '58px'};
            font-style: italic;
            font-weight: 800;
            letter-spacing: -1px;
            color: #000000;
          }
          .script-you {
            font-family: 'Playfair Display', 'Brush Script MT', 'Georgia', cursive, serif;
            font-size: ${is58mm ? '46px' : '60px'};
            font-style: italic;
            font-weight: 800;
            letter-spacing: -1px;
            color: #000000;
            margin-top: -6px;
          }
          .shopping-tag {
            font-size: ${is58mm ? '10px' : '12px'};
            font-weight: 900;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-top: 14px;
            color: #000000;
          }
          .stars-row {
            font-size: ${is58mm ? '14px' : '18px'};
            letter-spacing: 4px;
            margin: 10px 0;
            color: #000000;
          }
          .bottom-tag {
            font-size: ${is58mm ? '10px' : '12px'};
            font-weight: 800;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin-top: 6px;
            color: #000000;
          }
        </style>
      </head>
      <body>
        <div class="backside-container">
          <div class="top-tag">SEE YOU AGAIN SOON</div>
          
          <div class="social-block">
            <div>f @ ${socialHandle}</div>
            <div>${business.phone ? `${business.phone}` : '042.111.529.377'}</div>
            <div>${business.email || `WWW.${busName.replace(/\s+/g, '')}.PK`}</div>
          </div>

          <div class="address-block">
            ${business.address ? business.address.toUpperCase() : 'LAHORE | ISLAMABAD | KARACHI'}
          </div>

          <div class="brand-logo-title">
            ${spacedName}
          </div>

          <div class="thank-you-script-container">
            <div class="script-thank">Thank</div>
            <div class="script-you">You</div>
          </div>

          <div class="shopping-tag">FOR SHOPPING WITH US</div>

          <div class="stars-row">★ ★ ★ ★ ★</div>

          <div class="bottom-tag">SEE YOU AGAIN SOON</div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Prints the standalone luxury backside branding slip
 */
export async function printThermalBacksideSlip(
  business: Partial<UserSession>,
  paperWidth: '58mm' | '80mm' = '80mm'
): Promise<void> {
  const html = generateThermalBacksideHTML(business, paperWidth);

  if (Platform.OS === 'web') {
    try {
      const existing = document.getElementById('thermal-print-iframe');
      if (existing) {
        existing.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'thermal-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0px';
      iframe.style.width = paperWidth === '58mm' ? '300px' : '400px';
      iframe.style.height = '1200px';
      iframe.style.border = '0';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      iframe.style.zIndex = '-999';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            openThermalPrintWindow(html);
          }
        }, 350);
        return;
      }
    } catch (e) {
      openThermalPrintWindow(html);
      return;
    }
    return;
  }

  await Print.printAsync({ html });
}

/**
 * Open printable popup window fallback
 */
export function openThermalPrintWindow(html: string) {
  if (typeof window === 'undefined') return;
  const printWin = window.open('', '_blank', 'width=450,height=750,menubar=no,toolbar=no,location=no,status=no');
  if (printWin) {
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    setTimeout(() => {
      printWin.focus();
      printWin.print();
    }, 350);
  } else {
    Alert.alert('Popup Blocked', 'Please allow popups for this site to preview and print thermal receipts.');
  }
}

/**
 * Triggers direct thermal receipt printing to paired Bluetooth / USB POS printers
 */
export async function printThermalSlip(
  business: Partial<UserSession>,
  invoice: Invoice,
  items: InvoiceItem[],
  paperWidth: '58mm' | '80mm' = '80mm'
): Promise<void> {
  const html = generateThermalSlipHTML(business, invoice, items, paperWidth);

  if (Platform.OS === 'web') {
    // 1. Hidden off-screen iframe with real POS roll dimensions (avoids Chrome 0x0 viewport blank bug)
    try {
      const existing = document.getElementById('thermal-print-iframe');
      if (existing) {
        existing.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'thermal-print-iframe';
      // Real dimensions placed offscreen so Chrome layout engine renders fonts & styles properly
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0px';
      iframe.style.width = paperWidth === '58mm' ? '300px' : '400px';
      iframe.style.height = '1200px';
      iframe.style.border = '0';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      iframe.style.zIndex = '-999';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        // Wait 350ms to ensure full layout pass before print dialog
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.warn('Iframe print failed, opening popup window:', err);
            openThermalPrintWindow(html);
          }
        }, 350);
        return;
      }
    } catch (e) {
      console.warn('Iframe print error, falling back to window:', e);
      openThermalPrintWindow(html);
      return;
    }
    return;
  }

  // Mobile: native print dialog formatted for thermal receipt
  await Print.printAsync({ html });
}

/**
 * Connects directly to a Bluetooth ESC/POS printer via Web Bluetooth API (Chrome / Edge / Android)
 */
export async function printViaWebBluetooth(
  receipt: ThermalReceipt
): Promise<{ success: boolean; deviceName: string; message: string }> {
  if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
    return {
      success: false,
      deviceName: '',
      message: 'Web Bluetooth is not supported on this browser. Please use the Direct Thermal Print button.'
    };
  }

  try {
    const bluetooth = (navigator as any).bluetooth;

    // Standard Bluetooth printer GATT service UUIDs:
    // 0x18f0: Standard Printer Service
    // 0xe7810a0e-730e-4d14-85f3-18290e82a39b
    // 49535343-fe7d-4ae5-8fa9-9fafd205e455: ISSC Serial
    // 0000ffe0-0000-1000-8000-00805f9b34fb: Common Chinese POS Printer
    const device = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        'e7810a0e-730e-4d14-85f3-18290e82a39b',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000ff00-0000-1000-8000-00805f9b34fb',
      ]
    });

    if (!device || !device.gatt) {
      throw new Error('Bluetooth device or GATT server unavailable.');
    }

    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    
    let targetCharacteristic: any = null;
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          targetCharacteristic = char;
          break;
        }
      }
      if (targetCharacteristic) break;
    }

    if (!targetCharacteristic) {
      throw new Error('No writable GATT characteristic found on printer.');
    }

    // Send ESC/POS bytes in chunks of 512 bytes with 40ms interval
    const chunkSize = 512;
    const bytes = receipt.escposBytes;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      if (targetCharacteristic.writeValueWithoutResponse) {
        await targetCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await targetCharacteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, 40));
    }

    return {
      success: true,
      deviceName: device.name || 'Bluetooth POS Printer',
      message: `Successfully printed receipt to ${device.name || 'Bluetooth Printer'}!`
    };

  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      return { success: false, deviceName: '', message: 'Printer selection was cancelled.' };
    }
    return {
      success: false,
      deviceName: '',
      message: err.message || 'Bluetooth transmission error. Try Direct Thermal Print.'
    };
  }
}

/**
 * Backward compatibility simulation function
 */
export async function simulatePrint(
  deviceName: string, 
  receipt: ThermalReceipt
): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        message: `Successfully sent print buffer to ${deviceName}!`,
      });
    }, 1200);
  });
}

/**
 * Generates raw ESC/POS command bytes and plain text for Return & Exchange Vouchers
 */
export function generateReturnExchangeReceipt(
  business: Partial<UserSession>,
  record: ReturnExchange
): ThermalReceipt {
  const plainLines: string[] = [];
  const byteArrays: number[][] = [];

  const addLine = (text: string, formatCmds: number[] = []) => {
    let alignTag = '[LEFT] ';
    if (formatCmds === COMMANDS.ALIGN_CENTER) {
      alignTag = '[CENTER] ';
    } else if (formatCmds === COMMANDS.ALIGN_RIGHT) {
      alignTag = '[RIGHT] ';
    }
    plainLines.push(alignTag + text);

    const textBytes = Array.from(text).map(char => char.charCodeAt(0));
    byteArrays.push(formatCmds);
    byteArrays.push(textBytes);
    byteArrays.push(COMMANDS.LINE_FEED);
  };

  const d = new Date(record.createdAt);
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeStr = d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const cleanId = record.id.replace(/^ret_/i, '').toUpperCase();
  const voucherNo = cleanId.substring(0, 8);
  const isExchange = record.type === 'exchange';
  const title = isExchange ? 'EXCHANGE VOUCHER' : 'RETURN & REFUND SLIP';
  const customer = record.customerName || 'Valued Customer';
  const taxId = (business as any).taxNumber || (business as any).ntnNumber || (business as any).gstin || '';

  // 1. Reset
  byteArrays.push(COMMANDS.RESET);

  // 2. Business Name
  const busName = business.businessName || business.name || 'MY BUSINESS';
  plainLines.push(`[CENTER, DOUBLE-SIZE] ${busName}`);
  byteArrays.push(COMMANDS.ALIGN_CENTER);
  byteArrays.push(COMMANDS.TEXT_SIZE_DOUBLE);
  byteArrays.push(COMMANDS.BOLD_ON);
  byteArrays.push(Array.from(busName).map(c => c.charCodeAt(0)));
  byteArrays.push(COMMANDS.LINE_FEED);
  byteArrays.push(COMMANDS.TEXT_SIZE_NORMAL);
  byteArrays.push(COMMANDS.BOLD_OFF);

  if (business.address) addLine(business.address, COMMANDS.ALIGN_CENTER);
  if (business.phone) addLine(`Tel: ${business.phone}`, COMMANDS.ALIGN_CENTER);
  if (taxId) addLine(`GST/NTN: ${taxId}`, COMMANDS.ALIGN_CENTER);

  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);
  addLine(`*** ${title} ***`, COMMANDS.ALIGN_CENTER);
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  addLine(`Customer: ${customer}`, COMMANDS.ALIGN_LEFT);
  if (record.customerPhone) addLine(`Phone: ${record.customerPhone}`, COMMANDS.ALIGN_LEFT);
  addLine(`Date: ${dateStr}   Time: ${timeStr}`, COMMANDS.ALIGN_LEFT);
  addLine(`Slip No: #${voucherNo}`, COMMANDS.ALIGN_LEFT);
  if (record.invoiceId) {
    addLine(`Ref Bill: #${record.invoiceId.replace(/^inv_/i, '').substring(0, 8).toUpperCase()}`, COMMANDS.ALIGN_LEFT);
  }
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // Returned item section
  addLine('[RETURNED ITEM]', COMMANDS.ALIGN_LEFT);
  addLine(`${record.quantity}x ${record.originalProductName}`, COMMANDS.ALIGN_LEFT);
  addLine(`Condition: ${record.condition === 'resellable' ? 'Restocked' : 'Damaged'}`, COMMANDS.ALIGN_LEFT);
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  if (isExchange) {
    addLine('[REPLACEMENT ITEM]', COMMANDS.ALIGN_LEFT);
    addLine(`${record.replacementQuantity || 1}x ${record.replacementProductName || 'Replacement'}`, COMMANDS.ALIGN_LEFT);
    addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

    const diff = record.differenceAmount || 0;
    if (diff > 0) {
      const line = `Customer Paid: Rs. ${diff.toFixed(2)}`;
      plainLines.push(`[BOLD, RIGHT] ${line}`);
      byteArrays.push(COMMANDS.ALIGN_RIGHT);
      byteArrays.push(COMMANDS.BOLD_ON);
      byteArrays.push(Array.from(line).map(c => c.charCodeAt(0)));
      byteArrays.push(COMMANDS.LINE_FEED);
      byteArrays.push(COMMANDS.BOLD_OFF);
    } else if (diff < 0) {
      const line = `Store Refunded: Rs. ${Math.abs(diff).toFixed(2)}`;
      plainLines.push(`[BOLD, RIGHT] ${line}`);
      byteArrays.push(COMMANDS.ALIGN_RIGHT);
      byteArrays.push(COMMANDS.BOLD_ON);
      byteArrays.push(Array.from(line).map(c => c.charCodeAt(0)));
      byteArrays.push(COMMANDS.LINE_FEED);
      byteArrays.push(COMMANDS.BOLD_OFF);
    } else {
      const line = `Even Exchange: Rs. 0.00`;
      plainLines.push(`[BOLD, RIGHT] ${line}`);
      byteArrays.push(COMMANDS.ALIGN_RIGHT);
      byteArrays.push(COMMANDS.BOLD_ON);
      byteArrays.push(Array.from(line).map(c => c.charCodeAt(0)));
      byteArrays.push(COMMANDS.LINE_FEED);
      byteArrays.push(COMMANDS.BOLD_OFF);
    }
  } else {
    const refund = record.refundAmount || 0;
    const line = `Cash Refund: Rs. ${refund.toFixed(2)}`;
    plainLines.push(`[BOLD, RIGHT] ${line}`);
    byteArrays.push(COMMANDS.ALIGN_RIGHT);
    byteArrays.push(COMMANDS.BOLD_ON);
    byteArrays.push(Array.from(line).map(c => c.charCodeAt(0)));
    byteArrays.push(COMMANDS.LINE_FEED);
    byteArrays.push(COMMANDS.BOLD_OFF);
  }

  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);
  if (record.reason) addLine(`Reason: ${record.reason}`, COMMANDS.ALIGN_LEFT);
  if (record.notes) addLine(`Notes: ${record.notes}`, COMMANDS.ALIGN_LEFT);
  addLine('Thank You, Visit Again!', COMMANDS.ALIGN_CENTER);
  addLine('Prepared by Vaypar', COMMANDS.ALIGN_CENTER);

  byteArrays.push(COMMANDS.LINE_FEED);
  byteArrays.push(COMMANDS.LINE_FEED);
  byteArrays.push(COMMANDS.PAPER_CUT);

  const flatBytes: number[] = [];
  byteArrays.forEach(arr => {
    flatBytes.push(...arr);
  });

  return {
    plainText: plainLines.join('\n'),
    escposBytes: new Uint8Array(flatBytes),
  };
}

/**
 * Generates an exact 58mm or 80mm single-sided thermal receipt slip HTML for Return & Exchange
 */
export function generateReturnExchangeSlipHTML(
  business: Partial<UserSession>,
  record: ReturnExchange,
  paperWidth: '58mm' | '80mm' = '80mm'
): string {
  const is58mm = paperWidth === '58mm';
  const widthMm = is58mm ? '58mm' : '80mm';
  const contentWidthMm = is58mm ? '52mm' : '74mm';

  const cleanId = record.id.replace(/^ret_/i, '').toUpperCase();
  const voucherNo = cleanId.substring(0, 8);
  const isExchange = record.type === 'exchange';
  const title = isExchange ? 'EXCHANGE VOUCHER' : 'RETURN & REFUND SLIP';

  const d = new Date(record.createdAt);
  const dateFormatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeFormatted = d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });

  const taxId = (business as any).taxNumber || (business as any).ntnNumber || (business as any).gstin || '';
  const diff = record.differenceAmount || 0;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title} - #${voucherNo}</title>
        <style>
          @page {
            size: ${widthMm} auto;
            margin: 0mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .receipt {
            width: ${contentWidthMm} !important;
            max-width: ${contentWidthMm} !important;
            margin: 0 auto;
            padding: ${is58mm ? '3mm 1mm' : '5mm 2mm'};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace, sans-serif;
            font-size: ${is58mm ? '11.5px' : '13px'};
            line-height: 1.25;
            color: #000000;
          }
          .store-name {
            font-size: ${is58mm ? '15px' : '18px'};
            font-weight: 900;
            text-align: center;
            margin-bottom: 2px;
            letter-spacing: 0.2px;
            text-transform: uppercase;
          }
          .store-sub {
            font-size: ${is58mm ? '10px' : '11.5px'};
            text-align: center;
            font-weight: 600;
            margin: 1px 0;
            color: #111;
          }
          .store-tax {
            font-size: ${is58mm ? '10px' : '11.5px'};
            text-align: center;
            font-weight: 700;
            margin: 2px 0 3px 0;
          }
          .divider-solid {
            border-top: 1.5px solid #000000;
            margin: 4px 0;
          }
          .voucher-title {
            text-align: center;
            font-size: ${is58mm ? '12px' : '14px'};
            font-weight: 900;
            letter-spacing: 1px;
            padding: 3px 0;
          }
          .customer-line {
            font-size: ${is58mm ? '11px' : '12.5px'};
            font-weight: 700;
            padding: 1px 0;
          }
          .meta-grid {
            display: flex;
            justify-content: space-between;
            font-size: ${is58mm ? '10.5px' : '12px'};
            font-weight: 600;
            line-height: 1.3;
          }
          .section-tag {
            font-weight: 900;
            font-size: ${is58mm ? '11px' : '12px'};
            margin: 4px 0 2px 0;
            text-transform: uppercase;
          }
          .item-box {
            padding: 4px 0;
            font-size: ${is58mm ? '11px' : '12.5px'};
          }
          .item-title {
            font-weight: 800;
          }
          .item-sub {
            font-size: ${is58mm ? '10px' : '11.5px'};
            color: #333;
          }
          .grand-total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: ${is58mm ? '13px' : '15px'};
            font-weight: 900;
            margin: 5px 0 3px 0;
          }
          .footer-section {
            text-align: center;
            font-size: ${is58mm ? '10.5px' : '11.5px'};
            margin-top: 6px;
            line-height: 1.35;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="store-name">${business.businessName || business.name || 'MY BUSINESS'}</div>
          ${business.address ? `<div class="store-sub">${business.address}</div>` : ''}
          ${business.phone ? `<div class="store-sub">Tel: ${business.phone}</div>` : ''}
          ${taxId ? `<div class="store-tax">GST / NTN: ${taxId}</div>` : ''}
          
          <div class="divider-solid"></div>
          <div class="voucher-title">*** ${title} ***</div>
          <div class="divider-solid"></div>

          <div class="customer-line">Customer: ${record.customerName || 'Valued Customer'}</div>
          ${record.customerPhone ? `<div class="customer-line">Phone: ${record.customerPhone}</div>` : ''}

          <div class="meta-grid" style="margin-top: 3px;">
            <div>Date: ${dateFormatted} ${timeFormatted}</div>
            <div>Slip: #${voucherNo}</div>
          </div>
          ${record.invoiceId ? `<div style="font-size: ${is58mm ? '10.5px' : '11.5px'}; font-weight: 600; margin-top: 2px;">Ref Bill: #${record.invoiceId.replace(/^inv_/i, '').substring(0, 8).toUpperCase()}</div>` : ''}

          <div class="divider-solid"></div>

          <div class="section-tag">[ Returned Product ]</div>
          <div class="item-box">
            <div class="item-title">${record.quantity}x ${record.originalProductName}</div>
            <div class="item-sub">Condition: ${record.condition === 'resellable' ? 'Restocked to Inventory' : 'Damaged / Discarded'}</div>
          </div>

          ${isExchange ? `
            <div class="divider-solid"></div>
            <div class="section-tag">[ Replacement Product ]</div>
            <div class="item-box">
              <div class="item-title">${record.replacementQuantity || 1}x ${record.replacementProductName || 'Replacement'}</div>
            </div>

            <div class="divider-solid"></div>
            <div class="grand-total-row">
              <span>${diff > 0 ? 'Customer Paid Difference' : diff < 0 ? 'Store Refunded Difference' : 'Settlement'}</span>
              <span>Rs. ${Math.abs(diff).toFixed(2)}</span>
            </div>
          ` : `
            <div class="divider-solid"></div>
            <div class="grand-total-row">
              <span>Cash Refunded</span>
              <span>Rs. ${(record.refundAmount || 0).toFixed(2)}</span>
            </div>
          `}

          <div class="divider-solid"></div>

          ${record.reason ? `<div style="font-size: ${is58mm ? '10px' : '11.5px'}; margin-top: 2px;"><strong>Reason:</strong> ${record.reason}</div>` : ''}
          ${record.notes ? `<div style="font-size: ${is58mm ? '10px' : '11.5px'}; margin-top: 2px;"><strong>Notes:</strong> ${record.notes}</div>` : ''}

          <div class="footer-section">
            <div>Exchange & return subject to store policy.</div>
            <div style="font-weight: 700; margin-top: 2px;">Thank You, Visit Again!</div>
            <div style="font-size: 10px; color: #555555; margin-top: 5px; font-weight: 600; letter-spacing: 0.5px;">Prepared by Vaypar</div>
          </div>
          <br/>
        </div>
      </body>
    </html>
  `;
}

/**
 * Triggers direct thermal receipt printing for Return & Exchange
 */
export async function printReturnExchangeSlip(
  business: Partial<UserSession>,
  record: ReturnExchange,
  paperWidth: '58mm' | '80mm' = '80mm'
): Promise<void> {
  const html = generateReturnExchangeSlipHTML(business, record, paperWidth);

  if (Platform.OS === 'web') {
    try {
      const existing = document.getElementById('thermal-print-iframe');
      if (existing) {
        existing.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'thermal-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0px';
      iframe.style.width = paperWidth === '58mm' ? '300px' : '400px';
      iframe.style.height = '1200px';
      iframe.style.border = '0';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      iframe.style.zIndex = '-999';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.warn('Iframe print failed, opening popup window:', err);
            openThermalPrintWindow(html);
          }
        }, 350);
        return;
      }
    } catch (e) {
      console.warn('Iframe print error, falling back to window:', e);
      openThermalPrintWindow(html);
      return;
    }
    return;
  }

  // Mobile: native print dialog formatted for thermal receipt
  await Print.printAsync({ html });
}

