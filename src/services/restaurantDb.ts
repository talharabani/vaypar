import { getDB } from './sqlite';
import { createNotification } from './notificationService';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TableStatus =
  | 'available'
  | 'occupied'
  | 'waiting_kitchen'
  | 'food_ready'
  | 'needs_attention';

export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';

export type KitchenStation =
  | 'grill'
  | 'pizza'
  | 'chinese'
  | 'bar'
  | 'dessert'
  | 'general';

export type OrderCourse = 'starter' | 'main' | 'dessert' | 'drinks';
export type Priority = 'vip' | 'normal' | 'express';
export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';
export type ItemStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'served';

export interface RestaurantTable {
  id: string;
  businessId: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  priority: Priority;
  currentSessionId: string | null;
  seatedAt: string | null;
  lastUpdated: string;
  synced: number;
}

export interface TableSession {
  id: string;
  tableId: string;
  businessId: string;
  openedAt: string;
  closedAt: string | null;
  guestCount: number;
  waiterId: string;
  totalAmount: number;
  events: string; // JSON array of { timestamp, event }
}

export interface RestaurantOrder {
  id: string;
  businessId: string;
  tableId: string;
  sessionId: string;
  waiterId: string;
  waiterName: string;
  status: OrderStatus;
  priority: Priority;
  course: OrderCourse;
  notes: string;
  createdAt: string;
  kitchenReceivedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  estimatedMinutes: number;
  lastUpdated: string;
  synced: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  status: ItemStatus;
  kitchenStation: KitchenStation;
  estimatedMinutes: number;
  modifiers: string; // JSON string[]
  course: OrderCourse;
  changeType: ChangeType;
  lastUpdated: string;
}

export interface RestaurantMenuItem {
  id: string;
  businessId: string;
  productId: string;
  productName: string;
  price: number;
  kitchenStation: KitchenStation;
  estimatedMinutes: number;
  course: OrderCourse;
  isAvailable: number; // 0 or 1
  isFavorite: number; // 0 or 1
  modifiersConfig: string; // JSON string
  category: string; // From global products
  lastUpdated: string;
}

export interface OrderHistory {
  id: string;
  tableId: string;
  businessId: string;
  tableNumber: string;
  snapshotJson: string; // full order + items JSON
  closedAt: string;
  totalAmount: number;
}

// ─── Schema Init ─────────────────────────────────────────────────────────────

