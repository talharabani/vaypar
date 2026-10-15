/**
 * Tailor Module — SQLite service
 * Tables: tailor_orders, tailor_measurements
 */
import { getDB } from './sqlite';
import { createNotification } from './notificationService';

export type OrderStatus = 'pending' | 'cutting' | 'stitching' | 'trial' | 'ready' | 'delivered' | 'cancelled';

export interface TailorMeasurement {
  chest?: number;
  waist?: number;
  hips?: number;
  shoulder?: number;
  sleeveLength?: number;
  shirtLength?: number;
  troserLength?: number;
  troserWaist?: number;
  neck?: number;
  shalwarLength?: number;
  kameezLength?: number;
  notes?: string;
}

export interface TailorOrder {
  id: string;
  businessId: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  // Item details
  itemType: string;           // e.g. Shalwar Kameez, Pant Coat, Abaya, etc.
  quantity: number;
  fabric?: string;
  color?: string;
  design?: string;
  // Measurements stored as JSON
  measurements: string;       // JSON of TailorMeasurement
  // Financials
  totalPrice: number;
  advancePaid: number;
  balanceDue: number;
  // Schedule
  orderDate: string;
  deliveryDate: string;
  trialDate?: string;
  // Status
  status: OrderStatus;
  notes?: string;
  createdBy: string;
  lastUpdated: string;
  deleted?: number;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initTailorTables(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tailor_orders (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      orderNumber INTEGER DEFAULT 0,
      customerName TEXT NOT NULL,
      customerPhone TEXT,
      itemType TEXT,
      quantity INTEGER DEFAULT 1,
      fabric TEXT,
      color TEXT,
      design TEXT,
      measurements TEXT DEFAULT '{}',
      totalPrice REAL DEFAULT 0,
      advancePaid REAL DEFAULT 0,
      balanceDue REAL DEFAULT 0,
      orderDate TEXT,
      deliveryDate TEXT,
      trialDate TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      createdBy TEXT,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );
  `);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getTailorOrders(businessId: string, status?: OrderStatus): Promise<TailorOrder[]> {
  const db = await getDB();
  if (status) {
    return db.getAllAsync<TailorOrder>(
      'SELECT * FROM tailor_orders WHERE businessId = ? AND status = ? AND (deleted=0 OR deleted IS NULL) ORDER BY orderNumber DESC',
      [businessId, status]
    );
  }
  return db.getAllAsync<TailorOrder>(
    'SELECT * FROM tailor_orders WHERE businessId = ? AND (deleted=0 OR deleted IS NULL) ORDER BY orderNumber DESC',
    [businessId]
  );
}

export async function getTailorOrder(id: string): Promise<TailorOrder | null> {
  const db = await getDB();
  return db.getFirstAsync<TailorOrder>('SELECT * FROM tailor_orders WHERE id = ?', [id]);
}

export async function getNextOrderNumber(businessId: string): Promise<number> {
  const db = await getDB();
  const r = await db.getFirstAsync<{ max: number }>(
    'SELECT COALESCE(MAX(orderNumber),0)+1 as max FROM tailor_orders WHERE businessId = ?',
    [businessId]
  );
  return r?.max ?? 1;
}

export async function upsertTailorOrder(order: TailorOrder): Promise<void> {
  const db = await getDB();
  const prev = await getTailorOrder(order.id);
  await db.runAsync(
    `INSERT INTO tailor_orders (
       id, businessId, orderNumber, customerName, customerPhone,
       itemType, quantity, fabric, color, design, measurements,
       totalPrice, advancePaid, balanceDue, orderDate, deliveryDate, trialDate,
       status, notes, createdBy, lastUpdated, deleted
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       customerName=excluded.customerName, customerPhone=excluded.customerPhone,
       itemType=excluded.itemType, quantity=excluded.quantity,
       fabric=excluded.fabric, color=excluded.color, design=excluded.design,
       measurements=excluded.measurements, totalPrice=excluded.totalPrice,
       advancePaid=excluded.advancePaid, balanceDue=excluded.balanceDue,
       orderDate=excluded.orderDate, deliveryDate=excluded.deliveryDate,
       trialDate=excluded.trialDate, status=excluded.status,
       notes=excluded.notes, lastUpdated=excluded.lastUpdated,
       deleted=excluded.deleted`,
    [
      order.id, order.businessId, order.orderNumber,
      order.customerName, order.customerPhone,
      order.itemType, order.quantity, order.fabric ?? '', order.color ?? '', order.design ?? '',
      order.measurements, order.totalPrice, order.advancePaid, order.balanceDue,
      order.orderDate, order.deliveryDate, order.trialDate ?? '',
      order.status, order.notes ?? '', order.createdBy, order.lastUpdated, order.deleted ?? 0,
    ]
  );
  
  if (order.status === 'delivered' && (!prev || prev.status !== 'delivered')) {
    await createNotification(
      order.businessId,
      'tailor_dress_delivered',
      'Dress Delivered',
      `Order #${order.orderNumber} for ${order.customerName} has been delivered.`
    );
  }
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE tailor_orders SET status = ?, lastUpdated = ? WHERE id = ?',
    [status, new Date().toISOString(), id]
  );
  if (status === 'delivered') {
    const order = await getTailorOrder(id);
    if (order) {
      await createNotification(
        order.businessId,
        'tailor_dress_delivered',
        'Dress Delivered',
        `Order #${order.orderNumber} for ${order.customerName} has been delivered.`
      );
    }
  }
}

