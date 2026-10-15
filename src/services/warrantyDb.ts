/**
 * Warranty Database Service
 *
 * SQLite schemas and CRUD operations for the Warranty and Claims module.
 * Manages product warranty timelines, serial numbers, and claims log.
 */

import { getDB } from './sqlite';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WarrantyStatus = 'active' | 'expired' | 'voided';
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'resolved';

export interface Warranty {
  id: string;
  businessId: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  serialNumber: string;
  invoiceId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: WarrantyStatus;
  notes: string;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface WarrantyClaim {
  id: string;
  warrantyId: string;
  businessId: string;
  claimDate: string; // YYYY-MM-DD
  issueDescription: string;
  resolutionStatus: ClaimStatus;
  resolutionDetails: string;
  resolutionDate: string | null; // YYYY-MM-DD
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface WarrantyStats {
  activeCount: number;
  expiringCount: number; // Expiring within 30 days
  openClaimsCount: number;
  resolvedClaimsCount: number;
}

// ─── Schema Initialization ───────────────────────────────────────────────────

export async function initWarrantyTables(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS warranties (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      customerName TEXT NOT NULL,
      customerPhone TEXT DEFAULT '',
      productName TEXT NOT NULL,
      serialNumber TEXT DEFAULT '',
      invoiceId TEXT DEFAULT '',
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      notes TEXT DEFAULT '',
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS warranty_claims (
      id TEXT PRIMARY KEY,
      warrantyId TEXT NOT NULL,
      businessId TEXT NOT NULL,
      claimDate TEXT NOT NULL,
      issueDescription TEXT NOT NULL,
      resolutionStatus TEXT DEFAULT 'pending',
      resolutionDetails TEXT DEFAULT '',
      resolutionDate TEXT,
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );
  `);
}

// ─── Warranty CRUD Operations ─────────────────────────────────────────────────

export async function getWarranties(businessId: string, searchFilter?: string): Promise<Warranty[]> {
  const db = await getDB();
  
  if (searchFilter && searchFilter.trim()) {
    const pattern = `%${searchFilter.trim()}%`;
    return db.getAllAsync<Warranty>(
      `SELECT * FROM warranties 
       WHERE businessId = ? 
         AND deleted = 0 
         AND (
           customerName LIKE ? 
           OR customerPhone LIKE ? 
           OR productName LIKE ? 
           OR serialNumber LIKE ? 
           OR invoiceId LIKE ?
         )
       ORDER BY endDate DESC`,
      [businessId, pattern, pattern, pattern, pattern, pattern]
    );
  }

  return db.getAllAsync<Warranty>(
    'SELECT * FROM warranties WHERE businessId = ? AND deleted = 0 ORDER BY endDate DESC',
    [businessId]
  );
}

export async function getWarrantyById(id: string): Promise<Warranty | null> {
  const db = await getDB();
  return db.getFirstAsync<Warranty>(
    'SELECT * FROM warranties WHERE id = ?',
    [id]
  );
}

export async function upsertWarranty(warranty: Warranty): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO warranties (
      id, businessId, customerName, customerPhone, productName, serialNumber, 
      invoiceId, startDate, endDate, status, notes, synced, lastUpdated, deleted
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       customerName = excluded.customerName,
       customerPhone = excluded.customerPhone,
       productName = excluded.productName,
       serialNumber = excluded.serialNumber,
       invoiceId = excluded.invoiceId,
       startDate = excluded.startDate,
       endDate = excluded.endDate,
       status = excluded.status,
       notes = excluded.notes,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      warranty.id,
      warranty.businessId,
      warranty.customerName,
      warranty.customerPhone,
      warranty.productName,
      warranty.serialNumber,
      warranty.invoiceId,
      warranty.startDate,
      warranty.endDate,
      warranty.status,
      warranty.notes,
      warranty.synced ?? 0,
      warranty.lastUpdated,
      warranty.deleted ?? 0,
    ]
  );
}

export async function deleteWarranty(id: string): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE warranties SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [now, id]
  );
  // Also delete associated claims
  await db.runAsync(
    'UPDATE warranty_claims SET deleted = 1, synced = 0, lastUpdated = ? WHERE warrantyId = ?',
    [now, id]
  );
}

// ─── Warranty Claims CRUD Operations ──────────────────────────────────────────

export async function getWarrantyClaims(businessId: string, warrantyId?: string): Promise<WarrantyClaim[]> {
  const db = await getDB();
  if (warrantyId) {
    return db.getAllAsync<WarrantyClaim>(
      'SELECT * FROM warranty_claims WHERE businessId = ? AND warrantyId = ? AND deleted = 0 ORDER BY claimDate DESC',
      [businessId, warrantyId]
    );
  }
  return db.getAllAsync<WarrantyClaim>(
    'SELECT * FROM warranty_claims WHERE businessId = ? AND deleted = 0 ORDER BY claimDate DESC',
    [businessId]
  );
}

export async function getWarrantyClaimById(id: string): Promise<WarrantyClaim | null> {
  const db = await getDB();
  return db.getFirstAsync<WarrantyClaim>(
    'SELECT * FROM warranty_claims WHERE id = ?',
    [id]
  );
}

export async function upsertWarrantyClaim(claim: WarrantyClaim): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO warranty_claims (
      id, warrantyId, businessId, claimDate, issueDescription, 
      resolutionStatus, resolutionDetails, resolutionDate, synced, lastUpdated, deleted
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       claimDate = excluded.claimDate,
       issueDescription = excluded.issueDescription,
       resolutionStatus = excluded.resolutionStatus,
       resolutionDetails = excluded.resolutionDetails,
       resolutionDate = excluded.resolutionDate,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      claim.id,
      claim.warrantyId,
      claim.businessId,
      claim.claimDate,
      claim.issueDescription,
      claim.resolutionStatus,
      claim.resolutionDetails,
      claim.resolutionDate,
      claim.synced ?? 0,
      claim.lastUpdated,
      claim.deleted ?? 0,
    ]
  );
}

export async function deleteWarrantyClaim(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE warranty_claims SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

// ─── Statistics ──────────────────────────────────────────────────────────────

export async function getWarrantyStats(businessId: string): Promise<WarrantyStats> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const in30DaysStr = in30Days.toISOString().split('T')[0];

  const active = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM warranties 
     WHERE businessId = ? AND status = 'active' AND endDate >= ? AND deleted = 0`,
    [businessId, today]
  );

  const expiring = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM warranties 
     WHERE businessId = ? AND status = 'active' AND endDate >= ? AND endDate <= ? AND deleted = 0`,
    [businessId, today, in30DaysStr]
  );

  const openClaims = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM warranty_claims 
     WHERE businessId = ? AND resolutionStatus = 'pending' AND deleted = 0`,
    [businessId]
  );

  const resolvedClaims = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM warranty_claims 
     WHERE businessId = ? AND resolutionStatus IN ('approved', 'resolved') AND deleted = 0`,
    [businessId]
  );

  return {
    activeCount: active?.count ?? 0,
    expiringCount: expiring?.count ?? 0,
    openClaimsCount: openClaims?.count ?? 0,
    resolvedClaimsCount: resolvedClaims?.count ?? 0,
  };
}
