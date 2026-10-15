import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNotificationContext } from '../context/NotificationContext';
import { useTheme } from '../hooks/use-theme';
import { NotificationItem } from '../services/notificationService';

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
}

function getNotifConfig(type: string) {
  switch (type) {
    case 'restaurant_new_order':
      return { icon: 'receipt', color: '#6366F1', bg: 'rgba(99, 102, 241, 0.12)' };
    case 'restaurant_kitchen_ready':
      return { icon: 'restaurant', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.12)' };
    case 'restaurant_waiter_called':
      return { icon: 'call', color: '#F97316', bg: 'rgba(249, 115, 22, 0.12)' };
    case 'pharmacy_low_stock':
      return { icon: 'alert-circle', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)' };
    case 'gym_membership_expired':
      return { icon: 'time', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)' };
    case 'gym_member_paid':
      return { icon: 'checkmark-circle', color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)' };
    case 'salon_new_appointment':
      return { icon: 'calendar', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.12)' };
    case 'tailor_dress_delivered':
      return { icon: 'checkmark-done', color: '#14B8A6', bg: 'rgba(20, 184, 166, 0.12)' };
    default:
      return { icon: 'notifications', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)' };
  }
}

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (isNaN(diffSec) || diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return 'Recently';
  }
}

export function NotificationsModal({ visible, onClose }: NotificationsModalProps) {
  const theme = useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead, pushNotification } = useNotificationContext();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return n.read === 0;
    return true;
  });

  const handleSendTestNotification = async () => {
    await pushNotification(
      'restaurant_new_order',
      'New Order Received',
      'Table #4 placed a new order for 3 items (PKR 1,450)'
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.panelContainer,
            {
              backgroundColor: theme.backgroundElement || '#FFFFFF',
              borderColor: theme.border || '#E5E7EB',
            },
          ]}
        >
          {/* ─── Header ─── */}
          <View style={[styles.header, { borderBottomColor: theme.border || '#E5E7EB' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.headerIconWrap, { backgroundColor: theme.primary + '15' }]}>
                <Ionicons name="notifications" size={17} color={theme.primary} />
              </View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>Notifications</Text>
              {unreadCount > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.unreadBadgeText}>{unreadCount} new</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  onPress={() => markAllAsRead()}
                  style={styles.markAllBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.markAllText, { color: theme.primary }]}>Mark all read</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ─── Filter Tabs ─── */}
          <View style={[styles.tabsRow, { borderBottomColor: theme.border || '#E5E7EB' }]}>
            <TouchableOpacity
              onPress={() => setFilter('all')}
              style={[
                styles.tabBtn,
                filter === 'all' && [styles.tabBtnActive, { borderBottomColor: theme.primary }],
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  { color: filter === 'all' ? theme.text : theme.textSecondary },
                  filter === 'all' && { fontWeight: '700' },
                ]}
              >
                All ({notifications.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setFilter('unread')}
              style={[
                styles.tabBtn,
                filter === 'unread' && [styles.tabBtnActive, { borderBottomColor: theme.primary }],
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  { color: filter === 'unread' ? theme.text : theme.textSecondary },
                  filter === 'unread' && { fontWeight: '700' },
                ]}
              >
                Unread ({unreadCount})
              </Text>
            </TouchableOpacity>
          </View>

          {/* ─── Notification List ─── */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredNotifications.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIconWrap, { backgroundColor: theme.backgroundSelected || '#F4F5F7' }]}>
                  <Ionicons name="notifications-off-outline" size={32} color={theme.textSecondary} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </Text>
                <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                  Live orders, customer requests, and business alerts will appear here in real time.
                </Text>

                {/* Quick button to test live notifications */}
                <TouchableOpacity
                  style={[styles.testBtn, { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' }]}
                  onPress={handleSendTestNotification}
                >
                  <Ionicons name="sparkles-outline" size={14} color={theme.primary} />
                  <Text style={[styles.testBtnText, { color: theme.primary }]}>Send Sample Notification</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredNotifications.map((item: NotificationItem) => {
                const isUnread = item.read === 0;
                const cfg = getNotifConfig(item.type);

                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (isUnread) markAsRead(item.id);
                    }}
                    style={[
                      styles.notifCard,
                      {
                        backgroundColor: isUnread
                          ? theme.backgroundSelected || '#F8F9FA'
                          : theme.backgroundElement || '#FFFFFF',
                        borderColor: isUnread ? theme.border || '#E5E7EB' : 'transparent',
                      },
                    ]}
                  >
                    <View style={[styles.typeIconBox, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
                    </View>

                    <View style={styles.notifBody}>
                      <View style={styles.notifTopRow}>
                        <Text
                          style={[
                            styles.notifTitle,
                            { color: theme.text, fontWeight: isUnread ? '700' : '600' },
                          ]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Text style={[styles.notifTime, { color: theme.textSecondary }]}>
                          {formatRelativeTime(item.createdAt)}
                        </Text>
                      </View>

                      <Text
                        style={[styles.notifMessage, { color: theme.textSecondary }]}
                        numberOfLines={2}
                      >
                        {item.message}
                      </Text>
                    </View>

                    {isUnread && (
                      <View
                        style={[
                          styles.unreadDot,
                          { backgroundColor: theme.primary },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* ─── Footer Action ─── */}
          {notifications.length > 0 && (
            <View style={[styles.footer, { borderTopColor: theme.border || '#E5E7EB' }]}>
              <TouchableOpacity
                style={styles.testAlertBtn}
                onPress={handleSendTestNotification}
              >
                <Ionicons name="sparkles-outline" size={13} color={theme.textSecondary} />
                <Text style={[styles.testAlertText, { color: theme.textSecondary }]}>
                  Test Live Notification
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: Platform.OS === 'web' ? 'flex-start' : 'center',
    alignItems: Platform.OS === 'web' ? 'flex-end' : 'center',
    padding: Platform.OS === 'web' ? 20 : 16,
  },
  panelContainer: {
    width: Platform.OS === 'web' ? 410 : '100%',
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ marginTop: 56, marginRight: 8 } as any) : {}),
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  unreadBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  markAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 16,
  },
  tabBtn: {
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomWidth: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listScroll: {
    flexGrow: 1,
    maxHeight: 460,
  },
  listContent: {
    padding: 10,
    gap: 6,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  typeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBody: {
    flex: 1,
  },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  notifTitle: {
    fontSize: 13.5,
    flex: 1,
    marginRight: 8,
  },
  notifTime: {
    fontSize: 11,
    fontWeight: '500',
  },
  notifMessage: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 6,
  },
  emptyState: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 18,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  testBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  testAlertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  testAlertText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});
