import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { RestaurantTable, TableStatus, Priority } from '../../services/restaurantDb';

interface TableCardProps {
  table: RestaurantTable;
  elapsedMinutes: number;
  onPress: () => void;
  onLongPress?: () => void;
}

const STATUS_CONFIG: Record<TableStatus, { color: string; label: string; icon: string }> = {
  available:       { color: '#22C55E', label: 'Available',        icon: 'checkmark-circle' },
  occupied:        { color: '#3B82F6', label: 'Occupied',         icon: 'people' },
  waiting_kitchen: { color: '#F97316', label: 'Waiting Kitchen',  icon: 'time' },
  food_ready:      { color: '#8B5CF6', label: 'Food Ready',       icon: 'restaurant' },
  needs_attention: { color: '#EF4444', label: 'Needs Attention',  icon: 'alert-circle' },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  vip:     { label: 'VIP',     color: '#F59E0B' },
  express: { label: 'EXPRESS', color: '#EF4444' },
  normal:  { label: '',        color: 'transparent' },
};

export function TableCard({ table, elapsedMinutes, onPress, onLongPress }: TableCardProps) {
  const theme = useTheme();
  const cfg = STATUS_CONFIG[table.status];
  const pri = PRIORITY_CONFIG[table.priority];
  const isAttention = table.status === 'needs_attention';
  const isReady = table.status === 'food_ready';

  // Pulse animation for attention/ready states
  const [pulseAnim] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (isAttention || isReady) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [isAttention, isReady, pulseAnim]);

  const waitWarning = table.status !== 'available' && elapsedMinutes >= 20;

  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}>
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: cfg.color,
            transform: [{ scale: pulseAnim }],
            ...Platform.select({
              web: { boxShadow: `0 0 20px ${cfg.color}40` } as any,
              default: {
                shadowColor: cfg.color,
                shadowOpacity: 0.3,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              },
            }),
          },
        ]}
      >
        {/* Status strip */}
        <View style={[styles.strip, { backgroundColor: cfg.color }]} />

        {/* Priority badge */}
        {table.priority !== 'normal' && (
          <View style={[styles.priorityBadge, { backgroundColor: pri.color }]}>
            <Text style={styles.priorityText}>{pri.label}</Text>
          </View>
        )}

        {/* Table number */}
        <Text style={[styles.tableNum, { color: theme.text }]}>{table.tableNumber}</Text>

        {/* Status icon */}
        <Ionicons name={cfg.icon as any} size={28} color={cfg.color} style={styles.icon} />

        {/* Status label */}
        <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>

        {/* Capacity */}
        <View style={styles.capRow}>
          <Ionicons name="people-outline" size={12} color={theme.textSecondary} />
          <Text style={[styles.capText, { color: theme.textSecondary }]}>{table.capacity} seats</Text>
        </View>

        {/* Wait timer */}
        {table.status !== 'available' && elapsedMinutes > 0 && (
          <View style={[styles.timerRow, { backgroundColor: waitWarning ? '#EF444415' : theme.background }]}>
            <Ionicons
              name={waitWarning ? 'warning' : 'timer-outline'}
              size={12}
              color={waitWarning ? '#EF4444' : theme.textSecondary}
            />
            <Text style={[styles.timerText, { color: waitWarning ? '#EF4444' : theme.textSecondary }]}>
              {elapsedMinutes}m
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 130,
    height: 150,
    borderRadius: 20,
    borderWidth: 2,
    margin: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  strip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  priorityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  tableNum: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  icon: {
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
  },
  capText: {
    fontSize: 10,
    fontWeight: '600',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
