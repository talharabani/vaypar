import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { Card } from '../components/Card';
import ScreenWrapper from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useTheme } from '../hooks/use-theme';

export default function ActivityLogsScreen() {
  const theme = useTheme();
  const { activityLogs } = useDatabase();
  const { user } = useAuth();
  const isCashier = user?.role === 'cashier';
  const [searchQuery, setSearchQuery] = useState('');

  // Format Action Icon depending on content keywords
  const getActionIcon = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('invoice') || act.includes('bill')) {
      return <Ionicons name="receipt-outline" size={18} color={theme.primary} />;
    }
    if (act.includes('product') || act.includes('catalog')) {
      return <Ionicons name="cube-outline" size={18} color={theme.secondary} />;
    }
    if (act.includes('expense')) {
      return <Ionicons name="wallet-outline" size={18} color={theme.danger} />;
    }
    if (act.includes('installment')) {
      return <Ionicons name="calendar-outline" size={18} color={theme.warning} />;
    }
    if (act.includes('staff') || act.includes('employee')) {
      return <Ionicons name="person-outline" size={18} color={theme.success} />;
    }
    if (act.includes('salary') || act.includes('payroll')) {
      return <Ionicons name="cash-outline" size={18} color={theme.success} />;
    }
    return <Ionicons name="information-circle-outline" size={18} color={theme.textSecondary} />;
  };

  // All hooks must run before any conditional returns (Rules of Hooks)
  const filteredLogs = React.useMemo(() => {
    return activityLogs.filter(log => {
      const matchSearch = log.action.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          log.userName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [activityLogs, searchQuery]);

  // Cashiers cannot view activity audit trails — return AFTER all hooks
  if (isCashier) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Ionicons name="lock-closed-outline" size={72} color={theme.danger} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, marginTop: 16 }}>Access Restricted</Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8 }}>
            Activity audit logs are only accessible to Managers and Business Owners.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title="Activity Logs">
      
      {/* Search Header */}
      <View style={styles.searchSection}>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={20} color={theme.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Filter logs by staff or action..."
            placeholderTextColor={theme.textSecondary + 'aa'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
      </View>

      {/* Activity Timeline List */}
      <FlatList
        data={filteredLogs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="list-outline" size={60} color={theme.textSecondary + '40'} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No operations logged in this business yet.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const formattedDate = new Date(item.timestamp).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          return (
            <Card style={styles.logCard}>
              <View style={styles.logHeader}>
                <View style={[styles.iconWrapper, { backgroundColor: theme.border }]}>
                  {getActionIcon(item.action)}
                </View>
                
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logUser, { color: theme.text }]}>
                    {item.userName}
                  </Text>
                  <Text style={[styles.logAction, { color: theme.textSecondary }]}>
                    {item.action}
                  </Text>
                  <Text style={[styles.logTime, { color: theme.textSecondary }]}>
                    {formattedDate}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }}
      />

    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchSection: {
    padding: 16,
    paddingBottom: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
    padding: 0,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
    paddingHorizontal: 32,
  },
  logCard: {
    padding: 12,
    marginBottom: 8,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logUser: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  logAction: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  logTime: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
});
