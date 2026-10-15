import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getDB } from '../services/sqlite';
import {
  BusinessCategory,
  BusinessCategoryId,
  getCategoryById,
} from '../constants/businessCategories';
import { useAuth } from './AuthContext';

interface BusinessContextType {
  category: BusinessCategory;
  categoryId: BusinessCategoryId;
  hasModule: (moduleId: string) => boolean;
  updateCategory: (id: BusinessCategoryId) => Promise<void>;
  loadingCategory: boolean;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState<BusinessCategoryId>('general');
  const [loadingCategory, setLoadingCategory] = useState(true);

  const loadCategory = useCallback(async () => {
    if (!user?.businessId) {
      setLoadingCategory(false);
      return;
    }
    try {
      const db = await getDB();
      const row = await db.getFirstAsync<{ businessCategory: string | null }>(
        'SELECT businessCategory FROM businesses WHERE id = ?',
        [user.businessId]
      );
      const id = (row?.businessCategory as BusinessCategoryId | null) ?? 'general';
      setCategoryId(id);
    } catch (err) {
      console.error('[BusinessContext] Failed to load category:', err);
      setCategoryId('general');
    } finally {
      setLoadingCategory(false);
    }
  }, [user?.businessId]);

  useEffect(() => {
    setLoadingCategory(true);
    loadCategory();
  }, [loadCategory]);

  const updateCategory = useCallback(async (id: BusinessCategoryId) => {
    if (!user?.businessId) return;
    try {
      const db = await getDB();
      await db.runAsync(
        'UPDATE businesses SET businessCategory = ?, lastUpdated = ? WHERE id = ?',
        [id, new Date().toISOString(), user.businessId]
      );
      setCategoryId(id);
    } catch (err) {
      console.error('[BusinessContext] Failed to update category:', err);
      throw err;
    }
  }, [user?.businessId]);

  const category = getCategoryById(categoryId);

  const hasModule = useCallback(
    (moduleId: string) => category.modules.includes(moduleId),
    [category]
  );

  return (
    <BusinessContext.Provider
      value={{ category, categoryId, hasModule, updateCategory, loadingCategory }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessCategory(): BusinessContextType {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusinessCategory must be used within a BusinessProvider');
  return ctx;
}
