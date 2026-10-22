import * as SQLite from 'expo-sqlite';
import type { UserRole } from '../types';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export interface UserProfile {
  id: string; // matches auth UID or local_staff_uid
  businessId: string;
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  salary: number;
  joiningDate: string;
  status: 'active' | 'inactive';
  synced?: number;
  lastUpdated: string;
}

export interface BusinessProfile {
  id: string; // businessId
  businessName: string;
  phone: string;
  address: string;
  logoUri: string;
  businessCategory?: string;
  synced?: number;
  lastUpdated: string;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  creditLimit?: number;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface CreditAccount {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalDebit: number;   // total amount charged (udhar)
  totalCredit: number;  // total amount paid back
  balance: number;      // totalDebit - totalCredit
  lastTransactionAt: string;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface CreditTransaction {
  id: string;
  accountId: string;
  businessId: string;
  type: 'debit' | 'credit'; // debit = gave on udhar, credit = received payment
  amount: number;
  description?: string;
  createdAt: string;
  createdBy: string;
}

export interface UserSessionCombined {
  id: string;
  businessId: string;
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  salary: number;
  joiningDate: string;
  status: 'active' | 'inactive';
  businessName: string;
  address: string;
  logoUri: string;
  businessCategory?: string;
  synced?: number;
  lastUpdated: string;
}

export interface Product {
  id: string;
  userId: string; // legacy mapping
  businessId: string;
  createdBy: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  lowStockThreshold: number;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
  // Bulk import fields
  sku?: string | null;
  barcode?: string | null;
  purchasePrice?: number | null;
  unit?: string | null;
  brand?: string | null;
  supplier?: string | null;
  tax?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  status?: string | null;
  // Storage & store listing
  boxLocation?: string | null;   // e.g. "Shelf A3", "Box 12"
  listOnStore?: number | null;   // 1 = listed on public store, 0 = not listed
}

export interface Invoice {
  id: string;
  userId: string; // legacy mapping
  businessId: string;
  createdBy: string;
  customerName: string;
  customerPhone: string;
  subtotal: number;
  discount: number;
  serviceCharges?: number;
  total: number;
  createdAt: string;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface ReturnExchange {
  id: string;
  businessId: string;
  invoiceId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  type: 'return' | 'exchange'; // 'return' (refund) or 'exchange'
  originalProductId: string;
  originalProductName: string;
  quantity: number;
  refundAmount?: number;
  replacementProductId?: string | null;
  replacementProductName?: string | null;
  replacementQuantity?: number;
  differenceAmount?: number;
  condition: 'resellable' | 'damaged';
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  total: number;
}

export interface Expense {
  id: string;
  userId: string; // legacy mapping
  businessId: string;
  createdBy: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface InstallmentAccount {
  id: string;
  userId: string; // legacy mapping
  businessId: string;
  createdBy: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  totalAmount: number;
  downPayment: number;
  remainingAmount: number;
  monthsTenure: number;
  interestRate: number;
  monthlyEMI: number;
  nextDueDate: string;
  status: 'active' | 'completed' | 'defaulted';
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface InstallmentPayment {
  id: string;
  accountId: string;
  amountPaid: number;
  paymentDate: string;
  notes: string;
}

export interface SalaryPayment {
  id: string;
  userId: string;
  businessId: string;
  month: string; // e.g. "2026-07"
  amount: number;
  bonus: number;
  deduction: number;
  status: 'paid' | 'unpaid';
  paymentDate?: string;
  notes: string;
  synced?: number;
  lastUpdated: string;
}

export interface ActivityLog {
  id: string;
  businessId: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
  synced?: number;
  lastUpdated: string;
}

let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync('vyapar.db');
        await initializeDatabase(db);
        dbInstance = db;
        return db;
      } catch (err: any) {
        dbInitPromise = null; // allow retrying
        if (err.message && (err.message.includes('Invalid VFS state') || err.message.includes('createSyncAccessHandle'))) {
          throw new Error('Database is locked by another tab. Please close other tabs running the app to continue.');
        }
        throw err;
      }
    })();
  }
  
  return await dbInitPromise;
}

