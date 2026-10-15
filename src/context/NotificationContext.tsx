import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as notifService from '../services/notificationService';
import { registerLocalNotificationListener, savePushToken, setupExpoNotifications } from '../services/notificationService';
import { useAuth } from './AuthContext';

export interface ToastAlert {
  id: string;
  type: 'order_ready' | 'modification' | 'out_of_stock' | 'table_waiting' | 'customer_waiting' | 'new_order' | 'error' | 'success';
  title: string;
  message: string;
  emoji: string;
}

interface NotificationContextType {
  notifications: notifService.NotificationItem[];
  toasts: ToastAlert[];
  unreadCount: number;
  pushNotification: (type: string, title: string, message: string) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Map sqlite notification type to visual Toast styling
function mapTypeToToast(type: string): ToastAlert['type'] {
  switch (type) {
    case 'restaurant_new_order':
      return 'new_order';
    case 'restaurant_kitchen_ready':
      return 'order_ready';
    case 'restaurant_waiter_called':
      return 'table_waiting';
    case 'gym_member_paid':
    case 'gym_membership_expired':
      return 'success';
    case 'tailor_dress_delivered':
      return 'success';
    case 'pharmacy_low_stock':
      return 'out_of_stock';
    case 'salon_new_appointment':
      return 'success';
    default:
      return 'success';
  }
}

// Map alert type to emojis
function getEmojiForType(type: string): string {
  switch (type) {
    case 'restaurant_new_order':
      return '🔔';
    case 'restaurant_kitchen_ready':
      return '🍳';
    case 'restaurant_waiter_called':
      return '🙋‍♂️';
    case 'gym_member_paid':
      return '💪';
    case 'gym_membership_expired':
      return '⏰';
    case 'tailor_dress_delivered':
      return '👗';
    case 'pharmacy_low_stock':
      return '💊';
    case 'salon_new_appointment':
      return '📅';
    default:
      return '🔔';
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<notifService.NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastAlert[]>([]);

  const businessId = user?.businessId || user?.id;

  // Initialize DB table on mount
  useEffect(() => {
    notifService.initNotificationSchema().catch(err => {
      console.error('[NotificationContext] Failed to initialize notifications database schema:', err);
    });
  }, []);

  // Setup Expo Notifications and save push token
  useEffect(() => {
    if (!user?.id) return;

    setupExpoNotifications().then(async (pushToken) => {
      if (pushToken && user?.id) {
        await savePushToken(user.id, pushToken);
      }
    }).catch(err => {
      console.warn('[NotificationContext] Expo notification setup failed:', err);
    });
  }, [user?.id]);

  // Fetch local notifications when businessId is set
  const loadLocalNotifications = useCallback(async () => {
    if (!businessId) return;
    try {
      const list = await notifService.getNotifications(businessId);
      setNotifications(list);
    } catch (err) {
      console.error('[NotificationContext] Failed to fetch local notifications:', err);
    }
  }, [businessId]);

  useEffect(() => {
    loadLocalNotifications();
  }, [loadLocalNotifications]);

  // Handle incoming notification
  const handleIncomingNotification = useCallback((item: notifService.NotificationItem) => {
    // Add to state list — deduplicate by id
    setNotifications(prev => {
      if (prev.some(n => n.id === item.id)) return prev;
      return [item, ...prev].slice(0, 50);
    });

    // Show visual alert Toast — deduplicate by id
    setToasts(prev => {
      if (prev.some(t => t.id === item.id)) return prev;
      return [
        ...prev,
        {
          id: item.id,
          type: mapTypeToToast(item.type),
          title: item.title,
          message: item.message,
          emoji: getEmojiForType(item.type),
        },
      ];
    });
  }, []);

  // Set up listeners
  useEffect(() => {
    if (!businessId) return;

    // Listen to Supabase Realtime cloud notifications (BroadcastChannel for web)
    const unsubscribeCloud = notifService.listenForCloudNotifications(
      businessId,
      handleIncomingNotification
    );

    // Listen to local triggers created in this execution session
    const unsubscribeLocal = registerLocalNotificationListener(
      handleIncomingNotification
    );

    return () => {
      unsubscribeCloud();
      unsubscribeLocal();
    };
  }, [businessId, handleIncomingNotification]);

  // Create notifications (for local events)
  const pushNotification = async (type: string, title: string, message: string) => {
    if (!businessId) return;
    try {
      await notifService.createNotification(businessId, type, title, message);
    } catch (err) {
      console.error('[NotificationContext] Failed to create notification:', err);
    }
  };

  // Mark notification read
  const markAsRead = async (id: string) => {
    try {
      await notifService.markNotificationAsRead(id);
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: 1 } : n)
      );
    } catch (err) {
      console.error('[NotificationContext] Failed to mark notification read:', err);
    }
  };

  // Mark all read
  const markAllAsRead = async () => {
    if (!businessId) return;
    try {
      for (const n of notifications) {
        if (n.read === 0) {
          await notifService.markNotificationAsRead(n.id);
        }
      }
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    } catch (err) {
      console.error('[NotificationContext] Failed to mark all read:', err);
    }
  };

  // Dismiss Toast visually
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const unreadCount = notifications.filter(n => n.read === 0).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        toasts,
        unreadCount,
        pushNotification,
        markAsRead,
        markAllAsRead,
        dismissToast
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
}
