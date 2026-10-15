import { getDB, type Product } from './sqlite';

export interface ImportHistoryEntry {
  id: string;
  businessId: string;
  userId: string;
  userName: string;
  fileName: string;
  importDate: string; // ISO string
  status: 'completed' | 'completed_with_errors' | 'failed' | 'rolled_back';
  totalRecords: number;
  successCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: string; // JSON string of string[]
  duration: number; // in milliseconds
  rollbackData: string; // JSON of { created: string[], updated: Product[], createdBatches?: string[], createdMenuItems?: string[] }
}

export async function initImportHistorySchema(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS import_history (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      userId TEXT NOT NULL,
      userName TEXT NOT NULL,
      fileName TEXT NOT NULL,
      importDate TEXT NOT NULL,
      status TEXT NOT NULL,
      totalRecords INTEGER NOT NULL,
      successCount INTEGER NOT NULL,
      updatedCount INTEGER NOT NULL,
      skippedCount INTEGER NOT NULL,
      failedCount INTEGER NOT NULL,
      errors TEXT,
      duration INTEGER NOT NULL,
      rollbackData TEXT
    );
  `);
}

export async function getImportHistory(businessId: string): Promise<ImportHistoryEntry[]> {
  const db = await getDB();
  await initImportHistorySchema(); // ensure table exists
  return db.getAllAsync<ImportHistoryEntry>(
    'SELECT * FROM import_history WHERE businessId = ? ORDER BY importDate DESC',
    [businessId]
  );
}

export async function addImportHistory(entry: ImportHistoryEntry): Promise<void> {
  const db = await getDB();
  await initImportHistorySchema();
  await db.runAsync(
    `INSERT INTO import_history (
       id, businessId, userId, userName, fileName, importDate, status,
       totalRecords, successCount, updatedCount, skippedCount, failedCount,
       errors, duration, rollbackData
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.businessId,
      entry.userId,
      entry.userName,
      entry.fileName,
      entry.importDate,
      entry.status,
      entry.totalRecords,
      entry.successCount,
      entry.updatedCount,
      entry.skippedCount,
      entry.failedCount,
      entry.errors,
      entry.duration,
      entry.rollbackData
    ]
  );
}

export async function rollbackImport(importId: string, businessId: string): Promise<{ success: boolean; message: string }> {
  const db = await getDB();
  await initImportHistorySchema();
  
  const entry = await db.getFirstAsync<ImportHistoryEntry>(
    'SELECT * FROM import_history WHERE id = ? AND businessId = ?',
    [importId, businessId]
  );

  if (!entry) {
    return { success: false, message: 'Import log entry not found.' };
  }

  if (entry.status === 'rolled_back') {
    return { success: false, message: 'This import has already been rolled back.' };
  }

  let rollbackPayload: { 
    created?: string[]; 
    updated?: Product[]; 
    createdBatches?: string[]; 
    createdMenuItems?: string[];
  } = {};

  try {
    rollbackPayload = JSON.parse(entry.rollbackData);
  } catch (err) {
    return { success: false, message: 'Failed to parse rollback data.' };
  }

  const nowStr = new Date().toISOString();

  try {
    await db.withTransactionAsync(async () => {
      // 1. Delete (soft-delete) newly created products
      if (rollbackPayload.created && rollbackPayload.created.length > 0) {
        const placeholders = rollbackPayload.created.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE products SET deleted = 1, synced = 0, lastUpdated = ? WHERE id IN (${placeholders})`,
          [nowStr, ...rollbackPayload.created]
        );
      }

      // 2. Restore original state of updated products
      if (rollbackPayload.updated && rollbackPayload.updated.length > 0) {
        for (const prod of rollbackPayload.updated) {
          await db.runAsync(
            `INSERT INTO products (
               id, userId, businessId, createdBy, name, price, quantity, category, lowStockThreshold,
               synced, lastUpdated, deleted, sku, barcode, purchasePrice, unit, brand, supplier, tax, description, imageUrl, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               price = excluded.price,
               quantity = excluded.quantity,
               category = excluded.category,
               lowStockThreshold = excluded.lowStockThreshold,
               synced = excluded.synced,
               lastUpdated = excluded.lastUpdated,
               deleted = excluded.deleted,
               sku = excluded.sku,
               barcode = excluded.barcode,
               purchasePrice = excluded.purchasePrice,
               unit = excluded.unit,
               brand = excluded.brand,
               supplier = excluded.supplier,
               tax = excluded.tax,
               description = excluded.description,
               imageUrl = excluded.imageUrl,
               status = excluded.status`,
            [
              prod.id,
              prod.userId,
              prod.businessId,
              prod.createdBy,
              prod.name,
              prod.price,
              prod.quantity,
              prod.category,
              prod.lowStockThreshold,
              0, // mark unsynced
              nowStr,
              prod.deleted ?? 0,
              prod.sku ?? null,
              prod.barcode ?? null,
              prod.purchasePrice ?? 0,
              prod.unit ?? null,
              prod.brand ?? null,
              prod.supplier ?? null,
              prod.tax ?? 0,
              prod.description ?? null,
              prod.imageUrl ?? null,
              prod.status ?? 'active',
            ]
          );
        }
      }

      // 3. Delete created medicine batches
      if (rollbackPayload.createdBatches && rollbackPayload.createdBatches.length > 0) {
        const placeholders = rollbackPayload.createdBatches.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE medicine_batches SET deleted = 1, lastUpdated = ? WHERE id IN (${placeholders})`,
          [nowStr, ...rollbackPayload.createdBatches]
        );
      }

      // 4. Delete created menu items
      if (rollbackPayload.createdMenuItems && rollbackPayload.createdMenuItems.length > 0) {
        const placeholders = rollbackPayload.createdMenuItems.map(() => '?').join(',');
        await db.runAsync(
          `DELETE FROM restaurant_menu_items WHERE id IN (${placeholders})`,
          rollbackPayload.createdMenuItems
        );
      }

      // 5. Update history status
      await db.runAsync(
        "UPDATE import_history SET status = 'rolled_back' WHERE id = ?",
        [importId]
      );
    });

    return { success: true, message: 'Import rolled back successfully.' };
  } catch (err: any) {
    console.error('[rollbackImport] Failed:', err);
    return { success: false, message: err.message || 'Transaction rollback failed.' };
  }
}