async function initializeDatabase(db: SQLite.SQLiteDatabase) {
  // Configure journal mode
  await db.execAsync('PRAGMA journal_mode = WAL;');

  // Migrations block: Check if 'users' table is in the legacy format (contains businessName)
  try {
    const tableInfo = await db.getAllAsync<{ name: string }>("PRAGMA table_info(users)");
    const hasBusinessName = tableInfo.some(col => col.name === 'businessName');
    
    if (hasBusinessName) {
      console.log('Detected legacy user profile schema. Migrating to split multi-user schema...');
      
      // 1. Create businesses table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS businesses (
          id TEXT PRIMARY KEY,
          businessName TEXT,
          phone TEXT,
          address TEXT,
          logoUri TEXT,
          synced INTEGER DEFAULT 0,
          lastUpdated TEXT
        );
      `);

      // 2. Copy profile fields from users to businesses
      await db.execAsync(`
        INSERT OR IGNORE INTO businesses (id, businessName, phone, address, logoUri, synced, lastUpdated)
        SELECT id, businessName, phone, address, logoUri, synced, lastUpdated FROM users;
      `);

      // 3. Drop legacy users table
      await db.execAsync('DROP TABLE users;');
      console.log('Legacy profile schema dropped successfully.');
    }
  } catch (err) {
    console.error('Error running legacy profile database migration:', err);
  }

  // Define new structures
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      businessName TEXT,
      phone TEXT,
      address TEXT,
      logoUri TEXT,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      businessId TEXT,
      role TEXT,
      name TEXT,
      email TEXT,
      phone TEXT,
      salary REAL DEFAULT 0,
      joiningDate TEXT,
      status TEXT DEFAULT 'active',
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      userId TEXT,
      businessId TEXT,
      createdBy TEXT,
      name TEXT NOT NULL,
      price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      category TEXT,
      lowStockThreshold INTEGER DEFAULT 5,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      userId TEXT,
      businessId TEXT,
      createdBy TEXT,
      customerName TEXT,
      customerPhone TEXT,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      serviceCharges REAL DEFAULT 0,
      total REAL DEFAULT 0,
      createdAt TEXT,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoiceId TEXT,
      productId TEXT,
      productName TEXT,
      price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      total REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      userId TEXT,
      businessId TEXT,
      createdBy TEXT,
      title TEXT NOT NULL,
      amount REAL DEFAULT 0,
      category TEXT,
      date TEXT,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS installment_accounts (
      id TEXT PRIMARY KEY,
      userId TEXT,
      businessId TEXT,
      createdBy TEXT,
      customerName TEXT,
      customerPhone TEXT,
      productName TEXT,
      totalAmount REAL DEFAULT 0,
      downPayment REAL DEFAULT 0,
      remainingAmount REAL DEFAULT 0,
      monthsTenure INTEGER DEFAULT 12,
      interestRate REAL DEFAULT 0,
      monthlyEMI REAL DEFAULT 0,
      nextDueDate TEXT,
      status TEXT DEFAULT 'active',
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS installment_payments (
      id TEXT PRIMARY KEY,
      accountId TEXT,
      amountPaid REAL DEFAULT 0,
      paymentDate TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS salary_payments (
      id TEXT PRIMARY KEY,
      userId TEXT,
      businessId TEXT,
      month TEXT,
      amount REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      deduction REAL DEFAULT 0,
      status TEXT DEFAULT 'unpaid',
      paymentDate TEXT,
      notes TEXT,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      businessId TEXT,
      userId TEXT,
      userName TEXT,
      action TEXT,
      timestamp TEXT,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT
    );

    CREATE TABLE IF NOT EXISTS returns_exchanges (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      invoiceId TEXT,
      customerName TEXT,
      customerPhone TEXT,
      type TEXT NOT NULL,
      originalProductId TEXT NOT NULL,
      originalProductName TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      refundAmount REAL DEFAULT 0,
      replacementProductId TEXT,
      replacementProductName TEXT,
      replacementQuantity INTEGER DEFAULT 0,
      differenceAmount REAL DEFAULT 0,
      condition TEXT DEFAULT 'resellable',
      reason TEXT,
      notes TEXT,
      createdAt TEXT,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );
  `);

  // Alter tables dynamically to support multi-user scoping
  try {
    const productsInfo = await db.getAllAsync<{ name: string }>("PRAGMA table_info(products)");
    if (!productsInfo.some(col => col.name === 'businessId')) {
      await db.execAsync("ALTER TABLE products ADD COLUMN businessId TEXT;");
    }
    if (!productsInfo.some(col => col.name === 'createdBy')) {
      await db.execAsync("ALTER TABLE products ADD COLUMN createdBy TEXT;");
    }
    
    // Bulk Product Import Extra Fields Migration
    const colNames = productsInfo.map(col => col.name);
    const columnsToSync = [
      { name: 'sku', type: 'TEXT' },
      { name: 'barcode', type: 'TEXT' },
      { name: 'purchasePrice', type: 'REAL DEFAULT 0' },
      { name: 'unit', type: 'TEXT' },
      { name: 'brand', type: 'TEXT' },
      { name: 'supplier', type: 'TEXT' },
      { name: 'tax', type: 'REAL DEFAULT 0' },
      { name: 'description', type: 'TEXT' },
      { name: 'imageUrl', type: 'TEXT' },
      { name: 'status', type: "TEXT DEFAULT 'active'" },
      { name: 'boxLocation', type: 'TEXT' },
      { name: 'listOnStore', type: 'INTEGER DEFAULT 0' },
    ];

    for (const col of columnsToSync) {
      if (!colNames.includes(col.name)) {
        await db.execAsync(`ALTER TABLE products ADD COLUMN ${col.name} ${col.type};`);
      }
    }
  } catch (e) { console.error("products ALTER error:", e); }

  try {
    const invoicesInfo = await db.getAllAsync<{ name: string }>("PRAGMA table_info(invoices)");
    if (!invoicesInfo.some(col => col.name === 'businessId')) {
      await db.execAsync("ALTER TABLE invoices ADD COLUMN businessId TEXT;");
    }
    if (!invoicesInfo.some(col => col.name === 'createdBy')) {
      await db.execAsync("ALTER TABLE invoices ADD COLUMN createdBy TEXT;");
    }
    if (!invoicesInfo.some(col => col.name === 'serviceCharges')) {
      await db.execAsync("ALTER TABLE invoices ADD COLUMN serviceCharges REAL DEFAULT 0;");
    }
  } catch (e) { console.error("invoices ALTER error:", e); }

  try {
    const expensesInfo = await db.getAllAsync<{ name: string }>("PRAGMA table_info(expenses)");
    if (!expensesInfo.some(col => col.name === 'businessId')) {
      await db.execAsync("ALTER TABLE expenses ADD COLUMN businessId TEXT;");
    }
    if (!expensesInfo.some(col => col.name === 'createdBy')) {
      await db.execAsync("ALTER TABLE expenses ADD COLUMN createdBy TEXT;");
    }
  } catch (e) { console.error("expenses ALTER error:", e); }

  try {
    const instInfo = await db.getAllAsync<{ name: string }>("PRAGMA table_info(installment_accounts)");
    if (!instInfo.some(col => col.name === 'businessId')) {
      await db.execAsync("ALTER TABLE installment_accounts ADD COLUMN businessId TEXT;");
    }
    if (!instInfo.some(col => col.name === 'createdBy')) {
      await db.execAsync("ALTER TABLE installment_accounts ADD COLUMN createdBy TEXT;");
    }
  } catch (e) { console.error("installments ALTER error:", e); }

  // Add businessCategory column to businesses if missing
  try {
    const bizInfo = await db.getAllAsync<{ name: string }>("PRAGMA table_info(businesses)");
    if (!bizInfo.some(col => col.name === 'businessCategory')) {
      await db.execAsync("ALTER TABLE businesses ADD COLUMN businessCategory TEXT DEFAULT 'general';");
    }
  } catch (e) { console.error("businesses businessCategory ALTER error:", e); }

  // ─── Customers ──────────────────────────────────────────────────────────
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      businessId TEXT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      notes TEXT,
      creditLimit REAL DEFAULT 0,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS credit_accounts (
      id TEXT PRIMARY KEY,
      businessId TEXT,
      customerId TEXT,
      customerName TEXT,
      customerPhone TEXT,
      totalDebit REAL DEFAULT 0,
      totalCredit REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      lastTransactionAt TEXT,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      accountId TEXT,
      businessId TEXT,
      type TEXT,
      amount REAL DEFAULT 0,
      description TEXT,
      createdAt TEXT,
      createdBy TEXT
    );

    CREATE TABLE IF NOT EXISTS user_tour_status (
      userId TEXT PRIMARY KEY,
      status TEXT,
      version TEXT,
      completedAt TEXT,
      skippedAt TEXT,
      updatedAt TEXT
    );
  `);

  // Backfill businessId = userId and createdBy = userId for all legacy local records
  await db.execAsync(`
    UPDATE products SET businessId = userId WHERE businessId IS NULL OR businessId = '';
    UPDATE products SET createdBy = userId WHERE createdBy IS NULL OR createdBy = '';
    
    UPDATE invoices SET businessId = userId WHERE businessId IS NULL OR businessId = '';
    UPDATE invoices SET createdBy = userId WHERE createdBy IS NULL OR createdBy = '';
    
    UPDATE expenses SET businessId = userId WHERE businessId IS NULL OR businessId = '';
    UPDATE expenses SET createdBy = userId WHERE createdBy IS NULL OR createdBy = '';
    
    UPDATE installment_accounts SET businessId = userId WHERE businessId IS NULL OR businessId = '';
    UPDATE installment_accounts SET createdBy = userId WHERE createdBy IS NULL OR createdBy = '';
  `);
}

// ==========================================
// BUSINESS & USER PROFILE CRUD
// ==========================================

export async function getBusinessProfile(businessId: string): Promise<BusinessProfile | null> {
  const db = await getDB();
  return await db.getFirstAsync<BusinessProfile>(
    'SELECT * FROM businesses WHERE id = ?',
    [businessId]
  );
}

export async function getAllBusinessProfiles(): Promise<BusinessProfile[]> {
  const db = await getDB();
  return await db.getAllAsync<BusinessProfile>('SELECT * FROM businesses');
}

export async function upsertBusinessProfile(profile: BusinessProfile): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO businesses (id, businessName, phone, address, logoUri, businessCategory, synced, lastUpdated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       businessName = excluded.businessName,
       phone = excluded.phone,
       address = excluded.address,
       logoUri = excluded.logoUri,
       businessCategory = excluded.businessCategory,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated`,
    [profile.id, profile.businessName, profile.phone, profile.address, profile.logoUri, profile.businessCategory ?? 'general', profile.synced ?? 0, profile.lastUpdated]
  );
}


