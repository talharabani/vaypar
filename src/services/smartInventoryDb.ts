import { getDB } from './sqlite';

export interface InventoryLocation {
  id: string;
  businessId: string;
  name: string;
  address: string;
}

export interface InventoryBatch {
  id: string;
  productId: string;
  businessId: string;
  batchCode: string;
  locationId: string;
  locationName: string;
  quantity: number;
  costPrice: number;
  expiryDate: string; // YYYY-MM-DD
  receivedDate: string; // YYYY-MM-DD
}

export interface SupplierItem {
  id: string;
  productId: string;
  supplierName: string;
  price: number;
  deliveryDays: number;
  lastUpdated: string;
}

// ─── Initialize Inventory Schema ─────────────────────────────────────────────
export async function initInventoryTables(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS inventory_locations (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS inventory_batches (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      businessId TEXT NOT NULL,
      batchCode TEXT NOT NULL,
      locationId TEXT NOT NULL,
      locationName TEXT DEFAULT '',
      quantity INTEGER DEFAULT 0,
      costPrice REAL DEFAULT 0,
      expiryDate TEXT DEFAULT '',
      receivedDate TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS inventory_supplier_prices (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      supplierName TEXT NOT NULL,
      price REAL DEFAULT 0,
      deliveryDays INTEGER DEFAULT 3,
      lastUpdated TEXT
    );
  `);
}

// ─── Location CRUD ───────────────────────────────────────────────────────────
export async function getLocations(businessId: string): Promise<InventoryLocation[]> {
  const db = await getDB();
  return db.getAllAsync<InventoryLocation>(
    'SELECT * FROM inventory_locations WHERE businessId = ? ORDER BY name',
    [businessId]
  );
}

export async function addLocation(businessId: string, name: string, address: string): Promise<void> {
  const db = await getDB();
  const id = 'loc_' + Math.random().toString(36).substring(2, 9);
  await db.runAsync(
    'INSERT INTO inventory_locations (id, businessId, name, address) VALUES (?, ?, ?, ?)',
    [id, businessId, name, address]
  );
}

// ─── Batch CRUD ──────────────────────────────────────────────────────────────
export async function getBatches(businessId: string, productId?: string): Promise<InventoryBatch[]> {
  const db = await getDB();
  if (productId) {
    return db.getAllAsync<InventoryBatch>(
      'SELECT * FROM inventory_batches WHERE businessId = ? AND productId = ? ORDER BY expiryDate ASC',
      [businessId, productId]
    );
  }
  return db.getAllAsync<InventoryBatch>(
    'SELECT * FROM inventory_batches WHERE businessId = ? ORDER BY expiryDate ASC',
    [businessId]
  );
}

export async function addBatch(batch: Omit<InventoryBatch, 'id'>): Promise<void> {
  const db = await getDB();
  const id = 'bat_' + Math.random().toString(36).substring(2, 9);
  await db.runAsync(
    `INSERT INTO inventory_batches (id, productId, businessId, batchCode, locationId, locationName, quantity, costPrice, expiryDate, receivedDate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, batch.productId, batch.businessId, batch.batchCode, batch.locationId,
      batch.locationName, batch.quantity, batch.costPrice, batch.expiryDate, batch.receivedDate
    ]
  );

  // Update total main product stock automatically
  await db.runAsync(
    'UPDATE products SET quantity = quantity + ?, synced = 0, lastUpdated = ? WHERE id = ?',
    [batch.quantity, new Date().toISOString(), batch.productId]
  );
}

// ─── Supplier Price Comparisons ──────────────────────────────────────────────
export async function getSupplierPrices(productId: string): Promise<SupplierItem[]> {
  const db = await getDB();
  return db.getAllAsync<SupplierItem>(
    'SELECT * FROM inventory_supplier_prices WHERE productId = ? ORDER BY price ASC',
    [productId]
  );
}

export async function addSupplierPrice(item: Omit<SupplierItem, 'id' | 'lastUpdated'>): Promise<void> {
  const db = await getDB();
  const id = 'sup_' + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO inventory_supplier_prices (id, productId, supplierName, price, deliveryDays, lastUpdated)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, item.productId, item.supplierName, item.price, item.deliveryDays, now]
  );
}

// ─── Seeding Seed data helper ───────────────────────────────────────────────
export async function seedSmartInventory(businessId: string): Promise<void> {
  const now = new Date().toISOString();
  
  // Seed locations
  await addLocation(businessId, 'Main Warehouse (Karachi)', 'S.I.T.E Area, Karachi');
  await addLocation(businessId, 'Clifton Outlet Store', 'DHA Phase 6, Karachi');
  
  const locs = await getLocations(businessId);
  if (locs.length > 0) {
    const loc = locs[0];
    
    // Fetch products to seed batches for
    const db = await getDB();
    const products = await db.getAllAsync<{ id: string }>('SELECT id FROM products LIMIT 5');
    
    for (const p of products) {
      // Seed Batches
      await addBatch({
        productId: p.id,
        businessId,
        batchCode: 'BAT-2026A',
        locationId: loc.id,
        locationName: loc.name,
        quantity: 50,
        costPrice: 120,
        expiryDate: '2027-08-30',
        receivedDate: now.split('T')[0]
      });

      // Seed Supplier price matrices
      await addSupplierPrice({
        productId: p.id,
        supplierName: 'Al-Haq Wholesale Distributors',
        price: 110,
        deliveryDays: 2
      });
      await addSupplierPrice({
        productId: p.id,
        supplierName: 'Punjab Mega Traders',
        price: 115,
        deliveryDays: 4
      });
    }
  }
}
