import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import { CustomerNameInput } from '../../components/CustomerNameInput';
import { CustomerPhoneInput } from '../../components/CustomerPhoneInput';
import * as salonDb from '../../services/salonDb';
import { validateCustomerName, validateCustomerPhone, detectCountryCode } from '../../utils/phoneUtils';

export default function BookAppointmentScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [services, setServices] = useState<salonDb.SalonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [countryCode, setCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [selectedService, setSelectedService] = useState<salonDb.SalonService | null>(null);
  const [appointmentDate, setAppointmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointmentTime, setAppointmentTime] = useState('10:00');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      try {
        await salonDb.initSalonTables();
        let svcs = await salonDb.getServices(businessId);
        if (svcs.length === 0) {
          await salonDb.seedDefaultServices(businessId);
          svcs = await salonDb.getServices(businessId);
        }
        setServices(svcs);
        if (svcs.length > 0 && !selectedService) {
          setSelectedService(svcs[0]);
        }
      } catch (e) {
        console.error('Failed to load services:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId]);

  const timeSlots = (() => {
    const slots: string[] = [];
    for (let h = 8; h <= 21; h++) {
      for (const m of ['00', '30']) {
        slots.push(`${h.toString().padStart(2, '0')}:${m}`);
      }
    }
    return slots;
  })();

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      Alert.alert('Required', 'Please enter customer name');
      return;
    }
    const nameVal = validateCustomerName(customerName);
    if (!nameVal.isValid) {
      Alert.alert('Invalid Customer Name', nameVal.error || 'Name cannot contain numbers.');
      return;
    }

    let finalPhone = customerPhone.trim();
    if (customerPhone.trim()) {
      const phoneVal = validateCustomerPhone(customerPhone, countryCode);
      if (!phoneVal.isValid) {
        Alert.alert('Invalid Phone Number', phoneVal.error || 'Please enter a valid phone number.');
        return;
      }
      finalPhone = phoneVal.fullPhone;
    }

    if (!selectedService) {
      Alert.alert('Required', 'Please select a service');
      return;
    }
    if (!appointmentDate || !appointmentTime) {
      Alert.alert('Required', 'Please select date and time');
      return;
    }

    setSubmitting(true);
    try {
      const id = 'apt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const now = new Date().toISOString();

      await salonDb.upsertAppointment({
        id,
        businessId,
        customerName: customerName.trim(),
        customerPhone: finalPhone,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        staffId: user?.id || '',
        staffName: user?.name || '',
        appointmentDate,
        appointmentTime,
        durationMinutes: selectedService.durationMinutes,
        price: selectedService.price,
        status: 'scheduled',
        notes: notes.trim(),
        synced: 0,
        lastUpdated: now,
        deleted: 0,
      });

      Alert.alert('Success', 'Appointment booked successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to book appointment');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title="Book Appointment">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Book Appointment</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Customer Details */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Customer Details</Text>
            <CustomerNameInput
              label="Customer Name *"
              placeholder="Customer Name"
              value={customerName}
              onChangeText={setCustomerName}
              required
            />
            <CustomerPhoneInput
              label="Customer Phone"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              selectedCountryCode={countryCode}
              onCountryCodeChange={setCountryCode}
            />
          </View>

          {/* Service Selection */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Select Service *</Text>
            {services.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No services found. Add services first.
                </Text>
                <TouchableOpacity onPress={() => router.push('/salon/services' as any)}>
                  <Text style={[styles.linkText, { color: theme.primary }]}>Manage Services</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {services.map((svc) => (
                  <TouchableOpacity
                    key={svc.id}
                    style={[
                      styles.serviceChip,
                      {
                        backgroundColor: selectedService?.id === svc.id ? theme.primary + '15' : theme.backgroundElement,
                        borderColor: selectedService?.id === svc.id ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setSelectedService(svc)}
                  >
                    <Text
                      style={[
                        styles.serviceChipName,
                        { color: selectedService?.id === svc.id ? theme.primary : theme.text },
                      ]}
                      numberOfLines={1}
                    >
                      {svc.name}
                    </Text>
                    <Text style={[styles.serviceChipPrice, { color: theme.textSecondary }]}>
                      PKR {svc.price} · {svc.durationMinutes}min
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Date */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Date *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {Array.from({ length: 14 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() + i);
                const dateStr = d.toISOString().split('T')[0];
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                const dateNum = d.getDate();
                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={[
                      styles.dateChip,
                      {
                        backgroundColor: appointmentDate === dateStr ? theme.primary : theme.backgroundElement,
                        borderColor: appointmentDate === dateStr ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setAppointmentDate(dateStr)}
                  >
                    <Text style={[styles.dateChipDay, { color: appointmentDate === dateStr ? '#FFF' : theme.textSecondary }]}>
                      {dayName}
                    </Text>
                    <Text style={[styles.dateChipNum, { color: appointmentDate === dateStr ? '#FFF' : theme.text }]}>
                      {dateNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Time */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Time *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flexWrap: 'wrap' }}>
              {timeSlots.map((slot) => (
                <TouchableOpacity
                  key={slot}
                  style={[
                    styles.timeChip,
                    {
                      backgroundColor: appointmentTime === slot ? theme.primary : theme.backgroundElement,
                      borderColor: appointmentTime === slot ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setAppointmentTime(slot)}
                >
                  <Text style={[styles.timeChipText, { color: appointmentTime === slot ? '#FFF' : theme.text }]}>
                    {slot}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Notes</Text>
            <View style={[styles.inputGroup, { backgroundColor: theme.backgroundElement, borderColor: theme.border, minHeight: 80, alignItems: 'flex-start' }]}>
              <TextInput
                style={[styles.input, { color: theme.text, textAlignVertical: 'top' }]}
                placeholder="Any special instructions..."
                placeholderTextColor={theme.textSecondary + '80'}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          {/* Summary */}
          {selectedService && (
            <View style={[styles.summary, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
              <Text style={[styles.summaryTitle, { color: theme.primary }]}>Booking Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Service</Text>
                <Text style={[styles.summaryValue, { color: theme.text }]}>{selectedService.name}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Duration</Text>
                <Text style={[styles.summaryValue, { color: theme.text }]}>{selectedService.durationMinutes} minutes</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total</Text>
                <Text style={[styles.summaryValue, { color: theme.primary, fontWeight: '800' }]}>
                  PKR {selectedService.price.toLocaleString()}
                </Text>
              </View>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: submitting ? 0.6 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.submitBtnText}>Book Appointment</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  inputGroup: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500' },
  serviceChip: {
    padding: 14, borderRadius: 14, borderWidth: 1, minWidth: 130, gap: 4,
  },
  serviceChipName: { fontSize: 14, fontWeight: '700' },
  serviceChipPrice: { fontSize: 12, fontWeight: '500' },
  dateChip: {
    width: 56, height: 68, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  dateChipDay: { fontSize: 11, fontWeight: '600' },
  dateChipNum: { fontSize: 20, fontWeight: '800' },
  timeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  timeChipText: { fontSize: 13, fontWeight: '600' },
  summary: {
    marginHorizontal: 20, padding: 16, borderRadius: 16, borderWidth: 1, gap: 8, marginBottom: 20,
  },
  summaryTitle: { fontSize: 15, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 13, fontWeight: '500' },
  summaryValue: { fontSize: 13, fontWeight: '600' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, paddingVertical: 16, borderRadius: 16,
  },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  emptyBox: {
    padding: 20, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 8,
  },
  emptyText: { fontSize: 13, textAlign: 'center' },
  linkText: { fontSize: 14, fontWeight: '700' },
});
