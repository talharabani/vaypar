import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, Modal,
    ScrollView,
    StyleSheet, Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import ScreenWrapper from '../../../components/ScreenWrapper';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../hooks/use-theme';
import * as gymDb from '../../../services/gymDb';

function formatPKR(n: number) {
  return `PKR ${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
function uid() { return 'pay_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36); }
function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysLeft(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionBody, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {children}
      </View>
    </View>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
      <Ionicons name={icon as any} size={16} color={theme.textSecondary} style={{ marginRight: 8 }} />
      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor ?? theme.text }]}>{value}</Text>
    </View>
  );
}

// ─── Collect Fee Modal ────────────────────────────────────────────────────────
function CollectFeeModal({
  visible, member, onClose, onSaved, businessId, userId,
}: {
  visible: boolean; member: gymDb.GymMember | null;
  onClose: () => void; onSaved: () => void;
  businessId: string; userId: string;
}) {
  const theme = useTheme();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) setAmount(member.planPrice.toString());
  }, [member]);

  const handleSave = async () => {
    if (!member) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Invalid', 'Enter a valid amount.'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const thisMonth = now.substring(0, 7);
      await gymDb.recordGymPayment({
        id: uid(),
        businessId,
        memberId: member.id,
        memberName: member.name,
        planId: member.planId,
        planName: member.planName,
        amount: amt,
        month: thisMonth,
        paidDate: now,
        notes,
        createdBy: userId,
        lastUpdated: now,
      });
      setAmount('');
      setNotes('');
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modal, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Collect Fee</Text>
          {member && (
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {member.name} · Plan: {member.planName}
            </Text>
          )}
          <TextInput
            style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
            placeholder="Amount (PKR)"
            placeholderTextColor={theme.textSecondary}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
            placeholder="Note (optional)"
            placeholderTextColor={theme.textSecondary}
            value={notes}
            onChangeText={setNotes}
          />
          <View style={styles.modalBtns}>
            <TouchableOpacity style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]} onPress={onClose}>
              <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.primary }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color: '#FFF', fontWeight: '700' }}>Collect</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MemberDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [member, setMember] = useState<gymDb.GymMember | null>(null);
  const [payments, setPayments] = useState<gymDb.GymPayment[]>([]);
  const [attendance, setAttendance] = useState<gymDb.GymAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [feeModalVisible, setFeeModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'payments' | 'attendance'>('info');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [m, p, a] = await Promise.all([
        gymDb.getGymMember(id),
        gymDb.getGymPayments(businessId, id),
        gymDb.getAttendanceByMember(businessId, id),
      ]);
      setMember(m);
      setPayments(p);
      setAttendance(a);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id, businessId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = () => {
    Alert.alert('Delete Member', `Remove ${member?.name} from gym?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (member) { await gymDb.deleteMember(member.id); router.back(); }
        },
      },
    ]);
  };

  const handleCheckIn = async () => {
    if (!member) return;
    try {
      await gymDb.checkInMember(businessId, member, user?.id ?? '');
      Alert.alert('✅ Checked In', `${member.name} checked in successfully!`);
      load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  if (loading || !member) {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  const days = daysLeft(member.membershipEnd);
  const bmi = gymDb.calcBMI(member.heightCm ?? 0, member.weightKg ?? 0);
  const bmiInfo = gymDb.bmiCategory(bmi);

  const isExpired = member.status === 'expired';
  const isDue = member.feeStatus === 'due';
  const expiringSoon = days <= 7 && days > 0 && !isExpired;

  const statusColor = isExpired ? theme.danger : isDue ? theme.warning : theme.success;
  const avatarColor = member.gender === 'female' ? '#EC4899' : member.gender === 'other' ? '#8B5CF6' : theme.primary;

  return (
    <ScreenWrapper title={member.name}>
      {/* Header */}
      <View style={[styles.topHeader, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: theme.text }]} numberOfLines={1}>{member.name}</Text>
        <TouchableOpacity onPress={handleDelete} style={{ padding: 4 }}>
          <Ionicons name="trash-outline" size={20} color={theme.danger} />
        </TouchableOpacity>
      </View>

      {/* Hero Card */}
      <View style={[styles.heroCard, { backgroundColor: avatarColor }]}>
        <View style={styles.heroAvatar}>
          <Text style={styles.heroAvatarText}>{member.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{member.name}</Text>
          <Text style={styles.heroPhone}>{member.phone}</Text>
          <View style={styles.heroStatusRow}>
            <View style={[styles.heroPill, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={styles.heroPillText}>{member.planName}</Text>
            </View>
            <View style={[styles.heroPill, {
              backgroundColor: isExpired ? 'rgba(239,68,68,0.3)' : isDue ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'
            }]}>
              <Text style={styles.heroPillText}>
                {isExpired ? '✕ Expired' : isDue ? '⚠ Fee Due' : '✓ Active'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Alert banners */}
      {(isExpired || isDue || expiringSoon) && (
        <View style={[styles.alertBanner, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
          <Ionicons name="alert-circle" size={16} color={statusColor} />
          <Text style={[styles.alertText, { color: statusColor }]}>
            {isExpired
              ? 'Membership has expired. Collect fee to renew.'
              : expiringSoon
                ? `Expires in ${days} day${days !== 1 ? 's' : ''}!`
                : 'Monthly fee is due.'}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.primary }]}
          onPress={() => setFeeModalVisible(true)}
        >
          <Ionicons name="cash" size={16} color="#FFF" />
          <Text style={styles.actionBtnText}>Collect Fee</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.success }]}
          onPress={handleCheckIn}
        >
          <Ionicons name="scan" size={16} color="#FFF" />
          <Text style={styles.actionBtnText}>Check In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }]}
          onPress={() => router.push({ pathname: '/gym/new-member', params: { edit: member.id } })}
        >
          <Ionicons name="pencil" size={16} color={theme.text} />
          <Text style={[styles.actionBtnText, { color: theme.text }]}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {(['info', 'payments', 'attendance'] as const).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setActiveTab(t)}
            style={[styles.tab, activeTab === t && [styles.tabActive, { borderBottomColor: theme.primary }]]}
          >
            <Text style={[styles.tabText, { color: activeTab === t ? theme.primary : theme.textSecondary }]}>
              {t === 'info' ? 'Profile' : t === 'payments' ? `Payments (${payments.length})` : `Attendance (${attendance.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>

        {/* Profile Tab */}
        {activeTab === 'info' && (
          <>
            <Section title="MEMBERSHIP">
              <InfoRow icon="calendar-outline" label="Start" value={formatDate(member.membershipStart)} />
              <InfoRow
                icon="calendar" label="Expires" value={formatDate(member.membershipEnd)}
                valueColor={isExpired ? theme.danger : expiringSoon ? theme.warning : theme.success}
              />
              <InfoRow icon="pricetag-outline" label="Plan" value={`${member.planName} · ${formatPKR(member.planPrice)}`} />
              <InfoRow icon="cash-outline" label="Last Payment" value={member.lastFeeDate ? formatDate(member.lastFeeDate) : 'Never'} />
            </Section>

            <Section title="PERSONAL">
              <InfoRow icon="call-outline" label="Phone" value={member.phone || '—'} />
              <InfoRow icon="card-outline" label="CNIC" value={member.cnic || '—'} />
              <InfoRow icon="location-outline" label="Address" value={member.address || '—'} />
              <InfoRow icon="alert-circle-outline" label="Emergency" value={member.emergencyContact || '—'} />
              <InfoRow icon="person-outline" label="Gender" value={member.gender ?? '—'} />
              <InfoRow icon="calendar-outline" label="DOB" value={member.dateOfBirth ? formatDate(member.dateOfBirth) : '—'} />
              <InfoRow icon="star-outline" label="Joined" value={formatDate(member.joiningDate)} />
            </Section>

            {(member.heightCm || member.weightKg) && (
              <Section title="BODY METRICS">
                {member.heightCm ? <InfoRow icon="resize-outline" label="Height" value={`${member.heightCm} cm`} /> : null}
                {member.weightKg ? <InfoRow icon="fitness-outline" label="Weight" value={`${member.weightKg} kg`} /> : null}
                {bmi > 0 && (
                  <InfoRow
                    icon="analytics-outline"
                    label="BMI"
                    value={`${bmi} — ${bmiInfo.label}`}
                    valueColor={bmiInfo.color}
                  />
                )}
              </Section>
            )}

            {member.notes ? (
              <Section title="NOTES">
                <Text style={[styles.notesText, { color: theme.text }]}>{member.notes}</Text>
              </Section>
            ) : null}
          </>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <>
            {payments.length === 0 ? (
              <View style={styles.emptyTab}>
                <Ionicons name="cash-outline" size={52} color={theme.textSecondary + '40'} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No payments recorded yet.</Text>
                <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: theme.primary }]} onPress={() => setFeeModalVisible(true)}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Collect First Fee</Text>
                </TouchableOpacity>
              </View>
            ) : (
              payments.map(p => (
                <View key={p.id} style={[styles.payRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <View style={[styles.payIcon, { backgroundColor: theme.success + '18' }]}>
                    <Ionicons name="checkmark" size={18} color={theme.success} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[{ color: theme.text, fontWeight: '700' }]}>{p.planName}</Text>
                    <Text style={[{ color: theme.textSecondary, fontSize: 12 }]}>
                      {formatDate(p.paidDate)} · Month: {p.month}
                    </Text>
                    {p.notes ? <Text style={[{ color: theme.textSecondary, fontSize: 11 }]}>{p.notes}</Text> : null}
                  </View>
                  <Text style={[{ color: theme.success, fontWeight: '800', fontSize: 15 }]}>
                    {formatPKR(p.amount)}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {/* Attendance Tab */}
        {activeTab === 'attendance' && (
          <>
            {attendance.length === 0 ? (
              <View style={styles.emptyTab}>
                <Ionicons name="scan-outline" size={52} color={theme.textSecondary + '40'} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No attendance recorded yet.</Text>
                <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: theme.success }]} onPress={handleCheckIn}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Check In Now</Text>
                </TouchableOpacity>
              </View>
            ) : (
              attendance.map(a => (
                <View key={a.id} style={[styles.attRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <View style={[styles.payIcon, { backgroundColor: theme.primary + '18' }]}>
                    <Ionicons name="time-outline" size={18} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[{ color: theme.text, fontWeight: '700' }]}>{a.date}</Text>
                    <Text style={[{ color: theme.textSecondary, fontSize: 12 }]}>
                      In: {new Date(a.checkIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      {a.checkOut
                        ? ` · Out: ${new Date(a.checkOut).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}`
                        : ' · Still inside'}
                    </Text>
                  </View>
                  {!a.checkOut && (
                    <TouchableOpacity
                      style={[{ backgroundColor: theme.danger + '18', borderRadius: 8, padding: 6 }]}
                      onPress={async () => { await gymDb.checkOutMember(a.id); load(); }}
                    >
                      <Text style={[{ color: theme.danger, fontSize: 11, fontWeight: '700' }]}>Check Out</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <CollectFeeModal
        visible={feeModalVisible}
        member={member}
        businessId={businessId}
        userId={user?.id ?? ''}
        onClose={() => setFeeModalVisible(false)}
        onSaved={load}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12,
  },
  topHeaderTitle: { flex: 1, fontSize: 18, fontWeight: '800' },

  heroCard: {
    flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16,
  },
  heroAvatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarText: { fontSize: 26, fontWeight: '900', color: '#FFF' },
  heroInfo: { flex: 1 },
  heroName: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  heroPhone: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  heroStatusRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  heroPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  heroPillText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1,
  },
  alertText: { fontWeight: '700', fontSize: 13 },

  actionRow: { flexDirection: 'row', gap: 10, padding: 16 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 10, paddingVertical: 12,
  },
  actionBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: {},
  tabText: { fontSize: 13, fontWeight: '700' },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  sectionBody: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: { fontSize: 13, flex: 1, fontWeight: '500' },
  infoValue: { fontSize: 13, fontWeight: '700', maxWidth: '55%', textAlign: 'right' },
  notesText: { padding: 14, fontSize: 14, lineHeight: 22 },

  payRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  payIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  attRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },

  emptyTab: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  modalSub: { fontSize: 13, marginBottom: 16 },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