export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const db = await getDB();
  return await db.getFirstAsync<UserProfile>(
    'SELECT * FROM users WHERE id = ?',
    [userId]
  );
}

export async function getAllUserProfiles(): Promise<UserProfile[]> {
  const db = await getDB();
  return await db.getAllAsync<UserProfile>('SELECT * FROM users');
}

export async function getUserProfileCombined(userId: string): Promise<UserSessionCombined | null> {
  const db = await getDB();
  
  // Try to find the user profile first
  let userResult = await db.getFirstAsync<UserProfile>(
    'SELECT * FROM users WHERE id = ?',
    [userId]
  );
  
  // Legacy Fallback: If no user registry record exists but they have a business profile,
  // dynamically auto-create their owner user record on the fly to bridge the migration.
  if (!userResult) {
    const bizResult = await db.getFirstAsync<BusinessProfile>(
      'SELECT * FROM businesses WHERE id = ?',
      [userId]
    );
    if (bizResult) {
      console.log(`Auto-generating user registry entry for owner ID: ${userId}`);
      const now = new Date().toISOString();
      const defaultOwner: UserProfile = {
        id: userId,
        businessId: userId,
        role: 'owner',
        name: 'Business Owner',
        email: '',
        phone: bizResult.phone || '',
        salary: 0,
        joiningDate: now,
        status: 'active',
        synced: 0,
        lastUpdated: now
      };
      await upsertUserProfile(defaultOwner);
      userResult = defaultOwner;
    } else {
      return null;
    }
  }

  const bizResult = await db.getFirstAsync<BusinessProfile>(
    'SELECT * FROM businesses WHERE id = ?',
    [userResult.businessId]
  );

  return {
    id: userResult.id,
    businessId: userResult.businessId,
    role: userResult.role,
    name: userResult.name,
    email: userResult.email,
    phone: bizResult?.phone || userResult.phone || '',
    salary: userResult.salary,
    joiningDate: userResult.joiningDate,
    status: userResult.status,
    businessName: bizResult?.businessName || 'My Business',
    address: bizResult?.address || '',
    logoUri: bizResult?.logoUri || '',
    businessCategory: bizResult?.businessCategory || 'general',
    synced: userResult.synced,
    lastUpdated: userResult.lastUpdated
  };
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO users (id, businessId, role, name, email, phone, salary, joiningDate, status, synced, lastUpdated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       businessId = excluded.businessId,
       role = excluded.role,
       name = excluded.name,
       email = excluded.email,
       phone = excluded.phone,
       salary = excluded.salary,
       joiningDate = excluded.joiningDate,
       status = excluded.status,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated`,
    [
      profile.id,
      profile.businessId,
      profile.role,
      profile.name,
      profile.email,
      profile.phone,
      profile.salary,
      profile.joiningDate,
      profile.status,
      profile.synced ?? 0,
      profile.lastUpdated
    ]
  );
}

// ==========================================
// PRODUCTS CRUD
// ==========================================

export async function getProducts(businessId: string, includeDeleted = false): Promise<Product[]> {
  const db = await getDB();
  let query = 'SELECT * FROM products WHERE businessId = ?';
  if (!includeDeleted) {
    query += ' AND deleted = 0';
  }
  const result = await db.getAllAsync<Product>(query, [businessId]);
  return result;
}

export async function getProductById(id: string): Promise<Product | null> {
  const db = await getDB();
  return await db.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', [id]);
}

export async function upsertProduct(product: Product): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO products (
       id, userId, businessId, createdBy, name, price, quantity, category, lowStockThreshold, 
       synced, lastUpdated, deleted, sku, barcode, purchasePrice, unit, brand, supplier, tax, description, imageUrl, status,
       boxLocation, listOnStore
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       price = excluded.price,
       quantity = excluded.quantity,
       category = excluded.category,
       lowStockThreshold = excluded.lowStockThreshold,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted,
       sku = COALESCE(excluded.sku, products.sku),
       barcode = COALESCE(excluded.barcode, products.barcode),
       purchasePrice = CASE 
         WHEN excluded.purchasePrice > 0 THEN excluded.purchasePrice 
         ELSE products.purchasePrice 
       END,
       unit = COALESCE(excluded.unit, products.unit),
       brand = COALESCE(excluded.brand, products.brand),
       supplier = COALESCE(excluded.supplier, products.supplier),
       tax = CASE WHEN excluded.tax > 0 THEN excluded.tax ELSE products.tax END,
       description = COALESCE(excluded.description, products.description),
       imageUrl = COALESCE(excluded.imageUrl, products.imageUrl),
       status = COALESCE(excluded.status, products.status),
       boxLocation = COALESCE(excluded.boxLocation, products.boxLocation),
       listOnStore = CASE WHEN excluded.listOnStore IS NOT NULL THEN excluded.listOnStore ELSE products.listOnStore END`,
    [
      product.id,
      product.userId,
      product.businessId,
      product.createdBy,
      product.name,
      product.price,
      product.quantity,
      product.category,
      product.lowStockThreshold,
      product.synced ?? 0,
      product.lastUpdated,
      product.deleted ?? 0,
      product.sku ?? null,
      product.barcode ?? null,
      product.purchasePrice ?? 0,
      product.unit ?? null,
      product.brand ?? null,
      product.supplier ?? null,
      product.tax ?? 0,
      product.description ?? null,
      product.imageUrl ?? null,
      product.status ?? 'active',
      product.boxLocation ?? null,
      product.listOnStore ?? 0,
    ]
  );

  // Trigger low stock warning (adapts dynamically: Medicine for pharmacy, Product for other businesses)
  if ((product.deleted ?? 0) === 0 && product.quantity <= product.lowStockThreshold) {
    try {
      const { createNotification } = require('./notificationService');
      const biz = await db.getFirstAsync<{ businessCategory?: string }>(
        'SELECT businessCategory FROM businesses WHERE id = ?',
        [product.businessId]
      );
      const isPharmacy = biz?.businessCategory === 'pharmacy' || biz?.businessCategory === 'medical_store';
      const label = isPharmacy ? 'Medicine' : 'Product';
      const notifType = isPharmacy ? 'pharmacy_low_stock' : 'product_low_stock';
      await createNotification(
        product.businessId,
        notifType,
        `${label} Low Stock`,
        `${label} "${product.name}" is running low! (${product.quantity} remaining)`
      );
    } catch {}
  }
}

