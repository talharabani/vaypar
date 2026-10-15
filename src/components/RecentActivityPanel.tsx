/**
 * RecentActivityPanel
 *
 * A standalone dashboard widget showing recently opened records.
 * Each row is one-tap to navigate back to that exact screen.
 * Designed to match the existing dashboard card aesthetic.
 */

import React, { useCallback } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  RECORD_TYPE_META,
  RecentItem,
  useRecentActivity,
} from '../context/RecentActivityContext';
import { useTheme } from '../hooks/use-theme';

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60)           return 'just now';
  if (diff < 3600)         return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)        return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7)    return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

// ─── Single row item ──────────────────────────────────────────────────────────

interface RecentRowProps {
  item: RecentItem;
  isLast: boolean;
  onPress: () => void;
}

function RecentRow({ item, isLast, onPress }: RecentRowProps) {
  const theme = useTheme();
  const meta = RECORD_TYPE_META[item.type];

  return (
    <>
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        activeOpacity={0.72}
      >
        {/* Type icon */}
        <View style={[styles.iconBadge, { backgroundColor: meta.color + '18' }]}>
          <Ionicons name={meta.icon as any} size={18} color={meta.color} />
        </View>

        {/* Text */}
        <View style={styles.rowContent}>
          <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>
            {meta.label}
            {item.subtitle ? `  ·  ${item.subtitle}` : ''}
          </Text>
        </View>

        {/* Time + arrow */}
        <View style={styles.rowRight}>
          <Text style={[styles.rowTime, { color: theme.textSecondary }]}>
            {relativeTime(item.visitedAt)}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.textSecondary + '80'} />
        </View>
      </TouchableOpacity>
      {!isLast && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RecentActivityPanelProps {
  /** Max records to display. Default 8. */
  maxItems?: number;
  /** Optional style overrides for the outer card */
  style?: object;
}

export function RecentActivityPanel({ maxItems = 8, style }: RecentActivityPanelProps) {
  const theme = useTheme();
  const router = useRouter();
  const { recentItems, clearAll } = useRecentActivity();

  const displayed = recentItems.slice(0, maxItems);

  const handlePress = useCallback(
    (item: RecentItem) => {
      router.push(item.route as any);
    },
    [router]
  );

  if (displayed.length === 0) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
          style,
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerDot, { backgroundColor: theme.primary }]} />
            <Text style={[styles.headerTitle, { color: theme.text }]}>Recently Opened</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={36} color={theme.textSecondary + '40'} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Records you open will appear here
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          ...Platform.select({
            web: {
              boxShadow: `0 4px 20px ${theme.cardShadow}`,
            } as any,
            default: {
              shadowColor: theme.cardShadow,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
              elevation: 4,
            },
          }),
        },
        style,
      ]}
    >
      {/* Panel header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Recently Opened</Text>
          <View style={[styles.countBadge, { backgroundColor: theme.primary + '15' }]}>
            <Text style={[styles.countText, { color: theme.primary }]}>{displayed.length}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={clearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.clearBtn, { color: theme.textSecondary }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Rows */}
      <View style={styles.listContainer}>
        {displayed.map((item, idx) => (
          <RecentRow
            key={item.id}
            item={item}
            isLast={idx === displayed.length - 1}
            onPress={() => handlePress(item)}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Compact horizontal chip strip (for Sidebar) ──────────────────────────────

interface RecentChipStripProps {
  maxItems?: number;
  onNavigate?: () => void;
}

export function RecentChipStrip({ maxItems = 6, onNavigate }: RecentChipStripProps) {
  const theme = useTheme();
  const router = useRouter();
  const { recentItems } = useRecentActivity();

  const displayed = recentItems.slice(0, maxItems);
  if (displayed.length === 0) return null;

  return (
    <View style={stripStyles.container}>
      <Text style={[stripStyles.label, { color: theme.textSecondary }]}>RECENT</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={stripStyles.scroll}
      >
        {displayed.map(item => {
          const meta = RECORD_TYPE_META[item.type];
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                stripStyles.chip,
                {
                  backgroundColor: meta.color + '12',
                  borderColor: meta.color + '30',
                },
              ]}
              onPress={() => {
                onNavigate?.();
                router.push(item.route as any);
              }}
              activeOpacity={0.75}
            >
              <Ionicons name={meta.icon as any} size={13} color={meta.color} />
              <Text
                style={[stripStyles.chipText, { color: theme.text }]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
  },
  clearBtn: {
    fontSize: 12,
    fontWeight: '600',
  },

  listContainer: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 4,
    gap: 10,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  rowSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  rowTime: {
    fontSize: 10,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginHorizontal: 4,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

const stripStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  scroll: {
    gap: 6,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 160,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
});
