import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
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
import { useDatabase } from '../context/DatabaseContext';
import { useTheme } from '../hooks/use-theme';
import * as sqlite from '../services/sqlite';

export default function StaffScreen() {
  const theme = useTheme();
  const { 
    staffList, 
    addStaffMember, 
    editStaffMember, 
    payStaffSalary, 
    getStaffSalaryPayments 
  } = useDatabase();

  // Screen Tabs
  const [activeTab, setActiveTab] = useState<'roster' | 'payroll'>('roster');

  // Add/Edit Employee Form Modal
  const [employeeModalVisible, setEmployeeModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empRole, setEmpRole] = useState<'manager' | 'cashier' | 'cook'>('cashier');
  const [empSalary, setEmpSalary] = useState('');
  const [empPassword, setEmpPassword] = useState('');
  const [empPin, setEmpPin] = useState('');
  const [empStatus, setEmpStatus] = useState<'active' | 'inactive'>('active');
  const [formError, setFormError] = useState('');

  // Salary Payments Modal
  const [payrollModalVisible, setPayrollModalVisible] = useState(false);
  const [selectedPayrollStaff, setSelectedPayrollStaff] = useState<sqlite.UserProfile | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<sqlite.SalaryPayment[]>([]);
  const [loadingSalaryHistory, setLoadingSalaryHistory] = useState(false);

  // Pay Salary Form
  const [payMonth, setPayMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${yyyy}-${mm}`;
  });
  const [payBonus, setPayBonus] = useState('');
  const [payDeduction, setPayDeduction] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [salaryFormError, setSalaryFormError] = useState('');

  // Statistics
  const stats = React.useMemo(() => {
    const total = staffList.length;
    const active = staffList.filter(s => s.status === 'active').length;
    const totalWage = staffList.reduce((sum, s) => sum + (s.status === 'active' ? s.salary : 0), 0);
    return { total, active, totalWage };
  }, [staffList]);

  // Fetch salary history when selected payroll changes
  const loadSalaryHistory = async (staffId: string) => {
    setLoadingSalaryHistory(true);
    try {
      const history = await getStaffSalaryPayments(staffId);
      setSalaryHistory(history);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSalaryHistory(false);
    }
  };

  // Open modal for adding staff
  const handleOpenAddModal = () => {
    setIsEditMode(false);
    setSelectedStaffId('');
    setEmpName('');
    setEmpEmail('');
    setEmpPhone('');
    setEmpRole('cashier');
    setEmpSalary('');
    setEmpPassword('');
    setEmpPin('');
    setEmpStatus('active');
    setFormError('');
    setEmployeeModalVisible(true);
  };

  // Open modal for editing staff
  const handleOpenEditModal = async (staff: sqlite.UserProfile) => {
    setIsEditMode(true);
    setSelectedStaffId(staff.id);
    setEmpName(staff.name);
    setEmpEmail(staff.email);
    setEmpPhone(staff.phone);
    setEmpRole(staff.role as 'manager' | 'cashier');
    setEmpSalary(String(staff.salary));
    setEmpPassword(''); // Don't show password for security
    setEmpStatus(staff.status);
    setFormError('');
    
    // Load staff PIN
    try {
      const pin = await sqlite.getUserPin(staff.id);
      setEmpPin(pin || '');
    } catch {
      setEmpPin('');
    }

    setEmployeeModalVisible(true);
  };

  // Open modal for payroll
  const handleOpenPayrollModal = async (staff: sqlite.UserProfile) => {
    setSelectedPayrollStaff(staff);
    setPayBonus('');
    setPayDeduction('');
    setPayNotes('');
    setSalaryFormError('');
    setPayrollModalVisible(true);
    await loadSalaryHistory(staff.id);
  };

  // Form submission
  const handleSaveEmployee = async () => {
    setFormError('');
    if (!empName.trim()) return setFormError('Name is required.');
    if (!empPhone.trim()) return setFormError('Phone number is required.');
    if (!isEditMode && !empEmail.trim()) return setFormError('Email is required for sign up.');
    if (!isEditMode && !empPassword) return setFormError('Login password is required.');
    if (empPin.trim() && !/^\d{4}$/.test(empPin.trim())) {
      return setFormError('Quick PIN must be exactly 4 digits (e.g. 1111).');
    }
    
    const salaryNum = parseFloat(empSalary) || 0;

    try {
      if (isEditMode) {
        await editStaffMember(selectedStaffId, empName.trim(), empPhone.trim(), empRole, salaryNum, empStatus);
        if (empPin.trim()) {
          await sqlite.setUserPin(selectedStaffId, empPin.trim());
        }
        Alert.alert('Success', 'Employee details updated.');
      } else {
        const newStaff = await addStaffMember(empName.trim(), empEmail.trim(), empPhone.trim(), empRole, salaryNum, empPassword);
        if (newStaff && newStaff.id && empPin.trim()) {
          await sqlite.setUserPin(newStaff.id, empPin.trim());
        }
        Alert.alert('Success', `Employee registered! Email: ${empEmail.trim()}`);
      }
      setEmployeeModalVisible(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save employee profile.');
    }
  };

  const handlePaySalarySubmit = async () => {
    setSalaryFormError('');
    if (!selectedPayrollStaff) return;
    if (!payMonth.trim() || !/^\d{4}-\d{2}$/.test(payMonth)) {
      return setSalaryFormError('Please enter month in YYYY-MM format.');
    }

    try {
      const bonusNum = parseFloat(payBonus) || 0;
      const dedNum = parseFloat(payDeduction) || 0;
      const totalPaid = Math.max(0, (selectedPayrollStaff.salary || 0) + bonusNum - dedNum);
      await payStaffSalary(
        selectedPayrollStaff.id,
        payMonth.trim(),
        selectedPayrollStaff.salary,
        bonusNum,
        dedNum,
        payNotes.trim()
      );
      Alert.alert(
        'Salary Paid Successfully',
        `PKR ${totalPaid.toLocaleString('en-IN')} paid to ${selectedPayrollStaff.name}. Recorded under Business Expenses ("Staff Salaries") and deducted from cashflow.`
      );
      await loadSalaryHistory(selectedPayrollStaff.id);
      // Reset inputs
      setPayBonus('');
      setPayDeduction('');
      setPayNotes('');
    } catch (err: any) {
      setSalaryFormError(err.message || 'Failed to log salary payment.');
    }
  };

  return (
    <ScreenWrapper title="Staff & Payroll">
      
      {/* 1. Header Overview Cards */}
      <View style={styles.statsRow}>
        <Card style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Staff</Text>
          <Text style={[styles.statVal, { color: theme.text }]}>{stats.total} users</Text>
        </Card>
        <Card style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Active Roster</Text>
          <Text style={[styles.statVal, { color: theme.success }]}>{stats.active} active</Text>
        </Card>
        <Card style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Monthly Wages</Text>
          <Text style={[styles.statVal, { color: theme.primary }]}>PKR {stats.totalWage.toLocaleString('en-IN')}</Text>
        </Card>
      </View>

      {/* 2. Navigation Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'roster' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveTab('roster')}
        >
          <Ionicons name="people" size={18} color={activeTab === 'roster' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'roster' ? theme.primary : theme.textSecondary }]}>
            Staff Directory
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'payroll' && { borderBottomColor: theme.primary }]}
          onPress={() => setActiveTab('payroll')}
        >
          <Ionicons name="cash" size={18} color={activeTab === 'payroll' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'payroll' ? theme.primary : theme.textSecondary }]}>
            Payroll & Salaries
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Tab Contents */}
      {activeTab === 'roster' ? (
        <FlatList
          data={staffList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={
            <Button
              title="Add New Employee"
              variant="primary"
              size="medium"
              icon={<Ionicons name="person-add-outline" size={18} color="#FFFFFF" />}
              onPress={handleOpenAddModal}
              style={{ marginBottom: 16 }}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={60} color={theme.textSecondary + '40'} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No staff employees registered yet. Click above to register your first cashier or manager!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Card style={styles.staffCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.staffName, { color: theme.text }]}>{item.name}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.roleBadge, { backgroundColor: item.role === 'manager' ? theme.secondary + '15' : theme.primary + '15' }]}>
                      <Text style={[styles.roleText, { color: item.role === 'manager' ? theme.secondary : theme.primary }]}>
                        {item.role.toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? theme.success + '15' : theme.danger + '15' }]}>
                      <Text style={[styles.statusText, { color: item.status === 'active' ? theme.success : theme.danger }]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleOpenEditModal(item)} style={styles.editBtn}>
                  <Ionicons name="create-outline" size={20} color={theme.primary} />
                </TouchableOpacity>
              </View>

              <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />

              <View style={styles.cardDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="call-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.detailText, { color: theme.text }]}>{item.phone}</Text>
                </View>
                {item.email ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="mail-outline" size={14} color={theme.textSecondary} />
                    <Text style={[styles.detailText, { color: theme.text }]} numberOfLines={1}>{item.email}</Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Ionicons name="cash-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.detailText, { color: theme.text }]}>Wages: PKR {item.salary.toLocaleString('en-IN')} / month</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Joined: {item.joiningDate}</Text>
                </View>
              </View>
            </Card>
          )}
        />
      ) : (
        <FlatList
          data={staffList.filter(s => s.status === 'active')}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cash-outline" size={60} color={theme.textSecondary + '40'} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No active staff available for payroll.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Card style={styles.payrollCard}>
              <View style={styles.payrollHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.staffName, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.payrollSub, { color: theme.textSecondary }]}>
                    {item.role.toUpperCase()} • PKR {item.salary.toLocaleString('en-IN')} / mo
                  </Text>
                </View>
                <Button
                  title="Pay / Details"
                  variant="outline"
                  size="small"
                  icon={<Ionicons name="card-outline" size={16} color={theme.primary} />}
                  onPress={() => handleOpenPayrollModal(item)}
                />
              </View>
            </Card>
          )}
        />
      )}

      {/* 4. Add/Edit Employee Form Modal */}
      <Modal
        visible={employeeModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEmployeeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.formModal, { backgroundColor: theme.backgroundElement }]}>
            
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {isEditMode ? 'Edit Employee Details' : 'Register New Employee'}
              </Text>
              <TouchableOpacity onPress={() => setEmployeeModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              {formError ? (
                <View style={[styles.errorBox, { backgroundColor: theme.danger + '10', borderColor: theme.danger }]}>
                  <Text style={[styles.errorText, { color: theme.danger }]}>{formError}</Text>
                </View>
              ) : null}

              <Input
                label="Full Name *"
                placeholder="e.g. Usman Malik"
                value={empName}
                onChangeText={setEmpName}
              />

              <Input
                label="Contact Phone *"
                placeholder="e.g. 9876543210"
                value={empPhone}
                onChangeText={setEmpPhone}
                keyboardType="phone-pad"
              />

              <Input
                label="Staff Login Email *"
                placeholder="e.g. usman@shop.com"
                value={empEmail}
                onChangeText={setEmpEmail}
                keyboardType="email-address"
                editable={!isEditMode}
              />

              <Input
                label="Monthly Salary (PKR )"
                placeholder="e.g. 18000"
                value={empSalary}
                onChangeText={setEmpSalary}
                keyboardType="numeric"
              />

              {!isEditMode ? (
                <Input
                  label="Initial Password *"
                  placeholder="Minimum 6 characters"
                  value={empPassword}
                  onChangeText={setEmpPassword}
                  secureTextEntry
                />
              ) : null}

              <Input
                label="4-Digit Terminal Quick PIN"
                placeholder="e.g. 1111 (For fast POS keypad login)"
                value={empPin}
                onChangeText={(val) => setEmpPin(val.replace(/[^0-9]/g, '').slice(0, 4))}
                keyboardType="numeric"
                maxLength={4}
              />

              {/* Role Select Buttons */}
              <Text style={[styles.selectLabel, { color: theme.textSecondary }]}>Staff Role *</Text>
              <View style={styles.selectorRow}>
                <TouchableOpacity
                  style={[
                    styles.selectorBtn,
                    { borderColor: theme.border },
                    empRole === 'cashier' && { backgroundColor: theme.primary, borderColor: theme.primary }
                  ]}
                  onPress={() => setEmpRole('cashier')}
                >
                  <Text style={[styles.selectorBtnText, { color: empRole === 'cashier' ? '#FFFFFF' : theme.textSecondary }]}>Cashier</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.selectorBtn,
                    { borderColor: theme.border },
                    empRole === 'manager' && { backgroundColor: theme.secondary, borderColor: theme.secondary }
                  ]}
                  onPress={() => setEmpRole('manager')}
                >
                  <Text style={[styles.selectorBtnText, { color: empRole === 'manager' ? '#FFFFFF' : theme.textSecondary }]}>Manager</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.selectorBtn,
                    { borderColor: theme.border },
                    empRole === 'cook' && { backgroundColor: '#F59E0B', borderColor: '#F59E0B' }
                  ]}
                  onPress={() => setEmpRole('cook')}
                >
                  <Text style={[styles.selectorBtnText, { color: empRole === 'cook' ? '#FFFFFF' : theme.textSecondary }]}>Cook</Text>
                </TouchableOpacity>
              </View>

              {isEditMode ? (
                <>
                  <Text style={[styles.selectLabel, { color: theme.textSecondary }]}>Roster Status</Text>
                  <View style={styles.selectorRow}>
                    <TouchableOpacity
                      style={[
                        styles.selectorBtn,
                        { borderColor: theme.border },
                        empStatus === 'active' && { backgroundColor: theme.success, borderColor: theme.success }
                      ]}
                      onPress={() => setEmpStatus('active')}
                    >
                      <Text style={[styles.selectorBtnText, { color: empStatus === 'active' ? '#FFFFFF' : theme.textSecondary }]}>Active</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.selectorBtn,
                        { borderColor: theme.border },
                        empStatus === 'inactive' && { backgroundColor: theme.danger, borderColor: theme.danger }
                      ]}
                      onPress={() => setEmpStatus('inactive')}
                    >
                      <Text style={[styles.selectorBtnText, { color: empStatus === 'inactive' ? '#FFFFFF' : theme.textSecondary }]}>Deactivated</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              <Button
                title={isEditMode ? 'Update Profile' : 'Register Employee'}
                variant="primary"
                size="large"
                onPress={handleSaveEmployee}
                style={{ marginTop: 16, marginBottom: 30 }}
              />
            </ScrollView>
          </Card>
        </View>
      </Modal>

      {/* 5. Salary Ledger & Payroll Modal */}
      <Modal
        visible={payrollModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPayrollModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.payrollModal, { backgroundColor: theme.backgroundElement }]}>
            
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Payroll: {selectedPayrollStaff?.name}
                </Text>
                <Text style={[styles.modalSubheading, { color: theme.textSecondary }]}>
                  Assign payments & view logs
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPayrollModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              
              {/* Pay Salary Panel */}
              <Card style={[styles.payrollEntryCard, { borderColor: theme.border }]}>
                <Text style={[styles.payrollEntryTitle, { color: theme.text }]}>Log New Salary Payment</Text>
                
                {salaryFormError ? (
                  <View style={[styles.errorBox, { backgroundColor: theme.danger + '10', borderColor: theme.danger }]}>
                    <Text style={[styles.errorText, { color: theme.danger }]}>{salaryFormError}</Text>
                  </View>
                ) : null}

                <View style={styles.payrollInputsGrid}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Month (YYYY-MM) *"
                      placeholder="e.g. 2026-07"
                      value={payMonth}
                      onChangeText={setPayMonth}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Base Amount"
                      value={`PKR ${selectedPayrollStaff?.salary.toLocaleString('en-IN')}`}
                      editable={false}
                    />
                  </View>
                </View>

                <View style={styles.payrollInputsGrid}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Bonus"
                      placeholder="e.g. 1500"
                      value={payBonus}
                      onChangeText={setPayBonus}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Deduction"
                      placeholder="e.g. 500"
                      value={payDeduction}
                      onChangeText={setPayDeduction}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <Input
                  label="Payment Notes"
                  placeholder="e.g. Paid online via bank transfer"
                  value={payNotes}
                  onChangeText={setPayNotes}
                />

                <Button
                  title={`Process Payment (Total: PKR ${((selectedPayrollStaff?.salary || 0) + (parseFloat(payBonus) || 0) - (parseFloat(payDeduction) || 0)).toLocaleString('en-IN')})`}
                  variant="primary"
                  size="medium"
                  icon={<Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />}
                  onPress={handlePaySalarySubmit}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 4 }}>
                  <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
                  <Text style={{ fontSize: 11.5, color: theme.textSecondary, flex: 1 }}>
                    Salary payouts automatically record under Business Expenses ("Staff Salaries") and are deducted from daily cashflow & net revenue.
                  </Text>
                </View>
              </Card>

              {/* Salary History */}
              <Text style={[styles.payrollHistoryHeading, { color: theme.text }]}>Salary History Logs</Text>
              
              {loadingSalaryHistory ? (
                <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 20 }} />
              ) : salaryHistory.length === 0 ? (
                <Text style={[styles.emptyHistoryText, { color: theme.textSecondary }]}>
                  No salary payments logged yet.
                </Text>
              ) : (
                salaryHistory.map(item => {
                  const formattedDate = new Date(item.lastUpdated).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  });
                  const totalPaid = item.amount + item.bonus - item.deduction;
                  return (
                    <View key={item.id} style={[styles.historyRow, { borderBottomColor: theme.border }]}>
                      <View style={{ flex: 1.5 }}>
                        <Text style={[styles.historyMonth, { color: theme.text }]}>Month: {item.month}</Text>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>Paid on: {formattedDate}</Text>
                        {item.notes ? (
                          <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                            Notes: {item.notes}
                          </Text>
                        ) : null}
                      </View>
                      
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: theme.success }}>
                          PKR {totalPaid.toFixed(2)}
                        </Text>
                        {item.bonus > 0 && <Text style={{ fontSize: 11, color: theme.primary }}>+PKR {item.bonus} Bonus</Text>}
                        {item.deduction > 0 && <Text style={{ fontSize: 11, color: theme.danger }}>-PKR {item.deduction} Ded.</Text>}
                      </View>
                    </View>
                  );
                })
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </Card>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 8,
    gap: 10,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
    lineHeight: 20,
  },
  staffCard: {
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  staffName: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 9,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  editBtn: {
    padding: 4,
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  cardDetails: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    fontWeight: '600',
  },
  payrollCard: {
    padding: 16,
    marginBottom: 10,
  },
  payrollHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payrollSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  formModal: {
    width: '100%',
    maxHeight: '85%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
  },
  payrollModal: {
    width: '100%',
    maxHeight: '90%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
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
  modalSubheading: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  formScroll: {
    flexGrow: 0,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  selectorBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  payrollEntryCard: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 20,
  },
  payrollEntryTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  payrollInputsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  payrollHistoryHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyHistoryText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginVertical: 20,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  historyMonth: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
});