export async function softDeleteProduct(id: string, userId: string): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE products SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [now, id]
  );
}

// ==========================================
// INVOICES CRUD & ORDER NUMBER SEQUENCE
// ==========================================

/**
 * Generates the next sequential order number for a business in standard format ORD-YYYY-XXXX.
 * Sequences automatically restart when a new year begins (e.g. #ORD-2026-0000, #ORD-2026-0001; in 2027: #ORD-2027-0000).
 */
export async function getNextOrderNumber(businessId: string, date: Date = new Date()): Promise<string> {
  const db = await getDB();
  const year = date.getFullYear();
  const prefix = `ORD-${year}-`;

  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM invoices 
     WHERE businessId = ? 
       AND (id LIKE ? OR id LIKE ?) 
     ORDER BY rowid DESC`,
    [`${prefix}%`, `inv_${prefix}%`]
  );

  let maxSeq = -1;
  for (const row of rows) {
    const clean = row.id.replace(/^inv_/i, '');
    if (clean.startsWith(prefix)) {
      const numPart = parseInt(clean.substring(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  const seqFormatted = String(nextSeq).padStart(4, '0');
  return `ORD-${year}-${seqFormatted}`;
}

/**
 * Formats any invoice ID into standard clean #ORD-YYYY-XXXX representation
 */
export function formatOrderNumber(invoiceId?: string, createdAt?: string): string {
  if (!invoiceId) return 'ORD-0000-0000';
  const clean = invoiceId.replace(/^inv_/i, '').toUpperCase();
  if (clean.startsWith('ORD-')) {
    return clean;
  }
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  const digits = clean.replace(/[^0-9]/g, '');
  const seq = (digits.length >= 4 ? digits.slice(-4) : clean.slice(-4)).padStart(4, '0');
  return `ORD-${year}-${seq}`;
}


export async function getInvoices(businessId: string, includeDeleted = false): Promise<Invoice[]> {
  const db = await getDB();
  let query = 'SELECT * FROM invoices WHERE businessId = ?';
  if (!includeDeleted) {
    query += ' AND deleted = 0';
  }
  query += ' ORDER BY createdAt DESC';
  const result = await db.getAllAsync<Invoice>(query, [businessId]);
  return result;
}

export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const db = await getDB();
  const result = await db.getAllAsync<InvoiceItem>(
    'SELECT * FROM invoice_items WHERE invoiceId = ?',
    [invoiceId]
  );
  return result;
}

export async function createInvoice(invoice: Invoice, items: InvoiceItem[]): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    // Insert invoice
    await db.runAsync(
      `INSERT INTO invoices (id, userId, businessId, createdBy, customerName, customerPhone, subtotal, discount, serviceCharges, total, createdAt, synced, lastUpdated, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice.id,
        invoice.userId,
        invoice.businessId,
        invoice.createdBy,
        invoice.customerName,
        invoice.customerPhone,
        invoice.subtotal,
        invoice.discount,
        invoice.serviceCharges ?? 0,
        invoice.total,
        invoice.createdAt,
        invoice.synced ?? 0,
        invoice.lastUpdated,
        invoice.deleted ?? 0,
      ]
    );

    // Insert invoice items and update inventory stock levels
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO invoice_items (id, invoiceId, productId, productName, price, quantity, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.invoiceId, item.productId, item.productName, item.price, item.quantity, item.total]
      );

      // Decrement quantity in products table
      await db.runAsync(
        `UPDATE products 
         SET quantity = quantity - ?, synced = 0, lastUpdated = ? 
         WHERE id = ?`,
         [item.quantity, now, item.productId]
      );

      // Trigger low stock warning if threshold is breached after sale (dynamic for any business)
      const prod = await getProductById(item.productId);
      if (prod && (prod.deleted ?? 0) === 0 && prod.quantity <= prod.lowStockThreshold) {
        try {
          const { createNotification } = require('./notificationService');
          const biz = await db.getFirstAsync<{ businessCategory?: string }>(
            'SELECT businessCategory FROM businesses WHERE id = ?',
            [invoice.businessId]
          );
          const isPharmacy = biz?.businessCategory === 'pharmacy' || biz?.businessCategory === 'medical_store';
          const label = isPharmacy ? 'Medicine' : 'Product';
          const notifType = isPharmacy ? 'pharmacy_low_stock' : 'product_low_stock';
          await createNotification(
            invoice.businessId,
            notifType,
            `${label} Low Stock`,
            `${label} "${prod.name}" has dropped below threshold! Only ${prod.quantity} remaining.`
          );
        } catch {}
      }
    }
  });
}