export async function initRestaurantSchema(): Promise<void> {
  const db = await getDB();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      tableNumber TEXT NOT NULL,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available',
      priority TEXT DEFAULT 'normal',
      currentSessionId TEXT,
      seatedAt TEXT,
      lastUpdated TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS table_sessions (
      id TEXT PRIMARY KEY,
      tableId TEXT NOT NULL,
      businessId TEXT NOT NULL,
      openedAt TEXT NOT NULL,
      closedAt TEXT,
      guestCount INTEGER DEFAULT 1,
      waiterId TEXT NOT NULL,
      totalAmount REAL DEFAULT 0,
      events TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS restaurant_orders (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      tableId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      waiterId TEXT NOT NULL,
      waiterName TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      priority TEXT DEFAULT 'normal',
      course TEXT DEFAULT 'main',
      notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL,
      kitchenReceivedAt TEXT,
      preparingAt TEXT,
      readyAt TEXT,
      servedAt TEXT,
      estimatedMinutes INTEGER DEFAULT 15,
      lastUpdated TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
      kitchenStation TEXT DEFAULT 'general',
      estimatedMinutes INTEGER DEFAULT 10,
      modifiers TEXT DEFAULT '[]',
      course TEXT DEFAULT 'main',
      changeType TEXT DEFAULT 'unchanged',
      lastUpdated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS restaurant_menu_items (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      price REAL DEFAULT 0,
      kitchenStation TEXT DEFAULT 'general',
      estimatedMinutes INTEGER DEFAULT 10,
      course TEXT DEFAULT 'main',
      isAvailable INTEGER DEFAULT 1,
      lastUpdated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_history (
      id TEXT PRIMARY KEY,
      tableId TEXT NOT NULL,
      businessId TEXT NOT NULL,
      tableNumber TEXT NOT NULL,
      snapshotJson TEXT NOT NULL,
      closedAt TEXT NOT NULL,
      totalAmount REAL DEFAULT 0
    );
  `);

  // Migrations for restaurant_menu_items (isFavorite, modifiersConfig)
  try {
    const cols = await db.getAllAsync<{name: string}>('PRAGMA table_info(restaurant_menu_items)');
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('isFavorite')) {
      await db.execAsync('ALTER TABLE restaurant_menu_items ADD COLUMN isFavorite INTEGER DEFAULT 0;');
    }
    if (!colNames.includes('modifiersConfig')) {
      await db.execAsync("ALTER TABLE restaurant_menu_items ADD COLUMN modifiersConfig TEXT DEFAULT '[]';");
    }
  } catch (err) {
    console.warn('Migration error for restaurant_menu_items:', err);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uuid(): string {
  return 'roms-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

function now(): string {
  return new Date().toISOString();
}

function broadcastSync() {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    const channel = new BroadcastChannel('restaurant_sync');
    channel.postMessage('update');
    channel.close();
  }
}

// ─── Tables CRUD ─────────────────────────────────────────────────────────────

export async function getTables(businessId: string): Promise<RestaurantTable[]> {
  const db = await getDB();
  return db.getAllAsync<RestaurantTable>(
    'SELECT * FROM restaurant_tables WHERE businessId = ? ORDER BY tableNumber ASC',
    [businessId]
  );
}

export async function createTable(
  businessId: string,
  tableNumber: string,
  capacity: number,
  priority: Priority = 'normal'
): Promise<RestaurantTable> {
  const db = await getDB();
  const table: RestaurantTable = {
    id: uuid(),
    businessId,
    tableNumber,
    capacity,
    status: 'available',
    priority,
    currentSessionId: null,
    seatedAt: null,
    lastUpdated: now(),
    synced: 0,
  };
  await db.runAsync(
    `INSERT INTO restaurant_tables (id, businessId, tableNumber, capacity, status, priority, currentSessionId, seatedAt, lastUpdated, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [table.id, table.businessId, table.tableNumber, table.capacity, table.status, table.priority, table.currentSessionId, table.seatedAt, table.lastUpdated, table.synced]
  );
  return table;
}

export async function updateTableStatus(
  tableId: string,
  status: TableStatus,
  extra?: { currentSessionId?: string | null; seatedAt?: string | null }
): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE restaurant_tables SET status = ?, currentSessionId = COALESCE(?, currentSessionId), seatedAt = COALESCE(?, seatedAt), lastUpdated = ? WHERE id = ?`,
    [status, extra?.currentSessionId ?? null, extra?.seatedAt ?? null, now(), tableId]
  );

  if (status === 'needs_attention') {
    const table = await db.getFirstAsync<RestaurantTable>('SELECT * FROM restaurant_tables WHERE id = ?', [tableId]);
    if (table) {
      await createNotification(
        table.businessId,
        'restaurant_waiter_called',
        'Waiter Called',
        `Table #${table.tableNumber} is requesting waiter assistance.`
      );
    }
  }
}

