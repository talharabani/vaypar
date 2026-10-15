import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useDatabase } from '../../context/DatabaseContext';
import { useTheme } from '../../hooks/use-theme';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Ionicons } from '@expo/vector-icons';
import * as sqlite from '../../services/sqlite';
import ScreenWrapper from '../../components/ScreenWrapper';

const RESTAURANT_ROLES = [
  { label: 'Manager', value: 'manager' },
  { label: 'Chef / Cook', value: 'cook' },
  { label: 'Cashier / Billing', value: 'cashier' },
];

export default function RestaurantSalaryScreen() {
  const theme = useTheme();
  const {
    staffList,
    addStaffMember,
    editStaffMember,
    payStaffSalary,
    getStaffSalaryPayments,
  } = useDatabase();

  const [activeTab, setActiveTab] = useState<'staff' | 'payouts'>('staff');

  // Add/Edit Staff Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'manager' | 'cashier' | 'cook'>('cashier');
  const [salary, setSalary] = useState('');
  const [formError, setFormError] = useState('');

  // Salary Payment Modal
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<sqlite.UserProfile | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<sqlite.SalaryPayment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [payMonth, setPayMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [payAmount, setPayAmount] = useState('');
  const [payBonus, setPayBonus] = useState('0');
  const [payDeduction, setPayDeduction] = useState('0');
  const [payNotes, setPayNotes] = useState('');
  const [payError, setPayError] = useState('');

  // Total Monthly Payroll Expense
  const totalMonthlyPayroll = useMemo(() => {
    return staffList.reduce((sum, member) => sum + (member.salary || 0), 0);
  }, [staffList]);

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingId('');
    setName('');
    setPhone('');
    setRole('cashier');
    setSalary('');
    setFormError('');
    setModalVisible(true);
  };

  const openEditModal = (member: sqlite.UserProfile) => {
    setIsEditMode(true);
    setEditingId(member.id);
    setName(member.name);
    setPhone(member.phone || '');
    setRole((member.role as any) || 'cashier');
    setSalary(String(member.salary || 0));
    setFormError('');
    setModalVisible(true);
  };

  const handleSaveStaff = async () => {
    if (!name.trim()) {
      setFormError('Staff name is required');
      return;
    }
    const numSalary = parseFloat(salary) || 0;

    try {
      if (isEditMode) {
        await editStaffMember(editingId, name.trim(), phone.trim(), role, numSalary, 'active');
      } else {
        const dummyEmail = `staff_${Date.now()}@restaurant.local`;
        await addStaffMember(name.trim(), dummyEmail, phone.trim(), role, numSalary, '123456');
      }
      setModalVisible(false);
    } catch (e: any) {
      setFormError(e.message || 'Failed to save staff member');
    }
  };

  const openPayModal = async (member: sqlite.UserProfile) => {
    setSelectedStaff(member);
    setPayAmount(String(member.salary || 0));
    setPayBonus('0');
    setPayDeduction('0');
    setPayNotes('');
    setPayError('');
    setPayModalVisible(true);

    setLoadingHistory(true);
    try {
      const history = await getStaffSalaryPayments(member.id);
      setSalaryHistory(history);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleProcessPay = async () => {
    if (!selectedStaff) return;
    const numAmount = parseFloat(payAmount) || 0;
    const numBonus = parseFloat(payBonus) || 0;
    const numDeduction = parseFloat(payDeduction) || 0;

    if (numAmount <= 0) {
      setPayError('Please enter a valid payout amount');
      return;
    }

    try {
      await payStaffSalary(
        selectedStaff.id,
        payMonth,
        numAmount,
        numBonus,
        numDeduction,
        payNotes.trim()
      );
      Alert.alert('Success', `Salary logged for ${selectedStaff.name}`);
      const updatedHistory = await getStaffSalaryPayments(selectedStaff.id);
      setSalaryHistory(updatedHistory);
      setPayModalVisible(false);
    } catch (e: any) {
      setPayError(e.message || 'Failed to log salary payment');
    }
  };

  return (
    <ScreenWrapper title="Staff & Salary">
      <View style={styles.container}>
        {/* Header Summary */}
        <Card style={[styles.headerCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.headerSubTitle, { color: theme.textSecondary }]}>
                Total Monthly Payroll
              </Text>
              <Text style={[styles.headerTitle, { color: theme.primary }]}>
                ${totalMonthlyPayroll.toLocaleString()}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.primary }]}
              onPress={openAddModal}
            >
              <Ionicons name="person-add" size={18} color="#FFF" />
              <Text style={styles.addButtonText}>Add Staff</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Tab Selection */}
        <View style={[styles.tabBar, { backgroundColor: theme.backgroundElement }]}>
          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === 'staff' && { backgroundColor: theme.primary },
            ]}
            onPress={() => setActiveTab('staff')}
          >
            <Ionicons
              name="people"
              size={16}
              color={activeTab === 'staff' ? '#FFF' : theme.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'staff' ? '#FFF' : theme.textSecondary },
              ]}
            >
              Staff Roster ({staffList.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === 'payouts' && { backgroundColor: theme.primary },
            ]}
            onPress={() => setActiveTab('payouts')}
          >
            <Ionicons
              name="wallet"
              size={16}
              color={activeTab === 'payouts' ? '#FFF' : theme.textSecondary}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'payouts' ? '#FFF' : theme.textSecondary },
              ]}
            >
              Salary Actions
            </Text>
          </TouchableOpacity>
        </View>

        {/* Staff List */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          {staffList.length === 0 ? (
            <Card style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No restaurant staff members added yet.
              </Text>
              <Button title="Add First Staff Member" onPress={openAddModal} style={{ marginTop: 12 }} />
            </Card>
          ) : (
            staffList.map((member) => (
              <Card key={member.id} style={[styles.staffCard, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.staffMain}>
                  <View style={[styles.avatar, { backgroundColor: theme.primary + '20' }]}>
                    <Text style={[styles.avatarText, { color: theme.primary }]}>
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.staffName, { color: theme.text }]}>{member.name}</Text>
                    <Text style={[styles.staffRole, { color: theme.textSecondary }]}>
                      Role: {member.role?.toUpperCase() || 'STAFF'} {member.phone ? `• ${member.phone}` : ''}
                    </Text>
                    <Text style={[styles.staffSalary, { color: theme.primary }]}>
                      Monthly Salary: ${member.salary?.toLocaleString() || '0'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: theme.border }]}
                    onPress={() => openEditModal(member)}
                  >
                    <Ionicons name="create-outline" size={16} color={theme.text} />
                    <Text style={[styles.actionBtnText, { color: theme.text }]}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: theme.primary }]}
                    onPress={() => openPayModal(member)}
                  >
                    <Ionicons name="card-outline" size={16} color="#FFF" />
                    <Text style={[styles.actionBtnText, { color: '#FFF' }]}>Pay Salary</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          )}
        </ScrollView>

        {/* Add/Edit Staff Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {isEditMode ? 'Edit Staff Member' : 'Add New Staff Member'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

              <Input label="Full Name" value={name} onChangeText={setName} placeholder="e.g. Rahul Sharma" />
              <Input label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="e.g. +91 9876543210" />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Role</Text>
              <View style={styles.roleContainer}>
                {RESTAURANT_ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={[
                      styles.roleChip,
                      { borderColor: theme.border },
                      role === r.value && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                    onPress={() => setRole(r.value as any)}
                  >
                    <Text style={[styles.roleChipText, { color: role === r.value ? '#FFF' : theme.text }]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input label="Monthly Salary ($)" value={salary} onChangeText={setSalary} keyboardType="numeric" placeholder="e.g. 25000" />

              <Button title={isEditMode ? 'Update Staff' : 'Add Staff'} onPress={handleSaveStaff} style={{ marginTop: 16 }} />
            </View>
          </View>
        </Modal>

        {/* Pay Salary Modal */}
        <Modal visible={payModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Log Salary Payout ({selectedStaff?.name})
                </Text>
                <TouchableOpacity onPress={() => setPayModalVisible(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              {payError ? <Text style={styles.errorText}>{payError}</Text> : null}

              <Input label="Month (YYYY-MM)" value={payMonth} onChangeText={setPayMonth} placeholder="YYYY-MM" />
              <Input label="Base Amount ($)" value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Input label="Bonus ($)" value={payBonus} onChangeText={setPayBonus} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Deductions ($)" value={payDeduction} onChangeText={setPayDeduction} keyboardType="numeric" />
                </View>
              </View>
              <Input label="Notes / Reference" value={payNotes} onChangeText={setPayNotes} placeholder="Cash payout / Bank transfer ref" />

              <Button title="Confirm & Log Payout" onPress={handleProcessPay} style={{ marginTop: 12 }} />

              {/* History */}
              <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 16 }]}>Payout History</Text>
              {loadingHistory ? (
                <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} />
              ) : salaryHistory.length === 0 ? (
                <Text style={{ color: theme.textSecondary, marginVertical: 8 }}>No prior payout logs recorded.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 120, marginTop: 8 }}>
                  {salaryHistory.map((log) => (
                    <View key={log.id} style={[styles.historyRow, { borderColor: theme.border }]}>
                      <Text style={{ color: theme.text, fontWeight: '600' }}>{log.month}</Text>
                      <Text style={{ color: theme.primary, fontWeight: '700' }}>${(log.amount || 0).toLocaleString()}</Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                        {log.paymentDate ? log.paymentDate.split('T')[0] : log.lastUpdated ? log.lastUpdated.split('T')[0] : 'Logged'}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerCard: { padding: 16, borderRadius: 16, marginBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerSubTitle: { fontSize: 13, fontWeight: '500' },
  headerTitle: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  addButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 6 },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  tabBar: { flexDirection: 'row', padding: 4, borderRadius: 24, marginBottom: 16 },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 20, gap: 6 },
  tabText: { fontWeight: '600', fontSize: 13 },
  staffCard: { padding: 16, borderRadius: 16, marginBottom: 12 },
  staffMain: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800' },
  staffName: { fontSize: 17, fontWeight: '700' },
  staffRole: { fontSize: 13, marginTop: 2 },
  staffSalary: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 6 },
  actionBtnText: { fontWeight: '600', fontSize: 13 },
  emptyCard: { padding: 32, alignItems: 'center', borderRadius: 16 },
  emptyText: { marginTop: 12, textAlign: 'center', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  modalCard: { borderRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  errorText: { color: '#EF4444', fontSize: 13, marginBottom: 10 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  roleContainer: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  roleChip: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  roleChipText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
});
