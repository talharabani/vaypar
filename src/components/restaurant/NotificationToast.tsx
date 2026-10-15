import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';

export type ToastType = 'order_ready' | 'modification' | 'out_of_stock' | 'table_waiting' | 'customer_waiting' | 'new_order' | 'error' | 'success';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message: string;
}

const TOAST_CONFIG: Record<ToastType, { icon: string; color: string }> = {
  order_ready:      { icon: 'restaurant',     color: '#22C55E' },
  modification:     { icon: 'pencil',         color: '#F59E0B' },
  out_of_stock:     { icon: 'close-circle',   color: '#EF4444' },
  table_waiting:    { icon: 'warning',        color: '#EF4444' },
  customer_waiting: { icon: 'time',           color: '#F97316' },
  new_order:        { icon: 'receipt',        color: '#6D5DF6' },
  error:            { icon: 'alert-circle',   color: '#EF4444' },
  success:          { icon: 'checkmark-circle',color: '#22C55E' },
};

interface NotificationToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

export function NotificationToast({ toast, onDismiss }: NotificationToastProps) {
  const theme = useTheme();
  const cfg = TOAST_CONFIG[toast.type];
  const [slideAnim] = useState(() => new Animated.Value(-100));
  const [opacityAnim] = useState(() => new Animated.Value(0));

  const dismissSelf = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -120, duration: 250, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss(toast.id));
  }, [slideAnim, opacityAnim, onDismiss, toast.id]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => dismissSelf(), 5000);
    return () => clearTimeout(timer);
  }, [slideAnim, opacityAnim, dismissSelf]);

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: cfg.color,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: cfg.color + '20' }]}>
        <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.toastTitle, { color: theme.text }]}>{toast.title}</Text>
        <Text style={[styles.toastMsg, { color: theme.textSecondary }]} numberOfLines={2}>{toast.message}</Text>
      </View>
      <TouchableOpacity onPress={dismissSelf} style={styles.dismissBtn}>
        <Ionicons name="close" size={16} color={theme.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Toast Manager ────────────────────────────────────────────────────────────

interface NotificationContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function NotificationContainer({ toasts, onDismiss }: NotificationContainerProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map(t => (
        <NotificationToast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useToasts() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const push = (type: ToastType, title: string, message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, title, message }]);
  };

  const dismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return { toasts, push, dismiss };
}

export type { Toast };

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    right: 16,
    left: 16,
    zIndex: 9999,
    gap: 8,
    pointerEvents: 'box-none',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  toastTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  toastMsg: { fontSize: 12, fontWeight: '500' },
  dismissBtn: { padding: 4 },
});
