/* eslint-disable react-hooks/set-state-in-effect */
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as sqlite from '../services/sqlite';
import { runSync } from '../services/sync';
import { type UserRole, isAdminRole, isFinanceRole, isInventoryRole } from '../types';
import { useAuth } from './AuthContext';

interface DatabaseContextType {
  products: sqlite.Product[];
  invoices: sqlite.Invoice[];
  expenses: sqlite.Expense[];
  customers: sqlite.Customer[];
  installmentAccounts: sqlite.InstallmentAccount[];
  staffList: sqlite.UserProfile[];
  activityLogs: sqlite.ActivityLog[];
  returnsExchanges: sqlite.ReturnExchange[];
  loadingData: boolean;
  syncing: boolean;
  networkConnected: boolean;
  syncMessage: string;
  refreshData: () => Promise<void>;
  triggerSync: () => Promise<void>;
  
  // Product Operations
  addProduct: (name: string, price: number, quantity: number, category: string, lowStockThreshold: number, purchasePrice?: number, boxLocation?: string, listOnStore?: number) => Promise<void>;
  editProduct: (id: string, name: string, price: number, quantity: number, category: string, lowStockThreshold: number, purchasePrice?: number, boxLocation?: string, listOnStore?: number) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  
  // Invoice Operations
  createInvoice: (customerName: string, customerPhone: string, subtotal: number, discount: number, total: number, items: Omit<sqlite.InvoiceItem, 'id' | 'invoiceId'>[], serviceCharges?: number) => Promise<string>;
  deleteInvoice: (id: string) => Promise<void>;
  
  // Returns & Exchanges Operations
  createReturnExchange: (data: Omit<sqlite.ReturnExchange, 'id' | 'businessId' | 'createdAt' | 'synced' | 'lastUpdated' | 'deleted'>) => Promise<sqlite.ReturnExchange>;

  // Customer Operations
  addCustomer: (name: string, phone: string, address?: string, notes?: string) => Promise<sqlite.Customer>;

  // Expense Operations
  addExpense: (title: string, amount: number, category: string, date: string) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  // Installment Operations
  addInstallmentAccount: (customerName: string, customerPhone: string, productName: string, totalAmount: number, downPayment: number, monthsTenure: number, interestRate: number) => Promise<void>;
  payInstallment: (accountId: string, amountPaid: number, notes: string) => Promise<void>;
  deleteInstallmentAccount: (id: string) => Promise<void>;

  // Staff operations (Owner/Manager)
  addStaffMember: (name: string, email: string, phone: string, role: Exclude<UserRole, 'owner'>, salary: number, password?: string) => Promise<sqlite.UserProfile>;
  editStaffMember: (id: string, name: string, phone: string, role: Exclude<UserRole, 'owner'>, salary: number, status: 'active' | 'inactive') => Promise<void>;
  
