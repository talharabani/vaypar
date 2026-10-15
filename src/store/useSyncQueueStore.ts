import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

interface PendingMutation {
  id: string;
  table: string;
  action: 'insert' | 'update' | 'upsert' | 'delete';
  data: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

interface SyncQueueState {
  queue: PendingMutation[];
  isOnline: boolean;
  syncProgress: number; // 0 to 100
  isSyncing: boolean;
  pushMutation: (table: string, action: PendingMutation['action'], data: Record<string, unknown>) => Promise<void>;
  executeQueue: () => Promise<void>;
  setIsOnline: (status: boolean) => void;
  loadQueue: () => Promise<void>;
  clearQueue: () => Promise<void>;
}

const STORAGE_KEY = 'vyapar_sync_queue';
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;

/** Generate a unique mutation ID */
function generateMutationId(): string {
  return 'mut-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

/** Persist the queue to AsyncStorage */
async function persistQueue(queue: PendingMutation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('[SyncQueue] Failed to persist queue:', err);
  }
}

export const useSyncQueueStore = create<SyncQueueState>((set, get) => ({
  queue: [],
  isOnline: false,
  syncProgress: 0,
  isSyncing: false,

  loadQueue: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: PendingMutation[] = JSON.parse(stored);
        // Filter out mutations that have exceeded max retries
        const valid = parsed.filter((m) => (m.retryCount || 0) < MAX_RETRIES);
        set({ queue: valid });
      }
    } catch (err) {
      console.error('[SyncQueue] Failed to load queue:', err);
    }
  },

  pushMutation: async (table, action, data) => {
    const { queue } = get();

    // Deduplication: If there's already a pending mutation for the same record + table,
    // replace it instead of adding a duplicate
    const recordId = (data as Record<string, unknown>).id as string | undefined;
    let newQueue: PendingMutation[];

    if (recordId) {
      const existingIdx = queue.findIndex(
        (m) => m.table === table && (m.data as Record<string, unknown>).id === recordId
      );

      const mutation: PendingMutation = {
        id: generateMutationId(),
        table,
        action,
        data,
        timestamp: Date.now(),
        retryCount: 0,
      };

      if (existingIdx !== -1) {
        // Replace existing mutation for same record (latest write wins)
        newQueue = [...queue];
        newQueue[existingIdx] = mutation;
        console.log(`[SyncQueue] Deduplicated mutation for ${table}/${recordId}`);
      } else {
        newQueue = [...queue, mutation];
      }
    } else {
      newQueue = [
        ...queue,
        {
          id: generateMutationId(),
          table,
          action,
          data,
          timestamp: Date.now(),
          retryCount: 0,
        },
      ];
    }

    set({ queue: newQueue });
    await persistQueue(newQueue);

    // If online, immediately process
    if (get().isOnline && !get().isSyncing) {
      get().executeQueue().catch((err) => {
        console.warn('[SyncQueue] Auto-sync failed:', err);
      });
    }
  },

  executeQueue: async () => {
    const { queue, isOnline, isSyncing } = get();
    if (!isOnline || queue.length === 0 || isSyncing) return;

    console.log(`[SyncQueue] Starting sync for ${queue.length} pending operations...`);
    set({ isSyncing: true, syncProgress: 0 });

    const remainingQueue = [...queue];
    let completedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const mutation = queue[i];
      let success = false;

      try {
        if (mutation.action === 'insert') {
          const { error } = await supabase.from(mutation.table).insert(mutation.data);
          if (!error) success = true;
          else console.warn(`[SyncQueue] Insert ${mutation.id} error:`, error.message);
        } else if (mutation.action === 'update') {
          const { error } = await supabase
            .from(mutation.table)
            .update(mutation.data)
            .eq('id', mutation.data.id as string);
          if (!error) success = true;
          else console.warn(`[SyncQueue] Update ${mutation.id} error:`, error.message);
        } else if (mutation.action === 'upsert') {
          const { error } = await supabase.from(mutation.table).upsert(mutation.data);
          if (!error) success = true;
          else console.warn(`[SyncQueue] Upsert ${mutation.id} error:`, error.message);
        } else if (mutation.action === 'delete') {
          const { error } = await supabase
            .from(mutation.table)
            .delete()
            .eq('id', mutation.data.id as string);
          if (!error) success = true;
          else console.warn(`[SyncQueue] Delete ${mutation.id} error:`, error.message);
        }
      } catch (err) {
        console.warn(`[SyncQueue] Mutation ${mutation.id} threw:`, err);
      }

      if (success) {
        completedCount++;
        const idx = remainingQueue.findIndex((q) => q.id === mutation.id);
        if (idx !== -1) {
          remainingQueue.splice(idx, 1);
        }
        set({
          queue: [...remainingQueue],
          syncProgress: Math.round(((completedCount) / queue.length) * 100),
        });
        await persistQueue(remainingQueue);
      } else {
        // Increment retry count
        const idx = remainingQueue.findIndex((q) => q.id === mutation.id);
        if (idx !== -1) {
          remainingQueue[idx] = {
            ...remainingQueue[idx],
            retryCount: (remainingQueue[idx].retryCount || 0) + 1,
          };

          // If max retries exceeded, remove from queue
          if (remainingQueue[idx].retryCount >= MAX_RETRIES) {
            console.warn(`[SyncQueue] Mutation ${mutation.id} exceeded max retries, removing.`);
            remainingQueue.splice(idx, 1);
          }
        }

        // Apply exponential backoff delay before next attempt
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, mutation.retryCount || 0);
        await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 10000)));
      }
    }

    set({ syncProgress: 100, isSyncing: false });
    await persistQueue(remainingQueue);

    // Reset progress indicator after 3 seconds
    setTimeout(() => set({ syncProgress: 0 }), 3000);
  },

  setIsOnline: (status) => {
    const wasOffline = !get().isOnline;
    set({ isOnline: status });

    // Trigger sync when coming back online
    if (status && wasOffline && !get().isSyncing) {
      get().executeQueue().catch((err) => {
        console.warn('[SyncQueue] Online reconnect sync failed:', err);
      });
    }
  },

  clearQueue: async () => {
    set({ queue: [], syncProgress: 0 });
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
}));
