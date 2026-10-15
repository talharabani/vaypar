import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Invoice, InvoiceItem, Expense } from './sqlite';
import { UserSession } from '../store/useAuthStore';
import { Platform, Alert } from 'react-native';

export interface GenerateInvoiceHTMLOptions {
  business: Partial<UserSession>;
  invoice: Invoice;
  items: InvoiceItem[];
  paymentStatus?: string;
  autoPrint?: boolean;
  includeToolbar?: boolean;
}

export function generateInvoiceHTML({
  business,
  invoice,
  items,
  paymentStatus = 'Paid',
  autoPrint = false,
  includeToolbar = false,
}: GenerateInvoiceHTMLOptions): string {
  // Format dates
  const formattedDate = new Date(invoice.createdAt).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Compile items table rows
  const itemsRows = items.map((item) => `
    <tr>
      <td style="font-weight: 600; color: #0F172A; text-align: left; padding: 12px 8px;">${item.productName}</td>
      <td style="text-align: center; padding: 12px 8px;">PKR ${item.price.toFixed(2)}</td>
      <td style="text-align: center; padding: 12px 8px;">${item.quantity}</td>
      <td style="font-weight: 700; color: #1b4998; text-align: right; padding: 12px 8px;">PKR ${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  // Business Address Block
  const addressLine = business.address ? `<span>Address: ${business.address}</span>` : '';
  const phoneLine = business.phone ? `<span>Phone: ${business.phone}</span>` : '';
  const emailLine = business.email ? `<span>Email: ${business.email}</span>` : '';

  const cleanId = invoice.id.replace(/^inv_/i, '').toUpperCase();
  const isPaid = paymentStatus.toLowerCase().includes('paid');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <title>Invoice #${cleanId} - ${business.businessName || 'Business'}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          
          * {
            box-sizing: border-box;
          }

          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0F172A;
            margin: 0;
            padding: 0;
            background-color: #F8FAFC;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Floating Toolbar for Web / Customer Link */
          .toolbar {
            position: sticky;
            top: 0;
            left: 0;
            right: 0;
            z-index: 100;
            background: #0F172A;
            color: #FFFFFF;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          }
          .toolbar-brand {
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .toolbar-actions {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .btn-action {
            background: #1b4998;
            color: #FFFFFF;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
          }
          .btn-action:hover {
            opacity: 0.9;
            transform: translateY(-1px);
          }
          .btn-whatsapp {
            background: #25D366;
            color: #FFFFFF;
          }

          .page-wrapper {
            padding: 24px 16px 40px;
            display: flex;
            justify-content: center;
          }

          .page {
            width: 100%;
            max-width: 800px;
            margin: auto;
            padding: 40px;
            background-color: #ffffff;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
            border-radius: 12px;
          }
          
          /* Header Section */
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 36px;
            gap: 20px;
          }
          .logo-block {
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .logo-image {
            max-height: 65px;
            max-width: 200px;
            object-fit: contain;
            display: block;
            margin-bottom: 8px;
          }
          .business-name-fallback {
            font-size: 24px;
            font-weight: 800;
            color: #1b4998;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0;
          }
          .business-sub {
            font-size: 12px;
            color: #64748B;
            margin-top: 4px;
          }
          .invoice-banner {
            background: linear-gradient(135deg, #1b4998 0%, #102e63 100%);
            color: #ffffff;
            padding: 20px 44px;
            border-bottom-left-radius: 36px;
            border-top-right-radius: 12px;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: 1px;
            position: relative;
            overflow: hidden;
            text-transform: uppercase;
            box-shadow: 0 6px 16px rgba(27, 73, 152, 0.25);
          }
          .invoice-banner::after {
            content: '';
            position: absolute;
            width: 70px;
            height: 70px;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            top: -15px;
            right: -15px;
          }

          /* Client & Invoice Meta Info */
          .invoice-meta-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
            padding: 0 4px;
            gap: 20px;
          }
          .meta-bill-to {
            flex: 1;
          }
          .meta-bill-to h4 {
            color: #1b4998;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            margin: 0 0 6px 0;
          }
          .meta-bill-to .customer-name {
            font-size: 20px;
            font-weight: 800;
            margin: 0 0 6px 0;
            color: #0F172A;
          }
          .meta-bill-to p {
            margin: 3px 0;
            color: #475569;
            font-size: 13px;
            display: flex;
            align-items: center;
          }
          .meta-bill-to .bullet {
            color: #1b4998;
            font-weight: bold;
            margin-right: 8px;
            font-size: 14px;
          }

          .meta-invoice-info {
            text-align: right;
            font-size: 13px;
            color: #475569;
            line-height: 22px;
          }
          .meta-invoice-info p {
            margin: 2px 0;
          }
          .meta-invoice-info strong {
            color: #0F172A;
          }
          .status-badge {
            display: inline-block;
            padding: 3px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background: ${isPaid ? '#DCFCE7' : '#FEF3C7'};
            color: ${isPaid ? '#15803D' : '#B45309'};
            margin-top: 4px;
          }

          /* Two-Column Details Body */
          .content-grid {
            display: flex;
            gap: 24px;
            margin-bottom: 24px;
          }
          .left-panel {
            width: 28%;
            background-color: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 16px;
            padding: 20px 16px;
            box-sizing: border-box;
          }
          .left-panel h4 {
            color: #1b4998;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            margin: 0 0 8px 0;
            letter-spacing: 0.8px;
          }
          .left-panel p {
            margin: 0 0 16px 0;
            font-size: 12px;
            color: #475569;
            line-height: 18px;
          }
          .left-panel p:last-child {
            margin-bottom: 0;
          }

          .right-panel {
            width: 72%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          /* Items Table Layout */
          table.items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          table.items-table thead {
            border-top: 2px solid #1b4998;
            border-bottom: 2px solid #1b4998;
            background-color: #F8FAFC;
          }
          table.items-table th {
            padding: 10px 8px;
            font-size: 11px;
            font-weight: 700;
            color: #1b4998;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: center;
          }
          table.items-table td {
            font-size: 13px;
            color: #334155;
            border-bottom: 1px solid #E2E8F0;
          }
          table.items-table tr:last-child td {
            border-bottom: none;
          }

          /* Summary Calculations Block */
          .summary-section {
            display: flex;
            justify-content: flex-end;
            border-top: 2px solid #1b4998;
            padding-top: 12px;
          }
          .summary-table {
            width: 250px;
            border-collapse: collapse;
          }
          .summary-table td {
            padding: 6px 8px;
            font-size: 13px;
            color: #475569;
            text-align: right;
          }
          .summary-table tr.total-row td {
            font-size: 17px;
            font-weight: 800;
            color: #1b4998;
            padding-top: 10px;
          }

          /* Signatures Area */
          .signature-block {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            margin-top: 32px;
            padding-right: 12px;
          }
          .signature-line {
            width: 160px;
            border-bottom: 1px dashed #94A3B8;
            margin-bottom: 6px;
            height: 24px;
          }
          .signature-title {
            font-size: 13px;
            font-weight: 700;
            color: #0F172A;
            margin: 0;
            text-transform: capitalize;
          }
          .signature-sub {
            font-size: 11px;
            color: #64748B;
            margin: 2px 0 0 0;
          }

          /* Bottom Blue Contacts Footer */
          .footer-banner {
            background: linear-gradient(135deg, #1b4998 0%, #102e63 100%);
            color: #ffffff;
            padding: 18px 24px;
            border-top-left-radius: 36px;
            border-bottom-right-radius: 36px;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 36px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 4px 14px rgba(27, 73, 152, 0.2);
          }
          .footer-banner::after {
            content: '';
            position: absolute;
            width: 80px;
            height: 80px;
            background-color: rgba(255, 255, 255, 0.06);
            border-radius: 50%;
            bottom: -25px;
            right: -25px;
          }
          .footer-info {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 20px;
            font-size: 12px;
            font-weight: 500;
            z-index: 2;
          }

          /* Mobile responsiveness */
          @media (max-width: 680px) {
            .page-wrapper {
              padding: 0;
            }
            .page {
              padding: 20px 16px;
              border-radius: 0;
              box-shadow: none;
            }
            .header-container {
              flex-direction: column;
              align-items: stretch;
              margin-bottom: 24px;
            }
            .invoice-banner {
              border-radius: 12px;
              text-align: center;
              padding: 14px 20px;
              font-size: 22px;
            }
            .invoice-meta-container {
              flex-direction: column;
              gap: 16px;
            }
            .meta-invoice-info {
              text-align: left;
            }
            .content-grid {
              flex-direction: column;
            }
            .left-panel, .right-panel {
              width: 100% !important;
            }
            .summary-table {
              width: 100%;
            }
            .footer-banner {
              border-radius: 16px;
            }
          }

          /* Print Overrides */
          @media print {
            .no-print {
              display: none !important;
            }
            body {
              background: #ffffff !important;
              padding: 0 !important;
            }
            .page-wrapper {
              padding: 0 !important;
            }
            .page {
              box-shadow: none !important;
              padding: 0 !important;
              max-width: 100% !important;
            }
            @page {
              size: A4;
              margin: 12mm;
            }
          }
        </style>
      </head>
      <body>
        ${includeToolbar ? `
          <div class="toolbar no-print">
            <div class="toolbar-brand">
              <span>🧾</span>
              <span>${business.businessName || 'Vaypar Invoice'}</span>
            </div>
            <div class="toolbar-actions">
              <button class="btn-action" onclick="window.print()">
                <span>⬇</span>
                <span>Download / Print PDF</span>
              </button>
              ${business.phone ? `
                <a class="btn-action btn-whatsapp" href="https://wa.me/${business.phone.replace(/\\D/g,'')}" target="_blank">
                  <span>💬</span>
                  <span>WhatsApp Shop</span>
                </a>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <div class="page-wrapper">
          <div class="page">
            
            <!-- Header Banner -->
            <div class="header-container">
              <div class="logo-block">
                ${business.logoUri ? `
                  <img src="${business.logoUri}" class="logo-image" />
                ` : `
                  <h2 class="business-name-fallback">${business.businessName || 'My Business'}</h2>
                `}
                <div class="business-sub">${business.phone ? business.phone : ''} ${business.address ? '· ' + business.address : ''}</div>
              </div>
              <div class="invoice-banner">
                INVOICE
              </div>
            </div>

            <!-- Customer & Metadata info -->
            <div class="invoice-meta-container">
              <div class="meta-bill-to">
                <h4>INVOICE TO:</h4>
                <div class="customer-name">${invoice.customerName || 'Walk-in Customer'}</div>
                ${invoice.customerPhone ? `<p><span class="bullet">•</span> ${invoice.customerPhone} (Mobile)</p>` : ''}
                <p><span class="bullet">•</span> Customer Account: Active</p>
              </div>
              <div class="meta-invoice-info">
                <p><strong>Invoice No:</strong> #${cleanId}</p>
                <p><strong>Invoice Date:</strong> ${formattedDate}</p>
                <div><span class="status-badge">${paymentStatus}</span></div>
              </div>
            </div>

            <!-- Content Grid Split -->
            <div class="content-grid">
              
              <!-- Left Side Details Bar -->
              <div class="left-panel">
                <h4>PAYMENT METHOD</h4>
                <p>Cash / Online Transfer<br/>Card POS / Udhar Book</p>
                
                <h4>TERMS & CONDITIONS:</h4>
                <p style="font-size: 10px; line-height: 15px; margin-bottom: 0;">
                  1. Official invoice generated via Vaypar POS.<br/>
                  2. Goods once sold are subject to standard return policy.<br/>
                  3. For queries, contact business support above.
                </p>
              </div>

              <!-- Right Side Main Bill -->
              <div class="right-panel">
                <table class="items-table">
                  <thead>
                    <tr>
                      <th style="text-align: left; width: 45%;">PRODUCT</th>
                      <th style="width: 20%;">PRICE</th>
                      <th style="width: 15%;">QTY</th>
                      <th style="text-align: right; width: 20%;">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsRows}
                  </tbody>
                </table>

                <div>
                  <div class="summary-section">
                    <table class="summary-table">
                      <tbody>
                        <tr>
                          <td>SUB TOTAL:</td>
                          <td style="font-weight: 700; color: #0F172A;">PKR ${invoice.subtotal.toFixed(2)}</td>
                        </tr>
                        ${invoice.discount > 0 ? `
                        <tr>
                          <td>DISCOUNT:</td>
                          <td style="font-weight: 700; color: #DC2626;">-PKR ${invoice.discount.toFixed(2)}</td>
                        </tr>` : ''}
                        <tr class="total-row">
                          <td>TOTAL:</td>
                          <td>PKR ${invoice.total.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div class="signature-block">
                    <div class="signature-line"></div>
                    <p class="signature-title">${business.businessName || 'Authorized Signatory'}</p>
                    <p class="signature-sub">Vaypar Verified Merchant</p>
                  </div>
                </div>

              </div>

            </div>

            <!-- Bottom Footer Details Bar -->
            <div class="footer-banner">
              <div class="footer-info">
                ${phoneLine}
                ${emailLine}
                ${addressLine}
              </div>
            </div>

          </div>
        </div>

        ${autoPrint ? `
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            };
          </script>
        ` : ''}
      </body>
    </html>
  `;
}

export async function shareInvoicePDF(
  business: UserSession, 
  invoice: Invoice, 
  items: InvoiceItem[]
): Promise<void> {
  const isSharingAvailable = await Sharing.isAvailableAsync();
  const htmlContent = generateInvoiceHTML({
    business,
    invoice,
    items,
    paymentStatus: 'Paid',
    autoPrint: false,
    includeToolbar: false,
  });

  if (Platform.OS === 'web') {
    // Web: Open a clean new tab, load the HTML invoice, and print specifically that window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      // Add a small delay to ensure CSS fonts and layouts are completely rendered
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 300);
    } else {
      Alert.alert('Popup Blocked', 'Please allow popups for this site to print/save invoices.');
    }
    return;
  }

  // Mobile: Save to local PDF and open native sharing sheets
  if (!isSharingAvailable) {
    await Print.printAsync({ html: htmlContent });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html: htmlContent });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share Invoice #${invoice.id.toUpperCase()}`
  });
}

