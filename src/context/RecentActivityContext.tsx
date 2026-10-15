/**
 * RecentActivityContext
 *
 * Tracks a per-business log of recently opened records across all screens.
 * Persisted to AsyncStorage — survives app restarts, keyed by businessId.
 *
 * Max 20 items. Duplicate recordId entries are moved to top (most recent first).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordType =
  | 'invoice'
  | 'product'
  | 'customer'
  | 'warranty'
  | 'expense'
  | 'staff'
  | 'tailor_order'
  | 'gym_member'
  | 'salon_appt'
  | 'queue_token'
  | 'screen';

export interface RecentItem {
  /** Unique visit log ID (not the record ID) */
  id: string;
  /** The underlying record's ID */
  recordId: string;
  type: RecordType;
  /** Primary display label */
  title: string;
  /** Secondary info — amount, date, phone, etc. */
  subtitle?: string;
  /** Ionicons icon name */
  icon: string;
  /** Accent colour for the icon background */
  color: string;
  /** Route to push when tapped */
  route: string;
  /** ISO timestamp of the visit */
  visitedAt: string;
}

const MAX_ITEMS = 20;
const STORAGE_KEY_BASE = 'recent_activity_v1';

// ─── Context ──────────────────────────────────────────────────────────────────

interface RecentActivityContextType {
  recentItems: RecentItem[];
  logVisit: (item: Omit<RecentItem, 'id' | 'visitedAt'>) => void;
  clearAll: () => void;
}

const RecentActivityContext = createContext<RecentActivityContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RecentActivityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const storageKey = user?.businessId
    ? `${STORAGE_KEY_BASE}_${user.businessId}`
    : null;

  // Use a ref to avoid stale closures in logVisit
  const recentItemsRef = useRef<RecentItem[]>([]);
  recentItemsRef.current = recentItems;

  // Load from AsyncStorage when user is available
  useEffect(() => {
    if (!storageKey) return;
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as RecentItem[];
            setRecentItems(parsed);
          } catch {
            setRecentItems([]);
          }
        }
      })
      .catch(() => {});
  }, [storageKey]);

  const persist = useCallback(
    (items: RecentItem[]) => {
      if (!storageKey) return;
      AsyncStorage.setItem(storageKey, JSON.stringify(items)).catch(() => {});
    },
    [storageKey]
  );

  const logVisit = useCallback(
    (item: Omit<RecentItem, 'id' | 'visitedAt'>) => {
      const now = new Date().toISOString();
      const newEntry: RecentItem = {
        ...item,
        id: 'rv_' + Math.random().toString(36).substring(2, 11),
        visitedAt: now,
      };

      setRecentItems(prev => {
        // Remove any existing entry for the same recordId (dedup/move-to-top)
        const filtered = prev.filter(r => r.recordId !== item.recordId);
        const updated = [newEntry, ...filtered].slice(0, MAX_ITEMS);
        persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const clearAll = useCallback(() => {
    setRecentItems([]);
    if (storageKey) AsyncStorage.removeItem(storageKey).catch(() => {});
  }, [storageKey]);

  return (
    <RecentActivityContext.Provider value={{ recentItems, logVisit, clearAll }}>
      {children}
    </RecentActivityContext.Provider>
  );
}

export function useRecentActivity(): RecentActivityContextType {
  const ctx = useContext(RecentActivityContext);
  if (!ctx) throw new Error('useRecentActivity must be used within a RecentActivityProvider');
  return ctx;
}

// ─── Record-type helpers ──────────────────────────────────────────────────────

export const RECORD_TYPE_META: Record<
  RecordType,
  { icon: string; color: string; label: string }
> = {
  invoice:      { icon: 'receipt',              color: '#10B981', label: 'Invoice'      },
  product:      { icon: 'cube',                 color: '#6D5DF6', label: 'Product'      },
  customer:     { icon: 'person',               color: '#3B82F6', label: 'Customer'     },
  warranty:     { icon: 'shield-checkmark',     color: '#F59E0B', label: 'Warranty'     },
  expense:      { icon: 'wallet',               color: '#EF4444', label: 'Expense'      },
  staff:        { icon: 'people',               color: '#8B5CF6', label: 'Staff'        },
  tailor_order: { icon: 'cut',                  color: '#EC4899', label: 'Tailor Order' },
  gym_member:   { icon: 'barbell',              color: '#F97316', label: 'Gym Member'   },
  salon_appt:   { icon: 'calendar',             color: '#14B8A6', label: 'Appointment'  },
  queue_token:  { icon: 'people-circle',        color: '#6366F1', label: 'Queue Token'  },
  screen:       { icon: 'navigate-circle',      color: '#64748B', label: 'Screen'       },
};