export async function softDeleteInvoice(id: string, userId: string): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  
  await db.withTransactionAsync(async () => {
    // Mark invoice deleted
    await db.runAsync(
      'UPDATE invoices SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
      [now, id]
    );
    
    // Restore product stock from the items in this invoice
    const items = await getInvoiceItems(id);
    for (const item of items) {
      await db.runAsync(
        `UPDATE products 
         SET quantity = quantity + ?, synced = 0, lastUpdated = ? 
         WHERE id = ?`,
        [item.quantity, now, item.productId]
      );
    }
  });
}

// ==========================================
// RETURNS & EXCHANGES CRUD
// ==========================================

export async function getReturnsExchanges(businessId: string): Promise<ReturnExchange[]> {
  const db = await getDB();
  return await db.getAllAsync<ReturnExchange>(
    'SELECT * FROM returns_exchanges WHERE businessId = ? AND (deleted = 0 OR deleted IS NULL) ORDER BY createdAt DESC',
    [businessId]
  );
}

export async function createReturnExchange(record: ReturnExchange): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO returns_exchanges (
        id, businessId, invoiceId, customerName, customerPhone, type,
        originalProductId, originalProductName, quantity, refundAmount,
        replacementProductId, replacementProductName, replacementQuantity,
        differenceAmount, condition, reason, notes, createdAt, synced, lastUpdated, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.businessId,
        record.invoiceId || null,
        record.customerName || '',
        record.customerPhone || '',
        record.type,
        record.originalProductId,
        record.originalProductName,
        record.quantity,
        record.refundAmount || 0,
        record.replacementProductId || null,
        record.replacementProductName || null,
        record.replacementQuantity || 0,
        record.differenceAmount || 0,
        record.condition || 'resellable',
        record.reason || '',
        record.notes || '',
        record.createdAt || now,
        record.synced ?? 0,
        record.lastUpdated || now,
        record.deleted ?? 0
      ]
    );

    // If resellable, restore quantity of original product
    if (record.condition === 'resellable') {
      await db.runAsync(
        'UPDATE products SET quantity = quantity + ?, synced = 0, lastUpdated = ? WHERE id = ?',
        [record.quantity, now, record.originalProductId]
      );
    }

    // If exchange, deduct replacement quantity from inventory
    if (record.type === 'exchange' && record.replacementProductId && (record.replacementQuantity || 0) > 0) {
      await db.runAsync(
        'UPDATE products SET quantity = quantity - ?, synced = 0, lastUpdated = ? WHERE id = ?',
        [record.replacementQuantity || 0, now, record.replacementProductId]
      );
    }
  });
}

export async function softDeleteReturnExchange(id: string): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE returns_exchanges SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [now, id]
  );
}

// ==========================================
// EXPENSES CRUD
// ==========================================

export async function getExpenses(businessId: string, includeDeleted = false): Promise<Expense[]> {
  const db = await getDB();
  let query = 'SELECT * FROM expenses WHERE businessId = ?';
  if (!includeDeleted) {
    query += ' AND deleted = 0';
  }
  query += ' ORDER BY date DESC';
  const result = await db.getAllAsync<Expense>(query, [businessId]);
  return result;
}

export async function upsertExpense(expense: Expense): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO expenses (id, userId, businessId, createdBy, title, amount, category, date, synced, lastUpdated, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       amount = excluded.amount,
       category = excluded.category,
       date = excluded.date,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      expense.id,
      expense.userId,
      expense.businessId,
      expense.createdBy,
      expense.title,
      expense.amount,
      expense.category,
      expense.date,
      expense.synced ?? 0,
      expense.lastUpdated,
      expense.deleted ?? 0,
    ]
  );
}

export async function softDeleteExpense(id: string, userId: string): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE expenses SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [now, id]
  );
}

// ==========================================
// UN-SYNCED GETTERS (FOR CLOUD SYNC ENGINE)
// ==========================================