export async function deleteTable(tableId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM restaurant_tables WHERE id = ?', [tableId]);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function openSession(
  tableId: string,
  businessId: string,
  waiterId: string,
  guestCount: number
): Promise<TableSession> {
  const db = await getDB();
  const session: TableSession = {
    id: uuid(),
    tableId,
    businessId,
    openedAt: now(),
    closedAt: null,
    guestCount,
    waiterId,
    totalAmount: 0,
    events: JSON.stringify([{ timestamp: now(), event: 'Customer Seated' }]),
  };
  await db.runAsync(
    `INSERT INTO table_sessions (id, tableId, businessId, openedAt, closedAt, guestCount, waiterId, totalAmount, events)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [session.id, session.tableId, session.businessId, session.openedAt, session.closedAt, session.guestCount, session.waiterId, session.totalAmount, session.events]
  );
  await updateTableStatus(tableId, 'occupied', { currentSessionId: session.id, seatedAt: session.openedAt });
  return session;
}

export async function appendSessionEvent(sessionId: string, event: string): Promise<void> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ events: string }>('SELECT events FROM table_sessions WHERE id = ?', [sessionId]);
  if (!row) return;
  const events = JSON.parse(row.events);
  events.push({ timestamp: now(), event });
  await db.runAsync('UPDATE table_sessions SET events = ? WHERE id = ?', [JSON.stringify(events), sessionId]);
}

export async function closeSession(sessionId: string, tableId: string, totalAmount: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE table_sessions SET closedAt = ?, totalAmount = ? WHERE id = ?',
    [now(), totalAmount, sessionId]
  );
  await db.runAsync(
    `UPDATE restaurant_tables SET status = 'available', currentSessionId = NULL, seatedAt = NULL, lastUpdated = ? WHERE id = ?`,
    [now(), tableId]
  );
}

export async function getSession(sessionId: string): Promise<TableSession | null> {
  const db = await getDB();
  return db.getFirstAsync<TableSession>('SELECT * FROM table_sessions WHERE id = ?', [sessionId]);
}

export async function getTableSessions(tableId: string, limit = 10): Promise<TableSession[]> {
  const db = await getDB();
  return db.getAllAsync<TableSession>(
    'SELECT * FROM table_sessions WHERE tableId = ? ORDER BY openedAt DESC LIMIT ?',
    [tableId, limit]
  );
}

// ─── Orders CRUD ─────────────────────────────────────────────────────────────

export async function getOrdersForSession(sessionId: string): Promise<RestaurantOrder[]> {
  const db = await getDB();
  return db.getAllAsync<RestaurantOrder>(
    'SELECT * FROM restaurant_orders WHERE sessionId = ? ORDER BY createdAt ASC',
    [sessionId]
  );
}

export async function getActiveKitchenOrders(businessId: string): Promise<RestaurantOrder[]> {
  const db = await getDB();
  return db.getAllAsync<RestaurantOrder>(
    `SELECT * FROM restaurant_orders
     WHERE businessId = ? AND status IN ('pending','accepted','preparing','ready')
     ORDER BY
       CASE priority WHEN 'vip' THEN 1 WHEN 'express' THEN 2 ELSE 3 END ASC,
       createdAt ASC`,
    [businessId]
  );
}

export async function createOrder(
  businessId: string,
  tableId: string,
  sessionId: string,
  waiterId: string,
  waiterName: string,
  course: OrderCourse,
  priority: Priority,
  notes: string,
  estimatedMinutes: number
): Promise<RestaurantOrder> {
  const db = await getDB();
  const order: RestaurantOrder = {
    id: uuid(),
    businessId,
    tableId,
    sessionId,
    waiterId,
    waiterName,
    status: 'draft',
    priority,
    course,
    notes,
    createdAt: now(),
    kitchenReceivedAt: null,
    preparingAt: null,
    readyAt: null,
    servedAt: null,
    estimatedMinutes,
    lastUpdated: now(),
    synced: 0,
  };
  await db.runAsync(
    `INSERT INTO restaurant_orders (id, businessId, tableId, sessionId, waiterId, waiterName, status, priority, course, notes, createdAt, kitchenReceivedAt, preparingAt, readyAt, servedAt, estimatedMinutes, lastUpdated, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [order.id, order.businessId, order.tableId, order.sessionId, order.waiterId, order.waiterName, order.status, order.priority, order.course, order.notes, order.createdAt, order.kitchenReceivedAt, order.preparingAt, order.readyAt, order.servedAt, order.estimatedMinutes, order.lastUpdated, order.synced]
  );
  return order;
}

export async function sendOrderToKitchen(orderId: string, sessionId: string): Promise<void> {
  const db = await getDB();
  const t = now();
  await db.runAsync(
    `UPDATE restaurant_orders SET status = 'pending', kitchenReceivedAt = ?, lastUpdated = ? WHERE id = ?`,
    [t, t, orderId]
  );
  await appendSessionEvent(sessionId, 'Kitchen Received');
  // update table status
  const order = await db.getFirstAsync<RestaurantOrder>('SELECT * FROM restaurant_orders WHERE id = ?', [orderId]);
  if (order) {
    await updateTableStatus(order.tableId, 'waiting_kitchen');
    const table = await db.getFirstAsync<{ tableNumber: string }>('SELECT tableNumber FROM restaurant_tables WHERE id = ?', [order.tableId]);
    const tblNum = table?.tableNumber || 'Unknown';
    await createNotification(
      order.businessId,
      'restaurant_new_order',
      'New Order',
      `Table #${tblNum} has placed a new order.`
    );
  }
  broadcastSync();
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  sessionId?: string
): Promise<void> {
  const db = await getDB();
  const t = now();
  const fields: Record<OrderStatus, string> = {
    draft: '',
    pending: `kitchenReceivedAt = '${t}',`,
    accepted: '',
    preparing: `preparingAt = '${t}',`,
    ready: `readyAt = '${t}',`,
    served: `servedAt = '${t}',`,
    cancelled: '',
  };
  await db.runAsync(
    `UPDATE restaurant_orders SET status = ?, ${fields[status]} lastUpdated = ? WHERE id = ?`,
    [status, t, orderId]
  );

  const order = await db.getFirstAsync<RestaurantOrder>('SELECT * FROM restaurant_orders WHERE id = ?', [orderId]);
  if (order) {
    if (status === 'preparing') await updateTableStatus(order.tableId, 'waiting_kitchen');
    if (status === 'ready') {
      await updateTableStatus(order.tableId, 'food_ready');
      const table = await db.getFirstAsync<{ tableNumber: string }>('SELECT tableNumber FROM restaurant_tables WHERE id = ?', [order.tableId]);
      const tblNum = table?.tableNumber || 'Unknown';
      await createNotification(
        order.businessId,
        'restaurant_kitchen_ready',
        'Kitchen Ready',
        `Order for Table #${tblNum} is ready to serve!`
      );
    }
    if (status === 'served') {
      // Check if all orders in session are served
      const pendingOrders = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM restaurant_orders WHERE sessionId = ? AND status NOT IN ('served','cancelled')`,
        [order.sessionId]
      );
      if ((pendingOrders?.cnt ?? 1) === 0) await updateTableStatus(order.tableId, 'occupied');
    }
  }
  if (sessionId) {
    const eventMap: Partial<Record<OrderStatus, string>> = {
      accepted: 'Accepted by Kitchen',
      preparing: 'Preparing',
      ready: 'Ready',
      served: 'Served',
    };
    if (eventMap[status]) await appendSessionEvent(sessionId, eventMap[status]!);
  }
  broadcastSync();
}

// ─── Order Items ─────────────────────────────────────────────────────────────

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const db = await getDB();
  return db.getAllAsync<OrderItem>('SELECT * FROM order_items WHERE orderId = ?', [orderId]);
}

export async function getOrderItemsByStation(
  businessId: string,
  station: KitchenStation
): Promise<(OrderItem & { orderPriority: Priority; tableNumber: string; orderCreatedAt: string })[]> {
  const db = await getDB();
  return db.getAllAsync(
    `SELECT oi.*, ro.priority as orderPriority, rt.tableNumber, ro.createdAt as orderCreatedAt
     FROM order_items oi
     JOIN restaurant_orders ro ON ro.id = oi.orderId
     JOIN restaurant_tables rt ON rt.id = ro.tableId
     WHERE ro.businessId = ? AND oi.kitchenStation = ? AND oi.status IN ('pending','preparing')
     ORDER BY
       CASE ro.priority WHEN 'vip' THEN 1 WHEN 'express' THEN 2 ELSE 3 END ASC,
       ro.createdAt ASC`,
    [businessId, station]
  );
}

export async function addOrderItem(
  orderId: string,
  productId: string,
  productName: string,
  price: number,
  quantity: number,
  kitchenStation: KitchenStation,
  estimatedMinutes: number,
  course: OrderCourse,
  modifiers: string[] = [],
  changeType: ChangeType = 'unchanged'
): Promise<OrderItem> {
  const db = await getDB();
  const item: OrderItem = {
    id: uuid(),
    orderId,
    productId,
    productName,
    price,
    quantity,
    status: 'pending',
    kitchenStation,
    estimatedMinutes,
    modifiers: JSON.stringify(modifiers),
    course,
    changeType,
    lastUpdated: now(),
  };
  await db.runAsync(
    `INSERT INTO order_items (id, orderId, productId, productName, price, quantity, status, kitchenStation, estimatedMinutes, modifiers, course, changeType, lastUpdated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.id, item.orderId, item.productId, item.productName, item.price, item.quantity, item.status, item.kitchenStation, item.estimatedMinutes, item.modifiers, item.course, item.changeType, item.lastUpdated]
  );
  return item;
}

export async function updateItemStatus(itemId: string, status: ItemStatus): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE order_items SET status = ?, lastUpdated = ? WHERE id = ?',
    [status, now(), itemId]
  );
}

