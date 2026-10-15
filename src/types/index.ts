/**
 * Central Type Definitions for Vaypar
 *
 * All shared types, enums, and Zod schemas live here.
 * Module-specific types remain in their respective service files.
 */

import { z } from 'zod';

// ─── User Roles ───────────────────────────────────────────────────────────────

export const USER_ROLES = [
  'owner',
  'manager',
  'employee',
  'waiter',
  'kitchen',
  'cook',
  'cashier',
  'receptionist',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles that can manage business settings and staff */
export const ADMIN_ROLES: readonly UserRole[] = ['owner', 'manager'] as const;

/** Roles that can access financial reports */
export const FINANCE_ROLES: readonly UserRole[] = ['owner', 'manager'] as const;

/** Roles that can create sales / invoices */
export const SALES_ROLES: readonly UserRole[] = ['owner', 'manager', 'cashier', 'waiter', 'employee'] as const;

/** Roles that operate in the kitchen */
export const KITCHEN_ROLES: readonly UserRole[] = ['kitchen', 'cook'] as const;

/** Roles that can manage products / inventory */
export const INVENTORY_ROLES: readonly UserRole[] = ['owner', 'manager', 'employee'] as const;

// ─── Role Check Helpers ───────────────────────────────────────────────────────

export function isAdminRole(role: UserRole): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export function isFinanceRole(role: UserRole): boolean {
  return (FINANCE_ROLES as readonly string[]).includes(role);
}

export function isSalesRole(role: UserRole): boolean {
  return (SALES_ROLES as readonly string[]).includes(role);
}

export function isKitchenRole(role: UserRole): boolean {
  return (KITCHEN_ROLES as readonly string[]).includes(role);
}

export function isInventoryRole(role: UserRole): boolean {
  return (INVENTORY_ROLES as readonly string[]).includes(role);
}

// ─── Sync Status ──────────────────────────────────────────────────────────────

export type SyncStatus = 'synced' | 'pending' | 'error';

export function syncFlagToStatus(synced: number | undefined): SyncStatus {
  if (synced === 1) return 'synced';
  if (synced === 0) return 'pending';
  return 'error';
}

// ─── Business Category Types ──────────────────────────────────────────────────

export type { BusinessCategoryId, BusinessCategory, DashboardWidget, NavTab } from '../constants/businessCategories';

// ─── Zod Validation Schemas (Shared) ──────────────────────────────────────────

export const emailSchema = z.string().email('Invalid email address');

export const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export const phoneSchema = z.string().min(9, 'Please enter a valid phone number');

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const businessProfileSchema = z.object({
  businessName: z.string().min(3, 'Business name must be at least 3 characters'),
  phone: phoneSchema,
  address: z.string().min(5, 'Address must be at least 5 characters'),
  logoUri: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const staffMemberSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: emailSchema,
  phone: phoneSchema,
  role: z.enum(['manager', 'cashier', 'waiter', 'kitchen', 'cook', 'employee', 'receptionist']),
  salary: z.number().min(0, 'Salary must be positive'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  price: z.number().min(0, 'Price must be positive'),
  quantity: z.number().int().min(0, 'Quantity must be positive'),
  category: z.string().min(1, 'Category is required'),
  lowStockThreshold: z.number().int().min(0).default(5),
});

export const expenseSchema = z.object({
  title: z.string().min(1, 'Expense title is required'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  category: z.string().min(1, 'Category is required'),
  date: z.string().min(1, 'Date is required'),
});

// ─── Common Utility Types ─────────────────────────────────────────────────────

/** Pagination parameters for list queries */
export interface PaginationParams {
  page: number;
  pageSize: number;
  cursor?: string;
}

/** Paginated result wrapper */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

/** Generic API response */
export interface ApiResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Generic record with sync metadata */
export interface SyncableRecord {
  id: string;
  businessId: string;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}
