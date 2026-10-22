/**
 * Supabase Sync Service
 *
 * Handles bidirectional sync between local SQLite and Supabase.
 * Strategy: Incremental sync using per-table lastUpdated timestamps.
 * Conflict resolution: Last-write-wins based on lastUpdated.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import * as sqlite from './sqlite';

// ─── Column Mapping Helpers ──────────────────────────────────────────────────

/** Convert camelCase SQLite column names to snake_case Supabase columns */
function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

/** Convert snake_case Supabase columns to camelCase */
function toCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

// ─── Main Sync Orchestrator ──────────────────────────────────────────────────

export async function runSync(userId: string): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase is not configured. Running in local-only mode.' };
  }

  // Guard against local offline dummy accounts
  if (userId.startsWith('local_') || userId === 'local_user') {
    return { success: true, message: 'Local session active. Cloud sync skipped.' };
  }

  // Ensure active Supabase Auth session exists
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.user) {
    return { success: false, message: 'No active Supabase session. Please login to sync.' };
  }

  try {
    console.log(`[Sync] Starting sync for user: ${userId}`);

    const profile = await sqlite.getUserProfile(userId);
    const businessId = profile?.businessId || userId;

    // 1. PUSH local changes to Supabase
    await pushLocalChanges(userId, businessId, profile);

    // 2. PULL remote changes from Supabase
    await pullRemoteChanges(userId, businessId);

    console.log(`[Sync] Completed successfully for user: ${userId} (Business: ${businessId})`);
    return { success: true, message: 'Sync completed successfully.' };
  } catch (error) {
    console.error('[Sync] Failed:', error);
    return { success: false, message: `Sync failed: ${(error as Error).message}` };
  }
}

// ─── Push Local Changes ──────────────────────────────────────────────────────

