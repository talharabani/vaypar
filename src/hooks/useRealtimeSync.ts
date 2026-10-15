import { useEffect } from 'react';
import { useNotificationContext } from '../context/NotificationContext';
import * as sqlite from '../services/sqlite';
import { supabase } from '../services/supabase';
import { useSyncQueueStore } from '../store/useSyncQueueStore';
import type { UserRole } from '../types';

const isSupabaseConfigured =
  process.env.EXPO_PUBLIC_SUPABASE_URL &&
  process.env.EXPO_PUBLIC_SUPABASE_URL !== 'https://vyapar-demo.supabase.co';

// NetInfo helper or web fallback listener
function registerConnectionListener(onChange: (online: boolean) => void) {
  if (typeof window !== 'undefined' && 'addEventListener' in window) {
    const handleOnline = () => onChange(true);
    const handleOffline = () => onChange(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Initial state
    onChange(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  } else {
    // Native: try @react-native-community/netinfo, fallback to true
    try {
      const NetInfo = require('@react-native-community/netinfo');
      const unsubscribe = NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
        onChange(!!state.isConnected);
      });
      return () => unsubscribe();
    } catch {
      onChange(true);
      return () => {};
    }
  }
}

export function useRealtimeSync(businessId: string | undefined) {
  const setIsOnline = useSyncQueueStore(state => state.setIsOnline);
  const loadQueue = useSyncQueueStore(state => state.loadQueue);
  const { pushNotification } = useNotificationContext();

  // 1. Connection Monitor Setup
  useEffect(() => {
    loadQueue();
    const unsubscribe = registerConnectionListener((online) => {
      console.log(`[Realtime] Connection: ${online ? 'ONLINE' : 'OFFLINE'}`);
      setIsOnline(online);
    });
    return unsubscribe;
  }, [setIsOnline, loadQueue]);

  // 2. Real-time Subscription Channel Setup
  useEffect(() => {
    if (!businessId || !isSupabaseConfigured) return;

    console.log(`[Realtime] Connecting channel for business: ${businessId}`);
    
    const channel = supabase.channel(`biz_sync_${businessId}`)
      // ─── Profile changes (role updates, deactivations) ───────────────
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `business_id=eq.${businessId}`
        },
        async (payload) => {
          console.log('[Realtime] Profile update:', payload.eventType);
          if (payload.new) {
            const data = payload.new as Record<string, unknown>;
            try {
              const mappedUser: sqlite.UserProfile = {
                id: data.id as string,
                businessId: data.business_id as string,
                role: data.role as UserRole,
                name: data.name as string,
                email: data.email as string,
                phone: (data.phone as string) || '',
                salary: Number(data.salary || 0),
                joiningDate: data.joining_date as string,
                status: data.status as 'active' | 'inactive',
                synced: 1,
                lastUpdated: data.last_updated as string
              };
              await sqlite.upsertUserProfile(mappedUser);
            } catch (err) {
              console.error('[Realtime] Profile sync failed:', err);
            }
          }
        }
      )
      // ─── Notifications ─────────────────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `business_id=eq.${businessId}`
        },
        async (payload) => {
          console.log('[Realtime] Notification received:', payload.new);
          if (payload.new) {
            const notif = payload.new as Record<string, unknown>;
            try {
              // 1. Persist to local SQLite (mark as already synced)
              const sqliteDB = await sqlite.getDB();
              const result = await sqliteDB.runAsync(
                `INSERT OR IGNORE INTO notifications (id, businessId, type, title, message, createdAt, read, synced)
                 VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
                [
                  notif.id as string,
                  notif.business_id as string,
                  notif.type as string,
                  notif.title as string,
                  notif.message as string,
                  notif.created_at as string,
                ]
              );

              // 2. Fire to local listeners so NotificationContext shows the toast
              // Only dispatch if it was a genuinely new row (no duplicate)
              if (result.changes > 0) {
                const { emitLocalNotification } = await import('../services/notificationService');
                emitLocalNotification({
                  id: notif.id as string,
                  businessId: notif.business_id as string,
                  type: notif.type as string,
                  title: notif.title as string,
                  message: notif.message as string,
                  createdAt: notif.created_at as string,
                  read: 0,
                  synced: 1,
                });
              }
            } catch (err) {
              console.warn('[Realtime] Local notification sync failed:', err);
            }
          }
        }
      )
      // ─── Restaurant Orders (Kitchen ↔ Waiter flow) ─────────────────
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `business_id=eq.${businessId}`
        },
        async (payload) => {
          console.log('[Realtime] Restaurant order update:', payload.eventType);
          if (payload.new) {
            const order = payload.new as Record<string, unknown>;
            const status = order.status as string;

            // Notify on status changes
            if (status === 'ready') {
              pushNotification(
                'restaurant_kitchen_ready',
                'Order Ready',
                `Table ${order.table_number || '?'} order is ready for pickup`
              );
            } else if (status === 'pending' && payload.eventType === 'INSERT') {
              pushNotification(
                'restaurant_new_order',
                'New Order',
                `New order from Table ${order.table_number || '?'}`
              );
            }
          }
        }
      )
      // ─── Products (stock updates) ──────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `business_id=eq.${businessId}`
        },
        async (payload) => {
          if (payload.new) {
            const product = payload.new as Record<string, unknown>;
            try {
              await sqlite.upsertProduct({
                id: product.id as string,
                userId: '', // legacy
                businessId: product.business_id as string,
                createdBy: product.created_by as string || '',
                name: product.name as string,
                price: Number(product.price || 0),
                quantity: Number(product.quantity || 0),
                category: (product.category as string) || '',
                lowStockThreshold: Number(product.low_stock_threshold ?? 5),
                synced: 1,
                lastUpdated: product.last_updated as string,
                deleted: product.deleted ? 1 : 0,
              });
            } catch (err) {
              console.error('[Realtime] Product sync failed:', err);
            }
          }
        }
      )
      // ─── Invoices ──────────────────────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'invoices',
          filter: `business_id=eq.${businessId}`
        },
        async (payload) => {
          console.log('[Realtime] New invoice:', payload.new);
          // New invoices will be pulled on next full sync
          // This listener is primarily for dashboard real-time updates
        }
      )
      // ─── Salon Appointments ────────────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'salon_appointments',
          filter: `business_id=eq.${businessId}`
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const apt = payload.new as Record<string, unknown>;
            pushNotification(
              'salon_new_appointment',
              'New Appointment',
              `${apt.customer_name} booked ${apt.service_name} at ${apt.appointment_time}`
            );
          }
        }
      )
      // ─── Gym Members ───────────────────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gym_members',
          filter: `business_id=eq.${businessId}`
        },
        async (payload) => {
          if (payload.eventType === 'UPDATE') {
            const member = payload.new as Record<string, unknown>;
            if (member.status === 'expired') {
              pushNotification(
                'gym_membership_expired',
                'Membership Expired',
                `${member.name}'s membership has expired`
              );
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Subscription status: ${status}`);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, pushNotification]);
}
