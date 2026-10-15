/**
 * Queue Database Service
 *
 * SQLite schema and CRUD operations for the Customer Queue module.
 * Manages waiting customers, status changes, and staff assignments.
 */

import { getDB } from './sqlite';

// ─── Types ───────────────────────────────────────────────────────────────────

export type QueueStatus = 'waiting' | 'serving' | 'completed' | 'cancelled';

export interface QueueItem {
  id: string;
  businessId: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  partySize: number;
  staffId: string;
  staffName: string;
  status: QueueStatus;
  notes: string;
  checkInTime: string; // ISO 8601 String
  servedAt: string | null; // ISO 8601 String
  completedAt: string | null; // ISO 8601 String
  estimatedDuration: number; // in minutes
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface QueueStats {
  waitingCount: number;
  servingCount: number;
  completedToday: number;
  avgWaitMinutes: number;
}

// ─── Schema Initialization ───────────────────────────────────────────────────

export async function initQueueTables(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customer_queue (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      customerName TEXT NOT NULL,
      customerPhone TEXT DEFAULT '',
      serviceName TEXT DEFAULT '',
      partySize INTEGER DEFAULT 1,
      staffId TEXT DEFAULT '',
      staffName TEXT DEFAULT '',
      status TEXT DEFAULT 'waiting',
      notes TEXT DEFAULT '',
      checkInTime TEXT NOT NULL,
      servedAt TEXT,
      completedAt TEXT,
      estimatedDuration INTEGER DEFAULT 30,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );
  `);
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function getQueueItems(businessId: string, date?: string): Promise<QueueItem[]> {
  const db = await getDB();
  const filterDate = date || new Date().toISOString().split('T')[0];
  // Retrieve items created or completed on the filter date (allowing current active items to show)
  return db.getAllAsync<QueueItem>(
    `SELECT * FROM customer_queue 
     WHERE businessId = ? 
       AND deleted = 0 
       AND (
         checkInTime LIKE ? 
         OR status IN ('waiting', 'serving')
       )
     ORDER BY 
       CASE status 
         WHEN 'serving' THEN 1
         WHEN 'waiting' THEN 2
         ELSE 3 
       END, 
       checkInTime ASC`,
    [businessId, `${filterDate}%`]
  );
}

export async function getQueueItemById(id: string): Promise<QueueItem | null> {
  const db = await getDB();
  return db.getFirstAsync<QueueItem>(
    'SELECT * FROM customer_queue WHERE id = ?',
    [id]
  );
}

export async function upsertQueueItem(item: QueueItem): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO customer_queue (
      id, businessId, customerName, customerPhone, serviceName, partySize, 
      staffId, staffName, status, notes, checkInTime, servedAt, completedAt, 
      estimatedDuration, synced, lastUpdated, deleted
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       customerName = excluded.customerName,
       customerPhone = excluded.customerPhone,
       serviceName = excluded.serviceName,
       partySize = excluded.partySize,
       staffId = excluded.staffId,
       staffName = excluded.staffName,
       status = excluded.status,
       notes = excluded.notes,
       checkInTime = excluded.checkInTime,
       servedAt = excluded.servedAt,
       completedAt = excluded.completedAt,
       estimatedDuration = excluded.estimatedDuration,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      item.id,
      item.businessId,
      item.customerName,
      item.customerPhone,
      item.serviceName,
      item.partySize,
      item.staffId,
      item.staffName,
      item.status,
      item.notes,
      item.checkInTime,
      item.servedAt,
      item.completedAt,
      item.estimatedDuration,
      item.synced ?? 0,
      item.lastUpdated,
      item.deleted ?? 0,
    ]
  );
}

export async function updateQueueStatus(
  id: string, 
  status: QueueStatus, 
  servedAt: string | null = null, 
  completedAt: string | null = null
): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  
  if (status === 'serving') {
    await db.runAsync(
      `UPDATE customer_queue 
       SET status = ?, servedAt = ?, synced = 0, lastUpdated = ? 
       WHERE id = ?`,
      [status, servedAt || now, now, id]
    );
  } else if (status === 'completed') {
    await db.runAsync(
      `UPDATE customer_queue 
       SET status = ?, completedAt = ?, synced = 0, lastUpdated = ? 
       WHERE id = ?`,
      [status, completedAt || now, now, id]
    );
  } else {
    await db.runAsync(
      `UPDATE customer_queue 
       SET status = ?, synced = 0, lastUpdated = ? 
       WHERE id = ?`,
      [status, now, id]
    );
  }
}

export async function deleteQueueItem(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE customer_queue SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

// ─── Statistics ──────────────────────────────────────────────────────────────

export async function getQueueStats(businessId: string): Promise<QueueStats> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];

  const waiting = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM customer_queue 
     WHERE businessId = ? AND status = 'waiting' AND deleted = 0`,
    [businessId]
  );

  const serving = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM customer_queue 
     WHERE businessId = ? AND status = 'serving' AND deleted = 0`,
    [businessId]
  );

  const completed = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM customer_queue 
     WHERE businessId = ? AND status = 'completed' AND deleted = 0 AND checkInTime LIKE ?`,
    [businessId, `${today}%`]
  );

  // Calculate average wait time for today's completed customers (completedAt - checkInTime in minutes)
  const completedItems = await db.getAllAsync<{ checkInTime: string; servedAt: string | null }>(
    `SELECT checkInTime, servedAt FROM customer_queue 
     WHERE businessId = ? AND status = 'completed' AND deleted = 0 AND checkInTime LIKE ?`,
    [businessId, `${today}%`]
  );

  let totalWaitTimeMs = 0;
  let countWithWaitTime = 0;

  for (const item of completedItems) {
    const checkIn = new Date(item.checkInTime).getTime();
    // If we have servedAt, wait time is (servedAt - checkInTime), otherwise (completedAt - checkInTime)
    const end = item.servedAt ? new Date(item.servedAt).getTime() : null;
    if (end && end > checkIn) {
      totalWaitTimeMs += (end - checkIn);
      countWithWaitTime++;
    }
  }

  const avgWaitMinutes = countWithWaitTime > 0 
    ? Math.round(totalWaitTimeMs / (1000 * 60 * countWithWaitTime)) 
    : 0;

  return {
    waitingCount: waiting?.count ?? 0,
    servingCount: serving?.count ?? 0,
    completedToday: completed?.count ?? 0,
    avgWaitMinutes,
  };
}