export async function removeOrderItem(itemId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM order_items WHERE id = ?', [itemId]);
}

export async function editOrderItems(
  orderId: string,
  newItems: {
    productId: string;
    productName: string;
    price: number;
    quantity: number;
    kitchenStation: KitchenStation;
    estimatedMinutes: number;
    course: OrderCourse;
    modifiers: string[];
  }[],
  sessionId: string
): Promise<void> {
  const db = await getDB();
  const existingItems = await getOrderItems(orderId);
  const t = now();

  for (const oldItem of existingItems) {
    const oldMods = oldItem.modifiers || '[]';
    const match = newItems.find(n => n.productId === oldItem.productId && JSON.stringify(n.modifiers || []) === oldMods);
    
    if (!match) {
      // Removed
      await db.runAsync(
        'UPDATE order_items SET changeType = ?, lastUpdated = ? WHERE id = ?',
        ['removed', t, oldItem.id]
      );
    } else {
      if (match.quantity !== oldItem.quantity) {
        // Modified
        await db.runAsync(
          'UPDATE order_items SET quantity = ?, changeType = ?, lastUpdated = ? WHERE id = ?',
          [match.quantity, 'modified', t, oldItem.id]
        );
      } else {
        // Unchanged
        await db.runAsync(
          'UPDATE order_items SET changeType = ?, lastUpdated = ? WHERE id = ?',
          ['unchanged', t, oldItem.id]
        );
      }
    }
  }

  for (const newItem of newItems) {
    const newMods = JSON.stringify(newItem.modifiers || []);
    const match = existingItems.find(o => o.productId === newItem.productId && (o.modifiers || '[]') === newMods);
    if (!match) {
      // Added
      const item: OrderItem = {
        id: uuid(),
        orderId,
        productId: newItem.productId,
        productName: newItem.productName,
        price: newItem.price,
        quantity: newItem.quantity,
        status: 'pending',
        kitchenStation: newItem.kitchenStation,
        estimatedMinutes: newItem.estimatedMinutes,
        modifiers: newMods,
        course: newItem.course,
        changeType: 'added',
        lastUpdated: t,
      };
      await db.runAsync(
        `INSERT INTO order_items (id, orderId, productId, productName, price, quantity, status, kitchenStation, estimatedMinutes, modifiers, course, changeType, lastUpdated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.orderId, item.productId, item.productName, item.price, item.quantity, item.status, item.kitchenStation, item.estimatedMinutes, item.modifiers, item.course, item.changeType, item.lastUpdated]
      );
    }
  }

  // Update order status back to pending to alert them if it was ready/preparing
  // Let's just update lastUpdated and maybe append a session event
  await db.runAsync('UPDATE restaurant_orders SET status = "pending", lastUpdated = ? WHERE id = ?', [t, orderId]);
  await appendSessionEvent(sessionId, `Order #${orderId.slice(-6).toUpperCase()} Modified`);
  broadcastSync();
}

// ─── Menu Items ───────────────────────────────────────────────────────────────

export async function getMenuItems(businessId: string): Promise<RestaurantMenuItem[]> {
  const db = await getDB();
  return db.getAllAsync<RestaurantMenuItem>(
    `SELECT 
       COALESCE(rmi.id, p.id) as id,
       p.businessId,
       p.id as productId,
       p.name as productName,
       p.price,
       COALESCE(rmi.kitchenStation, 'general') as kitchenStation,
       COALESCE(rmi.estimatedMinutes, 10) as estimatedMinutes,
       COALESCE(rmi.course, 'main') as course,
       COALESCE(rmi.isAvailable, 1) as isAvailable,
       COALESCE(rmi.isFavorite, 0) as isFavorite,
       COALESCE(rmi.modifiersConfig, '[]') as modifiersConfig,
       p.category,
       p.lastUpdated
     FROM products p
     LEFT JOIN restaurant_menu_items rmi ON rmi.productId = p.id
     WHERE p.businessId = ? AND (p.deleted = 0 OR p.deleted IS NULL)
     ORDER BY p.name ASC`,
    [businessId]
  );
}

export async function upsertMenuItem(
  businessId: string,
  productId: string,
  productName: string,
  price: number,
  kitchenStation: KitchenStation,
  estimatedMinutes: number,
  course: OrderCourse,
  isFavorite: number = 0,
  modifiersConfig: string = '[]'
): Promise<void> {
  const db = await getDB();
  
  // 1. Sync with global products table
  const globalProduct = await db.getFirstAsync<{id: string}>('SELECT id FROM products WHERE id = ?', [productId]);
  if (!globalProduct) {
    await db.runAsync(
      `INSERT INTO products (id, userId, businessId, createdBy, name, price, quantity, category, lowStockThreshold, synced, lastUpdated, deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'Restaurant', 0, 0, ?, 0)`,
      [productId, businessId, businessId, 'restaurant_system', productName, price, now()]
    );
  } else {
    await db.runAsync('UPDATE products SET price = ?, lastUpdated = ? WHERE id = ?', [price, now(), productId]);
  }

  // 2. Sync with restaurant_menu_items table
  const existing = await db.getFirstAsync<RestaurantMenuItem>(
    'SELECT id FROM restaurant_menu_items WHERE businessId = ? AND productId = ?',
    [businessId, productId]
  );
  if (existing) {
    await db.runAsync(
      `UPDATE restaurant_menu_items SET productName=?, price=?, kitchenStation=?, estimatedMinutes=?, course=?, isFavorite=?, modifiersConfig=?, lastUpdated=? WHERE id=?`,
      [productName, price, kitchenStation, estimatedMinutes, course, isFavorite, modifiersConfig, now(), existing.id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO restaurant_menu_items (id, businessId, productId, productName, price, kitchenStation, estimatedMinutes, course, isAvailable, isFavorite, modifiersConfig, lastUpdated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [uuid(), businessId, productId, productName, price, kitchenStation, estimatedMinutes, course, isFavorite, modifiersConfig, now()]
    );
  }
}

export async function toggleMenuItemAvailability(menuItemId: string, isAvailable: boolean): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE restaurant_menu_items SET isAvailable = ?, lastUpdated = ? WHERE id = ?',
    [isAvailable ? 1 : 0, now(), menuItemId]
  );
}

// ─── Order History ────────────────────────────────────────────────────────────

export async function saveOrderHistory(
  session: TableSession,
  tableNumber: string,
  orders: RestaurantOrder[],
  allItems: OrderItem[]
): Promise<void> {
  const db = await getDB();
  const snapshot = JSON.stringify({ session, orders, items: allItems });
  await db.runAsync(
    `INSERT INTO order_history (id, tableId, businessId, tableNumber, snapshotJson, closedAt, totalAmount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), session.tableId, session.businessId, tableNumber, snapshot, now(), session.totalAmount]
  );
}

export async function getOrderHistory(tableId: string, limit = 20): Promise<OrderHistory[]> {
  const db = await getDB();
  return db.getAllAsync<OrderHistory>(
    'SELECT * FROM order_history WHERE tableId = ? ORDER BY closedAt DESC LIMIT ?',
    [tableId, limit]
  );
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(businessId: string): Promise<{
  activeTables: number;
  activeOrders: number;
  waitingOrders: number;
  inKitchenOrders: number;
  avgPrepMinutes: number;
  avgServeMinutes: number;
  topItems: { productName: string; count: number }[];
}> {
  const db = await getDB();

  const activeTables = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM restaurant_tables WHERE businessId = ? AND status != 'available'`,
    [businessId]
  );
  const activeOrders = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM restaurant_orders WHERE businessId = ? AND status NOT IN ('served','cancelled')`,
    [businessId]
  );
  const waitingOrders = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM restaurant_orders WHERE businessId = ? AND status = 'sent_to_kitchen'`,
    [businessId]
  );
  const inKitchenOrders = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM restaurant_orders WHERE businessId = ? AND status = 'preparing'`,
    [businessId]
  );

  const prepTime = await db.getFirstAsync<{ avg: number }>(
    `SELECT AVG((JULIANDAY(readyAt) - JULIANDAY(preparingAt)) * 24 * 60) as avg
     FROM restaurant_orders WHERE businessId = ? AND readyAt IS NOT NULL AND preparingAt IS NOT NULL`,
    [businessId]
  );
  const serveTime = await db.getFirstAsync<{ avg: number }>(
    `SELECT AVG((JULIANDAY(servedAt) - JULIANDAY(createdAt)) * 24 * 60) as avg
     FROM restaurant_orders WHERE businessId = ? AND servedAt IS NOT NULL`,
    [businessId]
  );

  const topItems = await db.getAllAsync<{ productName: string; count: number }>(
    `SELECT oi.productName, SUM(oi.quantity) as count
     FROM order_items oi
     JOIN restaurant_orders ro ON ro.id = oi.orderId
     WHERE ro.businessId = ?
     GROUP BY oi.productName ORDER BY count DESC LIMIT 5`,
    [businessId]
  );

  return {
    activeTables: activeTables?.cnt ?? 0,
    activeOrders: activeOrders?.cnt ?? 0,
    waitingOrders: waitingOrders?.cnt ?? 0,
    inKitchenOrders: inKitchenOrders?.cnt ?? 0,
    avgPrepMinutes: Math.round(prepTime?.avg ?? 0),
    avgServeMinutes: Math.round(serveTime?.avg ?? 0),
    topItems,
  };
}

export interface RestaurantStats {
  activeTables: number;
  activeOrders: number;
  waitingOrders: number;
  inKitchenOrders: number;
  avgPrepMinutes: number;
  avgServeMinutes: number;
  topItems: { productName: string; count: number }[];
}

export const initRestaurantTables = initRestaurantSchema;
export const getRestaurantStats = getDashboardStats;
export const getKitchenOrders = getActiveKitchenOrders;