async function pushLocalChanges(userId: string, businessId: string, profile: sqlite.UserProfile | null) {
  // A. Sync User Profile
  if (profile && profile.synced === 0) {
    console.log(`[Sync] Pushing user profile: ${userId}`);
    const { error } = await supabase.from('profiles').upsert({
      id: profile.id,
      business_id: profile.businessId,
      role: profile.role,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      salary: profile.salary,
      joining_date: profile.joiningDate,
      status: profile.status,
      last_updated: profile.lastUpdated,
    });
    if (!error) {
      await sqlite.markUserProfileSynced(userId);
    } else {
      console.warn('[Sync] Profile push failed:', error.message);
    }
  }

  // B. Sync Business Profile (Owner only)
  if (profile && profile.role === 'owner') {
    const biz = await sqlite.getBusinessProfile(businessId);
    if (biz && biz.synced === 0) {
      console.log(`[Sync] Pushing business profile: ${businessId}`);
      const { error } = await supabase.from('businesses').upsert({
        id: biz.id,
        business_name: biz.businessName,
        phone: biz.phone,
        address: biz.address,
        logo_uri: biz.logoUri,
        business_category: biz.businessCategory || 'general',
        last_updated: biz.lastUpdated,
      });
      if (!error) {
        await sqlite.markBusinessProfileSynced(businessId);
      } else {
        console.warn('[Sync] Business push failed:', error.message);
      }
    }
  }

  // C. Sync Products (batch upsert)
  const unsyncedProducts = await sqlite.getUnsyncedProducts(businessId, userId);
  if (unsyncedProducts.length > 0) {
    console.log(`[Sync] Pushing ${unsyncedProducts.length} products`);
    const rows = unsyncedProducts.map((p) => ({
      id: p.id,
      business_id: p.businessId || businessId,
      created_by: p.createdBy || userId,
      name: p.name,
      price: p.price,
      purchase_price: p.purchasePrice ?? 0,
      quantity: p.quantity,
      category: p.category,
      low_stock_threshold: p.lowStockThreshold,
      box_location: p.boxLocation || null,
      last_updated: p.lastUpdated,
      deleted: (p.deleted ?? 0) === 1,
    }));

    let { error } = await supabase.from('products').upsert(rows);
    if (error && ((error as any).code === '42703' || error.message?.includes('box_location') || error.message?.includes('purchase_price'))) {
      const fallbackRows = rows.map(({ box_location, ...rest }) => rest);
      const res = await supabase.from('products').upsert(fallbackRows);
      error = res.error;
    }
    if (!error) {
      for (const p of unsyncedProducts) {
        await sqlite.markProductSynced(p.id);
      }
    } else {
      console.warn('[Sync] Products push failed:', error.message);
    }
  }

  // D. Sync Invoices (with items)
  const unsyncedInvoices = await sqlite.getUnsyncedInvoices(businessId, userId);
  if (unsyncedInvoices.length > 0) {
    console.log(`[Sync] Pushing ${unsyncedInvoices.length} invoices`);
    for (const inv of unsyncedInvoices) {
      const items = await sqlite.getInvoiceItems(inv.id);

      const invPayload: any = {
        id: inv.id,
        business_id: inv.businessId || businessId,
        created_by: inv.createdBy || userId,
        customer_name: inv.customerName,
        customer_phone: inv.customerPhone,
        subtotal: inv.subtotal,
        discount: inv.discount,
        service_charges: inv.serviceCharges ?? 0,
        total: inv.total,
        created_at: inv.createdAt,
        last_updated: inv.lastUpdated,
        deleted: (inv.deleted ?? 0) === 1,
      };

      let { error: invError } = await supabase.from('invoices').upsert(invPayload);
      if (invError && (invError.message?.includes('service_charges') || (invError as any).code === '42703')) {
        delete invPayload.service_charges;
        const res = await supabase.from('invoices').upsert(invPayload);
        invError = res.error;
      }

      if (!invError) {
        // Push items
        if (items.length > 0) {
          const itemRows = items.map((item) => ({
            id: item.id,
            invoice_id: inv.id,
            product_id: item.productId,
            product_name: item.productName,
            price: item.price,
            quantity: item.quantity,
            total: item.total,
          }));
          await supabase.from('invoice_items').upsert(itemRows);
        }
        await sqlite.markInvoiceSynced(inv.id);
      } else {
        console.warn(`[Sync] Invoice ${inv.id} push failed:`, invError.message);
      }
    }
  }

  // E. Sync Expenses (batch upsert)
  const unsyncedExpenses = await sqlite.getUnsyncedExpenses(businessId, userId);
  if (unsyncedExpenses.length > 0) {
    console.log(`[Sync] Pushing ${unsyncedExpenses.length} expenses`);
    const rows = unsyncedExpenses.map((e) => ({
      id: e.id,
      business_id: e.businessId || businessId,
      created_by: e.createdBy || userId,
      title: e.title,
      amount: e.amount,
      category: e.category,
      date: e.date,
      last_updated: e.lastUpdated,
      deleted: (e.deleted ?? 0) === 1,
    }));

    const { error } = await supabase.from('expenses').upsert(rows);
    if (!error) {
      for (const e of unsyncedExpenses) {
        await sqlite.markExpenseSynced(e.id);
      }
    } else {
      console.warn('[Sync] Expenses push failed:', error.message);
    }
  }

  // F. Sync Customers (batch upsert)
  const unsyncedCustomers = await sqlite.getUnsyncedCustomers(businessId, userId);
  if (unsyncedCustomers.length > 0) {
    console.log(`[Sync] Pushing ${unsyncedCustomers.length} customers`);
    const rows = unsyncedCustomers.map((c) => ({
      id: c.id,
      business_id: c.businessId || businessId,
      name: c.name,
      phone: c.phone || '',
      address: c.address || '',
      notes: c.notes || '',
      credit_limit: c.creditLimit || 0,
      last_updated: c.lastUpdated,
      deleted: (c.deleted ?? 0) === 1,
    }));

    const { error } = await supabase.from('customers').upsert(rows);
    if (!error) {
      for (const c of unsyncedCustomers) {
        await sqlite.markCustomerSynced(c.id);
      }
    } else {
      console.warn('[Sync] Customers push failed:', error.message);
    }
  }

  // G. Sync Installment Accounts (with payments)
  const unsyncedInstallments = await sqlite.getUnsyncedInstallmentAccounts(businessId, userId);
  if (unsyncedInstallments.length > 0) {
    console.log(`[Sync] Pushing ${unsyncedInstallments.length} installments`);
    for (const inst of unsyncedInstallments) {
      const payments = await sqlite.getInstallmentPayments(inst.id);

      const { error: instError } = await supabase.from('installment_accounts').upsert({
        id: inst.id,
        business_id: inst.businessId || businessId,
        created_by: inst.createdBy || userId,
        customer_name: inst.customerName,
        customer_phone: inst.customerPhone,
        product_name: inst.productName,
        total_amount: inst.totalAmount,
        down_payment: inst.downPayment,
        remaining_amount: inst.remainingAmount,
        months_tenure: inst.monthsTenure,
        interest_rate: inst.interestRate,
        monthly_emi: inst.monthlyEMI,
        next_due_date: inst.nextDueDate,
        status: inst.status,
        last_updated: inst.lastUpdated,
        deleted: (inst.deleted ?? 0) === 1,
      });

      if (!instError) {
        if (payments.length > 0) {
          const pmtRows = payments.map((pmt) => ({
            id: pmt.id,
            account_id: inst.id,
            amount_paid: pmt.amountPaid,
            payment_date: pmt.paymentDate,
            notes: pmt.notes,
          }));
          await supabase.from('installment_payments').upsert(pmtRows);
        }
        await sqlite.markInstallmentAccountSynced(inst.id);
      } else {
        console.warn(`[Sync] Installment ${inst.id} push failed:`, instError.message);
      }
    }
  }
}