export async function getUnsyncedUsers(): Promise<UserProfile[]> {
  const db = await getDB();
  return await db.getAllAsync<UserProfile>('SELECT * FROM users WHERE synced = 0');
}

export async function getUnsyncedBusinesses(): Promise<BusinessProfile[]> {
  const db = await getDB();
  return await db.getAllAsync<BusinessProfile>('SELECT * FROM businesses WHERE synced = 0');
}

export async function getUnsyncedProducts(businessIdOrUserId: string, fallbackUserId?: string): Promise<Product[]> {
  const db = await getDB();
  const bId = businessIdOrUserId;
  const uId = fallbackUserId || businessIdOrUserId;
  return await db.getAllAsync<Product>(
    'SELECT * FROM products WHERE (businessId = ? OR userId = ?) AND synced = 0',
    [bId, uId]
  );
}

export async function getUnsyncedInvoices(businessIdOrUserId: string, fallbackUserId?: string): Promise<Invoice[]> {
  const db = await getDB();
  const bId = businessIdOrUserId;
  const uId = fallbackUserId || businessIdOrUserId;
  return await db.getAllAsync<Invoice>(
    'SELECT * FROM invoices WHERE (businessId = ? OR userId = ?) AND synced = 0',
    [bId, uId]
  );
}

export async function getUnsyncedExpenses(businessIdOrUserId: string, fallbackUserId?: string): Promise<Expense[]> {
  const db = await getDB();
  const bId = businessIdOrUserId;
  const uId = fallbackUserId || businessIdOrUserId;
  return await db.getAllAsync<Expense>(
    'SELECT * FROM expenses WHERE (businessId = ? OR userId = ?) AND synced = 0',
    [bId, uId]
  );
}

export async function getUnsyncedCustomers(businessIdOrUserId: string, fallbackUserId?: string): Promise<Customer[]> {
  const db = await getDB();
  const bId = businessIdOrUserId;
  return await db.getAllAsync<Customer>(
    'SELECT * FROM customers WHERE businessId = ? AND synced = 0',
    [bId]
  );
}

export async function markUserProfileSynced(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE users SET synced = 1 WHERE id = ?', [id]);
}

export async function markBusinessProfileSynced(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE businesses SET synced = 1 WHERE id = ?', [id]);
}

export async function markProductSynced(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE products SET synced = 1 WHERE id = ?', [id]);
}

export async function markInvoiceSynced(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE invoices SET synced = 1 WHERE id = ?', [id]);
}

export async function markExpenseSynced(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE expenses SET synced = 1 WHERE id = ?', [id]);
}

export async function markCustomerSynced(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE customers SET synced = 1 WHERE id = ?', [id]);
}

export async function clearLocalBusinessData(businessId: string): Promise<void> {
  if (!businessId) return;
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM products WHERE businessId = ?', [businessId]);
    await db.runAsync('DELETE FROM invoices WHERE businessId = ?', [businessId]);
    await db.runAsync('DELETE FROM expenses WHERE businessId = ?', [businessId]);
    await db.runAsync('DELETE FROM customers WHERE businessId = ?', [businessId]);
    await db.runAsync('DELETE FROM installment_accounts WHERE businessId = ?', [businessId]);
  });
}

// ==========================================
// SYNC METADATA HELPERS
// ==========================================

export async function getSyncMetadata(key: string): Promise<string | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_metadata WHERE key = ?', [key]);
  return row ? row.value : null;
}

export async function setSyncMetadata(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'INSERT INTO sync_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

// ==========================================
// INSTALLMENTS CRUD
// ==========================================

export async function getInstallmentAccounts(businessId: string, includeDeleted = false): Promise<InstallmentAccount[]> {
  const db = await getDB();
  let query = 'SELECT * FROM installment_accounts WHERE businessId = ?';
  if (!includeDeleted) {
    query += ' AND deleted = 0';
  }
  query += ' ORDER BY nextDueDate ASC';
  return await db.getAllAsync<InstallmentAccount>(query, [businessId]);
}

export async function getInstallmentPayments(accountId: string): Promise<InstallmentPayment[]> {
  const db = await getDB();
  return await db.getAllAsync<InstallmentPayment>(
    'SELECT * FROM installment_payments WHERE accountId = ? ORDER BY paymentDate DESC',
    [accountId]
  );
}

export async function createInstallmentAccount(account: InstallmentAccount, firstPayment?: InstallmentPayment): Promise<void> {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    // Insert account
    await db.runAsync(
      `INSERT INTO installment_accounts (id, userId, businessId, createdBy, customerName, customerPhone, productName, totalAmount, downPayment, remainingAmount, monthsTenure, interestRate, monthlyEMI, nextDueDate, status, synced, lastUpdated, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.id,
        account.userId,
        account.businessId,
        account.createdBy,
        account.customerName,
        account.customerPhone,
        account.productName,
        account.totalAmount,
        account.downPayment,
        account.remainingAmount,
        account.monthsTenure,
        account.interestRate,
        account.monthlyEMI,
        account.nextDueDate,
        account.status,
        account.synced ?? 0,
        account.lastUpdated,
        account.deleted ?? 0
      ]
    );

    // If there is an initial down payment, log it
    if (firstPayment) {
      await db.runAsync(
        `INSERT INTO installment_payments (id, accountId, amountPaid, paymentDate, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [firstPayment.id, firstPayment.accountId, firstPayment.amountPaid, firstPayment.paymentDate, firstPayment.notes]
      );
    }
  });
}

