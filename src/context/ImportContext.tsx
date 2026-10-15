import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import * as sqlite from '../services/sqlite';
import * as inventoryDb from '../services/inventoryDb';
import * as restaurantDb from '../services/restaurantDb';
import * as importHistoryDb from '../services/importHistoryDb';
import { createNotification } from '../services/notificationService';
import { useDatabase } from './DatabaseContext';

export interface ImportProgress {
  fileName: string;
  totalCount: number;
  importedCount: number;
  successCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  etaSeconds: number;
  currentProductName: string;
  status: 'idle' | 'importing' | 'completed' | 'completed_with_errors' | 'failed';
  errorsList: string[];
}

interface ImportContextType {
  activeImport: ImportProgress | null;
  startBackgroundImport: (
    fileName: string,
    rows: Record<string, any>[],
    mappings: Record<string, string>,
    businessId: string,
    userId: string,
    userName: string,
    config: {
      duplicateHandling: 'skip' | 'update' | 'duplicate';
      autoCreateCategories: boolean;
      categoryId: string;
    }
  ) => Promise<void>;
  cancelActiveImport: () => void;
  clearActiveImport: () => void;
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export function ImportProvider({ children }: { children: React.ReactNode }) {
  const [activeImport, setActiveImport] = useState<ImportProgress | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const { refreshData } = useDatabase();

  const cancelActiveImport = useCallback(() => {
    isCancelledRef.current = true;
    setActiveImport(prev => prev ? { ...prev, status: 'failed', currentProductName: 'Import cancelled by user.' } : null);
  }, []);

  const clearActiveImport = useCallback(() => {
    setActiveImport(null);
  }, []);

  const startBackgroundImport = useCallback(async (
    fileName: string,
    rows: Record<string, any>[],
    mappings: Record<string, string>,
    businessId: string,
    userId: string,
    userName: string,
    config: {
      duplicateHandling: 'skip' | 'update' | 'duplicate';
      autoCreateCategories: boolean;
      categoryId: string;
    }
  ) => {
    isCancelledRef.current = false;
    const startTime = Date.now();
    const totalCount = rows.length;

    const initialProgress: ImportProgress = {
      fileName,
      totalCount,
      importedCount: 0,
      successCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      etaSeconds: 0,
      currentProductName: 'Initializing...',
      status: 'importing',
      errorsList: []
    };
    setActiveImport(initialProgress);

    // Load existing items for duplicate matching
    const existingProducts = await sqlite.getProducts(businessId);
    const existingProductMap = new Map<string, sqlite.Product>();
    existingProducts.forEach(p => {
      existingProductMap.set(p.name.toLowerCase().trim(), p);
      if (p.sku) existingProductMap.set(p.sku.toLowerCase().trim(), p);
      if (p.barcode) existingProductMap.set(p.barcode.toLowerCase().trim(), p);
    });

    // Pharmacy batch match cache if needed
    let existingBatches: any[] = [];
    if (config.categoryId === 'pharmacy' || config.categoryId === 'medical_store') {
      const db = await sqlite.getDB();
      existingBatches = await db.getAllAsync('SELECT * FROM medicine_batches WHERE businessId = ?', [businessId]);
    }

    const createdProductIds: string[] = [];
    const updatedProductsSnapshots: sqlite.Product[] = [];
    const createdBatches: string[] = [];
    const createdMenuItems: string[] = [];
    const errorsList: string[] = [];

    let successCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const chunkSize = 20; // run chunked to yield execution to UI
    let index = 0;

    const runChunk = async () => {
      if (isCancelledRef.current) {
        return;
      }

      const chunkEnd = Math.min(index + chunkSize, totalCount);
      const db = await sqlite.getDB();

      for (let i = index; i < chunkEnd; i++) {
        const row = rows[i];
        const rowNum = i + 1;
        
        try {
          // Extract mapped columns
          const name = String(row[mappings['name']] || '').trim();
          if (!name) {
            failedCount++;
            errorsList.push(`Row ${rowNum}: Product name column is empty.`);
            continue;
          }

          const priceVal = row[mappings['price']];
          const price = parseFloat(String(priceVal || 0));

          const qtyVal = mappings['quantity'] ? row[mappings['quantity']] : undefined;
          const quantity = qtyVal !== undefined ? parseInt(String(qtyVal), 10) : 0;

          const categoryVal = mappings['category'] ? row[mappings['category']] : undefined;
          let category = String(categoryVal || 'General').trim();

          const thresholdVal = mappings['lowStockThreshold'] ? row[mappings['lowStockThreshold']] : undefined;
          const lowStockThreshold = thresholdVal !== undefined ? parseInt(String(thresholdVal), 10) : 5;

          const sku = mappings['sku'] ? String(row[mappings['sku']] || '').trim() : '';
          const barcode = mappings['barcode'] ? String(row[mappings['barcode']] || '').trim() : '';
          const purchasePrice = mappings['purchasePrice'] ? parseFloat(String(row[mappings['purchasePrice']] || 0)) : 0;
          const boxLocation = mappings['boxLocation'] ? String(row[mappings['boxLocation']] || '').trim() : '';
          const unit = mappings['unit'] ? String(row[mappings['unit']] || '').trim() : '';
          const brand = mappings['brand'] ? String(row[mappings['brand']] || '').trim() : '';
          const supplier = mappings['supplier'] ? String(row[mappings['supplier']] || '').trim() : '';
          const tax = mappings['tax'] ? parseFloat(String(row[mappings['tax']] || 0)) : 0;
          const description = mappings['description'] ? String(row[mappings['description']] || '').trim() : '';
          const imageUrl = mappings['imageUrl'] ? String(row[mappings['imageUrl']] || '').trim() : '';
          const status = mappings['status'] ? String(row[mappings['status']] || 'active').trim() : 'active';

          // Category Auto-Creation settings logic
          if (!config.autoCreateCategories && category !== 'General') {
            const hasCategory = existingProducts.some(p => p.category?.toLowerCase() === category.toLowerCase());
            if (!hasCategory) {
              category = 'General'; // Default back
            }
          }

          // Duplicate detection
          let existingProduct: sqlite.Product | undefined;
          if (barcode) existingProduct = existingProductMap.get(barcode.toLowerCase());
          if (!existingProduct && sku) existingProduct = existingProductMap.get(sku.toLowerCase());
          if (!existingProduct) existingProduct = existingProductMap.get(name.toLowerCase());

          const nowIso = new Date().toISOString();

          if (existingProduct) {
            if (config.duplicateHandling === 'skip') {
              skippedCount++;
              continue;
            } else if (config.duplicateHandling === 'update') {
              // Capture snapshot for rollback
              updatedProductsSnapshots.push({ ...existingProduct });

              const updatedProd: sqlite.Product = {
                ...existingProduct,
                name,
                price,
                quantity: quantity || existingProduct.quantity,
                category,
                lowStockThreshold,
                lastUpdated: nowIso,
                synced: 0,
                sku: sku || existingProduct.sku,
                barcode: barcode || existingProduct.barcode,
                purchasePrice: purchasePrice || existingProduct.purchasePrice,
                boxLocation: boxLocation || existingProduct.boxLocation,
                unit: unit || existingProduct.unit,
                brand: brand || existingProduct.brand,
                supplier: supplier || existingProduct.supplier,
                tax: tax || existingProduct.tax,
                description: description || existingProduct.description,
                imageUrl: imageUrl || existingProduct.imageUrl,
                status: status || existingProduct.status
              };

              await sqlite.upsertProduct(updatedProd);

              // Category specific updates for Pharmacy
              if (config.categoryId === 'pharmacy' || config.categoryId === 'medical_store') {
                const batchNumber = mappings['batchNumber'] ? String(row[mappings['batchNumber']] || '').trim() : '';
                const expiryDate = mappings['expiryDate'] ? String(row[mappings['expiryDate']] || '').trim() : '';
                const manufacturer = brand;

                if (batchNumber && expiryDate) {
                  const existingBatch = existingBatches.find(b => b.productId === updatedProd.id && b.batchNumber.toLowerCase() === batchNumber.toLowerCase());
                  const batchId = existingBatch ? existingBatch.id : 'bat_' + Math.random().toString(36).substring(2, 9);
                  
                  if (!existingBatch) {
                    createdBatches.push(batchId);
                  }

                  await inventoryDb.upsertMedicineBatch({
                    id: batchId,
                    businessId,
                    productId: updatedProd.id,
                    productName: name,
                    batchNumber,
                    expiryDate,
                    quantity: quantity || 0,
                    purchasePrice: purchasePrice || 0,
                    manufacturer,
                    lastUpdated: nowIso
                  });
                }
              }

              // Restaurant Updates
              if (config.categoryId === 'restaurant') {
                const prepTime = mappings['estimatedMinutes'] ? parseInt(String(row[mappings['estimatedMinutes']] || 10), 10) : 10;
                const availabilityVal = mappings['isAvailable'] ? String(row[mappings['isAvailable']] || '').toLowerCase() : '';
                const isAvailable = availabilityVal === 'no' || availabilityVal === '0' || availabilityVal === 'false' ? 0 : 1;

                await restaurantDb.upsertMenuItem(
                  businessId,
                  updatedProd.id,
                  name,
                  price,
                  'general',
                  prepTime,
                  'main',
                  0,
                  '[]'
                );
                // Ensure availability is synced
                const dbItem = await db.getFirstAsync<{ id: string }>('SELECT id FROM restaurant_menu_items WHERE productId = ?', [updatedProd.id]);
                if (dbItem) {
                  await restaurantDb.toggleMenuItemAvailability(dbItem.id, isAvailable === 1);
                }
              }

              updatedCount++;
              continue;
            }
          }

          // Create new product
          const newProductId = 'prod_' + Math.random().toString(36).substring(2, 15);
          const newProd: sqlite.Product = {
            id: newProductId,
            userId,
            businessId,
            createdBy: userId,
            name,
            price,
            quantity,
            category,
            lowStockThreshold,
            lastUpdated: nowIso,
            synced: 0,
            deleted: 0,
            sku: sku || null,
            barcode: barcode || null,
            purchasePrice: purchasePrice || null,
            boxLocation: boxLocation || null,
            unit: unit || null,
            brand: brand || null,
            supplier: supplier || null,
            tax: tax || null,
            description: description || null,
            imageUrl: imageUrl || null,
            status: status || 'active'
          };

          await sqlite.upsertProduct(newProd);
          createdProductIds.push(newProductId);

          // Pharmacy specific batch creations
          if (config.categoryId === 'pharmacy' || config.categoryId === 'medical_store') {
            const batchNumber = mappings['batchNumber'] ? String(row[mappings['batchNumber']] || '').trim() : '';
            const expiryDate = mappings['expiryDate'] ? String(row[mappings['expiryDate']] || '').trim() : '';
            const manufacturer = brand;

            if (batchNumber && expiryDate) {
              const batchId = 'bat_' + Math.random().toString(36).substring(2, 9);
              await inventoryDb.upsertMedicineBatch({
                id: batchId,
                businessId,
                productId: newProductId,
                productName: name,
                batchNumber,
                expiryDate,
                quantity: quantity || 0,
                purchasePrice: purchasePrice || 0,
                manufacturer,
                lastUpdated: nowIso
              });
              createdBatches.push(batchId);
            }
          }

          // Restaurant specific creations
          if (config.categoryId === 'restaurant') {
            const prepTime = mappings['estimatedMinutes'] ? parseInt(String(row[mappings['estimatedMinutes']] || 10), 10) : 10;
            const availabilityVal = mappings['isAvailable'] ? String(row[mappings['isAvailable']] || '').toLowerCase() : '';
            const isAvailable = availabilityVal === 'no' || availabilityVal === '0' || availabilityVal === 'false' ? 0 : 1;
            const menuId = 'rmi_' + Math.random().toString(36).substring(2, 9);

            await db.runAsync(
              `INSERT INTO restaurant_menu_items (id, businessId, productId, productName, price, kitchenStation, estimatedMinutes, course, isAvailable, isFavorite, modifiersConfig, lastUpdated)
               VALUES (?, ?, ?, ?, ?, 'general', ?, 'main', ?, 0, '[]', ?)`,
              [menuId, businessId, newProductId, name, price, prepTime, isAvailable, nowIso]
            );
            createdMenuItems.push(menuId);
          }

          successCount++;
        } catch (err: any) {
          failedCount++;
          errorsList.push(`Row ${rowNum}: ${err.message || 'Unknown database save error.'}`);
        }
      }

      index = chunkEnd;

      // Progress calculation
      const elapsedMs = Date.now() - startTime;
      const progressRatio = index / totalCount;
      const speed = index / (elapsedMs / 1000); // records per sec
      const remainingRows = totalCount - index;
      const etaSeconds = speed > 0 ? Math.ceil(remainingRows / speed) : 0;

      const currentName = rows[index - 1] ? String(rows[index - 1][mappings['name']] || '') : '';

      setActiveImport({
        fileName,
        totalCount,
        importedCount: index,
        successCount,
        updatedCount,
        skippedCount,
        failedCount,
        etaSeconds,
        currentProductName: currentName,
        status: 'importing',
        errorsList
      });

      if (index < totalCount) {
        // Yield to browser UI thread
        await new Promise(resolve => setTimeout(resolve, 80));
        await runChunk();
      } else {
        // Complete
        const duration = Date.now() - startTime;
        const status = errorsList.length === 0 ? 'completed' : 'completed_with_errors';
        
        const historyEntry: importHistoryDb.ImportHistoryEntry = {
          id: 'imp_' + Math.random().toString(36).substring(2, 11),
          businessId,
          userId,
          userName,
          fileName,
          importDate: new Date().toISOString(),
          status,
          totalRecords: totalCount,
          successCount,
          updatedCount,
          skippedCount,
          failedCount,
          errors: JSON.stringify(errorsList.slice(0, 50)), // cap log error size
          duration,
          rollbackData: JSON.stringify({
            created: createdProductIds,
            updated: updatedProductsSnapshots,
            createdBatches,
            createdMenuItems
          })
        };

        await importHistoryDb.addImportHistory(historyEntry);
        await refreshData(); // refresh parent products list context

        // Trigger Local Notification
        await createNotification(
          businessId,
          'product_import_status',
          'Product Import Complete',
          `Successfully processed ${totalCount} entries (${successCount} added, ${updatedCount} updated, ${skippedCount} skipped, ${failedCount} errors).`
        );

        setActiveImport({
          fileName,
          totalCount,
          importedCount: index,
          successCount,
          updatedCount,
          skippedCount,
          failedCount,
          etaSeconds: 0,
          currentProductName: 'Completed successfully.',
          status,
          errorsList
        });
      }
    };

    // Trigger async execution
    await runChunk();
  }, [refreshData]);

  return (
    <ImportContext.Provider
      value={{
        activeImport,
        startBackgroundImport,
        cancelActiveImport,
        clearActiveImport
      }}
    >
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  const context = useContext(ImportContext);
  if (context === undefined) {
    throw new Error('useImport must be used within an ImportProvider');
  }
  return context;
}