  // Salary operations (Owner-only)
  getStaffSalaryPayments: (staffId: string) => Promise<sqlite.SalaryPayment[]>;
  payStaffSalary: (staffId: string, month: string, amount: number, bonus: number, deduction: number, notes: string) => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<sqlite.Product[]>([]);
  const [invoices, setInvoices] = useState<sqlite.Invoice[]>([]);
  const [expenses, setExpenses] = useState<sqlite.Expense[]>([]);
  const [customers, setCustomers] = useState<sqlite.Customer[]>([]);
  const [installmentAccounts, setInstallmentAccounts] = useState<sqlite.InstallmentAccount[]>([]);
  const [staffList, setStaffList] = useState<sqlite.UserProfile[]>([]);
  const [activityLogs, setActivityLogs] = useState<sqlite.ActivityLog[]>([]);
  const [returnsExchanges, setReturnsExchanges] = useState<sqlite.ReturnExchange[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [networkConnected, setNetworkConnected] = useState(true);
  const [syncMessage, setSyncMessage] = useState('');

  // 1. Monitor network state
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setNetworkConnected(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // 2. Activity logger helper
  const logActivity = useCallback(async (action: string) => {
    if (!user) return;
    try {
      const now = new Date().toISOString();
      const newLog: sqlite.ActivityLog = {
        id: 'log_' + Math.random().toString(36).substring(2, 15),
        businessId: user.businessId,
        userId: user.id,
        userName: user.name || user.email,
        action,
        timestamp: now,
        synced: 0,
        lastUpdated: now
      };
      await sqlite.insertActivityLog(newLog);
    } catch (e) {
      console.error('Failed to insert activity log:', e);
    }
  }, [user]);

  // 3. Load data from SQLite when user changes
  const refreshData = useCallback(async () => {
    if (!user) {
      setProducts([]);
      setInvoices([]);
      setExpenses([]);
      setCustomers([]);
      setInstallmentAccounts([]);
      setStaffList([]);
      setActivityLogs([]);
      setReturnsExchanges([]);
      return;
    }

    setLoadingData(true);
    try {
      // Fetch core datasets scoped to the businessId
      let [dbProducts, dbInvoices, dbExpenses, dbInstallments, dbCustomers, dbReturns] = await Promise.all([
        sqlite.getProducts(user.businessId),
        sqlite.getInvoices(user.businessId),
        sqlite.getExpenses(user.businessId),
        sqlite.getInstallmentAccounts(user.businessId),
        sqlite.getCustomers(user.businessId),
        sqlite.getReturnsExchanges(user.businessId),
      ]);

      // Auto-backfill existing salary payments into expenses so all cashflow & expenses are 100% accurate
      try {
        const salaryPayments = await sqlite.getSalaryPayments(user.businessId);
        if (salaryPayments && salaryPayments.length > 0) {
          const staffMembers = await sqlite.getStaffMembers(user.businessId);
          for (const sal of salaryPayments) {
            const expId = 'exp_' + sal.id;
            const netAmount = Math.max(0, (sal.amount || 0) + (sal.bonus || 0) - (sal.deduction || 0));
            const existingExp = dbExpenses.find(e => e.id === expId || e.id === 'exp_sal_' + sal.id);
            if (!existingExp && netAmount > 0 && sal.status === 'paid') {
              const staff = staffMembers.find(s => s.id === sal.userId);
              const pDate = sal.paymentDate ? sal.paymentDate.split('T')[0] : (sal.lastUpdated ? sal.lastUpdated.split('T')[0] : new Date().toISOString().split('T')[0]);
              const newSalaryExp: sqlite.Expense = {
                id: expId,
                userId: user.id,
                businessId: user.businessId,
                createdBy: user.id,
                title: `Staff Salary - ${staff?.name || 'Employee'} (${sal.month})`,
                amount: netAmount,
                category: 'Staff Salaries',
                date: pDate,
                synced: 0,
                lastUpdated: sal.lastUpdated || new Date().toISOString(),
                deleted: 0
              };
              await sqlite.upsertExpense(newSalaryExp);
              dbExpenses.push(newSalaryExp);
            }
          }
        }
      } catch (salErr) {
        console.warn('[DatabaseContext] Auto-sync salary expenses error:', salErr);
      }
      
      setProducts(dbProducts);
      setInvoices(dbInvoices);
      setExpenses(dbExpenses);
      setCustomers(dbCustomers);
      setInstallmentAccounts(dbInstallments);
      setReturnsExchanges(dbReturns);

      // Publish a localStorage snapshot so the public /store page can read
      // catalog data without needing the SQLite lock (which is held by this tab).
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const bizProfile = await sqlite.getBusinessProfile(user.businessId);
          const storeSnapshot = {
            business: bizProfile,
            products: dbProducts.filter(p => p.quantity > 0 && !p.deleted && p.listOnStore === 1),
            updatedAt: new Date().toISOString(),
          };
          window.localStorage.setItem(
            `vaypar_store_${user.businessId}`,
            JSON.stringify(storeSnapshot)
          );
          // Also write a slug → businessId index so the store page can look up by slug
          if (bizProfile) {
            const slug = bizProfile.businessName
              .toLowerCase().trim()
              .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
            window.localStorage.setItem(`vaypar_slug_${slug}`, user.businessId);
          }
        } catch (e) {
          // Non-critical — store page will fall back to SQLite attempt
          console.warn('[DatabaseContext] Failed to write store snapshot to localStorage:', e);
        }
      }

      // Load staff list (Owner only)
      if (user.role === 'owner') {
        const dbStaff = await sqlite.getStaffMembers(user.businessId);
        setStaffList(dbStaff);
      } else {
        setStaffList([]);
      }

      // Load activity logs (Owner and Manager only)
      if (user.role === 'owner' || user.role === 'manager') {
        const dbLogs = await sqlite.getActivityLogs(user.businessId);
        setActivityLogs(dbLogs);
      } else {
        setActivityLogs([]);
      }
    } catch (error) {
      console.error('Failed to load local SQLite business data:', error);
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // 4. Cloud Sync Trigger (Ref-guarded against render loops)
  const syncingRef = useRef(false);
  const lastSyncedUserRef = useRef<string | null>(null);

  const triggerSync = useCallback(async () => {
    if (!user || !networkConnected || syncingRef.current) return;
    
    // Don't sync if in local-only demo mode
    if (user.id === 'local_user' || user.id.startsWith('local_')) return;

    syncingRef.current = true;
    setSyncing(true);
    setSyncMessage('Syncing with cloud...');
    try {
      // Sync scoped to their user ID (or business ID)
      const result = await runSync(user.id);
      setSyncMessage(result.message);
      
      if (result.success) {
        await refreshData();
      }
    } catch (e) {
      console.error('Sync failed:', e);
      setSyncMessage('Sync failed.');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [user?.id, networkConnected, refreshData]);

  // Auto-sync on network reconnect or login (runs once per user session)
  useEffect(() => {
    if (user && networkConnected && user.id !== 'local_user' && !user.id.startsWith('local_')) {
      if (lastSyncedUserRef.current !== user.id) {
        lastSyncedUserRef.current = user.id;
        triggerSync();
      }
    }
  }, [user?.id, networkConnected, triggerSync]);

  // ==========================================
  // Product Operations (RBAC Enforced)
  // ==========================================
  const addProduct = async (name: string, price: number, quantity: number, category: string, lowStockThreshold: number, purchasePrice?: number, boxLocation?: string, listOnStore?: number) => {
    if (!user) throw new Error('Authentication required');
    if (!isInventoryRole(user.role)) throw new Error('Access denied. You do not have permission to add products.');
    
    const now = new Date().toISOString();
    const newProduct: sqlite.Product = {
      id: 'prod_' + Math.random().toString(36).substring(2, 15),
      userId: user.id,
      businessId: user.businessId,
      createdBy: user.id,
      name,
      price,
      quantity,
      category,
      lowStockThreshold,
      purchasePrice: purchasePrice ?? 0,
      boxLocation: boxLocation ?? null,
      listOnStore: listOnStore ?? 0,
      synced: 0,
      lastUpdated: now,
      deleted: 0
    };

    await sqlite.upsertProduct(newProduct);
    await logActivity(`Created product "${name}" (Sale: PKR ${price.toFixed(2)}, Purchase: PKR ${(purchasePrice ?? 0).toFixed(2)})`);
    await refreshData();
    triggerSync();
  };

  const editProduct = async (id: string, name: string, price: number, quantity: number, category: string, lowStockThreshold: number, purchasePrice?: number, boxLocation?: string, listOnStore?: number) => {
    if (!user) throw new Error('Authentication required');
    if (!isInventoryRole(user.role)) throw new Error('Access denied. You do not have permission to edit products.');
    
    const existing = products.find(p => p.id === id);
    const now = new Date().toISOString();
    const updatedProduct: sqlite.Product = {
      id,
      userId: user.id,
      businessId: user.businessId,
      createdBy: user.id,
      name,
      price,
      quantity,
      category,
      lowStockThreshold,
      purchasePrice: (purchasePrice !== undefined && purchasePrice > 0) ? purchasePrice : (existing?.purchasePrice ?? 0),
      boxLocation: boxLocation !== undefined ? (boxLocation.trim() || null) : (existing?.boxLocation ?? null),
      listOnStore: listOnStore ?? existing?.listOnStore ?? 0,
      sku: existing?.sku ?? null,
      barcode: existing?.barcode ?? null,
      unit: existing?.unit ?? null,
      brand: existing?.brand ?? null,
      supplier: existing?.supplier ?? null,
      tax: existing?.tax ?? 0,
      description: existing?.description ?? null,
      imageUrl: existing?.imageUrl ?? null,
      status: existing?.status ?? 'active',
      synced: 0,
      lastUpdated: now,
      deleted: 0
    };

    await sqlite.upsertProduct(updatedProduct);
    await logActivity(`Updated product "${name}" to price: PKR ${price.toFixed(2)}, quantity: ${quantity}`);
    await refreshData();
    triggerSync();
  };

  const deleteProduct = async (id: string) => {
    if (!user) throw new Error('Authentication required');
    if (!isInventoryRole(user.role)) throw new Error('Access denied. You do not have permission to delete products.');
    
    const item = products.find(p => p.id === id);
    await sqlite.softDeleteProduct(id, user.id);
    await logActivity(`Deleted product "${item?.name || id}"`);
    await refreshData();
    triggerSync();
  };

  // ==========================================
  // Invoice Operations (RBAC Enforced)
  // ==========================================
  const createInvoice = async (
    customerName: string, 
    customerPhone: string, 
    subtotal: number, 
    discount: number, 
    total: number, 
    items: Omit<sqlite.InvoiceItem, 'id' | 'invoiceId'>[],
    serviceCharges: number = 0
  ) => {
    if (!user) throw new Error('Authentication required');
    
    const now = new Date().toISOString();
    const targetBizId = user.businessId || user.id;
    const invoiceId = await sqlite.getNextOrderNumber(targetBizId);
    
    const newInvoice: sqlite.Invoice = {
      id: invoiceId,
      userId: user.id,
      businessId: targetBizId,
      createdBy: user.id,
      customerName,
      customerPhone,
      subtotal,
      discount,
      serviceCharges: serviceCharges || 0,
      total,
      createdAt: now,
      synced: 0,
      lastUpdated: now,
      deleted: 0
    };

    const invoiceItems: sqlite.InvoiceItem[] = items.map((item, index) => ({
      id: `inv_item_${invoiceId}_${index}`,
      invoiceId,
      productId: item.productId,
      productName: item.productName,
      price: item.price,
      quantity: item.quantity,
      total: item.total
    }));

    await sqlite.createInvoice(newInvoice, invoiceItems);

    // Auto-save/update customer directory entry with phone & name
    if (customerPhone || customerName) {
      try {
        const cleanPhone = (customerPhone || '').trim();
        const existingCusts = cleanPhone ? await sqlite.searchCustomersByPhone(user.businessId, cleanPhone) : [];
        const existing = existingCusts.find(c => c.phone === cleanPhone);
        const custId = existing ? existing.id : ('cust_' + Math.random().toString(36).substring(2, 15));
        await sqlite.upsertCustomer({
          id: custId,
          businessId: user.businessId,
          name: customerName?.trim() || existing?.name || 'Customer',
          phone: cleanPhone,
          lastUpdated: now,
          deleted: 0
        });
      } catch (e) {
        console.warn('[DatabaseContext] Auto-save customer failed:', e);
      }
    }

    await logActivity(`Created sales invoice for customer "${customerName || 'Walk-in'}" (Total: PKR ${total.toFixed(2)}${serviceCharges > 0 ? `, Service Charges: PKR ${serviceCharges.toFixed(2)}` : ''})`);
    await refreshData();
    triggerSync();
    
    return invoiceId;
  };

  const createReturnExchange = async (data: Omit<sqlite.ReturnExchange, 'id' | 'businessId' | 'createdAt' | 'synced' | 'lastUpdated' | 'deleted'>): Promise<sqlite.ReturnExchange> => {
    if (!user) throw new Error('Authentication required');
    const now = new Date().toISOString();
    const id = 'ret_' + Math.random().toString(36).substring(2, 15);
    const record: sqlite.ReturnExchange = {
      ...data,
      id,
      businessId: user.businessId,
      createdAt: now,
      synced: 0,
      lastUpdated: now,
      deleted: 0
    };

    await sqlite.createReturnExchange(record);
    const actionDesc = data.type === 'exchange'
      ? `Exchanged ${data.quantity}x "${data.originalProductName}" for ${data.replacementQuantity}x "${data.replacementProductName}"`
      : `Refunded ${data.quantity}x "${data.originalProductName}" (PKR ${(data.refundAmount || 0).toFixed(2)})`;
    await logActivity(`Return/Exchange: ${actionDesc} for customer "${data.customerName || 'Walk-in'}"`);
    await refreshData();
    triggerSync();
    return record;
  };

  const addCustomer = async (name: string, phone: string, address?: string, notes?: string): Promise<sqlite.Customer> => {
    if (!user) throw new Error('Authentication required');
    const now = new Date().toISOString();
    const id = 'cust_' + Math.random().toString(36).substring(2, 15);
    const newCust: sqlite.Customer = {
      id,
      businessId: user.businessId,
      name: name.trim(),
      phone: phone.trim(),
      address: address?.trim() || '',
      notes: notes?.trim() || '',
      creditLimit: 0,
      synced: 0,
      lastUpdated: now,
      deleted: 0
    };
    await sqlite.upsertCustomer(newCust);
    await logActivity(`Created customer profile "${newCust.name}"`);
    await refreshData();
    triggerSync();
    return newCust;
  };

  const deleteInvoice = async (id: string) => {
    if (!user) throw new Error('Authentication required');
    if (!isAdminRole(user.role)) throw new Error('Access denied. Only admins can delete invoices.');
    
    const inv = invoices.find(i => i.id === id);
    await sqlite.softDeleteInvoice(id, user.id);
    await logActivity(`Deleted sales invoice #${id.toUpperCase()} (Customer: ${inv?.customerName || 'Walk-in'})`);
    await refreshData();
    triggerSync();
  };

  // ==========================================
  // Expense Operations (RBAC Enforced)
  // ==========================================
  const addExpense = async (title: string, amount: number, category: string, date: string) => {
    if (!user) throw new Error('Authentication required');
    if (!isFinanceRole(user.role)) throw new Error('Access denied. You do not have permission to record expenses.');
    
    const now = new Date().toISOString();
    const newExpense: sqlite.Expense = {
      id: 'exp_' + Math.random().toString(36).substring(2, 15),
      userId: user.id,
      businessId: user.businessId,
      createdBy: user.id,
      title,
      amount,
      category,
      date,
      synced: 0,
      lastUpdated: now,
      deleted: 0
    };

    await sqlite.upsertExpense(newExpense);
    await logActivity(`Recorded expense "${title}" (Amount: PKR ${amount.toFixed(2)})`);
    await refreshData();
    triggerSync();
  };

  const deleteExpense = async (id: string) => {
    if (!user) throw new Error('Authentication required');
    if (!isAdminRole(user.role)) throw new Error('Access denied. Only admins can delete expenses.');
    
    const exp = expenses.find(e => e.id === id);
    await sqlite.softDeleteExpense(id, user.id);
    await logActivity(`Deleted expense "${exp?.title || id}" (PKR ${exp?.amount.toFixed(2)})`);
    await refreshData();
    triggerSync();
  };

  // ==========================================
  // Installment Operations (RBAC Enforced)
  // ==========================================
  const addInstallmentAccount = async (
    customerName: string,
    customerPhone: string,
    productName: string,
    totalAmount: number,
    downPayment: number,
    monthsTenure: number,
    interestRate: number
  ) => {
    if (!user) throw new Error('Authentication required');
    if (!isAdminRole(user.role)) throw new Error('Access denied. Only admins can set up installment plans.');
    
    const now = new Date().toISOString();
    
    const principal = Math.max(0, totalAmount - downPayment);
    let monthlyEMI = principal / monthsTenure;
    
    if (interestRate > 0 && principal > 0) {
      const monthlyInterest = (interestRate / 100) / 12;
      const emiFactor = Math.pow(1 + monthlyInterest, monthsTenure);
      monthlyEMI = (principal * monthlyInterest * emiFactor) / (emiFactor - 1);
    }
    
    if (isNaN(monthlyEMI) || !isFinite(monthlyEMI)) {
      monthlyEMI = principal / monthsTenure;
    }
    
    const nextDue = new Date();
    nextDue.setMonth(nextDue.getMonth() + 1);
    const nextDueDateStr = nextDue.toISOString().split('T')[0];

    const accountId = 'inst_' + Math.random().toString(36).substring(2, 11);
    const newAccount: sqlite.InstallmentAccount = {
      id: accountId,
      userId: user.id,
      businessId: user.businessId,
      createdBy: user.id,
      customerName,
      customerPhone,
      productName,
      totalAmount,
      downPayment,
      remainingAmount: parseFloat((monthlyEMI * monthsTenure).toFixed(2)),
      monthsTenure,
      interestRate,
      monthlyEMI: parseFloat(monthlyEMI.toFixed(2)),
      nextDueDate: nextDueDateStr,
      status: 'active',
      synced: 0,
      lastUpdated: now,
      deleted: 0
    };

    let firstPayment: sqlite.InstallmentPayment | undefined;
    if (downPayment > 0) {
      firstPayment = {
        id: 'pmt_' + Math.random().toString(36).substring(2, 11),
        accountId: accountId,
        amountPaid: downPayment,
        paymentDate: now,
        notes: 'Initial Down Payment'
      };
    }

    await sqlite.createInstallmentAccount(newAccount, firstPayment);
    await logActivity(`Created installment contract for "${customerName}" (Product: ${productName})`);
    await refreshData();
    triggerSync();
  };

  const payInstallment = async (accountId: string, amountPaid: number, notes: string) => {
    if (!user) throw new Error('Authentication required');
    if (!isAdminRole(user.role)) throw new Error('Access denied. Only admins can log installment payments.');
    
    const now = new Date().toISOString();
    const currentAccount = installmentAccounts.find(a => a.id === accountId);
    if (!currentAccount) throw new Error('Account not found');
    
    const newRemainingAmount = Math.max(0, currentAccount.remainingAmount - amountPaid);
    
    const newPayment: sqlite.InstallmentPayment = {
      id: 'pmt_' + Math.random().toString(36).substring(2, 11),
      accountId,
      amountPaid,
      paymentDate: now,
      notes
    };

    await sqlite.addInstallmentPayment(newPayment, newRemainingAmount);
    await logActivity(`Logged installment payment PKR ${amountPaid.toFixed(2)} from "${currentAccount.customerName}"`);
    await refreshData();
    triggerSync();
  };

  const deleteInstallmentAccount = async (id: string) => {
    if (!user) throw new Error('Authentication required');
    if (!isAdminRole(user.role)) throw new Error('Access denied. Only admins can delete installment plans.');
    
    const account = installmentAccounts.find(a => a.id === id);
    await sqlite.softDeleteInstallmentAccount(id, user.id);
    await logActivity(`Deleted installment plan for "${account?.customerName || id}"`);
    await refreshData();
    triggerSync();
  };

  // ==========================================
  // Staff Operations (Owner-only)
  // ==========================================
  const addStaffMember = async (
    name: string, 
    email: string, 
    phone: string, 
    role: Exclude<UserRole, 'owner'>, 
    salary: number,
    password = 'Password123'
  ) => {
    if (!user) throw new Error('Authentication required');
    if (!isAdminRole(user.role)) throw new Error('Access denied. Only admins can manage staff.');
    
    const now = new Date().toISOString();
    const staffId = 'staff_' + Math.random().toString(36).substring(2, 15);
    
    const newStaff: sqlite.UserProfile = {
      id: staffId,
      businessId: user.businessId,
      role,
      name,
      email,
      phone,
      salary,
      joiningDate: now.split('T')[0],
      status: 'active',
      synced: 0,
      lastUpdated: now
    };

    // Store their credentials for local login fallback
    const db = await sqlite.getDB();
    await db.runAsync('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)', ['pwd_' + staffId, password]);
    
    await sqlite.upsertUserProfile(newStaff);
    await logActivity(`Added staff member "${name}" as a ${role}`);
    await refreshData();
    return newStaff;
  };

  const editStaffMember = async (
    id: string,
    name: string,
    phone: string,
    role: Exclude<UserRole, 'owner'>,
    salary: number,
    status: 'active' | 'inactive'
  ) => {
    if (!user) throw new Error('Authentication required');
    if (!isAdminRole(user.role)) throw new Error('Access denied. Only admins can edit staff.');
    
    const existing = staffList.find(s => s.id === id);
    if (!existing) throw new Error('Staff member not found');
    
    const now = new Date().toISOString();
    const updatedStaff: sqlite.UserProfile = {
      ...existing,
      name,
      phone,
      role,
      salary,
      status,
      synced: 0,
      lastUpdated: now
    };

    await sqlite.upsertUserProfile(updatedStaff);
    await logActivity(`Updated staff member "${name}" details (Status: ${status})`);
    await refreshData();
  };

  // ==========================================
  // Salary Operations (Owner-only)
  // ==========================================
  const getStaffSalaryPayments = async (staffId: string) => {
    if (!user) throw new Error('Authentication required');
    if (!isAdminRole(user.role)) throw new Error('Access denied. Only admins can view salaries.');
    return await sqlite.getSalaryPayments(user.businessId, staffId);
  };

  const payStaffSalary = async (
    staffId: string,
    month: string,
    amount: number,
    bonus: number,
    deduction: number,
    notes: string
  ) => {
    if (!user) throw new Error('Authentication required');
    if (!isAdminRole(user.role)) throw new Error('Access denied. Only admins can pay salaries.');
    
    const now = new Date().toISOString();
    const paymentId = 'sal_' + Math.random().toString(36).substring(2, 11);
    
    const newPayment: sqlite.SalaryPayment = {
      id: paymentId,
      userId: staffId,
      businessId: user.businessId,
      month,
      amount,
      bonus,
      deduction,
      status: 'paid',
      paymentDate: now,
      notes,
      synced: 0,
      lastUpdated: now
    };

    await sqlite.upsertSalaryPayment(newPayment);
    
    const staff = staffList.find(s => s.id === staffId);
    const staffName = staff?.name || 'Employee';
    const netSalary = Math.max(0, amount + bonus - deduction);

    // Auto-record salary payment into Expenses under 'Staff Salaries' category
    if (netSalary > 0) {
      const salaryExpenseId = 'exp_' + paymentId;
      const salaryExpense: sqlite.Expense = {
        id: salaryExpenseId,
        userId: user.id,
        businessId: user.businessId,
        createdBy: user.id,
        title: `Staff Salary - ${staffName} (${month})`,
        amount: netSalary,
        category: 'Staff Salaries',
        date: now.split('T')[0],
        synced: 0,
        lastUpdated: now,
        deleted: 0
      };
      await sqlite.upsertExpense(salaryExpense);
    }

    await logActivity(`Logged salary payment for "${staffName}" for month ${month} (Total: PKR ${netSalary.toFixed(2)})`);
    await refreshData();
    triggerSync().catch(err => console.warn('[DatabaseContext] triggerSync after salary payment failed:', err));
  };

  return (
    <DatabaseContext.Provider 
      value={{
        products,
        invoices,
        expenses,
        customers,
        installmentAccounts,
        staffList,
        activityLogs,
        returnsExchanges,
        loadingData,
        syncing,
        networkConnected,
        syncMessage,
        refreshData,
        triggerSync,
        
        addProduct,
        editProduct,
        deleteProduct,
        
        createInvoice,
        deleteInvoice,

        createReturnExchange,
        addCustomer,
        
        addExpense,
        deleteExpense,

        addInstallmentAccount,
        payInstallment,
        deleteInstallmentAccount,

        addStaffMember,
        editStaffMember,
        getStaffSalaryPayments,
        payStaffSalary
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}
