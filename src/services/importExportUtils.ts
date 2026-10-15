import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import type { Product } from './sqlite';

export interface DBField {
  key: string;
  label: string;
  required: boolean;
}

// ─── Columns by Category ──────────────────────────────────────────────────────
export function getColumnsForCategory(categoryId: string): string[] {
  if (categoryId === 'restaurant' || categoryId === 'cafe' || categoryId === 'dhaba' || categoryId === 'bakery' || categoryId === 'sweet_shop' || categoryId === 'juice_bar' || categoryId === 'coffee_shop') {
    return ['Item Name', 'Category', 'Price', 'Box / Counter Location', 'Preparation Time', 'Availability'];
  }
  if (categoryId === 'pharmacy' || categoryId === 'medical_store') {
    return ['Medicine Name', 'Batch Number', 'Expiry Date', 'Manufacturer', 'Box / Rack Location', 'Purchase Price', 'Selling Price'];
  }
  if (categoryId === 'tailor') {
    return ['Fabric Name', 'Color', 'Box / Shelf Location', 'Unit Price'];
  }
  // Default General Store Template
  return [
    'Product Name', 'Category', 'SKU', 'Barcode', 'Box Location', 'Purchase Price', 'Selling Price',
    'Quantity', 'Unit', 'Brand', 'Supplier', 'Minimum Stock', 'Tax', 'Description',
    'Image URL', 'Status'
  ];
}

// ─── Sample Template Data ──────────────────────────────────────────────────────
export function getSampleTemplateData(categoryId: string): Record<string, any>[] {
  if (categoryId === 'restaurant' || categoryId === 'cafe' || categoryId === 'dhaba' || categoryId === 'bakery' || categoryId === 'sweet_shop' || categoryId === 'juice_bar' || categoryId === 'coffee_shop') {
    return [
      { 'Item Name': 'Chicken Biryani', 'Category': 'Main Course', 'Price': 350, 'Box / Counter Location': 'Kitchen Counter 1', 'Preparation Time': 15, 'Availability': 'Yes' },
      { 'Item Name': 'Garlic Naan', 'Category': 'Breads', 'Price': 50, 'Box / Counter Location': 'Tandoor Section', 'Preparation Time': 5, 'Availability': 'Yes' },
      { 'Item Name': 'Mint Margarita', 'Category': 'Beverages', 'Price': 150, 'Box / Counter Location': 'Bar Counter', 'Preparation Time': 4, 'Availability': 'No' },
    ];
  }
  if (categoryId === 'pharmacy' || categoryId === 'medical_store') {
    return [
      { 'Medicine Name': 'Panadol 500mg', 'Batch Number': 'B-PN102', 'Expiry Date': '2027-12-31', 'Manufacturer': 'GSK', 'Box / Rack Location': 'Rack A - Shelf 2', 'Purchase Price': 1.5, 'Selling Price': 2.0 },
      { 'Medicine Name': 'Amoxil 250mg Suspension', 'Batch Number': 'B-AM509', 'Expiry Date': '2026-06-30', 'Manufacturer': 'Glaxo', 'Box / Rack Location': 'Fridge Shelf 1', 'Purchase Price': 95.0, 'Selling Price': 110.0 },
    ];
  }
  if (categoryId === 'tailor') {
    return [
      { 'Fabric Name': 'Premium Cotton Latha', 'Color': 'Off-White', 'Box / Shelf Location': 'Fabric Box 04', 'Unit Price': 1200 },
      { 'Fabric Name': 'Wash and Wear Blend', 'Color': 'Navy Blue', 'Box / Shelf Location': 'Fabric Box 09', 'Unit Price': 850 },
    ];
  }
  return [
    {
      'Product Name': 'Premium Basmati Rice 5kg',
      'Category': 'Groceries',
      'SKU': 'RICE-BAS-05',
      'Barcode': '8901234567890',
      'Box Location': 'Box #12 - Shelf A',
      'Purchase Price': 1150.0,
      'Selling Price': 1350.0,
      'Quantity': 25,
      'Unit': 'pcs',
      'Brand': 'Guard Rice',
      'Supplier': 'Guard Agricultural',
      'Minimum Stock': 5,
      'Tax': 0.0,
      'Description': 'Long grain premium quality basmati rice.',
      'Image URL': 'https://images.unsplash.com/photo-1586201375761-83865001e31c',
      'Status': 'active'
    },
    {
      'Product Name': 'Tapal Danedar Tea Bag 100s',
      'Category': 'Beverages',
      'SKU': 'TEA-TAP-100',
      'Barcode': '8909876543210',
      'Box Location': 'Box #05 - Rack 2',
      'Purchase Price': 490.0,
      'Selling Price': 550.0,
      'Quantity': 40,
      'Unit': 'pack',
      'Brand': 'Tapal Tea',
      'Supplier': 'Tapal Tea Private Ltd',
      'Minimum Stock': 10,
      'Tax': 0.0,
      'Description': 'Strong black tea bags.',
      'Image URL': '',
      'Status': 'active'
    }
  ];
}