export async function addInstallmentPayment(payment: InstallmentPayment, newRemainingAmount: number): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  const status = newRemainingAmount <= 0 ? 'completed' : 'active';

  await db.withTransactionAsync(async () => {
    // Log payment
    await db.runAsync(
      `INSERT INTO installment_payments (id, accountId, amountPaid, paymentDate, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [payment.id, payment.accountId, payment.amountPaid, payment.paymentDate, payment.notes]
    );

    // Update account balance, status and next due date
    const account = await db.getFirstAsync<{ nextDueDate: string }>(
      'SELECT nextDueDate FROM installment_accounts WHERE id = ?',
      [payment.accountId]
    );
    
    let nextDate = now.split('T')[0];
    if (account && account.nextDueDate) {
      const curDate = new Date(account.nextDueDate);
      curDate.setMonth(curDate.getMonth() + 1);
      nextDate = curDate.toISOString().split('T')[0];
    }

    await db.runAsync(
      `UPDATE installment_accounts 
       SET remainingAmount = ?, status = ?, nextDueDate = ?, synced = 0, lastUpdated = ? 
       WHERE id = ?`,
      [newRemainingAmount, status, nextDate, now, payment.accountId]
    );
  });
}

export async function softDeleteInstallmentAccount(id: string, userId: string): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE installment_accounts SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [now, id]
  );
}

export async function getUnsyncedInstallmentAccounts(businessIdOrUserId: string, fallbackUserId?: string): Promise<InstallmentAccount[]> {
  const db = await getDB();
  const bId = businessIdOrUserId;
  const uId = fallbackUserId || businessIdOrUserId;
  return await db.getAllAsync<InstallmentAccount>(
    'SELECT * FROM installment_accounts WHERE (businessId = ? OR userId = ?) AND synced = 0',
    [bId, uId]
  );
}

export async function markInstallmentAccountSynced(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE installment_accounts SET synced = 1 WHERE id = ?', [id]);
}

// ==========================================
// STAFF & USERS CRUD (STAFF MANAGEMENT SYSTEM)
// ==========================================

export async function getStaffMembers(businessId: string): Promise<UserProfile[]> {
  const db = await getDB();
  return await db.getAllAsync<UserProfile>(
    "SELECT * FROM users WHERE businessId = ? AND role != 'owner'",
    [businessId]
  );
}

// ==========================================
// SALARY PAYMENTS CRUD
// ==========================================

export async function getSalaryPayments(businessId: string, userId?: string): Promise<SalaryPayment[]> {
  const db = await getDB();
  if (userId) {
    return await db.getAllAsync<SalaryPayment>(
      "SELECT * FROM salary_payments WHERE businessId = ? AND userId = ? ORDER BY month DESC",
      [businessId, userId]
    );
  }
  return await db.getAllAsync<SalaryPayment>(
    "SELECT * FROM salary_payments WHERE businessId = ? ORDER BY month DESC",
    [businessId]
  );
}

export async function upsertSalaryPayment(payment: SalaryPayment): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO salary_payments (id, userId, businessId, month, amount, bonus, deduction, status, paymentDate, notes, synced, lastUpdated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       amount = excluded.amount,
       bonus = excluded.bonus,
       deduction = excluded.deduction,
       status = excluded.status,
       paymentDate = excluded.paymentDate,
       notes = excluded.notes,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated`,
    [
      payment.id,
      payment.userId,
      payment.businessId,
      payment.month,
      payment.amount,
      payment.bonus,
      payment.deduction,
      payment.status,
      payment.paymentDate || null,
      payment.notes,
      payment.synced ?? 0,
      payment.lastUpdated
    ]
  );
}

// ==========================================
// AUDIT ACTIVITY TIMELINE LOGS
// ==========================================

export async function getActivityLogs(businessId: string): Promise<ActivityLog[]> {
  const db = await getDB();
  return await db.getAllAsync<ActivityLog>(
    "SELECT * FROM activity_logs WHERE businessId = ? ORDER BY timestamp DESC LIMIT 100",
    [businessId]
  );
}

export async function insertActivityLog(log: ActivityLog): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO activity_logs (id, businessId, userId, userName, action, timestamp, synced, lastUpdated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      log.id,
      log.businessId,
      log.userId,
      log.userName,
      log.action,
      log.timestamp,
      log.synced ?? 0,
      log.lastUpdated
    ]
  );
}

// ==========================================
// CUSTOMERS
// ==========================================

export async function getCustomers(businessId: string): Promise<Customer[]> {
  const db = await getDB();
  return await db.getAllAsync<Customer>(
    'SELECT * FROM customers WHERE businessId = ? AND (deleted = 0 OR deleted IS NULL) ORDER BY name ASC',
    [businessId]
  );
}

export async function upsertCustomer(customer: Customer): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO customers (id, businessId, name, phone, address, notes, creditLimit, synced, lastUpdated, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       phone = excluded.phone,
       address = excluded.address,
       notes = excluded.notes,
       creditLimit = excluded.creditLimit,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      customer.id,
      customer.businessId,
      customer.name,
      customer.phone || '',
      customer.address || '',
      customer.notes || '',
      customer.creditLimit ?? 0,
      customer.synced ?? 0,
      customer.lastUpdated,
      customer.deleted ?? 0,
    ]
  );
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    "UPDATE customers SET deleted = 1, lastUpdated = ? WHERE id = ?",
    [new Date().toISOString(), id]
  );
}

export async function searchCustomersByPhone(businessId: string, phone: string): Promise<Customer[]> {
  const db = await getDB();
  return await db.getAllAsync<Customer>(
    "SELECT * FROM customers WHERE businessId = ? AND phone LIKE ? AND (deleted = 0 OR deleted IS NULL)",
    [businessId, `%${phone}%`]
  );
}

// ==========================================
// UDHAR / CREDIT SYSTEM
// ==========================================

export async function getCreditAccounts(businessId: string): Promise<CreditAccount[]> {
  const db = await getDB();
  return await db.getAllAsync<CreditAccount>(
    'SELECT * FROM credit_accounts WHERE businessId = ? AND (deleted = 0 OR deleted IS NULL) ORDER BY lastTransactionAt DESC',
    [businessId]
  );
}

export async function getCreditAccount(accountId: string): Promise<CreditAccount | null> {
  const db = await getDB();
  return await db.getFirstAsync<CreditAccount>(
    'SELECT * FROM credit_accounts WHERE id = ?',
    [accountId]
  );
}

