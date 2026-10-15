/**
 * Notification Service
 *
 * Handles local notifications via expo-notifications and Supabase realtime.
 * Firebase has been fully removed. All cloud notifications route through
 * Supabase Realtime subscriptions in useRealtimeSync.ts.
 */

import { Platform } from 'react-native';
import { getDB } from './sqlite';
import { supabase } from './supabase';

const isSupabaseConfigured =
  process.env.EXPO_PUBLIC_SUPABASE_URL &&
  process.env.EXPO_PUBLIC_SUPABASE_URL !== 'https://vyapar-demo.supabase.co';

export interface NotificationItem {
  id: string;
  businessId: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: number; // 0 = unread, 1 = read
  synced: number; // 0 = unsynced, 1 = synced
}

// ─── Initialize Notification Schema ───────────────────────────────────────────
export async function initNotificationSchema(): Promise<void> {
  const sqliteDB = await getDB();
  await sqliteDB.execAsync(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0
    );
  `);
}

// ─── Retrieve Notifications from local SQLite ────────────────────────────────
export async function getNotifications(businessId: string): Promise<NotificationItem[]> {
  const sqliteDB = await getDB();
  return sqliteDB.getAllAsync<NotificationItem>(
    'SELECT * FROM notifications WHERE businessId = ? ORDER BY createdAt DESC LIMIT 50',
    [businessId]
  );
}

// ─── Mark Notification as Read ───────────────────────────────────────────────
export async function markNotificationAsRead(id: string): Promise<void> {
  const sqliteDB = await getDB();
  await sqliteDB.runAsync(
    'UPDATE notifications SET read = 1 WHERE id = ?',
    [id]
  );
}

// ─── Local Listeners List ───────────────────────────────────────────────────
type NotificationListener = (item: NotificationItem) => void;
const localListeners = new Set<NotificationListener>();

export function registerLocalNotificationListener(listener: NotificationListener): () => void {
  localListeners.add(listener);
  return () => {
    localListeners.delete(listener);
  };
}

/** Emit a notification item directly to all registered local listeners (used by realtime sync) */
export function emitLocalNotification(item: NotificationItem): void {
  localListeners.forEach(listener => {
    try {
      listener(item);
    } catch (err) {
      console.error('[NotificationService] Local listener error during emit:', err);
    }
  });
}

// ─── Expo Notifications Setup ────────────────────────────────────────────────

let notificationsModule: typeof import('expo-notifications') | null = null;

async function getNotificationsModule() {
  if (notificationsModule) return notificationsModule;
  if (Platform.OS === 'web') return null;

  try {
    notificationsModule = require('expo-notifications');
    return notificationsModule;
  } catch {
    console.warn('[NotificationService] expo-notifications not available');
    return null;
  }
}

/** Request notification permissions and configure channel */
export async function setupExpoNotifications(): Promise<string | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  try {
    // Set notification handler for foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[NotificationService] Notification permissions not granted');
      return null;
    }

    // Set up Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Vaypar Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#208AEF',
      });
    }

    // Get push token (only works in EAS builds, not Expo Go)
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
      });
      return tokenData.data;
    } catch {
      console.log('[NotificationService] Push token unavailable (Expo Go)');
      return null;
    }
  } catch (err) {
    console.warn('[NotificationService] Setup failed:', err);
    return null;
  }
}

/** Schedule a local notification */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  triggerSeconds?: number
): Promise<string | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: triggerSeconds
        ? { seconds: triggerSeconds, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL }
        : null,
    });
    return id;
  } catch (err) {
    console.warn('[NotificationService] Schedule failed:', err);
    return null;
  }
}

// ─── Create a New Notification (Offline-first / Sync) ────────────────────────
export async function createNotification(
  businessId: string,
  type: string,
  title: string,
  message: string
): Promise<NotificationItem> {
  const sqliteDB = await getDB();
  const id = 'notif-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();

  const item: NotificationItem = {
    id,
    businessId,
    type,
    title,
    message,
    createdAt: now,
    read: 0,
    synced: 0,
  };

  // 1. Persist in local SQLite
  await sqliteDB.runAsync(
    `INSERT INTO notifications (id, businessId, type, title, message, createdAt, read, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.id, item.businessId, item.type, item.title, item.message, item.createdAt, item.read, item.synced]
  );

  // 2. Broadcast locally inside current application runtime
  localListeners.forEach(listener => {
    try {
      listener(item);
    } catch (err) {
      console.error('[NotificationService] Local listener error:', err);
    }
  });

  // 3. Broadcast to other browser tabs using BroadcastChannel on Web
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel('vyapar_notifications');
      channel.postMessage(item);
      channel.close();
    } catch (err) {
      console.warn('[NotificationService] BroadcastChannel failed:', err);
    }
  }

  // 4. Push to Supabase if configured
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('notifications').insert({
        id,
        business_id: businessId,
        type,
        title,
        message,
        created_at: now,
        read: false,
      });
      if (!error) {
        await sqliteDB.runAsync(
          'UPDATE notifications SET synced = 1 WHERE id = ?',
          [id]
        );
        item.synced = 1;
      }
    } catch (err) {
      console.warn('[NotificationService] Supabase push deferred (offline):', err);
    }
  }

  // 5. Schedule local device notification
  await scheduleLocalNotification(title, message);

  return item;
}

// ─── Listen for Cloud Notifications (Supabase Realtime) ──────────────────────
export function listenForCloudNotifications(
  businessId: string,
  onNewNotification: (item: NotificationItem) => void
): () => void {
  // Web: BroadcastChannel for multi-tab sync
  let broadcastUnsubscribe = () => {};
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    const channel = new BroadcastChannel('vyapar_notifications');
    const handleMsg = (event: MessageEvent) => {
      const item = event.data as NotificationItem;
      if (item && item.businessId === businessId) {
        onNewNotification(item);
      }
    };
    channel.addEventListener('message', handleMsg);
    broadcastUnsubscribe = () => {
      channel.removeEventListener('message', handleMsg);
      channel.close();
    };
  }

  // Supabase realtime subscription is handled in useRealtimeSync.ts
  // This function now only handles BroadcastChannel for web multi-tab support
  if (!isSupabaseConfigured) {
    console.log('[NotificationService] Cloud alerts disabled. Using local BroadcastChannel.');
  }

  return broadcastUnsubscribe;
}

/** Save push token to Supabase profile for server-side push notifications */
export async function savePushToken(userId: string, pushToken: string): Promise<void> {
  if (!isSupabaseConfigured || !pushToken) return;

  try {
    await supabase
      .from('profiles')
      .update({ push_token: pushToken })
      .eq('id', userId);
  } catch (err) {
    console.warn('[NotificationService] Failed to save push token:', err);
  }
}