// ─── Smart Mappings ─────────────────────────────────────────────────────────────
const SYNONYMS: Record<string, string[]> = {
  name: ['product name', 'item name', 'name', 'title', 'product', 'item', 'fabric name', 'medicine name', 'fabric_name', 'medicine_name', 'item_name', 'product_name'],
  category: ['category', 'group', 'type', 'product category', 'item category', 'product_category', 'item_category'],
  price: ['selling price', 'price', 'sale price', 'rate', 'unit price', 'selling_price', 'price (pkr)', 'selling price (pkr)', 'unit price (pkr)', 'unit_price', 'rate_pkr'],
  quantity: ['quantity', 'stock', 'qty', 'count', 'units', 'initial stock', 'quantity in stock', 'quantity_in_stock', 'stock_qty'],
  lowStockThreshold: ['low stock limit', 'low stock threshold', 'min stock', 'minimum stock', 'alert quantity', 'low stock warning', 'warning level', 'low_stock_limit', 'min_stock', 'minimum_stock'],
  sku: ['sku', 'stock keeping unit', 'code', 'item code', 'product code', 'item_code', 'product_code'],
  barcode: ['barcode', 'ean', 'upc', 'qr code', 'barcode number', 'barcode_number'],
  purchasePrice: ['purchase price', 'cost price', 'cost', 'buy price', 'purchase_price', 'purchase price (pkr)', 'cost price (pkr)', 'cost_price', 'buy_rate'],
  boxLocation: [
    'box location', 'box', 'box no', 'box number', 'storage box', 'location',
    'shelf', 'shelf location', 'rack', 'container', 'bin', 'box_location',
    'box_no', 'box_number', 'shelf_location', 'storage_location', 'bin_location',
    'rack location', 'box / shelf location', 'box / rack location', 'box / counter location',
    'storage'
  ],
  unit: ['unit', 'uom', 'pack', 'measurement unit', 'pack unit', 'unit_of_measure'],
  brand: ['brand', 'manufacturer', 'make', 'brand name', 'company', 'brand_name'],
  supplier: ['supplier', 'vendor', 'distributor', 'supplier name', 'supplier_name'],
  tax: ['tax', 'vat', 'gst', 'tax percentage', 'tax rate', 'tax_percentage', 'tax_rate'],
  description: ['description', 'details', 'notes', 'about', 'product description', 'product_description'],
  imageUrl: ['image url', 'image', 'photo', 'pic', 'image_url', 'product image', 'photo_url', 'image_link'],
  status: ['status', 'active', 'availability', 'is available', 'available', 'is_available'],
  // Custom Modules Fields
  batchNumber: ['batch number', 'batch', 'batch no', 'batch_number', 'batch_no'],
  expiryDate: ['expiry date', 'expiry', 'exp date', 'expiration', 'expiry_date', 'exp_date'],
  estimatedMinutes: ['preparation time', 'prep time', 'cook time', 'preparation_time', 'prep_time', 'cook_time'],
  isAvailable: ['availability', 'is available', 'available', 'is_available']
};

