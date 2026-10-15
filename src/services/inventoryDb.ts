import { getDB } from './sqlite';

export interface MedicineBatch {
  id: string;
  businessId: string;
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  quantity: number;
  purchasePrice: number;
  manufacturer: string;
  lastUpdated: string;
  deleted?: number;
}

export interface PharmacyStats {
  totalProducts: number;
  expiringIn30Days: number;
  expiredBatches: number;
  todaySales: number;
}

// ─── Initialize Schema ───────────────────────────────────────────────────────
export async function initInventoryTables(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS medicine_batches (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      batchNumber TEXT NOT NULL,
      expiryDate TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      purchasePrice REAL DEFAULT 0,
      manufacturer TEXT DEFAULT '',
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );
  `);
}

// ─── Stats Logic ─────────────────────────────────────────────────────────────
export async function getPharmacyStats(businessId: string): Promise<PharmacyStats> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];

  const totalProds = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(DISTINCT productId) as count FROM medicine_batches WHERE businessId = ? AND deleted = 0",
    [businessId]
  );

  // Expiring in 30 days
  const date30 = new Date();
  date30.setDate(date30.getDate() + 30);
  const date30Str = date30.toISOString().split('T')[0];

  const expiring30 = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM medicine_batches WHERE businessId = ? AND expiryDate >= ? AND expiryDate <= ? AND deleted = 0",
    [businessId, today, date30Str]
  );

  // Expired
  const expired = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM medicine_batches WHERE businessId = ? AND expiryDate < ? AND deleted = 0",
    [businessId, today]
  );

  // Today Sales
  const sales = await db.getFirstAsync<{ total: number | null }>(
    "SELECT SUM(total) as total FROM invoices WHERE businessId = ? AND DATE(createdAt) = ? AND deleted = 0",
    [businessId, today]
  );

  return {
    totalProducts: totalProds?.count ?? 0,
    expiringIn30Days: expiring30?.count ?? 0,
    expiredBatches: expired?.count ?? 0,
    todaySales: sales?.total ?? 0,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────
export async function getExpiringBatches(businessId: string, limitDays = 90): Promise<MedicineBatch[]> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + limitDays);
  const targetDateStr = targetDate.toISOString().split('T')[0];

  return db.getAllAsync<MedicineBatch>(
    `SELECT * FROM medicine_batches 
     WHERE businessId = ? AND deleted = 0 
     ORDER BY expiryDate ASC`,
    [businessId]
  );
}

export async function upsertMedicineBatch(batch: MedicineBatch): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO medicine_batches (id, businessId, productId, productName, batchNumber, expiryDate, quantity, purchasePrice, manufacturer, lastUpdated, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       productName = excluded.productName,
       batchNumber = excluded.batchNumber,
       expiryDate = excluded.expiryDate,
       quantity = excluded.quantity,
       purchasePrice = excluded.purchasePrice,
       manufacturer = excluded.manufacturer,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      batch.id, batch.businessId, batch.productId, batch.productName,
      batch.batchNumber, batch.expiryDate, batch.quantity, batch.purchasePrice,
      batch.manufacturer, batch.lastUpdated, batch.deleted ?? 0
    ]
  );
}

// ─── Helper Functions ────────────────────────────────────────────────────────
export function expiryDaysLeft(expiryDateStr: string): number {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDateStr);
    exp.setHours(0, 0, 0, 0);
    const diff = exp.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

export function expiryColor(daysLeft: number): string {
  if (daysLeft < 0) return '#EF4444'; // Expired (Red)
  if (daysLeft <= 30) return '#F59E0B'; // Near Expiry (Yellow)
  return '#10B981'; // Safe (Green)
}
