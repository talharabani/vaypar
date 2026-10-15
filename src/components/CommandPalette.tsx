import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Modal, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Platform, 
  Dimensions,
  Pressable
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/use-theme';
import { useThemeContext } from '../context/ThemeContext';
import { useDatabase } from '../context/DatabaseContext';

interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Actions' | 'Navigation' | 'Products' | 'Invoices' | 'Expenses';
  icon: string;
  color?: string;
  action: () => void;
}

export function CommandPalette({ visible, onClose }: CommandPaletteProps) {
  const theme = useTheme();
  const router = useRouter();
  const { toggleTheme, themeMode } = useThemeContext();
  const { products, invoices, expenses, triggerSync } = useDatabase();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<TextInput>(null);

  // Focus input when opened
  useEffect(() => {
    if (visible) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  // Handle Ctrl+K / Cmd+K listener in layout, but escape key here
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleWebKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleWebKeydown);
    return () => window.removeEventListener('keydown', handleWebKeydown);
  }, [visible, onClose]);

  // Actions list
  const actions: PaletteItem[] = [
    {
      id: 'toggle-theme',
      title: `Switch Theme Mode`,
      subtitle: `Current: ${themeMode.toUpperCase()}`,
      category: 'Actions',
      icon: 'color-wand-outline',
      color: theme.primary,
      action: () => {
        toggleTheme();
        onClose();
      }
    },
    {
      id: 'sync-db',
      title: 'Sync Database with Cloud',
      subtitle: 'Force local-cloud reconciliation',
      category: 'Actions',
      icon: 'cloud-upload-outline',
      color: theme.success,
      action: () => {
        triggerSync();
        onClose();
      }
    }
  ];

  // Navigation list
  const navigations: PaletteItem[] = [
    {
      id: 'nav-home',
      title: 'Go to Dashboard',
      subtitle: 'Home statistics & quick reports',
      category: 'Navigation',
      icon: 'grid-outline',
      color: theme.primary,
      action: () => {
        router.push('/');
        onClose();
      }
    },
    {
      id: 'nav-bills',
      title: 'Go to Bills & POS Invoicing',
      subtitle: 'Create customer invoice',
      category: 'Navigation',
      icon: 'receipt-outline',
      color: theme.success,
      action: () => {
        router.push('/bills');
        onClose();
      }
    },
    {
      id: 'nav-products',
      title: 'Go to Products Catalog',
      subtitle: 'Manage items & stock levels',
      category: 'Navigation',
      icon: 'cube-outline',
      color: theme.secondary,
      action: () => {
        router.push('/products');
        onClose();
      }
    },
    {
      id: 'nav-expenses',
      title: 'Go to Expenses Ledger',
      subtitle: 'Track categorised shop spends',
      category: 'Navigation',
      icon: 'wallet-outline',
      color: theme.danger,
      action: () => {
        router.push('/expenses');
        onClose();
      }
    },
    {
      id: 'nav-settings',
      title: 'Go to Business Settings',
      subtitle: 'Customise receipts & configuration',
      category: 'Navigation',
      icon: 'settings-outline',
      color: theme.textSecondary,
      action: () => {
        router.push('/settings');
        onClose();
      }
    }
  ];

  // Compile items based on search query
  const getFilteredItems = (): PaletteItem[] => {
    if (!query.trim()) {
      return [...actions, ...navigations];
    }

    const lowerQuery = query.toLowerCase();
    const results: PaletteItem[] = [];

    // Filter Actions
    actions.forEach(item => {
      if (item.title.toLowerCase().includes(lowerQuery) || item.category.toLowerCase().includes(lowerQuery)) {
        results.push(item);
      }
    });

    // Filter Navigation
    navigations.forEach(item => {
      if (item.title.toLowerCase().includes(lowerQuery) || item.category.toLowerCase().includes(lowerQuery)) {
        results.push(item);
      }
    });

    // Filter Products
    products.forEach(p => {
      if (p.name.toLowerCase().includes(lowerQuery) || (p.category && p.category.toLowerCase().includes(lowerQuery))) {
        results.push({
          id: `prod-${p.id}`,
          title: p.name,
          subtitle: `Product • Price: PKR ${p.price} • Stock: ${p.quantity}`,
          category: 'Products',
          icon: 'cube',
          color: theme.primary,
          action: () => {
            router.push('/products');
            onClose();
          }
        });
      }
    });

    // Filter Invoices (Recent 10)
    invoices.slice(0, 15).forEach(inv => {
      const matchName = (inv.customerName || '').toLowerCase().includes(lowerQuery);
      const matchId = inv.id.toLowerCase().includes(lowerQuery);
      if (matchName || matchId) {
        results.push({
          id: `inv-${inv.id}`,
          title: `Bill to: ${inv.customerName || 'Walk-in Customer'}`,
          subtitle: `Invoice #${inv.id.substring(0, 8).toUpperCase()} • PKR ${inv.total.toFixed(2)}`,
          category: 'Invoices',
          icon: 'receipt',
          color: theme.success,
          action: () => {
            router.push('/bills');
            onClose();
          }
        });
      }
    });

    // Filter Expenses (Recent 10)
    expenses.slice(0, 15).forEach(exp => {
      const matchCat = exp.category.toLowerCase().includes(lowerQuery);
      const matchDesc = (exp.title || '').toLowerCase().includes(lowerQuery);
      if (matchCat || matchDesc) {
        results.push({
          id: `exp-${exp.id}`,
          title: `Expense: ${exp.category}`,
          subtitle: `${exp.title ? exp.title + ' • ' : ''}PKR ${exp.amount}`,
          category: 'Expenses',
          icon: 'wallet',
          color: theme.danger,
          action: () => {
            router.push('/expenses');
            onClose();
          }
        });
      }
    });

    return results.slice(0, 15); // Cap results at 15 for premium performance
  };

  const filteredItems = getFilteredItems();

  // Keyboard navigation for web
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleWebNav = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[activeIndex]) {
          filteredItems[activeIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleWebNav);
    return () => window.removeEventListener('keydown', handleWebNav);
  }, [visible, filteredItems, activeIndex]);

  // Adjust activeIndex when items change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Group items by category for visual hierarchy
  const itemsByCategory = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, PaletteItem[]>);

  // Flat list order to match with activeIndex
  const flatOrder = Object.keys(itemsByCategory).flatMap(cat => itemsByCategory[cat]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.overlayContent}>
          <Pressable 
            style={[
              styles.paletteContainer, 
              { 
                backgroundColor: theme.background === '#09090B' ? 'rgba(20, 20, 25, 0.85)' : 'rgba(255, 255, 255, 0.88)',
                borderColor: theme.border,
                ...Platform.select({
                  web: {
                    backdropFilter: 'blur(25px)',
                    WebkitBackdropFilter: 'blur(25px)',
                    boxShadow: `0 24px 50px ${theme.cardShadow}`,
                  } as any,
                  default: {}
                })
              }
            ]}
            onPress={(e) => e.stopPropagation()} // Prevent closing
          >
            {/* Header: Search Bar */}
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
              <Ionicons name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: theme.text }]}
                placeholder="Type a command or search items..."
                placeholderTextColor={theme.textSecondary}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={[styles.escText, { color: theme.textSecondary }]}>ESC</Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable Results */}
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {flatOrder.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={40} color={theme.textSecondary} />
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    No commands or items match "{query}"
                  </Text>
                </View>
              ) : (
                Object.keys(itemsByCategory).map((catName) => (
                  <View key={catName} style={styles.section}>
                    <Text style={[styles.sectionHeader, { color: theme.primary }]}>
                      {catName.toUpperCase()}
                    </Text>
                    {itemsByCategory[catName].map((item) => {
                      const absoluteIndex = flatOrder.findIndex(f => f.id === item.id);
                      const isHighlighted = absoluteIndex === activeIndex;

                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.itemRow,
                            isHighlighted && {
                              backgroundColor: theme.primary + '18',
                              borderColor: theme.primary + '40',
                            }
                          ]}
                          onPress={item.action}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.iconContainer, { backgroundColor: (item.color || theme.primary) + '15' }]}>
                            <Ionicons 
                              name={item.icon as any} 
                              size={18} 
                              color={item.color || theme.primary} 
                            />
                          </View>
                          <View style={styles.itemMeta}>
                            <Text style={[styles.itemTitle, { color: theme.text }]}>
                              {item.title}
                            </Text>
                            {item.subtitle && (
                              <Text style={[styles.itemSub, { color: theme.textSecondary }]}>
                                {item.subtitle}
                              </Text>
                            )}
                          </View>
                          {isHighlighted && Platform.OS === 'web' && (
                            <View style={styles.actionBadge}>
                              <Text style={[styles.actionText, { color: theme.primary }]}>
                                ENTER ⏎
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: theme.border }]}>
              <View style={styles.shortcuts}>
                <View style={styles.shortcutItem}>
                  <Text style={[styles.shortcutKey, { backgroundColor: theme.border, color: theme.text }]}>↑↓</Text>
                  <Text style={[styles.shortcutLabel, { color: theme.textSecondary }]}>Navigate</Text>
                </View>
                <View style={styles.shortcutItem}>
                  <Text style={[styles.shortcutKey, { backgroundColor: theme.border, color: theme.text }]}>⏎</Text>
                  <Text style={[styles.shortcutLabel, { color: theme.textSecondary }]}>Select</Text>
                </View>
                <View style={styles.shortcutItem}>
                  <Text style={[styles.shortcutKey, { backgroundColor: theme.border, color: theme.text }]}>Esc</Text>
                  <Text style={[styles.shortcutLabel, { color: theme.textSecondary }]}>Close</Text>
                </View>
              </View>
              <Text style={[styles.brandText, { color: theme.textSecondary }]}>Raycast AI</Text>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  paletteContainer: {
    width: '100%',
    maxWidth: 620,
    height: 480,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
    borderBottomWidth: 1,
  },
  searchIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    height: '100%',
    padding: 0,
    outlineStyle: 'none', // Remove web focus ring
  } as any,
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  escText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    paddingLeft: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemMeta: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(109, 93, 246, 0.1)',
  },
  actionText: {
    fontSize: 9,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderTopWidth: 1,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: 16,
  },
  shortcutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shortcutKey: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  shortcutLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  brandText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
