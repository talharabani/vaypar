import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/use-theme';
import { useSyncQueueStore } from '../store/useSyncQueueStore';

export function SyncStatusBar() {
  const theme = useTheme();
  const { queue, syncProgress, isSyncing } = useSyncQueueStore();
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const shouldShow = isSyncing && queue.length > 0;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heightAnim, {
        toValue: shouldShow ? 36 : 0,
        duration: 250,
        useNativeDriver: false, // height can't use native driver
      }),
      Animated.timing(opacityAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [shouldShow]);

  if (queue.length === 0 && !isSyncing) return null;

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: theme.primary,
          height: heightAnim,
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={styles.inner}>
        <View style={[styles.progressFill, { width: `${syncProgress}%` as any }]} />
      </View>
      <Text style={styles.text}>
        Syncing {queue.length} change{queue.length > 1 ? 's' : ''}… {syncProgress}%
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  inner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