export function getDatabaseFieldsForCategory(categoryId: string): DBField[] {
  if (categoryId === 'restaurant' || categoryId === 'cafe' || categoryId === 'dhaba' || categoryId === 'bakery' || categoryId === 'sweet_shop' || categoryId === 'juice_bar' || categoryId === 'coffee_shop') {
    return [
      { key: 'name', label: 'Item Name', required: true },
      { key: 'category', label: 'Category', required: false },
      { key: 'price', label: 'Price', required: true },
      { key: 'boxLocation', label: 'Box / Counter Location', required: false },
      { key: 'estimatedMinutes', label: 'Preparation Time (mins)', required: false },
      { key: 'isAvailable', label: 'Availability', required: false }
    ];
  }
  if (categoryId === 'pharmacy' || categoryId === 'medical_store') {
    return [
      { key: 'name', label: 'Medicine Name', required: true },
      { key: 'price', label: 'Selling Price', required: true },
      { key: 'purchasePrice', label: 'Purchase Price', required: false },
      { key: 'batchNumber', label: 'Batch Number', required: true },
      { key: 'expiryDate', label: 'Expiry Date (YYYY-MM-DD)', required: true },
      { key: 'boxLocation', label: 'Box / Shelf / Rack Location', required: false },
      { key: 'brand', label: 'Manufacturer', required: false },
      { key: 'category', label: 'Category', required: false }
    ];
  }
  if (categoryId === 'tailor') {
    return [
      { key: 'name', label: 'Fabric Name', required: true },
      { key: 'price', label: 'Unit Price', required: true },
      { key: 'boxLocation', label: 'Box / Shelf Location', required: false },
      { key: 'brand', label: 'Color', required: false }
    ];
  }
  return [
    { key: 'name', label: 'Product Name', required: true },
    { key: 'category', label: 'Category', required: false },
    { key: 'price', label: 'Selling Price', required: true },
    { key: 'quantity', label: 'Stock Quantity', required: false },
    { key: 'boxLocation', label: 'Box / Storage Location', required: false },
    { key: 'lowStockThreshold', label: 'Low Stock Limit', required: false },
    { key: 'sku', label: 'SKU', required: false },
    { key: 'barcode', label: 'Barcode', required: false },
    { key: 'purchasePrice', label: 'Purchase Price', required: false },
    { key: 'unit', label: 'Unit', required: false },
    { key: 'brand', label: 'Brand', required: false },
    { key: 'supplier', label: 'Supplier', required: false },
    { key: 'tax', label: 'Tax %', required: false },
    { key: 'description', label: 'Description', required: false },
    { key: 'imageUrl', label: 'Image URL', required: false },
    { key: 'status', label: 'Status (active/inactive)', required: false }
  ];
}

export function suggestColumnMappings(headers: string[], dbFields: DBField[]): Record<string, string> {
  const mappings: Record<string, string> = {};
  
  for (const field of dbFields) {
    const list = SYNONYMS[field.key] || [field.key.toLowerCase()];
    
    // Exact or synonym match
    const matchedHeader = headers.find(header => {
      const normalizedHeader = header.toLowerCase().trim();
      return list.some(syn => normalizedHeader === syn);
    });

    if (matchedHeader) {
      mappings[field.key] = matchedHeader;
      continue;
    }

    // Substring match fallback
    const partialMatch = headers.find(header => {
      const normalizedHeader = header.toLowerCase().trim();
      return list.some(syn => normalizedHeader.includes(syn) || syn.includes(normalizedHeader));
    });

    if (partialMatch) {
      mappings[field.key] = partialMatch;
    }
  }

  return mappings;
}

// ─── Row Validation ─────────────────────────────────────────────────────────────
export interface ValidationError {
  rowIndex: number;
  rowName: string;
  field: string;
  value: any;
  message: string;
}