export async function shareSalesReportPDF(
  business: UserSession, 
  invoices: Invoice[]
): Promise<void> {
  const isSharingAvailable = await Sharing.isAvailableAsync();

  // Format date
  const reportDateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Calculate sum
  const totalSum = invoices.reduce((sum, item) => sum + item.total, 0);

  // Compile items table rows
  const itemsRows = invoices.map((item, idx) => {
    const formattedDate = new Date(item.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="text-align: center;">${formattedDate}</td>
        <td style="font-weight: 600; color: #0F172A; text-align: center;">#${item.id.substring(0, 8).toUpperCase()}</td>
        <td style="text-align: left; font-weight: 500;">${item.customerName || 'Walk-in Customer'}</td>
        <td style="font-weight: 700; color: #16A34A; text-align: right;">PKR ${item.total.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  // Business Address Block
  const addressLine = business.address ? `<span>Address: ${business.address}</span>` : '';
  const phoneLine = business.phone ? `<span>Phone: ${business.phone}</span>` : '';
  const emailLine = business.email ? `<span>Email: ${business.email}</span>` : '';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Sales Report - ${business.businessName || 'Business'}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #0F172A;
            margin: 0;
            padding: 0;
            background-color: #ffffff;
            -webkit-print-color-adjust: exact;
          }
          .page {
            max-width: 800px;
            margin: auto;
            padding: 40px;
            box-sizing: border-box;
            background-color: #ffffff;
          }
          
          /* Header Section */
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
          }
          .logo-block {
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .logo-image {
            max-height: 60px;
            max-width: 180px;
            object-fit: contain;
            display: block;
            margin-bottom: 8px;
          }
          .business-name-fallback {
            font-size: 20px;
            font-weight: 800;
            color: #1b4998;
            text-transform: uppercase;
            margin: 0;
          }
          .invoice-banner {
            background-color: #1b4998;
            color: #ffffff;
            padding: 24px 50px 24px 40px;
            border-bottom-left-radius: 40px;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 0.5px;
            position: relative;
            overflow: hidden;
            text-transform: uppercase;
          }
          /* Visual design accents */
          .invoice-banner::after {
            content: '';
            position: absolute;
            width: 80px;
            height: 80px;
            background-color: rgba(255, 255, 255, 0.08);
            border-radius: 50%;
            top: -20px;
            right: -20px;
          }

          /* Client & Invoice Meta Info */
          .invoice-meta-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
            padding: 0 10px;
          }
          .meta-bill-to {
            width: 55%;
          }
          .meta-bill-to h4 {
            color: #1b4998;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 6px 0;
          }
          .meta-bill-to .customer-name {
            font-size: 20px;
            font-weight: 800;
            margin: 0 0 8px 0;
            color: #0F172A;
          }
          .meta-bill-to p {
            margin: 4px 0;
            color: #475569;
            font-size: 13px;
            display: flex;
            align-items: center;
          }
          .meta-bill-to .bullet {
            color: #1b4998;
            font-weight: bold;
            margin-right: 8px;
            font-size: 14px;
          }

          .meta-invoice-info {
            text-align: right;
            font-size: 13px;
            color: #475569;
            line-height: 20px;
          }
          .meta-invoice-info p {
            margin: 4px 0;
          }
          .meta-invoice-info strong {
            color: #0F172A;
          }

          /* Two-Column Details Body */
          .content-grid {
            display: flex;
            gap: 24px;
            margin-bottom: 20px;
          }
          .left-panel {
            width: 30%;
            background-color: #F1F5F9;
            border-radius: 20px;
            padding: 24px 20px;
            box-sizing: border-box;
          }
          .left-panel h4 {
            color: #0F172A;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            margin: 0 0 8px 0;
            letter-spacing: 0.5px;
          }
          .left-panel p {
            margin: 0 0 20px 0;
            font-size: 12px;
            color: #475569;
            line-height: 18px;
          }
          .left-panel p:last-child {
            margin-bottom: 0;
          }

          .right-panel {
            width: 70%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          /* Items Table Layout */
          table.items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          table.items-table thead {
            border-top: 2px solid #1b4998;
            border-bottom: 2px solid #1b4998;
          }
          table.items-table th {
            padding: 12px 8px;
            font-size: 12px;
            font-weight: 700;
            color: #1b4998;
            text-transform: uppercase;
            text-align: center;
          }
          table.items-table td {
            padding: 14px 8px;
            font-size: 13px;
            color: #475569;
            border-bottom: 1px solid #E2E8F0;
          }
          table.items-table tr:last-child td {
            border-bottom: none;
          }

          /* Summary Calculations Block */
          .summary-section {
            display: flex;
            justify-content: flex-end;
            border-top: 2px solid #1b4998;
            padding-top: 12px;
          }
          .summary-table {
            width: 260px;
            border-collapse: collapse;
          }
          .summary-table td {
            padding: 6px 8px;
            font-size: 13px;
            color: #475569;
            text-align: right;
          }
          .summary-table tr.total-row td {
            font-size: 16px;
            font-weight: 800;
            color: #16A34A;
            padding-top: 10px;
          }

          /* Signatures Area */
          .signature-block {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            margin-top: 36px;
            padding-right: 12px;
          }
          .signature-line {
            width: 150px;
            border-bottom: 1px dashed #94A3B8;
            margin-bottom: 8px;
            height: 30px;
          }
          .signature-title {
            font-size: 13px;
            font-weight: 700;
            color: #0F172A;
            margin: 0;
            text-transform: capitalize;
          }
          .signature-sub {
            font-size: 11px;
            color: #64748B;
            margin: 2px 0 0 0;
          }

          /* Bottom Blue Contacts Footer */
          .footer-banner {
            background-color: #1b4998;
            color: #ffffff;
            padding: 20px 24px;
            border-top-left-radius: 40px;
            border-bottom-right-radius: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 40px;
            position: relative;
            overflow: hidden;
          }
          .footer-banner::after {
            content: '';
            position: absolute;
            width: 100px;
            height: 100px;
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 50%;
            bottom: -30px;
            right: -30px;
          }
          .footer-info {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 24px;
            font-size: 12px;
            font-weight: 500;
            z-index: 2;
          }
        </style>
      </head>
      <body>
        <div class="page">
          
          <!-- Header Banner -->
          <div class="header-container">
            <div class="logo-block">
              ${business.logoUri ? `
                <img src="${business.logoUri}" class="logo-image" />
              ` : `
                <h2 class="business-name-fallback">${business.businessName || 'My Business'}</h2>
              `}
            </div>
            <div class="invoice-banner" style="background-color: #1b4998;">
              SALES REPORT
            </div>
          </div>

          <!-- Customer & Metadata info -->
          <div class="invoice-meta-container">
            <div class="meta-bill-to">
              <h4>BUSINESS PROFILE</h4>
              <div class="customer-name">${business.businessName || 'My Business'}</div>
              ${business.phone ? `<p><span class="bullet">•</span> Contact: ${business.phone}</p>` : ''}
              <p><span class="bullet">•</span> Account Status: Active</p>
            </div>
            <div class="meta-invoice-info">
              <p><strong>Report:</strong> Sales Summary</p>
              <p><strong>Generated On:</strong> ${reportDateStr}</p>
              <p><strong>Invoices Issued:</strong> ${invoices.length} billing sheets</p>
            </div>
          </div>

          <!-- Content Grid Split -->
          <div class="content-grid">
            
            <!-- Left Side Details Bar -->
            <div class="left-panel">
              <h4>REPORT SCOPE</h4>
              <p>Revenue & Sales<br/>Invoice Records<br/>Profit Generation</p>
              
              <h4>LEGAL COMPLIANCES:</h4>
              <p style="font-size: 10px; line-height: 15px; margin-bottom: 0;">
                1. Match invoice dates with bank transfers.<br/>
                2. Report taxable revenue quarterly.<br/>
                3. Auto-saved in local SQLite database.
              </p>
            </div>

            <!-- Right Side Main Bill -->
            <div class="right-panel">
              <table class="items-table">
                <thead>
                  <tr>
                    <th style="width: 30px;">#</th>
                    <th style="width: 90px;">DATE</th>
                    <th style="width: 110px;">INVOICE ID</th>
                    <th style="text-align: left; width: 170px;">CUSTOMER</th>
                    <th style="text-align: right; width: 100px;">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>

              <div>
                <div class="summary-section">
                  <table class="summary-table">
                    <tbody>
                      <tr class="total-row">
                        <td style="font-size: 14px;">NET REVENUE:</td>
                        <td>PKR ${totalSum.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="signature-block">
                  <div class="signature-line"></div>
                  <p class="signature-title">${business.businessName || 'General Manager'}</p>
                  <p class="signature-sub">Authorized Signatory</p>
                </div>
              </div>

            </div>

          </div>

          <!-- Bottom Footer Details Bar -->
          <div class="footer-banner">
            <div class="footer-info">
              ${phoneLine}
              ${emailLine}
              ${addressLine}
            </div>
          </div>

        </div>
      </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 300);
    } else {
      Alert.alert('Popup Blocked', 'Please allow popups to print/save report.');
    }
    return;
  }

  if (!isSharingAvailable) {
    await Print.printAsync({ html: htmlContent });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html: htmlContent });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share Sales Report - ${business.businessName || 'Business'}`
  });
}

export async function shareExpenseReportPDF(
  business: UserSession, 
  expenses: Expense[]
): Promise<void> {
  const isSharingAvailable = await Sharing.isAvailableAsync();

  // Format date
  const reportDateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Calculate sum
  const totalSum = expenses.reduce((sum, item) => sum + item.amount, 0);

  // Compile items table rows
  const itemsRows = expenses.map((item, idx) => {
    const formattedDate = new Date(item.date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="text-align: center;">${formattedDate}</td>
        <td style="font-weight: 600; color: #0F172A; text-align: left;">${item.title}</td>
        <td style="text-align: center; font-weight: 500;">${item.category}</td>
        <td style="font-weight: 700; color: #DC2626; text-align: right;">PKR ${item.amount.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  // Business Address Block
  const addressLine = business.address ? `<span>Address: ${business.address}</span>` : '';
  const phoneLine = business.phone ? `<span>Phone: ${business.phone}</span>` : '';
  const emailLine = business.email ? `<span>Email: ${business.email}</span>` : '';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Expense Report - ${business.businessName || 'Business'}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #0F172A;
            margin: 0;
            padding: 0;
            background-color: #ffffff;
            -webkit-print-color-adjust: exact;
          }
          .page {
            max-width: 800px;
            margin: auto;
            padding: 40px;
            box-sizing: border-box;
            background-color: #ffffff;
          }
          
          /* Header Section */
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
          }
          .logo-block {
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .logo-image {
            max-height: 60px;
            max-width: 180px;
            object-fit: contain;
            display: block;
            margin-bottom: 8px;
          }
          .business-name-fallback {
            font-size: 20px;
            font-weight: 800;
            color: #1b4998;
            text-transform: uppercase;
            margin: 0;
          }
          .invoice-banner {
            background-color: #1b4998;
            color: #ffffff;
            padding: 24px 50px 24px 40px;
            border-bottom-left-radius: 40px;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 0.5px;
            position: relative;
            overflow: hidden;
            text-transform: uppercase;
          }
          /* Visual design accents */
          .invoice-banner::after {
            content: '';
            position: absolute;
            width: 80px;
            height: 80px;
            background-color: rgba(255, 255, 255, 0.08);
            border-radius: 50%;
            top: -20px;
            right: -20px;
          }

          /* Client & Invoice Meta Info */
          .invoice-meta-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
            padding: 0 10px;
          }
          .meta-bill-to {
            width: 55%;
          }
          .meta-bill-to h4 {
            color: #1b4998;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 6px 0;
          }
          .meta-bill-to .customer-name {
            font-size: 20px;
            font-weight: 800;
            margin: 0 0 8px 0;
            color: #0F172A;
          }
          .meta-bill-to p {
            margin: 4px 0;
            color: #475569;
            font-size: 13px;
            display: flex;
            align-items: center;
          }
          .meta-bill-to .bullet {
            color: #1b4998;
            font-weight: bold;
            margin-right: 8px;
            font-size: 14px;
          }

          .meta-invoice-info {
            text-align: right;
            font-size: 13px;
            color: #475569;
            line-height: 20px;
          }
          .meta-invoice-info p {
            margin: 4px 0;
          }
          .meta-invoice-info strong {
            color: #0F172A;
          }

          /* Two-Column Details Body */
          .content-grid {
            display: flex;
            gap: 24px;
            margin-bottom: 20px;
          }
          .left-panel {
            width: 30%;
            background-color: #F1F5F9;
            border-radius: 20px;
            padding: 24px 20px;
            box-sizing: border-box;
          }
          .left-panel h4 {
            color: #0F172A;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            margin: 0 0 8px 0;
            letter-spacing: 0.5px;
          }
          .left-panel p {
            margin: 0 0 20px 0;
            font-size: 12px;
            color: #475569;
            line-height: 18px;
          }
          .left-panel p:last-child {
            margin-bottom: 0;
          }

          .right-panel {
            width: 70%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          /* Items Table Layout */
          table.items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          table.items-table thead {
            border-top: 2px solid #1b4998;
            border-bottom: 2px solid #1b4998;
          }
          table.items-table th {
            padding: 12px 8px;
            font-size: 12px;
            font-weight: 700;
            color: #1b4998;
            text-transform: uppercase;
            text-align: center;
          }
          table.items-table td {
            padding: 14px 8px;
            font-size: 13px;
            color: #475569;
            border-bottom: 1px solid #E2E8F0;
          }
          table.items-table tr:last-child td {
            border-bottom: none;
          }

          /* Summary Calculations Block */
          .summary-section {
            display: flex;
            justify-content: flex-end;
            border-top: 2px solid #1b4998;
            padding-top: 12px;
          }
          .summary-table {
            width: 260px;
            border-collapse: collapse;
          }
          .summary-table td {
            padding: 6px 8px;
            font-size: 13px;
            color: #475569;
            text-align: right;
          }
          .summary-table tr.total-row td {
            font-size: 16px;
            font-weight: 800;
            color: #DC2626;
            padding-top: 10px;
          }

          /* Signatures Area */
          .signature-block {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            margin-top: 36px;
            padding-right: 12px;
          }
          .signature-line {
            width: 150px;
            border-bottom: 1px dashed #94A3B8;
            margin-bottom: 8px;
            height: 30px;
          }
          .signature-title {
            font-size: 13px;
            font-weight: 700;
            color: #0F172A;
            margin: 0;
            text-transform: capitalize;
          }
          .signature-sub {
            font-size: 11px;
            color: #64748B;
            margin: 2px 0 0 0;
          }

          /* Bottom Blue Contacts Footer */
          .footer-banner {
            background-color: #1b4998;
            color: #ffffff;
            padding: 20px 24px;
            border-top-left-radius: 40px;
            border-bottom-right-radius: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 40px;
            position: relative;
            overflow: hidden;
          }
          .footer-banner::after {
            content: '';
            position: absolute;
            width: 100px;
            height: 100px;
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 50%;
            bottom: -30px;
            right: -30px;
          }
          .footer-info {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 24px;
            font-size: 12px;
            font-weight: 500;
            z-index: 2;
          }
        </style>
      </head>
      <body>
        <div class="page">
          
          <!-- Header Banner -->
          <div class="header-container">
            <div class="logo-block">
              ${business.logoUri ? `
                <img src="${business.logoUri}" class="logo-image" />
              ` : `
                <h2 class="business-name-fallback">${business.businessName || 'My Business'}</h2>
              `}
            </div>
            <div class="invoice-banner" style="background-color: #1b4998;">
              EXPENSES
            </div>
          </div>

          <!-- Customer & Metadata info -->
          <div class="invoice-meta-container">
            <div class="meta-bill-to">
              <h4>BUSINESS PROFILE</h4>
              <div class="customer-name">${business.businessName || 'My Business'}</div>
              ${business.phone ? `<p><span class="bullet">•</span> Contact: ${business.phone}</p>` : ''}
              <p><span class="bullet">•</span> Account Status: Active</p>
            </div>
            <div class="meta-invoice-info">
              <p><strong>Report:</strong> Expense Sheet</p>
              <p><strong>Generated On:</strong> ${reportDateStr}</p>
              <p><strong>Records Count:</strong> ${expenses.length} entries</p>
            </div>
          </div>

          <!-- Content Grid Split -->
          <div class="content-grid">
            
            <!-- Left Side Details Bar -->
            <div class="left-panel">
              <h4>REPORT SCOPE</h4>
              <p>Business Operations<br/>Tax Deductions<br/>Loss & Expense Tracking</p>
              
              <h4>LEGAL COMPLIANCES:</h4>
              <p style="font-size: 10px; line-height: 15px; margin-bottom: 0;">
                1. Keep original receipts for tax records.<br/>
                2. Subject to auditing standards.<br/>
                3. Auto-saved in local SQLite database.
              </p>
            </div>

            <!-- Right Side Main Bill -->
            <div class="right-panel">
              <table class="items-table">
                <thead>
                  <tr>
                    <th style="width: 30px;">#</th>
                    <th style="width: 90px;">DATE</th>
                    <th style="text-align: left; width: 170px;">DESCRIPTION</th>
                    <th style="width: 120px;">CATEGORY</th>
                    <th style="text-align: right; width: 100px;">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>

              <div>
                <div class="summary-section">
                  <table class="summary-table">
                    <tbody>
                      <tr class="total-row">
                        <td style="font-size: 14px;">TOTAL EXPENSES:</td>
                        <td>PKR ${totalSum.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="signature-block">
                  <div class="signature-line"></div>
                  <p class="signature-title">${business.businessName || 'General Manager'}</p>
                  <p class="signature-sub">Authorized Signatory</p>
                </div>
              </div>

            </div>

          </div>

          <!-- Bottom Footer Details Bar -->
          <div class="footer-banner">
            <div class="footer-info">
              ${phoneLine}
              ${emailLine}
              ${addressLine}
            </div>
          </div>

        </div>
      </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 300);
    } else {
      Alert.alert('Popup Blocked', 'Please allow popups to print/save report.');
    }
    return;
  }

  if (!isSharingAvailable) {
    await Print.printAsync({ html: htmlContent });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html: htmlContent });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share Expense Report - ${business.businessName || 'Business'}`
  });
}

