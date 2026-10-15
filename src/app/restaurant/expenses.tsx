import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { useDatabase } from '../../context/DatabaseContext';
import { useTheme } from '../../hooks/use-theme';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Ionicons } from '@expo/vector-icons';
import ScreenWrapper from '../../components/ScreenWrapper';

const RESTAURANT_EXPENSE_CATEGORIES = [
  'Ingredients & Groceries',
  'Rent & Lease',
  'Gas & Electricity',
  'Kitchen Supplies',
  'Staff Salaries',
  'Maintenance & Repairs',
  'Marketing & Ads',
  'Other Expenses',
];

export default function RestaurantExpensesScreen() {
  const theme = useTheme();
  const { expenses, addExpense, deleteExpense } = useDatabase();

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(RESTAURANT_EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formError, setFormError] = useState('');

  // Total Expenses
  const totalExpenseSum = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses]);

  // Filtered List
  const filteredExpenses = useMemo(() => {
    if (selectedCategory === 'All') return expenses;
    return expenses.filter((e) => e.category === selectedCategory);
  }, [expenses, selectedCategory]);

  const handleSaveExpense = async () => {
    if (!title.trim()) {
      setFormError('Expense description is required');
      return;
    }
    const numAmount = parseFloat(amount) || 0;
    if (numAmount <= 0) {
      setFormError('Please enter a valid amount');
      return;
    }

    try {
      await addExpense(title.trim(), numAmount, category, date);
      setTitle('');
      setAmount('');
      setFormError('');
      setModalVisible(false);
    } catch (e: any) {
      setFormError(e.message || 'Failed to add expense');
    }
  };

  const handleDeleteExpense = (id: string, name: string) => {
    Alert.alert('Delete Expense', `Are you sure you want to remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(id) },
    ]);
  };

  return (
    <ScreenWrapper title="Restaurant Expenses">
      <View style={styles.container}>
        {/* Header Summary */}
        <Card style={[styles.headerCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.headerSubTitle, { color: theme.textSecondary }]}>
                Total Restaurant Expenses
              </Text>
              <Text style={[styles.headerTitle, { color: '#EF4444' }]}>
                ${totalExpenseSum.toLocaleString()}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.primary }]}
              onPress={() => setModalVisible(true)}
            >
              <Ionicons name="add-circle" size={18} color="#FFF" />
              <Text style={styles.addButtonText}>Add Expense</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Category Selector Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContent}
        >
          {['All', ...RESTAURANT_EXPENSE_CATEGORIES].map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  { borderColor: theme.border },
                  isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    { color: isSelected ? '#FFF' : theme.textSecondary },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Expense List */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          {filteredExpenses.length === 0 ? (
            <Card style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="receipt-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No expenses logged for this category.
              </Text>
              <Button title="Log Expense" onPress={() => setModalVisible(true)} style={{ marginTop: 12 }} />
            </Card>
          ) : (
            filteredExpenses.map((item) => (
              <Card key={item.id} style={[styles.expenseCard, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.expenseMain}>
                  <View style={[styles.iconBox, { backgroundColor: '#EF444420' }]}>
                    <Ionicons name="cart" size={20} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.expenseTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[styles.expenseSub, { color: theme.textSecondary }]}>
                      {item.category} • {item.date}
                    </Text>
                  </View>
                  <Text style={[styles.expenseAmount, { color: '#EF4444' }]}>
                    -${item.amount.toLocaleString()}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleDeleteExpense(item.id, item.title)}
                    style={{ marginLeft: 10 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          )}
        </ScrollView>

        {/* Add Expense Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Log Operational Expense</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

              <Input label="Description" value={title} onChangeText={setTitle} placeholder="e.g. Vegetables & Spices Bulk Buy" />
              <Input label="Amount ($)" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="e.g. 450" />
              <Input label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {RESTAURANT_EXPENSE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.roleChip,
                      { borderColor: theme.border, marginRight: 8 },
                      category === cat && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.roleChipText, { color: category === cat ? '#FFF' : theme.text }]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Button title="Save Expense" onPress={handleSaveExpense} />
            </View>
          </View>
        </Modal>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerCard: { padding: 16, borderRadius: 16, marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerSubTitle: { fontSize: 13, fontWeight: '500' },
  headerTitle: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  addButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 6 },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  categoryScroll: { marginBottom: 16 },
  categoryContent: { gap: 8, paddingRight: 16 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  categoryChipText: { fontSize: 12, fontWeight: '600' },
  expenseCard: { padding: 14, borderRadius: 16, marginBottom: 10 },
  expenseMain: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  expenseTitle: { fontSize: 15, fontWeight: '700' },
  expenseSub: { fontSize: 12, marginTop: 2 },
  expenseAmount: { fontSize: 16, fontWeight: '800' },
  emptyCard: { padding: 32, alignItems: 'center', borderRadius: 16 },
  emptyText: { marginTop: 12, textAlign: 'center', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  modalCard: { borderRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  errorText: { color: '#EF4444', fontSize: 13, marginBottom: 10 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  roleChipText: { fontSize: 12, fontWeight: '600' },
});