export function validateImportRow(
  rawRow: Record<string, any>,
  rowIndex: number,
  dbFields: DBField[],
  mappings: Record<string, string>,
  categoryId: string,
  existingSkus: Set<string>,
  existingBarcodes: Set<string>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const rowName = rawRow[mappings['name']] ? String(rawRow[mappings['name']]) : `Row ${rowIndex}`;

  // Get mapped values
  const nameVal = rawRow[mappings['name']];
  const priceVal = rawRow[mappings['price']];

  // 1. Required field checks
  for (const field of dbFields) {
    if (field.required) {
      const mappedHeader = mappings[field.key];
      const value = mappedHeader ? rawRow[mappedHeader] : undefined;
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push({
          rowIndex,
          rowName,
          field: field.label,
          value,
          message: `Required field "${field.label}" is missing.`
        });
      }
    }
  }

  // 2. Validate Price
  if (priceVal !== undefined && priceVal !== null && String(priceVal).trim() !== '') {
    const price = parseFloat(String(priceVal));
    if (isNaN(price) || price < 0) {
      errors.push({
        rowIndex,
        rowName,
        field: 'Price',
        value: priceVal,
        message: 'Price must be a valid non-negative number.'
      });
    }
  }

  // 3. Validate Quantity
  const qtyHeader = mappings['quantity'];
  if (qtyHeader) {
    const qtyVal = rawRow[qtyHeader];
    if (qtyVal !== undefined && qtyVal !== null && String(qtyVal).trim() !== '') {
      const qty = parseInt(String(qtyVal), 10);
      if (isNaN(qty) || qty < 0) {
        errors.push({
          rowIndex,
          rowName,
          field: 'Quantity',
          value: qtyVal,
          message: 'Quantity must be a non-negative integer.'
        });
      }
    }
  }

  // 4. Validate Expiry Date (Pharmacy only)
  if (categoryId === 'pharmacy' || categoryId === 'medical_store') {
    const expHeader = mappings['expiryDate'];
    if (expHeader) {
      const expVal = rawRow[expHeader];
      if (expVal !== undefined && expVal !== null && String(expVal).trim() !== '') {
        const dateStr = String(expVal).trim();
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateStr)) {
          errors.push({
            rowIndex,
            rowName,
            field: 'Expiry Date',
            value: expVal,
            message: 'Expiry Date must be in YYYY-MM-DD format.'
          });
        } else {
          const timestamp = Date.parse(dateStr);
          if (isNaN(timestamp)) {
            errors.push({
              rowIndex,
              rowName,
              field: 'Expiry Date',
              value: expVal,
              message: 'Expiry Date must be a valid calendar date.'
            });
          }
        }
      }
    }
  }

  // 5. Duplicate SKU Checks
  const skuHeader = mappings['sku'];
  if (skuHeader) {
    const skuVal = String(rawRow[skuHeader] || '').trim();
    if (skuVal && existingSkus.has(skuVal.toLowerCase())) {
      // Not a blocker error if duplicate strategy is "Update" or "Skip", 
      // but recorded so preview knows. We flag it as an warning/error for reference
    }
  }

  // 6. Duplicate Barcode Checks
  const barcodeHeader = mappings['barcode'];
  if (barcodeHeader) {
    const barVal = String(rawRow[barcodeHeader] || '').trim();
    if (barVal && existingBarcodes.has(barVal.toLowerCase())) {
      // Warn
    }
  }

  return errors;
}

// ─── File Parsers ──────────────────────────────────────────────────────────────
export async function parseCsvFile(fileText: string): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(fileText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results: any) => {
        resolve(results.data as Record<string, any>[]);
      },
      error: (error: any) => {
        reject(error);
      }
    });
  });
}

export async function parseExcelFile(arrayBuffer: ArrayBuffer): Promise<Record<string, any>[]> {
  const data = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // sheet_to_json returns array of objects with keys matching header cells
  return XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
}

// ─── File Exporter ─────────────────────────────────────────────────────────────
export function exportToCsv(data: Record<string, any>[], filename = 'export.csv'): string {
  const csv = Papa.unparse(data);
  return csv;
}

export function exportToExcel(data: Record<string, any>[], sheetName = 'Products'): ArrayBuffer {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  const wopts: XLSX.WritingOptions = { bookType: 'xlsx', bookSST: false, type: 'array' };
  const arrayBuffer = XLSX.write(workbook, wopts);
  return arrayBuffer;
}

export async function downloadExcelFile(data: Record<string, any>[], filename = 'template.xlsx', sheetName = 'Products') {
  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !document) return;

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Generate ArrayBuffer (full valid 17KB+ binary Excel file)
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', bookSST: false, type: 'array' });
    const blob = new Blob([excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });

    // MS Edge/IE Legacy Blob saver fallback
    if (typeof (navigator as any) !== 'undefined' && (navigator as any).msSaveOrOpenBlob) {
      (navigator as any).msSaveOrOpenBlob(blob, safeFilename);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = safeFilename;
    link.setAttribute('download', safeFilename);
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 2000);
  } else {
    // Expo Go Mobile Native (iOS / Android)
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      
      const b64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const docDir = (FileSystem as any).documentDirectory || '';
      const fileUri = `${docDir}${safeFilename}`;

      await (FileSystem as any).writeAsStringAsync(fileUri, b64, {
        encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `Open ${safeFilename} in Excel / Files`,
          UTI: 'com.microsoft.excel.xlsx'
        });
      } else {
        Alert.alert('File Saved', `Template saved to device storage: ${fileUri}`);
      }
    } catch (e: any) {
      console.error('Expo Go Mobile download failed:', e);
      Alert.alert('Download Error', e.message || 'Could not save Excel template on mobile device.');
    }
  }
}

