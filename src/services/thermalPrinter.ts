import { Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import { Invoice, InvoiceItem } from './sqlite';
import { UserSession } from '../store/useAuthStore';

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
function formatRow(name: string, qty: string, rate: string, total: string): string {
  const colNameWidth = 12;
  const colQtyWidth = 4;
  const colRateWidth = 7;
  const colTotalWidth = 9;

  let paddedName = name;
  if (name.length > colNameWidth) {
    paddedName = name.substring(0, colNameWidth - 2) + '..';
  } else {
    paddedName = name.padEnd(colNameWidth, ' ');
  }

  const paddedQty = qty.padStart(colQtyWidth, ' ');
  const paddedRate = rate.padStart(colRateWidth, ' ');
  const paddedTotal = total.padStart(colTotalWidth, ' ');

  return `${paddedName}${paddedQty}${paddedRate}${paddedTotal}`;
}

/**
 * Generates raw ESC/POS command bytes and plain text for 58mm receipt rolls
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

  // 1. Initialize Printer
  byteArrays.push(COMMANDS.RESET);

  // 2. Header (Center, Double Size, Bold)
  const busName = business.businessName || 'My Business';
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

  // Dividing Line
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 4. Metadata
  const cleanId = invoice.id.replace(/^inv_/i, '').toUpperCase();
  const dateStr = new Date(invoice.createdAt).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
  addLine(`Invoice ID: #${cleanId}`, COMMANDS.ALIGN_LEFT);
  addLine(`Date: ${dateStr}`, COMMANDS.ALIGN_LEFT);

  if (invoice.customerName) {
    addLine(`Cust: ${invoice.customerName}`, COMMANDS.ALIGN_LEFT);
  }
  if (invoice.customerPhone) {
    addLine(`Tel: ${invoice.customerPhone}`, COMMANDS.ALIGN_LEFT);
  }

  // Dividing Line
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 5. Items Header
  addLine(formatRow('Item', 'Qty', 'Price', 'Total'), COMMANDS.ALIGN_LEFT);
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 6. Items Details
  items.forEach(item => {
    addLine(
      formatRow(
        item.productName,
        item.quantity.toString(),
        item.price.toFixed(0),
        item.total.toFixed(0)
      ),
      COMMANDS.ALIGN_LEFT
    );
  });

  // Dividing Line
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);

  // 7. Summary
  const subtotalStr = `Subtotal: Rs.${invoice.subtotal.toFixed(2)}`;
  addLine(subtotalStr.padStart(32, ' '), COMMANDS.ALIGN_RIGHT);

  if (invoice.discount > 0) {
    const discStr = `Discount: -Rs.${invoice.discount.toFixed(2)}`;
    addLine(discStr.padStart(32, ' '), COMMANDS.ALIGN_RIGHT);
  }

  if (invoice.serviceCharges && invoice.serviceCharges > 0) {
    const scStr = `Service Fee: +Rs.${invoice.serviceCharges.toFixed(2)}`;
    addLine(scStr.padStart(32, ' '), COMMANDS.ALIGN_RIGHT);
  }

  // Total (Bold, aligned right)
  const totalStr = `NET TOTAL: Rs.${invoice.total.toFixed(2)}`;
  plainLines.push(`[BOLD, RIGHT] ${totalStr}`);
  byteArrays.push(COMMANDS.ALIGN_RIGHT);
  byteArrays.push(COMMANDS.BOLD_ON);
  byteArrays.push(Array.from(totalStr).map(c => c.charCodeAt(0)));
  byteArrays.push(COMMANDS.LINE_FEED);
  byteArrays.push(COMMANDS.BOLD_OFF);

  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);
  addLine(`* ${(busName || 'VAYPAR').toUpperCase()} *`, COMMANDS.ALIGN_CENTER);
  addLine('Smart Retail Point of Sale', COMMANDS.ALIGN_CENTER);
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);
  addLine('RETURN & EXCHANGE POLICY:', COMMANDS.ALIGN_CENTER);
  addLine('Exchange within 7 days with slip', COMMANDS.ALIGN_CENTER);
  addLine('Tags intact & resellable condition', COMMANDS.ALIGN_CENTER);
  addLine('No refund on discounted items', COMMANDS.ALIGN_CENTER);
  addLine('--------------------------------', COMMANDS.ALIGN_LEFT);
  addLine(`INVOICE: #${cleanId}`, COMMANDS.ALIGN_CENTER);
  addLine('THANK YOU FOR YOUR VISIT!', COMMANDS.ALIGN_CENTER);
  addLine('PLEASE VISIT AGAIN!', COMMANDS.ALIGN_CENTER);

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
 * Generates an exact 58mm or 80mm thermal receipt slip HTML optimized for Bluetooth / USB POS printers
 */
export function generateThermalSlipHTML(
  business: Partial<UserSession>,
  invoice: Invoice,
  items: InvoiceItem[],
  paperWidth: '58mm' | '80mm' = '80mm'
): string {
  const is58mm = paperWidth === '58mm';
  const widthMm = is58mm ? '58mm' : '80mm';
  const contentWidthMm = is58mm ? '54mm' : '76mm';
  const cleanId = invoice.id.replace(/^inv_/i, '').toUpperCase();
  const dateStr = new Date(invoice.createdAt).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const itemsRows = items.map(item => `
    <tr>
      <td style="text-align: left; padding: 4px 0; word-break: break-word; font-weight: 700; color: #000;">${item.productName}</td>
      <td style="text-align: center; padding: 4px 0; font-weight: 700; color: #000;">${item.quantity}</td>
      <td style="text-align: right; padding: 4px 0; font-weight: 600; color: #000;">${item.price.toFixed(0)}</td>
      <td style="text-align: right; padding: 4px 0; font-weight: 900; color: #000;">${item.total.toFixed(0)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt - #${cleanId}</title>
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
            padding: ${is58mm ? '4mm 1mm' : '6mm 2mm'};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: ${is58mm ? '12px' : '14px'};
            line-height: 1.35;
            color: #000000;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: 700; }
          .title {
            font-size: ${is58mm ? '18px' : '23px'};
            font-weight: 900;
            margin-bottom: 3px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            line-height: 1.2;
            color: #000000;
          }
          .sub {
            font-size: ${is58mm ? '11px' : '13px'};
            margin: 2px 0;
            font-weight: 600;
            color: #000000;
          }
          .divider {
            border-top: 1.5px dashed #000000;
            margin: 6px 0;
          }
          .meta-row {
            margin: 2px 0;
            font-size: ${is58mm ? '11px' : '13px'};
            display: flex;
            justify-content: space-between;
            color: #000000;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: inherit;
            margin: 4px 0;
            color: #000000;
          }
          th {
            border-bottom: 1.5px dashed #000000;
            padding: 4px 0;
            font-size: ${is58mm ? '11px' : '13px'};
            font-weight: 900;
            text-transform: uppercase;
            color: #000000;
          }
          td {
            padding: 3px 0;
            vertical-align: top;
            color: #000000;
          }
          .total-table {
            width: 100%;
            margin-top: 4px;
            color: #000000;
          }
          .total-row td {
            font-size: ${is58mm ? '16px' : '20px'};
            font-weight: 900;
            padding-top: 5px;
            color: #000000;
          }

          /* LAYERS BAKESHOP STYLE LUXURY FOOTER / BACKSIDE BRANDING */
          .layers-backside {
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1.5px dashed #000000;
            text-align: center;
            color: #000000;
          }
          .top-tag {
            font-size: ${is58mm ? '10px' : '12px'};
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-bottom: 10px;
          }
          .social-contact {
            font-size: ${is58mm ? '9px' : '11px'};
            font-weight: 600;
            line-height: 1.4;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }
          .location-tag {
            font-size: ${is58mm ? '8px' : '10px'};
            font-weight: 800;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-bottom: 10px;
          }
          .main-logo-text {
            font-size: ${is58mm ? '18px' : '24px'};
            font-weight: 900;
            letter-spacing: 4px;
            margin: 8px 0 12px 0;
            text-transform: uppercase;
          }
          .script-box {
            margin: 6px 0;
            line-height: 0.85;
          }
          .script-thank {
            font-family: 'Playfair Display', 'Brush Script MT', 'Georgia', cursive, serif;
            font-size: ${is58mm ? '38px' : '52px'};
            font-style: italic;
            font-weight: 800;
            letter-spacing: -1px;
            color: #000000;
          }
          .script-you {
            font-family: 'Playfair Display', 'Brush Script MT', 'Georgia', cursive, serif;
            font-size: ${is58mm ? '40px' : '54px'};
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
            margin-top: 10px;
          }
          .stars-row {
            font-size: ${is58mm ? '13px' : '16px'};
            letter-spacing: 3px;
            margin: 8px 0;
          }
          .bottom-tag {
            font-size: ${is58mm ? '10px' : '12px'};
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="center title">${business.businessName || 'MY BUSINESS'}</div>
          ${business.address ? `<div class="center sub">${business.address}</div>` : ''}
          ${business.phone ? `<div class="center sub">Tel: ${business.phone}</div>` : ''}
          
          <div class="divider"></div>

          <div class="meta-row">
            <span><strong>Invoice #:</strong> #${cleanId}</span>
          </div>
          <div class="meta-row">
            <span><strong>Date:</strong> ${dateStr}</span>
          </div>
          ${invoice.customerName ? `
            <div class="meta-row">
              <span><strong>Customer:</strong> ${invoice.customerName}</span>
            </div>
          ` : ''}
          ${invoice.customerPhone ? `
            <div class="meta-row">
              <span><strong>Phone:</strong> ${invoice.customerPhone}</span>
            </div>
          ` : ''}

          <div class="divider"></div>

          <table>
            <thead>
              <tr>
                <th style="text-align: left; width: 44%;">ITEM</th>
                <th style="text-align: center; width: 14%;">QTY</th>
                <th style="text-align: right; width: 20%;">RATE</th>
                <th style="text-align: right; width: 22%;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="divider"></div>

          <table class="total-table">
            <tr>
              <td style="text-align: left; font-weight: 700;">Subtotal:</td>
              <td style="text-align: right; font-weight: 800;">Rs.${invoice.subtotal.toFixed(2)}</td>
            </tr>
            ${invoice.discount > 0 ? `
            <tr>
              <td style="text-align: left; font-weight: 700;">Discount:</td>
              <td style="text-align: right; font-weight: 800;">-Rs.${invoice.discount.toFixed(2)}</td>
            </tr>` : ''}
            ${(invoice.serviceCharges && invoice.serviceCharges > 0) ? `
            <tr>
              <td style="text-align: left; font-weight: 700;">Service Fee:</td>
              <td style="text-align: right; font-weight: 800;">+Rs.${invoice.serviceCharges.toFixed(2)}</td>
            </tr>` : ''}
            <tr class="total-row">
              <td style="text-align: left;">NET TOTAL:</td>
              <td style="text-align: right;">Rs.${invoice.total.toFixed(2)}</td>
            </tr>
          </table>

          <!-- BRANDED BACK / FOOTER SECTION (EXACT LAYERS STYLE) -->
          <div class="layers-backside">
            <div class="top-tag">SEE YOU AGAIN SOON</div>
            
            <div class="social-contact">
              <div>f @ ${(business.businessName || 'vaypar').toLowerCase().replace(/\s+/g, '.')}</div>
              <div>${business.phone ? `${business.phone}` : '042.111.529.377'}</div>
              <div>${business.email || `WWW.${(business.businessName || 'VAYPAR').toUpperCase().replace(/\s+/g, '')}.PK`}</div>
            </div>

            <div class="location-tag">
              ${business.address ? business.address.toUpperCase() : 'LAHORE | ISLAMABAD | KARACHI'}
            </div>

            <div class="main-logo-text">
              ${(business.businessName || 'VAYPAR').toUpperCase().split('').join(' ')}
            </div>

            <div class="script-box">
              <div class="script-thank">Thank</div>
              <div class="script-you">You</div>
            </div>

            <div class="shopping-tag">FOR SHOPPING WITH US</div>

            <div class="stars-row">★ ★ ★ ★ ★</div>

            <div class="bottom-tag">SEE YOU AGAIN SOON</div>
          </div>
          <br/><br/>
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