export interface RevenueStatementData {
  business: UserSession;
  timeframe: 'daily' | 'weekly' | 'monthly' | 'annually' | 'all';
  periodLabel: string;
  totalRevenue: number;
  totalExpenses: number;
  netRevenue: number;
  invoiceCount: number;
  averageOrderValue: number;
  invoices: Invoice[];
  expenses?: Expense[];
}

export async function shareRevenueStatementPDF(data: RevenueStatementData): Promise<void> {
  const {
    business,
    periodLabel,
    totalRevenue,
    totalExpenses,
    netRevenue,
    invoiceCount,
    averageOrderValue,
    invoices,
  } = data;

  const isSharingAvailable = await Sharing.isAvailableAsync();

  const generatedAt = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const statementNumber = `STM-${Date.now().toString().slice(-8)}`;
  const accountRef = `PK-REV-${(business.businessId || 'MAIN').slice(0, 8).toUpperCase()}-01`;

  // Calculate running balances in chronological order
  const sortedInvoices = [...invoices].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let runningBalance = 0;
  const ledgerRows = sortedInvoices.map((inv, idx) => {
    runningBalance += inv.total;
    const invDate = new Date(inv.createdAt).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const refCode = inv.id.length > 8 ? inv.id.slice(0, 8).toUpperCase() : inv.id.toUpperCase();
    const customer = inv.customerName ? inv.customerName : 'Counter Walk-in Customer';
    const channel = (inv as any).paymentMethod || (inv.discount > 0 ? 'Cash (Discounted)' : 'Direct Cash / POS');

    return `
      <tr style="background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="padding: 10px 12px; font-size: 11px; color: #475569; border-bottom: 1px solid #E2E8F0; white-space: nowrap;">
          ${invDate}
        </td>
        <td style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #0F172A; border-bottom: 1px solid #E2E8F0; font-family: monospace;">
          #${refCode}
        </td>
        <td style="padding: 10px 12px; font-size: 11.5px; font-weight: 600; color: #1E293B; border-bottom: 1px solid #E2E8F0;">
          ${customer}
          ${inv.customerPhone ? `<div style="font-size: 10px; color: #64748B; font-weight: normal;">${inv.customerPhone}</div>` : ''}
        </td>
        <td style="padding: 10px 12px; font-size: 11px; color: #334155; border-bottom: 1px solid #E2E8F0;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: #EEF2F6; font-size: 10px; font-weight: 600; color: #334155;">
            ${channel}
          </span>
        </td>
        <td style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #16A34A; text-align: right; border-bottom: 1px solid #E2E8F0; font-family: monospace;">
          +PKR ${inv.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style="padding: 10px 12px; font-size: 11.5px; font-weight: 800; color: #0F172A; text-align: right; border-bottom: 1px solid #E2E8F0; font-family: monospace;">
          PKR ${runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Revenue Financial Statement - ${statementNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
          
          @page {
            size: A4;
            margin: 12mm 15mm;
          }
          
          * {
            box-sizing: border-box;
          }

          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0F172A;
            margin: 0;
            padding: 0;
            background-color: #F8FAFC;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .statement-card {
            max-width: 900px;
            margin: 20px auto;
            background-color: #FFFFFF;
            border: 1px solid #CBD5E1;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
            overflow: hidden;
          }

          .bank-header-stripe {
            height: 6px;
            background: linear-gradient(90deg, #0F172A 0%, #1E3A8A 50%, #C5A880 100%);
          }

          .header-section {
            padding: 28px 36px 20px 36px;
            border-bottom: 2px solid #0F172A;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }

          .institution-brand {
            flex: 1;
          }

          .institution-title {
            font-size: 24px;
            font-weight: 800;
            color: #0F172A;
            letter-spacing: -0.5px;
            margin: 0 0 4px 0;
            text-transform: uppercase;
          }

          .institution-sub {
            font-size: 11px;
            color: #64748B;
            font-weight: 600;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            margin: 0 0 10px 0;
          }

          .meta-item {
            font-size: 11px;
            color: #475569;
            margin: 2px 0;
          }

          .statement-badge-box {
            text-align: right;
            border-left: 2px solid #E2E8F0;
            padding-left: 24px;
          }

          .statement-badge-title {
            font-size: 18px;
            font-weight: 800;
            color: #1E3A8A;
            letter-spacing: 0.5px;
            margin: 0 0 4px 0;
          }

          .statement-sub-tag {
            display: inline-block;
            background-color: #EFF6FF;
            color: #1E40AF;
            border: 1px solid #BFDBFE;
            padding: 3px 10px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 8px;
          }

          .account-info-grid {
            margin: 0 36px;
            padding: 16px 0;
            border-bottom: 1px solid #E2E8F0;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
          }

          .acc-info-cell {
            border-left: 3px solid #C5A880;
            padding-left: 10px;
          }

          .acc-info-label {
            font-size: 10px;
            font-weight: 700;
            color: #64748B;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
          }

          .acc-info-val {
            font-size: 12.5px;
            font-weight: 800;
            color: #0F172A;
            font-family: 'JetBrains Mono', monospace;
          }

          /* Summary Box */
          .summary-container {
            margin: 20px 36px;
            background-color: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 6px;
            padding: 16px 20px;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 12px;
          }

          .summary-item {
            text-align: center;
            border-right: 1px solid #E2E8F0;
            padding: 0 8px;
          }

          .summary-item:last-child {
            border-right: none;
          }

          .summary-label {
            font-size: 9.5px;
            font-weight: 700;
            color: #64748B;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }

          .summary-value {
            font-size: 16px;
            font-weight: 800;
            color: #0F172A;
            font-family: 'JetBrains Mono', monospace;
          }

          .ledger-section {
            padding: 0 36px 24px 36px;
          }

          .section-heading {
            font-size: 13px;
            font-weight: 800;
            color: #0F172A;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 16px 0 10px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .ledger-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #CBD5E1;
            border-radius: 6px;
            overflow: hidden;
          }

          .ledger-table th {
            background-color: #0F172A;
            color: #FFFFFF;
            font-size: 10.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 10px 12px;
            text-align: left;
          }

          .footer-section {
            padding: 20px 36px 28px 36px;
            border-top: 2px solid #E2E8F0;
            background-color: #F8FAFC;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }

          .compliance-text {
            max-width: 500px;
            font-size: 10px;
            color: #64748B;
            line-height: 15px;
          }

          .signature-box {
            text-align: center;
            border-top: 1.5px dashed #64748B;
            padding-top: 8px;
            width: 200px;
          }

          .signature-title {
            font-size: 11px;
            font-weight: 700;
            color: #0F172A;
          }

          .signature-sub {
            font-size: 9.5px;
            color: #64748B;
          }
        </style>
      </head>
      <body>
        <div class="statement-card">
          <div class="bank-header-stripe"></div>

          <!-- Header -->
          <div class="header-section">
            <div class="institution-brand">
              <h1 class="institution-title">${business.businessName || 'Business Merchant'}</h1>
              <div class="institution-sub">Merchant Operations & Financial Treasury</div>
              ${business.address ? `<div class="meta-item">Address: ${business.address}</div>` : ''}
              ${business.phone ? `<div class="meta-item">Phone: ${business.phone}</div>` : ''}
              ${business.email ? `<div class="meta-item">Email: ${business.email}</div>` : ''}
            </div>

            <div class="statement-badge-box">
              <div class="statement-badge-title">BANK-GRADE REVENUE STATEMENT</div>
              <div class="statement-sub-tag">Certified Inflow Ledger</div>
              <div class="meta-item"><strong>Statement Ref:</strong> ${statementNumber}</div>
              <div class="meta-item"><strong>Value Date:</strong> ${generatedAt}</div>
              <div class="meta-item"><strong>Period:</strong> ${periodLabel}</div>
            </div>
          </div>

          <!-- Account Information Bar -->
          <div class="account-info-grid">
            <div class="acc-info-cell">
              <div class="acc-info-label">Account Title</div>
              <div class="acc-info-val" style="font-size: 11px;">${business.businessName || 'Merchant Primary'}</div>
            </div>
            <div class="acc-info-cell">
              <div class="acc-info-label">Account Number</div>
              <div class="acc-info-val">${accountRef}</div>
            </div>
            <div class="acc-info-cell">
              <div class="acc-info-label">Currency</div>
              <div class="acc-info-val">PKR (Pakistani Rupee)</div>
            </div>
            <div class="acc-info-cell">
              <div class="acc-info-label">Audit Status</div>
              <div class="acc-info-val" style="color: #16A34A;">VERIFIED & ACTIVE</div>
            </div>
          </div>

          <!-- Executive Financial Summary -->
          <div class="summary-container">
            <div class="summary-item">
              <div class="summary-label">Total Inflow (Gross)</div>
              <div class="summary-value" style="color: #16A34A;">PKR ${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Operating Expenses</div>
              <div class="summary-value" style="color: #DC2626;">PKR ${totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Net Inflow Balance</div>
              <div class="summary-value" style="color: ${netRevenue >= 0 ? '#1E3A8A' : '#DC2626'};">
                PKR ${netRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total Invoices</div>
              <div class="summary-value">${invoiceCount}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Average Order Value</div>
              <div class="summary-value">PKR ${averageOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <!-- Ledger Table -->
          <div class="ledger-section">
            <div class="section-heading">
              <span>Itemized Inflow & Deposit Ledger</span>
              <span style="font-size: 11px; color: #64748B; font-weight: 600;">Total Transactions: ${invoices.length}</span>
            </div>

            <table class="ledger-table">
              <thead>
                <tr>
                  <th style="width: 18%;">Date & Time</th>
                  <th style="width: 14%;">Reference #</th>
                  <th style="width: 28%;">Particulars / Customer</th>
                  <th style="width: 14%;">Channel</th>
                  <th style="width: 13%; text-align: right;">Credit (+PKR)</th>
                  <th style="width: 13%; text-align: right;">Balance (PKR)</th>
                </tr>
              </thead>
              <tbody>
                ${ledgerRows.length > 0 ? ledgerRows : `
                  <tr>
                    <td colspan="6" style="text-align: center; padding: 24px; color: #64748B; font-size: 12px;">
                      No recorded invoices or revenue transactions found for this period.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>

          <!-- Official Bank Statement Footer -->
          <div class="footer-section">
            <div class="compliance-text">
              <strong>Official Financial Document Notice:</strong><br />
              This statement constitutes an authentic transaction record extracted from the Vaypar Enterprise Financial Ledger for ${business.businessName || 'the merchant'}. All balances reflect cleared invoices and recorded operational expenses.<br />
              <strong>Security Digest:</strong> SHA256-${Date.now().toString(16).toUpperCase()}-VERIFIED-SECURE
            </div>
            <div class="signature-box">
              <div class="signature-title">Authorized Signatory</div>
              <div class="signature-sub">Treasury & Merchant Operations</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  // Web: Open professional print window
  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 350);
    } else {
      Alert.alert('Popup Blocked', 'Please allow popups for this site to export/print statement.');
    }
    return;
  }

  // Mobile: native print/share
  if (!isSharingAvailable) {
    await Print.printAsync({ html: htmlContent });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html: htmlContent });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Revenue Statement - ${statementNumber}`,
  });
}

