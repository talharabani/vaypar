import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import { CustomerNameInput } from '../../components/CustomerNameInput';
import { CustomerPhoneInput } from '../../components/CustomerPhoneInput';
import * as gymDb from '../../services/gymDb';
import { validateCustomerName, validateCustomerPhone, detectCountryCode } from '../../utils/phoneUtils';

function uid() { return 'mbr_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36); }

function LabeledInput({
  label, placeholder, value, onChangeText, keyboardType, multiline, required,
}: {
  label: string; placeholder: string; value: string;
  onChangeText: (t: string) => void; keyboardType?: any;
  multiline?: boolean; required?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
        {label}{required && <Text style={{ color: theme.danger }}> *</Text>}
      </Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
          multiline && { height: 80, textAlignVertical: 'top', paddingTop: 10 },
        ]}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary + '80'}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

export default function NewMemberScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ edit?: string }>();
  const businessId = user?.businessId ?? '';

  const [plans, setPlans] = useState<gymDb.GymPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<gymDb.GymPlan | null>(null);
  const [planPickerVisible, setPlanPickerVisible] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [cnic, setCnic] = useState('');
  const [address, setAddress] = useState('');
  const [emergency, setEmergency] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [dob, setDob] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!businessId) return;
      await gymDb.initGymTables();
      await gymDb.seedDefaultPlans(businessId);
      const p = await gymDb.getGymPlans(businessId);
      const active = p.filter(pl => pl.isActive);
      setPlans(active);
      if (active.length > 0) setSelectedPlan(active[0]);
    })();
  }, [businessId]);

  const bmi = height && weight
    ? gymDb.calcBMI(parseFloat(height), parseFloat(weight))
    : 0;
  const bmiInfo = gymDb.bmiCategory(bmi);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Please enter member name.'); return; }
    const nameVal = validateCustomerName(name);
    if (!nameVal.isValid) { Alert.alert('Invalid Name', nameVal.error || 'Name cannot contain numbers.'); return; }

    if (!phone.trim()) { Alert.alert('Required', 'Please enter phone number.'); return; }
    const phoneVal = validateCustomerPhone(phone, countryCode);
    if (!phoneVal.isValid) { Alert.alert('Invalid Phone', phoneVal.error || 'Please enter a valid phone number.'); return; }

    if (!selectedPlan) { Alert.alert('Required', 'Please select a membership plan.'); return; }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const start = startDate || now.split('T')[0];
      const end = new Date(new Date(start).getTime() + selectedPlan.durationDays * 86400000)
        .toISOString().split('T')[0];

      const member: gymDb.GymMember = {
        id: uid(),
        businessId,
        name: name.trim(),
        phone: phoneVal.fullPhone,
        cnic: cnic.trim(),
        address: address.trim(),
        emergencyContact: emergency.trim(),
        gender,
        dateOfBirth: dob,
        joiningDate: start,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        planPrice: selectedPlan.price,
        membershipStart: start,
        membershipEnd: end,
        status: 'active',
        feeStatus: 'due',
        heightCm: height ? parseFloat(height) : undefined,
        weightKg: weight ? parseFloat(weight) : undefined,
        notes: notes.trim(),
        lastUpdated: now,
      };
      await gymDb.upsertGymMember(member);
      router.replace('/gym');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenWrapper title="New Member">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>New Member</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: theme.primary }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">

        {/* Personal Info */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Personal Information</Text>

        <CustomerNameInput label="Full Name *" placeholder="e.g. Ali Hassan" value={name} onChangeText={setName} required />
        <CustomerPhoneInput label="Phone Number *" value={phone} onChangeText={setPhone} selectedCountryCode={countryCode} onCountryCodeChange={setCountryCode} required />
        <LabeledInput label="CNIC" placeholder="XXXXX-XXXXXXX-X" value={cnic} onChangeText={setCnic} keyboardType="numeric" />

        {/* Gender */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Gender</Text>
          <View style={styles.genderRow}>
            {(['male', 'female', 'other'] as const).map(g => (
              <TouchableOpacity
                key={g}
                onPress={() => setGender(g)}
                style={[
                  styles.genderChip,
                  {
                    backgroundColor: gender === g ? theme.primary : theme.background,
                    borderColor: gender === g ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={{ color: gender === g ? '#FFF' : theme.textSecondary, fontWeight: '700', textTransform: 'capitalize', fontSize: 13 }}>
                  {g === 'male' ? '👨 Male' : g === 'female' ? '👩 Female' : '⚧ Other'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <LabeledInput label="Date of Birth" placeholder="YYYY-MM-DD" value={dob} onChangeText={setDob} />
        <LabeledInput label="Address" placeholder="House/Street, City" value={address} onChangeText={setAddress} />
        <LabeledInput label="Emergency Contact" placeholder="Name & Phone" value={emergency} onChangeText={setEmergency} />

        {/* Membership Plan */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 8 }]}>Membership Plan</Text>

        <TouchableOpacity
          style={[styles.planPicker, { backgroundColor: theme.background, borderColor: theme.border }]}
          onPress={() => setPlanPickerVisible(true)}
        >
          {selectedPlan ? (
            <View style={styles.planSelected}>
              <View style={{ flex: 1 }}>
                <Text style={[{ color: theme.text, fontWeight: '700', fontSize: 15 }]}>{selectedPlan.name}</Text>
                <Text style={[{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }]}>
                  {selectedPlan.durationDays} days · PKR {selectedPlan.price.toLocaleString()}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
            </View>
          ) : (
            <Text style={[{ color: theme.textSecondary }]}>Select a plan…</Text>
          )}
        </TouchableOpacity>

        <LabeledInput label="Membership Start Date" placeholder="YYYY-MM-DD" value={startDate} onChangeText={setStartDate} />

        {selectedPlan && startDate ? (
          <View style={[styles.endDateBox, { backgroundColor: theme.primary + '12', borderColor: theme.primary + '40' }]}>
            <Ionicons name="calendar-outline" size={16} color={theme.primary} />
            <Text style={[{ color: theme.primary, fontWeight: '600', fontSize: 13, marginLeft: 8 }]}>
              Membership ends:{' '}
              {new Date(new Date(startDate).getTime() + selectedPlan.durationDays * 86400000)
                .toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        ) : null}

        {/* Body Metrics */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 8 }]}>Body Metrics (Optional)</Text>

        <View style={styles.metricsRow}>
          <View style={{ flex: 1 }}>
            <LabeledInput label="Height (cm)" placeholder="e.g. 175" value={height} onChangeText={setHeight} keyboardType="numeric" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <LabeledInput label="Weight (kg)" placeholder="e.g. 72" value={weight} onChangeText={setWeight} keyboardType="numeric" />
          </View>
        </View>

        {bmi > 0 && (
          <View style={[styles.bmiCard, { backgroundColor: bmiInfo.color + '12', borderColor: bmiInfo.color + '40' }]}>
            <Text style={[styles.bmiValue, { color: bmiInfo.color }]}>BMI: {bmi}</Text>
            <Text style={[styles.bmiLabel, { color: bmiInfo.color }]}>{bmiInfo.label}</Text>
          </View>
        )}

        <LabeledInput label="Notes" placeholder="Health conditions, goals, etc." value={notes} onChangeText={setNotes} multiline />
      </ScrollView>

      {/* Plan Picker Modal */}
      <Modal visible={planPickerVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.planModal, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Select Plan</Text>
            <ScrollView>
              {plans.map(p => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { setSelectedPlan(p); setPlanPickerVisible(false); }}
                  style={[
                    styles.planOption,
                    {
                      backgroundColor: selectedPlan?.id === p.id ? theme.primary + '12' : theme.background,
                      borderColor: selectedPlan?.id === p.id ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: theme.text, fontWeight: '700', fontSize: 15 }]}>{p.name}</Text>
                    <Text style={[{ color: theme.textSecondary, fontSize: 12 }]}>
                      {p.durationDays} days · {p.description}
                    </Text>
                  </View>
                  <Text style={[{ color: theme.primary, fontWeight: '800', fontSize: 16 }]}>
                    PKR {p.price.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => setPlanPickerVisible(false)}
            >
              <Text style={[{ color: theme.text, fontWeight: '700' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', flex: 1, marginLeft: 12 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 12, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, fontWeight: '500',
  },

  genderRow: { flexDirection: 'row', gap: 8 },
  genderChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  planPicker: {
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12,
  },
  planSelected: { flexDirection: 'row', alignItems: 'center' },
  endDateBox: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1,
    padding: 10, marginBottom: 12,
  },

  metricsRow: { flexDirection: 'row' },
  bmiCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14,
  },
  bmiValue: { fontSize: 16, fontWeight: '800' },
  bmiLabel: { fontSize: 14, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  planModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  planOption: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  modalCloseBtn: {
    marginTop: 8, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center',
  },
});
