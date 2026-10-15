import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { RestaurantOrder, OrderItem, Priority } from '../../services/restaurantDb';

interface KitchenTicketProps {
  order: RestaurantOrder;
  items: OrderItem[];
  tableNumber: string;
  onAcceptOrder: () => void;
  onStartPreparing: () => void;
  onMarkReady: () => void;
  onMarkItemReady: (itemId: string) => void;
  readOnly?: boolean;
}

function elapsedMs(isoString: string | null): number {
  if (!isoString) return 0;
  return Date.now() - new Date(isoString).getTime();
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  vip: '#F59E0B',
  express: '#EF4444',
  normal: '#6D5DF6',
};

const ITEM_STATUS_CONFIG = {
  pending:   { color: '#A1A1AA', label: 'Pending',   icon: 'time-outline' },
  accepted:  { color: '#6366F1', label: 'Accepted',  icon: 'thumbs-up' },
  preparing: { color: '#F97316', label: 'Cooking',   icon: 'flame' },
  ready:     { color: '#22C55E', label: 'Ready',     icon: 'checkmark-circle' },
  served:    { color: '#3B82F6', label: 'Served',    icon: 'checkmark-done' },
};

export function KitchenTicket({ order, items, tableNumber, onAcceptOrder, onStartPreparing, onMarkReady, onMarkItemReady, readOnly = false }: KitchenTicketProps) {
  const theme = useTheme();
  const priColor = PRIORITY_COLORS[order.priority];

  // Live timer — re-render every second via parent tick key prop
  useEffect(() => {
    const id = setInterval(() => {/* intentional empty — parent re-keys this component */}, 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedMs_ = elapsedMs(order.preparingAt ?? order.kitchenReceivedAt);
  const elapsedMin = elapsedMs_ / 60000;
  const expectedMin = order.estimatedMinutes;
  const remainingMin = Math.max(0, expectedMin - elapsedMin);
  const pct = Math.min(1, elapsedMin / Math.max(1, expectedMin));

  const isDelayed = pct >= 1;
  const timerColor = isDelayed ? '#EF4444' : pct >= 0.8 ? '#F97316' : '#22C55E';
  const elapsedFormatted = formatDuration(elapsedMs_);
  const remainingFormatted = isDelayed ? 'LATE!' : formatDuration(remainingMin * 60000);

  const hasChanges = items.some(i => i.changeType !== 'unchanged');

  return (
    <View style={[styles.ticket, { backgroundColor: theme.backgroundElement, borderColor: isDelayed ? '#EF4444' : priColor }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: (isDelayed ? '#EF4444' : priColor) + '20' }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.orderId, { color: priColor }]}>#{order.id.slice(-6).toUpperCase()}</Text>
          <Text style={[styles.tableLabel, { color: theme.text }]}>{tableNumber}</Text>
          {order.priority !== 'normal' && (
            <View style={[styles.priBadge, { backgroundColor: priColor }]}>
              <Text style={styles.priBadgeText}>{order.priority.toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.courseTag, { color: theme.textSecondary }]}>{order.course.toUpperCase()}</Text>
        </View>
      </View>

      {/* Change notification banner */}
      {hasChanges && (
        <View style={[styles.changeBanner, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B' }]}>
          <Ionicons name="pencil" size={14} color="#F59E0B" />
          <Text style={[styles.changeBannerText, { color: '#F59E0B' }]}>Order Updated — Review changes below</Text>
        </View>
      )}

      {/* Timer block */}
      <View style={styles.timerBlock}>
        <View style={styles.timerStat}>
          <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>ELAPSED</Text>
          <Text style={[styles.timerVal, { color: timerColor }]}>{elapsedFormatted}</Text>
        </View>
        <View style={styles.timerStat}>
          <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>EXPECTED</Text>
          <Text style={[styles.timerVal, { color: theme.text }]}>{String(Math.floor(expectedMin)).padStart(2,'0')}:00</Text>
        </View>
        <View style={styles.timerStat}>
          <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>REMAINING</Text>
          <Text style={[styles.timerVal, { color: isDelayed ? '#EF4444' : theme.text }]}>
            {remainingFormatted}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: timerColor }]} />
      </View>

      {/* Items */}
      <View style={styles.itemsList}>
        {items.map(item => {
          const sc = ITEM_STATUS_CONFIG[item.status];
          const mods: string[] = JSON.parse(item.modifiers || '[]');
          return (
            <TouchableOpacity
              key={item.id}
              disabled={readOnly || item.status !== 'preparing'}
              onPress={() => item.status === 'preparing' && onMarkItemReady(item.id)}
              style={[styles.itemRow, { borderBottomColor: theme.border }]}
            >
              {/* Change type indicator */}
              {item.changeType === 'added' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginRight: 6 }} />}
              {item.changeType === 'removed' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 6 }} />}
              {item.changeType === 'modified' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 6 }} />}

              <Text style={[styles.itemQty, { color: theme.text, textDecorationLine: item.changeType === 'removed' ? 'line-through' : 'none' }]}>{item.quantity}×</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: theme.text, textDecorationLine: item.changeType === 'removed' ? 'line-through' : 'none' }]}>{item.productName}</Text>
                {mods.length > 0 && (
                  <Text style={[styles.itemMods, { color: theme.textSecondary, textDecorationLine: item.changeType === 'removed' ? 'line-through' : 'none' }]}>{mods.join(' • ')}</Text>
                )}
              </View>
              <View style={[styles.itemStatusBadge, { backgroundColor: sc.color + '20' }]}>
                <Ionicons name={sc.icon as any} size={12} color={sc.color} />
                <Text style={[styles.itemStatusText, { color: sc.color }]}>{sc.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Notes */}
      {order.notes ? (
        <View style={[styles.notesRow, { backgroundColor: theme.background }]}>
          <Ionicons name="chatbubble-outline" size={14} color="#F59E0B" />
          <Text style={[styles.notesText, { color: theme.text }]}>{order.notes}</Text>
        </View>
      ) : null}

      {/* Action buttons */}
      {!readOnly && (
        <View style={styles.actions}>
          {order.status === 'pending' && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#6366F1' }]} onPress={onAcceptOrder}>
              <Ionicons name="thumbs-up" size={16} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Accept Order</Text>
            </TouchableOpacity>
          )}
          {order.status === 'accepted' && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={onStartPreparing}>
              <Ionicons name="flame" size={16} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Start Preparing</Text>
            </TouchableOpacity>
          )}
          {order.status === 'preparing' && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#22C55E' }]} onPress={onMarkReady}>
              <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Mark All Ready</Text>
            </TouchableOpacity>
          )}
          {order.status === 'ready' && (
            <View style={[styles.readyBanner, { backgroundColor: '#22C55E20', borderColor: '#22C55E' }]}>
              <Ionicons name="restaurant" size={16} color="#22C55E" />
              <Text style={[styles.readyText, { color: '#22C55E' }]}>Ready for Service!</Text>
            </View>
          )}
        </View>
      )}
      
      {/* Show ready banner even in readOnly mode if it's ready */}
      {readOnly && order.status === 'ready' && (
        <View style={styles.actions}>
          <View style={[styles.readyBanner, { backgroundColor: '#22C55E20', borderColor: '#22C55E' }]}>
            <Ionicons name="restaurant" size={16} color="#22C55E" />
            <Text style={[styles.readyText, { color: '#22C55E' }]}>Ready for Service!</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: {},
  orderId: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  tableLabel: { fontSize: 14, fontWeight: '700' },
  priBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  priBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  courseTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  changeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  changeBannerText: { fontSize: 12, fontWeight: '700' },
  timerBlock: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 14,
  },
  timerStat: { alignItems: 'center' },
  timerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  timerVal: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] as any },
  progressTrack: { height: 4, marginHorizontal: 14, borderRadius: 2, marginBottom: 12 },
  progressFill: { height: 4, borderRadius: 2 },
  itemsList: { paddingHorizontal: 14 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  changeAdded: { fontSize: 14 },
  changeRemoved: { fontSize: 14 },
  changeModified: { fontSize: 14 },
  itemQty: { fontSize: 15, fontWeight: '800', width: 28 },
  itemName: { fontSize: 14, fontWeight: '700' },
  itemMods: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  itemStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  itemStatusText: { fontSize: 11, fontWeight: '700' },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    margin: 14,
    padding: 10,
    borderRadius: 10,
  },
  notesText: { fontSize: 12, fontWeight: '600', flex: 1 },
  actions: { padding: 14, paddingTop: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
  },
  actionBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  readyText: { fontWeight: '800', fontSize: 14 },
});
