import React, { useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import { CustomerNameInput } from '../../components/CustomerNameInput';
import { CustomerPhoneInput } from '../../components/CustomerPhoneInput';
import * as tailorDb from '../../services/tailorDb';
import { validateCustomerName, validateCustomerPhone, detectCountryCode } from '../../utils/phoneUtils';

function uid() { return 'ord_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36); }

export default function NewTailorOrderScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  // Order Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [countryCode, setCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [itemType, setItemType] = useState(tailorDb.ITEM_TYPES[0]);
  const [quantity, setQuantity] = useState('1');
  const [fabric, setFabric] = useState('');
  const [color, setColor] = useState('');
  const [design, setDesign] = useState('');

  // Financials & Dates
  const [totalPrice, setTotalPrice] = useState('');
  const [advancePaid, setAdvancePaid] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  );
  const [trialDate, setTrialDate] = useState('');
  const [notes, setNotes] = useState('');

  // Measurements
  const [kameezLength, setKameezLength] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [shoulder, setShoulder] = useState('');
  const [sleeveLength, setSleeveLength] = useState('');
  const [neck, setNeck] = useState('');
  const [shalwarLength, setShalwarLength] = useState('');

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!customerName.trim()) { Alert.alert('Required', 'Please enter customer name.'); return; }
    const nameVal = validateCustomerName(customerName);
    if (!nameVal.isValid) { Alert.alert('Invalid Customer Name', nameVal.error || 'Name cannot contain numbers.'); return; }

    if (!customerPhone.trim()) { Alert.alert('Required', 'Please enter phone number.'); return; }
    const phoneVal = validateCustomerPhone(customerPhone, countryCode);
    if (!phoneVal.isValid) { Alert.alert('Invalid Phone Number', phoneVal.error || 'Please enter a valid phone number.'); return; }

    const total = parseFloat(totalPrice) || 0;
    const adv = parseFloat(advancePaid) || 0;

    setSaving(true);
    try {
      await tailorDb.initTailorTables();
      const orderNum = await tailorDb.getNextOrderNumber(businessId);
      const now = new Date().toISOString();

      const measurementsObj: tailorDb.TailorMeasurement = {
        kameezLength: parseFloat(kameezLength) || undefined,
        chest: parseFloat(chest) || undefined,
        waist: parseFloat(waist) || undefined,
        shoulder: parseFloat(shoulder) || undefined,
        sleeveLength: parseFloat(sleeveLength) || undefined,
        neck: parseFloat(neck) || undefined,
        shalwarLength: parseFloat(shalwarLength) || undefined,
      };

      const newOrder: tailorDb.TailorOrder = {
        id: uid(),
        businessId,
        orderNumber: orderNum,
        customerName: customerName.trim(),
        customerPhone: phoneVal.fullPhone,
        itemType,
        quantity: parseInt(quantity) || 1,
        fabric: fabric.trim(),
        color: color.trim(),
        design: design.trim(),
        measurements: JSON.stringify(measurementsObj),
        totalPrice: total,
        advancePaid: adv,
        balanceDue: Math.max(0, total - adv),
        orderDate: now.split('T')[0],
        deliveryDate,
        trialDate: trialDate.trim(),
        status: 'pending',
        notes: notes.trim(),
        createdBy: user?.id ?? '',
        lastUpdated: now,
      };

      await tailorDb.upsertTailorOrder(newOrder);
      router.replace('/tailor');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenWrapper title="New Tailor Order">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>New Stitching Order</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: theme.primary }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">

        {/* Customer Info */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Customer Info</Text>
        <CustomerNameInput
          label="Customer Name *"
          placeholder="e.g. Muhammad Usman"
          value={customerName}
          onChangeText={setCustomerName}
          required
        />
        <CustomerPhoneInput
          label="Phone Number *"
          value={customerPhone}
          onChangeText={setCustomerPhone}
          selectedCountryCode={countryCode}
          onCountryCodeChange={setCountryCode}
          required
        />

        {/* Suit & Fabric Info */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 12 }]}>Order Details</Text>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Item Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeChips}>
          {tailorDb.ITEM_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setItemType(t)}
              style={[
                styles.chip,
                {
                  backgroundColor: itemType === t ? theme.primary : theme.backgroundElement,
                  borderColor: itemType === t ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={{ color: itemType === t ? '#FFF' : theme.text, fontWeight: '700', fontSize: 12 }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.rowInputs}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Quantity</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
            />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Fabric / Brand</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Wash & Wear"
              placeholderTextColor={theme.textSecondary}
              value={fabric}
              onChangeText={setFabric}
            />
          </View>
        </View>

        {/* Measurements Form */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 12 }]}>Measurements (Inches)</Text>
        <View style={styles.rowInputs}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Kameez Length</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={kameezLength} onChangeText={setKameezLength} keyboardType="numeric" placeholder="e.g. 40" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Chest</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={chest} onChangeText={setChest} keyboardType="numeric" placeholder="e.g. 21" />
          </View>
        </View>

        <View style={styles.rowInputs}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Shoulder (Teera)</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={shoulder} onChangeText={setShoulder} keyboardType="numeric" placeholder="e.g. 18" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Sleeve Length</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={sleeveLength} onChangeText={setSleeveLength} keyboardType="numeric" placeholder="e.g. 24" />
          </View>
        </View>

        <View style={styles.rowInputs}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Neck (Gala)</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={neck} onChangeText={setNeck} keyboardType="numeric" placeholder="e.g. 15.5" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Shalwar Length</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={shalwarLength} onChangeText={setShalwarLength} keyboardType="numeric" placeholder="e.g. 38" />
          </View>
        </View>

        {/* Pricing & Schedule */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 12 }]}>Payment & Schedule</Text>
        <View style={styles.rowInputs}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Total Price (PKR)</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={totalPrice} onChangeText={setTotalPrice} keyboardType="numeric" placeholder="e.g. 2500" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Advance Paid (PKR)</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={advancePaid} onChangeText={setAdvancePaid} keyboardType="numeric" placeholder="e.g. 1000" />
          </View>
        </View>

        <View style={styles.rowInputs}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Delivery Date</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={deliveryDate} onChangeText={setDeliveryDate} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Trial Date (Optional)</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} value={trialDate} onChangeText={setTrialDate} placeholder="YYYY-MM-DD" />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Special Instructions / Design Notes</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, height: 70 }]}
            multiline
            placeholder="Double gala, pocket style, cuff details..."
            value={notes}
            onChangeText={setNotes}
          />
        </View>

      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, fontWeight: '500' },
  typeChips: { gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, borderWidth: 1 },
  rowInputs: { flexDirection: 'row', marginBottom: 12 },
});