export async function getCreditAccountByCustomer(businessId: string, customerId: string): Promise<CreditAccount | null> {
  const db = await getDB();
  return await db.getFirstAsync<CreditAccount>(
    'SELECT * FROM credit_accounts WHERE businessId = ? AND customerId = ? AND (deleted = 0 OR deleted IS NULL)',
    [businessId, customerId]
  );
}

export async function upsertCreditAccount(account: CreditAccount): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO credit_accounts (id, businessId, customerId, customerName, customerPhone, totalDebit, totalCredit, balance, lastTransactionAt, synced, lastUpdated, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       customerName = excluded.customerName,
       customerPhone = excluded.customerPhone,
       totalDebit = excluded.totalDebit,
       totalCredit = excluded.totalCredit,
       balance = excluded.balance,
       lastTransactionAt = excluded.lastTransactionAt,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      account.id,
      account.businessId,
      account.customerId,
      account.customerName,
      account.customerPhone,
      account.totalDebit,
      account.totalCredit,
      account.balance,
      account.lastTransactionAt,
      account.synced ?? 0,
      account.lastUpdated,
      account.deleted ?? 0,
    ]
  );
}

export async function addCreditTransaction(tx: CreditTransaction, account: CreditAccount): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();

  // Insert the transaction
  await db.runAsync(
    `INSERT INTO credit_transactions (id, accountId, businessId, type, amount, description, createdAt, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tx.id, tx.accountId, tx.businessId, tx.type, tx.amount, tx.description || '', tx.createdAt, tx.createdBy]
  );

  // Recalculate running balance
  const newDebit = tx.type === 'debit' ? account.totalDebit + tx.amount : account.totalDebit;
  const newCredit = tx.type === 'credit' ? account.totalCredit + tx.amount : account.totalCredit;
  const newBalance = newDebit - newCredit;

  await db.runAsync(
    `UPDATE credit_accounts SET totalDebit = ?, totalCredit = ?, balance = ?, lastTransactionAt = ?, lastUpdated = ? WHERE id = ?`,
    [newDebit, newCredit, newBalance, now, now, account.id]
  );
}

export async function getCreditTransactions(accountId: string): Promise<CreditTransaction[]> {
  const db = await getDB();
  return await db.getAllAsync<CreditTransaction>(
    'SELECT * FROM credit_transactions WHERE accountId = ? ORDER BY createdAt DESC',
    [accountId]
  );
}

export async function getTotalOutstandingBalance(businessId: string): Promise<number> {
  const db = await getDB();
  const result = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(balance), 0) as total FROM credit_accounts WHERE businessId = ? AND (deleted = 0 OR deleted IS NULL) AND balance > 0',
    [businessId]
  );
  return result?.total ?? 0;
}

// ==========================================
// QUICK PIN CODE MANAGEMENT
// ==========================================

export async function setUserPin(userId: string, pin: string): Promise<void> {
  const db = await getDB();
  const cleanPin = pin.trim();
  
  // Remove any old reverse lookup for this user
  const oldPin = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    [`pin_${userId}`]
  );
  if (oldPin && oldPin.value) {
    await db.runAsync('DELETE FROM sync_metadata WHERE key = ?', [`user_by_pin_${oldPin.value}`]);
  }

  // Store user PIN
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    [`pin_${userId}`, cleanPin]
  );
  // Store reverse lookup for quick login
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    [`user_by_pin_${cleanPin}`, userId]
  );
}

export async function getUserPin(userId: string): Promise<string> {
  const db = await getDB();
  const res = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    [`pin_${userId}`]
  );
  if (res && res.value) return res.value;
  return '';
}

export async function loginWithQuickPin(pin: string): Promise<UserSessionCombined | null> {
  const cleanPin = pin.trim();
  if (!cleanPin || cleanPin.length !== 4) return null;
  const db = await getDB();

  // 1. Direct reverse lookup in metadata
  const reverseLookup = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    [`user_by_pin_${cleanPin}`]
  );
  if (reverseLookup && reverseLookup.value) {
    const profile = await getUserProfileCombined(reverseLookup.value);
    if (profile) return profile;
  }

  // 2. Search through all user profiles for a matching PIN
  const allUsers = await getAllUserProfiles();
  for (const u of allUsers) {
    const userPinRes = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM sync_metadata WHERE key = ?',
      [`pin_${u.id}`]
    );
    if (userPinRes && userPinRes.value === cleanPin) {
      const profile = await getUserProfileCombined(u.id);
      if (profile) return profile;
    }
  }

  // Strict security: No hardcoded fallback.
  // If the entered PIN was not configured by any registered user or staff, reject it.
  return null;
}

// ==========================================
// USER TOUR ONBOARDING STATUS
// ==========================================

export interface UserTourStatusRecord {
  userId: string;
  status: 'completed' | 'skipped' | 'not_started';
  version: string;
  completedAt?: string;
  skippedAt?: string;
  updatedAt?: string;
}

export async function getUserTourStatus(userId: string): Promise<UserTourStatusRecord | null> {
  if (!userId) return null;
  const db = await getDB();
  const row = await db.getFirstAsync<UserTourStatusRecord>(
    'SELECT * FROM user_tour_status WHERE userId = ?',
    [userId]
  );
  if (!row) return null;
  return row;
}

export async function setUserTourStatus(
  userId: string,
  status: 'completed' | 'skipped',
  version: string = '2.0'
): Promise<void> {
  if (!userId) return;
  const db = await getDB();
  const now = new Date().toISOString();
  const completedAt = status === 'completed' ? now : null;
  const skippedAt = status === 'skipped' ? now : null;

  await db.runAsync(
    `INSERT INTO user_tour_status (userId, status, version, completedAt, skippedAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET
       status = excluded.status,
       version = excluded.version,
       completedAt = COALESCE(excluded.completedAt, user_tour_status.completedAt),
       skippedAt = COALESCE(excluded.skippedAt, user_tour_status.skippedAt),
       updatedAt = excluded.updatedAt`,
    [userId, status, version, completedAt, skippedAt, now]
  );
}


