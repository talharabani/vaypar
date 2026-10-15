import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/use-theme';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle | ViewStyle[];
}

export function SkeletonLoader({ width = '100%', height = 20, borderRadius = 8, style }: SkeletonProps) {
  const theme = useTheme();
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.75,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 1000,
          useNativeDriver: true,
        })
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const skeletonColor = theme.background === '#09090B' 
    ? 'rgba(255, 255, 255, 0.08)' 
    : 'rgba(15, 23, 42, 0.06)';

  return (
    <Animated.View 
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor: skeletonColor,
          opacity: pulseAnim,
        },
        style
      ]}
    />
  );
}

// 1. KPI Metric cards row skeleton
export function MetricCardSkeleton() {
  const theme = useTheme();
  return (
    <View style={styles.kpiContainer}>
      {[1, 2, 3].map((i) => (
        <View 
          key={i} 
          style={[
            styles.kpiCard, 
            { 
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              borderWidth: 1,
            }
          ]}
        >
          <SkeletonLoader width={20} height={20} borderRadius={10} style={{ marginBottom: 8 }} />
          <SkeletonLoader width="60%" height={10} style={{ marginBottom: 6 }} />
          <SkeletonLoader width="85%" height={16} />
        </View>
      ))}
    </View>
  );
}

// 2. Stripe Area Chart card skeleton
export function ChartSkeleton() {
  const theme = useTheme();
  return (
    <View 
      style={[
        styles.chartCard, 
        { 
          backgroundColor: theme.backgroundElement, 
          borderColor: theme.border,
          borderWidth: 1,
        }
      ]}
    >
      <View style={styles.chartHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <SkeletonLoader width="40%" height={14} />
          <SkeletonLoader width="70%" height={10} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SkeletonLoader width={40} height={10} />
          <SkeletonLoader width={40} height={10} />
        </View>
      </View>
      <SkeletonLoader width="100%" height={140} borderRadius={12} style={{ marginTop: 12 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <SkeletonLoader key={i} width="10%" height={8} />
        ))}
      </View>
    </View>
  );
}

// 3. Transactions list rows skeleton
export function ListRowSkeleton({ count = 3 }: { count?: number }) {
  const theme = useTheme();
  return (
    <View 
      style={[
        styles.listCard, 
        { 
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderWidth: 1,
        }
      ]}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx}>
          {idx > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          <View style={styles.listRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonLoader width="60%" height={14} />
              <SkeletonLoader width="40%" height={10} />
            </View>
            <SkeletonLoader width={80} height={16} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  kpiContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    padding: 12,
    borderRadius: 20,
    alignItems: 'flex-start',
  },
  chartCard: {
    padding: 16,
    borderRadius: 20,
    marginVertical: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listCard: {
    borderRadius: 20,
    padding: 0,
    overflow: 'hidden',
    marginBottom: 16,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  divider: {
    height: 1,
  },
});