// ─── Pull Remote Changes ─────────────────────────────────────────────────────

async function pullRemoteChanges(userId: string, businessId: string) {
  const nowStr = new Date().toISOString();

  // A. Pull Business Profile
  const { data: bizData } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single();

  if (bizData) {
    const localBiz = await sqlite.getBusinessProfile(businessId);
    // If local profile has pending changes (synced = 0), do not overwrite with remote
    if (localBiz && (localBiz.synced ?? 0) === 0) {
      console.log(`[Sync] Local business profile ${businessId} has pending local changes. Preserving local profile.`);
    } else {
      // Ensure local logo is never wiped if remote logo is empty string
      const finalLogo = bizData.logo_uri || localBiz?.logoUri || '';
      await sqlite.upsertBusinessProfile({
        id: businessId,
        businessName: bizData.business_name || localBiz?.businessName || 'My Business',
        phone: bizData.phone || localBiz?.phone || '',
        address: bizData.address || localBiz?.address || '',
        logoUri: finalLogo,
        businessCategory: bizData.business_category || localBiz?.businessCategory || 'general',
        synced: 1,
        lastUpdated: bizData.last_updated || nowStr,
      });
    }
  }

  // B. Pull Products
  const lastProductSync = (await sqlite.getSyncMetadata(`sync_products_${userId}`)) || '1970-01-01T00:00:00.000Z';
  const { data: remoteProducts } = await supabase
    .from('products')
    .select('*')
    .eq('business_id', businessId)
    .gt('last_updated', lastProductSync);

  if (remoteProducts && remoteProducts.length > 0) {
    console.log(`[Sync] Pulled ${remoteProducts.length} remote products`);
    for (const rp of remoteProducts) {
      const existing = await sqlite.getProductById(rp.id);
      const rawPp = rp.purchase_price ?? rp.purchasePrice;
      const pp = (rawPp !== null && rawPp !== undefined && Number(rawPp) > 0)
        ? Number(rawPp)
        : (existing?.purchasePrice ?? 0);

      await sqlite.upsertProduct({
        id: rp.id,
        userId: userId,
        businessId: rp.business_id || businessId,
        createdBy: rp.created_by || userId,
        name: rp.name,
        price: rp.price,
        purchasePrice: pp,
        quantity: rp.quantity,
        category: rp.category,
        lowStockThreshold: rp.low_stock_threshold ?? 5,
        boxLocation: rp.box_location || rp.boxLocation || existing?.boxLocation || null,
        listOnStore: (rp.list_on_store !== undefined ? Number(rp.list_on_store) : (rp.listOnStore !== undefined ? Number(rp.listOnStore) : existing?.listOnStore)) ?? 0,
        sku: rp.sku || existing?.sku || null,
        barcode: rp.barcode || existing?.barcode || null,
        unit: rp.unit || existing?.unit || null,
        brand: rp.brand || existing?.brand || null,
        supplier: rp.supplier || existing?.supplier || null,
        tax: (rp.tax !== undefined ? Number(rp.tax) : existing?.tax) ?? 0,
        description: rp.description || existing?.description || null,
        imageUrl: rp.image_url || rp.image_uri || existing?.imageUrl || null,
        status: rp.status || existing?.status || 'active',
        synced: 1,
        lastUpdated: rp.last_updated,
        deleted: rp.deleted ? 1 : 0,
      });
    }
  }
  await sqlite.setSyncMetadata(`sync_products_${userId}`, nowStr);

  // C. Pull Invoices
  const lastInvoiceSync = (await sqlite.getSyncMetadata(`sync_invoices_${userId}`)) || '1970-01-01T00:00:00.000Z';
  const { data: remoteInvoices } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('business_id', businessId)
    .gt('last_updated', lastInvoiceSync);

  if (remoteInvoices && remoteInvoices.length > 0) {
    console.log(`[Sync] Pulled ${remoteInvoices.length} remote invoices`);
    const sqliteDB = await sqlite.getDB();

    for (const ri of remoteInvoices) {
      await sqliteDB.withTransactionAsync(async () => {
        await sqliteDB.runAsync(
          `INSERT INTO invoices (id, userId, businessId, createdBy, customerName, customerPhone, subtotal, discount, serviceCharges, total, createdAt, synced, lastUpdated, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             customerName = excluded.customerName,
             customerPhone = excluded.customerPhone,
             subtotal = excluded.subtotal,
             discount = excluded.discount,
             serviceCharges = excluded.serviceCharges,
             total = excluded.total,
             createdAt = excluded.createdAt,
             synced = excluded.synced,
             lastUpdated = excluded.lastUpdated,
             deleted = excluded.deleted`,
          [
            ri.id, userId, ri.business_id || businessId, ri.created_by || userId,
            ri.customer_name, ri.customer_phone, ri.subtotal, ri.discount,
            ri.service_charges ?? 0,
            ri.total, ri.created_at, 1, ri.last_updated, ri.deleted ? 1 : 0,
          ]
        );

        // Replace items
        await sqliteDB.runAsync('DELETE FROM invoice_items WHERE invoiceId = ?', [ri.id]);
        const items = ri.invoice_items || [];
        for (const item of items) {
          await sqliteDB.runAsync(
            `INSERT INTO invoice_items (id, invoiceId, productId, productName, price, quantity, total)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id || `${ri.id}_${item.product_id}`,
              ri.id, item.product_id, item.product_name,
              item.price, item.quantity, item.total,
            ]
          );
        }
      });
    }
  }
  await sqlite.setSyncMetadata(`sync_invoices_${userId}`, nowStr);

  // D. Pull Expenses
  const lastExpenseSync = (await sqlite.getSyncMetadata(`sync_expenses_${userId}`)) || '1970-01-01T00:00:00.000Z';
  const { data: remoteExpenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('business_id', businessId)
    .gt('last_updated', lastExpenseSync);

  if (remoteExpenses && remoteExpenses.length > 0) {
    console.log(`[Sync] Pulled ${remoteExpenses.length} remote expenses`);
    for (const re of remoteExpenses) {
      await sqlite.upsertExpense({
        id: re.id,
        userId: userId,
        businessId: re.business_id || businessId,
        createdBy: re.created_by || userId,
        title: re.title,
        amount: re.amount,
        category: re.category,
        date: re.date,
        synced: 1,
        lastUpdated: re.last_updated,
        deleted: re.deleted ? 1 : 0,
      });
    }
  }
  await sqlite.setSyncMetadata(`sync_expenses_${userId}`, nowStr);

  // E. Pull Installment Accounts
  const lastInstSync = (await sqlite.getSyncMetadata(`sync_installments_${userId}`)) || '1970-01-01T00:00:00.000Z';
  const { data: remoteInst } = await supabase
    .from('installment_accounts')
    .select('*')
    .eq('business_id', businessId)
    .gt('last_updated', lastInstSync);

  if (remoteInst && remoteInst.length > 0) {
    console.log(`[Sync] Pulled ${remoteInst.length} remote installments`);
    const sqliteDB = await sqlite.getDB();

    for (const ri of remoteInst) {
      await sqliteDB.withTransactionAsync(async () => {
        await sqliteDB.runAsync(
          `INSERT INTO installment_accounts (id, userId, businessId, createdBy, customerName, customerPhone, productName, totalAmount, downPayment, remainingAmount, monthsTenure, interestRate, monthlyEMI, nextDueDate, status, synced, lastUpdated, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             customerName = excluded.customerName,
             customerPhone = excluded.customerPhone,
             productName = excluded.productName,
             totalAmount = excluded.totalAmount,
             downPayment = excluded.downPayment,
             remainingAmount = excluded.remainingAmount,
             monthsTenure = excluded.monthsTenure,
             interestRate = excluded.interestRate,
             monthlyEMI = excluded.monthlyEMI,
             nextDueDate = excluded.nextDueDate,
             status = excluded.status,
             synced = excluded.synced,
             lastUpdated = excluded.lastUpdated,
             deleted = excluded.deleted`,
          [
            ri.id, userId, ri.business_id || businessId, ri.created_by || userId,
            ri.customer_name, ri.customer_phone, ri.product_name,
            ri.total_amount, ri.down_payment, ri.remaining_amount,
            ri.months_tenure, ri.interest_rate, ri.monthly_emi,
            ri.next_due_date, ri.status, 1, ri.last_updated,
            ri.deleted ? 1 : 0,
          ]
        );

        // Pull payments for this account
        const { data: pmts } = await supabase
          .from('installment_payments')
          .select('*')
          .eq('account_id', ri.id);

        if (pmts && pmts.length > 0) {
          await sqliteDB.runAsync('DELETE FROM installment_payments WHERE accountId = ?', [ri.id]);
          for (const pmt of pmts) {
            await sqliteDB.runAsync(
              `INSERT INTO installment_payments (id, accountId, amountPaid, paymentDate, notes)
               VALUES (?, ?, ?, ?, ?)`,
              [pmt.id, ri.id, pmt.amount_paid, pmt.payment_date, pmt.notes]
            );
          }
        }
      });
    }
  }
  await sqlite.setSyncMetadata(`sync_installments_${userId}`, nowStr);

  // F. Pull Customers
  const lastCustomerSync = (await sqlite.getSyncMetadata(`sync_customers_${userId}`)) || '1970-01-01T00:00:00.000Z';
  const { data: remoteCustomers } = await supabase
    .from('customers')
    .select('*')
    .eq('business_id', businessId)
    .gt('last_updated', lastCustomerSync);

  if (remoteCustomers && remoteCustomers.length > 0) {
    console.log(`[Sync] Pulled ${remoteCustomers.length} remote customers`);
    for (const rc of remoteCustomers) {
      await sqlite.upsertCustomer({
        id: rc.id,
        businessId: rc.business_id || businessId,
        name: rc.name,
        phone: rc.phone || '',
        address: rc.address || '',
        notes: rc.notes || '',
        creditLimit: rc.credit_limit || 0,
        synced: 1,
        lastUpdated: rc.last_updated,
        deleted: rc.deleted ? 1 : 0,
      });
    }
  }
  await sqlite.setSyncMetadata(`sync_customers_${userId}`, nowStr);
}
