import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import ScreenWrapper from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useTheme } from '../hooks/use-theme';
import { shareExpenseReportPDF } from '../services/pdfGenerator';

const EXPENSE_CATEGORIES = [
  'Inventory Supplies',
  'Rent & Lease',
  'Staff Salaries',
  'Electricity & Bills',
  'Tax & Customs',
  'Logistics & Transport',
  'Marketing & Ads',
  'Others'
];

export default function ExpensesScreen() {
  const { expenses, addExpense, deleteExpense } = useDatabase();
  const theme = useTheme();
  const { user } = useAuth();

  // Search & Filters state
  const [selectedCategory, setSelectedCategory] = useState('All');
  // Form State
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [formError, setFormError] = useState('');

  // Total Expenses sum
  const totalExpenseSum = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses]);

  // Category distribution calculation
  const categorySummary = useMemo(() => {
    const distribution: { [key: string]: number } = {};
    
    // Initialize
    EXPENSE_CATEGORIES.forEach(cat => {
      distribution[cat] = 0;
    });

    expenses.forEach(exp => {
      const cat = exp.category || 'Others';
      if (distribution[cat] !== undefined) {
        distribution[cat] += exp.amount;
      } else {
        distribution['Others'] += exp.amount;
      }
    });

    // Format list sorted by amount desc
    return Object.entries(distribution)
      .map(([name, total]) => {
        const percentage = totalExpenseSum > 0 ? (total / totalExpenseSum) * 100 : 0;
        return { name, total, percentage };
      })
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [expenses, totalExpenseSum]);

  // Filtered expenses list
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      return selectedCategory === 'All' || exp.category === selectedCategory;
    });
  }, [expenses, selectedCategory]);

  if (user?.role === 'cashier') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Ionicons name="lock-closed-outline" size={80} color={theme.danger} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, marginTop: 16 }}>Access Denied</Text>
        <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8 }}>
          Cashiers are not authorized to view or manage business expenses.
        </Text>
      </View>
    );
  }

  const handleShareReport = async () => {
    if (expenses.length === 0) {
      Alert.alert('Empty Report', 'There are no logged expenses to generate a report.');
      return;
    }
    try {
      await shareExpenseReportPDF(user!, expenses);
    } catch (err: any) {
      Alert.alert('Report Error', err.message || 'Failed to compile or share expense report PDF.');
    }
  };

  const handleOpenAddModal = () => {
    setTitle('');
    setAmount('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setDate(new Date().toISOString().split('T')[0]);
    setFormError('');
    setModalVisible(true);
  };

  const handleSaveExpense = async () => {
    setFormError('');
    if (!title.trim()) {
      setFormError('Expense title is required.');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Please enter a valid amount.');
      return;
    }
    if (!date) {
      setFormError('Please select a date.');
      return;
    }

    try {
      await addExpense(title.trim(), parsedAmount, category, date);
      setModalVisible(false);
    } catch (e: any) {
      setFormError(e.message || 'Failed to save expense.');
    }
  };

  const handleDeleteExpense = (id: string, name: string) => {
    const title = 'Delete Expense';
    const message = `Are you sure you want to delete "${name}"? This will subtract it from your net profit calculation.`;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) {
        deleteExpense(id).catch(err => {
          console.error(err);
          alert('Failed to delete expense.');
        });
      }
      return;
    }

    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(id);
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to delete expense.');
            }
          }
        }
      ]
    );
  };

  // Color mapper for categories
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Inventory Supplies': return '#F59E0B'; // Amber
      case 'Rent & Lease': return '#818CF8'; // Indigo
      case 'Staff Salaries': return '#10B981'; // Emerald
      case 'Electricity & Bills': return '#06B6D4'; // Cyan
      case 'Tax & Customs': return '#F43F5E'; // Rose
      case 'Logistics & Transport': return '#3B82F6'; // Blue
      case 'Marketing & Ads': return '#EC4899'; // Pink
      default: return '#94A3B8'; // Slate
    }
  };

  return (
    <ScreenWrapper title="Expenses">
      {/* Category breakdown bar header */}
      <ScrollView 
        style={styles.headerScroll} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.headerContent}
      >
        <Card style={styles.summaryCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>Total Expenses Paid</Text>
            <TouchableOpacity 
              onPress={handleShareReport}
              style={{ padding: 6, borderRadius: 8, backgroundColor: theme.primaryLight }}
              activeOpacity={0.7}
            >
              <Ionicons name="download-outline" size={18} color={theme.primary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.cardValue, { color: theme.danger, marginBottom: categorySummary.length > 0 ? 16 : 0 }]}>
            PKR {totalExpenseSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </Text>

          {categorySummary.length > 0 && (
            <View style={styles.breakdownSection}>
              <Text style={[styles.breakdownTitle, { color: theme.text }]}>Category Share</Text>
              {categorySummary.slice(0, 3).map(item => (
                <View key={item.name} style={styles.progressRow}>
                  <View style={styles.progressLabels}>
                    <Text style={[styles.progressName, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.progressVal, { color: theme.textSecondary }]}>
                      PKR {item.total.toLocaleString('en-IN')} ({item.percentage.toFixed(0)}%)
                    </Text>
                  </View>
                  <View style={[styles.progressBg, { backgroundColor: theme.border }]}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { width: `${item.percentage}%`, backgroundColor: getCategoryColor(item.name) }
                      ]} 
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Scrollable Category Selector chips */}
        <View style={styles.chipHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Listings</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContainer}>
            <TouchableOpacity
              style={[
                styles.chip,
                { 
                  backgroundColor: selectedCategory === 'All' ? theme.primary : theme.backgroundElement,
                  borderColor: theme.border,
                }
              ]}
              onPress={() => setSelectedCategory('All')}
            >
              <Text style={[styles.chipText, { color: selectedCategory === 'All' ? '#FFFFFF' : theme.textSecondary }]}>
                All
              </Text>
            </TouchableOpacity>
            {EXPENSE_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.chip,
                  { 
                    backgroundColor: selectedCategory === cat ? theme.primary : theme.backgroundElement,
                    borderColor: theme.border,
                  }
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.chipText, { color: selectedCategory === cat ? '#FFFFFF' : theme.textSecondary }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Expenses flatlist */}
      <FlatList
        data={filteredExpenses}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={60} color={theme.textSecondary + '60'} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {selectedCategory !== 'All' 
                ? 'No expenses logged under this category.'
                : 'No expenses logged yet. Tap the button below to register paid expenses.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const formattedDate = new Date(item.date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
          return (
            <Card style={styles.expenseCard}>
              <View style={[styles.categoryIndicator, { backgroundColor: getCategoryColor(item.category) }]} />
              
              <View style={styles.expenseInfo}>
                <Text style={[styles.expenseTitle, { color: theme.text }]}>{item.title}</Text>
                <Text style={[styles.expenseSub, { color: theme.textSecondary }]}>
                  {item.category} • {formattedDate}
                </Text>
              </View>

              <View style={styles.expenseRightCol}>
                <Text style={[styles.expenseAmount, { color: theme.danger }]}>
                  -PKR {item.amount.toFixed(2)}
                </Text>
                <TouchableOpacity 
                  onPress={() => handleDeleteExpense(item.id, item.title)}
                  style={styles.deleteBtn}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.danger} />
                </TouchableOpacity>
              </View>
            </Card>
          );
        }}
      />

      {/* FAB Floating action button */}
      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={handleOpenAddModal}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Modal Dialog for Expense */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContent}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <Card style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Log Business Expense</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close" size={24} color={theme.text} />
                  </TouchableOpacity>
                </View>

                {formError ? (
                  <View style={[styles.errorBox, { backgroundColor: theme.danger + '15', borderColor: theme.danger }]}>
                    <Ionicons name="alert-circle-outline" size={20} color={theme.danger} style={styles.errorIcon} />
                    <Text style={[styles.errorText, { color: theme.danger }]}>{formError}</Text>
                  </View>
                ) : null}

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.formScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  <Input
                    label="Expense Title *"
                    placeholder="e.g. July Shop Rent, Raw Supplies"
                    value={title}
                    onChangeText={setTitle}
                  />

                  <Input
                    label="Amount Paid (PKR ) *"
                    placeholder="e.g. 5000"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                  />

                  {/* Category Dropdown Picker Simulation */}
                  <Text style={[styles.pickerLabel, { color: theme.textSecondary }]}>Category *</Text>
                  <View style={styles.categorySelectContainer}>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.catOption,
                          {
                            backgroundColor: category === cat ? theme.primaryLight : theme.background,
                            borderColor: category === cat ? theme.primary : theme.border
                          }
                        ]}
                        onPress={() => setCategory(cat)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.catOptionIndicator, { backgroundColor: getCategoryColor(cat) }]} />
                        <Text style={[styles.catOptionText, { color: category === cat ? theme.primary : theme.text }]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Simple input field for date YYYY-MM-DD */}
                  <Input
                    label="Payment Date (YYYY-MM-DD) *"
                    placeholder="e.g. 2026-07-28"
                    value={date}
                    onChangeText={setDate}
                  />

                  <Button
                    title="Register Expense"
                    variant="danger"
                    size="large"
                    onPress={handleSaveExpense}
                    style={styles.saveBtn}
                  />
                </ScrollView>
              </Card>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerScroll: {
    flexGrow: 0,
  },
  headerContent: {
    padding: 16,
    paddingBottom: 4,
  },
  summaryCard: {
    padding: 20,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 16,
  },
  breakdownSection: {
    marginTop: 8,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  progressRow: {
    marginVertical: 6,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressName: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1.2,
  },
  progressVal: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1.8,
    textAlign: 'right',
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  chipHeaderRow: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
    paddingHorizontal: 32,
    fontWeight: '500',
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginVertical: 5,
  },
  categoryIndicator: {
    width: 6,
    height: 38,
    borderRadius: 3,
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1.5,
  },
  expenseTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  expenseSub: {
    fontSize: 12,
    fontWeight: '600',
  },
  expenseRightCol: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  deleteBtn: {
    padding: 2,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
  },
  modalCard: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  formScroll: {
    paddingBottom: 16,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
    marginLeft: 4,
  },
  categorySelectContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  catOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 6,
  },
  catOptionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});