export async function deleteTailorOrder(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE tailor_orders SET deleted = 1, lastUpdated = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface TailorStats {
  pending: number;
  inProgress: number;
  readyToDeliver: number;
  deliveredToday: number;
  totalRevenue: number;
  pendingBalance: number;
}

export async function getTailorStats(businessId: string): Promise<TailorStats> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];
  const [pending, inProg, ready, delivered, revenue, balance] = await Promise.all([
    db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM tailor_orders WHERE businessId=? AND status='pending' AND (deleted=0 OR deleted IS NULL)`, [businessId]),
    db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM tailor_orders WHERE businessId=? AND status IN ('cutting','stitching') AND (deleted=0 OR deleted IS NULL)`, [businessId]),
    db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM tailor_orders WHERE businessId=? AND status IN ('trial','ready') AND (deleted=0 OR deleted IS NULL)`, [businessId]),
    db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM tailor_orders WHERE businessId=? AND status='delivered' AND deliveryDate LIKE ? AND (deleted=0 OR deleted IS NULL)`, [businessId, `${today}%`]),
    db.getFirstAsync<{ total: number }>(`SELECT COALESCE(SUM(totalPrice),0) as total FROM tailor_orders WHERE businessId=? AND status='delivered' AND (deleted=0 OR deleted IS NULL)`, [businessId]),
    db.getFirstAsync<{ total: number }>(`SELECT COALESCE(SUM(balanceDue),0) as total FROM tailor_orders WHERE businessId=? AND status NOT IN ('delivered','cancelled') AND (deleted=0 OR deleted IS NULL)`, [businessId]),
  ]);
  return {
    pending: pending?.c ?? 0,
    inProgress: inProg?.c ?? 0,
    readyToDeliver: ready?.c ?? 0,
    deliveredToday: delivered?.c ?? 0,
    totalRevenue: revenue?.total ?? 0,
    pendingBalance: balance?.total ?? 0,
  };
}

export const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; next?: OrderStatus; icon: string }> = {
  pending:    { label: 'Pending',     color: '#6B7280', next: 'cutting',   icon: 'hourglass-outline' },
  cutting:    { label: 'Cutting',     color: '#F59E0B', next: 'stitching', icon: 'cut-outline' },
  stitching:  { label: 'Stitching',   color: '#3B82F6', next: 'trial',     icon: 'shirt-outline' },
  trial:      { label: 'Trial',       color: '#8B5CF6', next: 'ready',     icon: 'person-outline' },
  ready:      { label: 'Ready',       color: '#22C55E', next: 'delivered', icon: 'checkmark-circle-outline' },
  delivered:  { label: 'Delivered',   color: '#10B981', icon: 'bag-check-outline' },
  cancelled:  { label: 'Cancelled',   color: '#EF4444', icon: 'close-circle-outline' },
};

export const ITEM_TYPES = [
  'Shalwar Kameez', 'Pant Coat', 'Waistcoat', 'Pant Shirt',
  'Sherwani', 'Kameez', 'Trouser', 'Abaya', 'Frock',
  'Dupatta', 'Shalwar', 'Other',
];
