import { getDB } from './sqlite';

export interface CrmCustomer {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  birthday: string; // YYYY-MM-DD
  notes: string;
  tags: string; // Comma-separated tags e.g., "VIP, Regular, Local"
  rating: number; // 1 to 5 stars
  isVip: number; // 0 or 1
  loyaltyPoints: number;
  favoriteProductIds: string; // Comma-separated product IDs
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface WhatsappLog {
  id: string;
  customerId: string;
  businessId: string;
  sender: 'business' | 'customer';
  message: string;
  timestamp: string;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  businessId: string;
  points: number; // Positive for earned, negative for redeemed
  description: string;
  timestamp: string;
}

// ─── Initialize CRM Schema ──────────────────────────────────────────────────
export async function initCrmTables(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS crm_customers (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      birthday TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      rating INTEGER DEFAULT 5,
      isVip INTEGER DEFAULT 0,
      loyaltyPoints INTEGER DEFAULT 0,
      favoriteProductIds TEXT DEFAULT '',
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS crm_whatsapp_logs (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      businessId TEXT NOT NULL,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crm_loyalty_transactions (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      businessId TEXT NOT NULL,
      points INTEGER NOT NULL,
      description TEXT DEFAULT '',
      timestamp TEXT NOT NULL
    );
  `);
}

// ─── CRUD Operations for CRM Customers ──────────────────────────────────────
export async function getCrmCustomers(businessId: string): Promise<CrmCustomer[]> {
  const db = await getDB();
  return db.getAllAsync<CrmCustomer>(
    'SELECT * FROM crm_customers WHERE businessId = ? AND deleted = 0 ORDER BY name ASC',
    [businessId]
  );
}

export async function getCrmCustomerById(id: string): Promise<CrmCustomer | null> {
  const db = await getDB();
  return db.getFirstAsync<CrmCustomer>(
    'SELECT * FROM crm_customers WHERE id = ?',
    [id]
  );
}

export async function upsertCrmCustomer(customer: CrmCustomer): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO crm_customers (id, businessId, name, phone, email, address, birthday, notes, tags, rating, isVip, loyaltyPoints, favoriteProductIds, synced, lastUpdated, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       phone = excluded.phone,
       email = excluded.email,
       address = excluded.address,
       birthday = excluded.birthday,
       notes = excluded.notes,
       tags = excluded.tags,
       rating = excluded.rating,
       isVip = excluded.isVip,
       loyaltyPoints = excluded.loyaltyPoints,
       favoriteProductIds = excluded.favoriteProductIds,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      customer.id, customer.businessId, customer.name, customer.phone,
      customer.email, customer.address, customer.birthday, customer.notes,
      customer.tags, customer.rating, customer.isVip, customer.loyaltyPoints,
      customer.favoriteProductIds, customer.synced ?? 0, customer.lastUpdated,
      customer.deleted ?? 0
    ]
  );
}

export async function deleteCrmCustomer(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE crm_customers SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

// ─── WhatsApp Simulated logs CRUD ───────────────────────────────────────────
export async function getWhatsappLogs(customerId: string): Promise<WhatsappLog[]> {
  const db = await getDB();
  return db.getAllAsync<WhatsappLog>(
    'SELECT * FROM crm_whatsapp_logs WHERE customerId = ? ORDER BY timestamp ASC',
    [customerId]
  );
}

export async function logWhatsappMessage(
  customerId: string,
  businessId: string,
  sender: 'business' | 'customer',
  message: string
): Promise<void> {
  const db = await getDB();
  const id = 'msg_' + Math.random().toString(36).substring(2, 11);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO crm_whatsapp_logs (id, customerId, businessId, sender, message, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, customerId, businessId, sender, message, now]
  );
}

// ─── Loyalty Points Transactions ─────────────────────────────────────────────
export async function getLoyaltyTransactions(customerId: string): Promise<LoyaltyTransaction[]> {
  const db = await getDB();
  return db.getAllAsync<LoyaltyTransaction>(
    'SELECT * FROM crm_loyalty_transactions WHERE customerId = ? ORDER BY timestamp DESC',
    [customerId]
  );
}

export async function addLoyaltyPoints(
  customerId: string,
  businessId: string,
  points: number,
  description: string
): Promise<void> {
  const db = await getDB();
  const id = 'lt_' + Math.random().toString(36).substring(2, 11);
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO crm_loyalty_transactions (id, customerId, businessId, points, description, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, customerId, businessId, points, description, now]
  );

  // Update customer loyalty total
  await db.runAsync(
    'UPDATE crm_customers SET loyaltyPoints = loyaltyPoints + ?, synced = 0, lastUpdated = ? WHERE id = ?',
    [points, now, customerId]
  );
}

// ─── Seeding Seed data helper ───────────────────────────────────────────────
export async function seedCrmCustomers(businessId: string): Promise<void> {
  const now = new Date().toISOString();
  const c = [
    {
      id: `crm_${businessId}_1`,
      businessId,
      name: 'Ahmed Khan',
      phone: '+92 300 1234567',
      email: 'ahmed@email.com',
      address: 'Gulshan-e-Iqbal, Karachi',
      birthday: '1992-08-15',
      notes: 'Prefers fast delivery. Always buys premium items.',
      tags: 'VIP, Repeat Customer',
      rating: 5,
      isVip: 1,
      loyaltyPoints: 350,
      favoriteProductIds: '',
      lastUpdated: now
    },
    {
      id: `crm_${businessId}_2`,
      businessId,
      name: 'Zainab Bibi',
      phone: '+92 312 9876543',
      email: 'zainab@email.com',
      address: 'DHA Phase 5, Lahore',
      birthday: '1995-12-04',
      notes: 'Frequently requests discount.',
      tags: 'Regular, Local',
      rating: 4,
      isVip: 0,
      loyaltyPoints: 120,
      favoriteProductIds: '',
      lastUpdated: now
    }
  ];

  for (const customer of c) {
    await upsertCrmCustomer({
      ...customer,
      deleted: 0,
      synced: 0
    });
    
    // Seed initial WhatsApp logs
    await logWhatsappMessage(customer.id, businessId, 'customer', 'Aslam o Alaikum, is my order confirmed?');
    await logWhatsappMessage(customer.id, businessId, 'business', 'Walaikum Assalam, yes we have processed it!');
  }
}