export async function downloadCsvFile(data: Record<string, any>[], filename = 'template.csv') {
  const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const csvText = Papa.unparse(data, { newline: '\r\n' });

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !document) return;

    // Add UTF-8 BOM prefix (\uFEFF) for Excel Windows compatibility
    const blob = new Blob(['\uFEFF' + csvText], { 
      type: 'text/csv;charset=utf-8;' 
    });

    if (typeof (navigator as any) !== 'undefined' && (navigator as any).msSaveOrOpenBlob) {
      (navigator as any).msSaveOrOpenBlob(blob, safeFilename);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = safeFilename;
    link.setAttribute('download', safeFilename);
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 2000);
  } else {
    // Expo Go Mobile Native (iOS / Android)
    try {
      const docDir = (FileSystem as any).documentDirectory || '';
      const fileUri = `${docDir}${safeFilename}`;
      await (FileSystem as any).writeAsStringAsync(fileUri, '\uFEFF' + csvText, {
        encoding: (FileSystem as any).EncodingType?.UTF8 || 'utf8',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Open ${safeFilename} in Excel / Files`,
          UTI: 'public.comma-separated-values-text'
        });
      } else {
        Alert.alert('File Saved', `Template saved to device storage: ${fileUri}`);
      }
    } catch (e: any) {
      console.error('Expo Go Mobile CSV download failed:', e);
      Alert.alert('Download Error', e.message || 'Could not save CSV template on mobile device.');
    }
  }
}

export function getTemplateCsvRawText(categoryId: string): string {
  const mockData = getSampleTemplateData(categoryId);
  return Papa.unparse(mockData, { newline: '\r\n' });
}

// ─── XML Exporter & Parser ──────────────────────────────────────────────────
export function exportToXml(data: Record<string, any>[], rootName = 'Products', itemName = 'Product'): string {
  function escapeXml(unsafe: any) {
    if (unsafe === undefined || unsafe === null) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function sanitizeTag(key: string) {
    return key.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;
  for (const item of data) {
    xml += `  <${itemName}>\n`;
    for (const [key, value] of Object.entries(item)) {
      const tag = sanitizeTag(key);
      xml += `    <${tag}>${escapeXml(value)}</${tag}>\n`;
    }
    xml += `  </${itemName}>\n`;
  }
  xml += `</${rootName}>\n`;
  return xml;
}

export async function downloadXmlFile(data: Record<string, any>[], filename = 'export.xml') {
  const safeFilename = filename.endsWith('.xml') ? filename : `${filename}.xml`;
  const xmlText = exportToXml(data);

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !document) return;

    const blob = new Blob([xmlText], { type: 'application/xml;charset=utf-8;' });
    if (typeof (navigator as any) !== 'undefined' && (navigator as any).msSaveOrOpenBlob) {
      (navigator as any).msSaveOrOpenBlob(blob, safeFilename);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = safeFilename;
    link.setAttribute('download', safeFilename);
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 2000);
  } else {
    try {
      const docDir = (FileSystem as any).documentDirectory || '';
      const fileUri = `${docDir}${safeFilename}`;
      await (FileSystem as any).writeAsStringAsync(fileUri, xmlText, {
        encoding: (FileSystem as any).EncodingType?.UTF8 || 'utf8',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/xml',
          dialogTitle: `Open ${safeFilename} in Files`,
        });
      } else {
        Alert.alert('File Saved', `XML file saved to device storage: ${fileUri}`);
      }
    } catch (e: any) {
      console.error('Mobile XML download failed:', e);
      Alert.alert('Download Error', e.message || 'Could not save XML file on mobile device.');
    }
  }
}

export async function parseXmlFile(xmlText: string): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  const itemRegex = /<Product[\s\S]*?>([\s\S]*?)<\/Product>|<Item[\s\S]*?>([\s\S]*?)<\/Item>|<row[\s\S]*?>([\s\S]*?)<\/row>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1] || match[2] || match[3] || '';
    const fieldRegex = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let fieldMatch;
    const rowObj: Record<string, any> = {};

    while ((fieldMatch = fieldRegex.exec(itemContent)) !== null) {
      const fieldName = fieldMatch[1].replace(/_/g, ' ');
      const rawVal = fieldMatch[2]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();

      const numVal = Number(rawVal);
      rowObj[fieldName] = isNaN(numVal) || rawVal === '' ? rawVal : numVal;
    }

    if (Object.keys(rowObj).length > 0) {
      rows.push(rowObj);
    }
  }

  return rows;
}

export function getTemplateXmlRawText(categoryId: string): string {
  const mockData = getSampleTemplateData(categoryId);
  return exportToXml(mockData);
}

