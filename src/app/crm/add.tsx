import React, { useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import { CustomerNameInput } from '../../components/CustomerNameInput';
import { CustomerPhoneInput } from '../../components/CustomerPhoneInput';
import * as crmDb from '../../services/crmDb';
import { validateCustomerName, validateCustomerPhone, detectCountryCode } from '../../utils/phoneUtils';

export default function AddCustomerScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [birthday, setBirthday] = useState(''); // YYYY-MM-DD
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState(''); // Comma-separated tags
  const [rating, setRating] = useState(5);
  const [isVip, setIsVip] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter customer name');
      return;
    }
    const nameVal = validateCustomerName(name);
    if (!nameVal.isValid) {
      Alert.alert('Invalid Name', nameVal.error || 'Name cannot contain numbers.');
      return;
    }

    let finalPhone = phone.trim();
    if (phone.trim()) {
      const phoneVal = validateCustomerPhone(phone, countryCode);
      if (!phoneVal.isValid) {
        Alert.alert('Invalid Phone', phoneVal.error || 'Please enter a valid phone number.');
        return;
      }
      finalPhone = phoneVal.fullPhone;
    }

    setSubmitting(true);
    try {
      const id = 'crm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const now = new Date().toISOString();

      await crmDb.upsertCrmCustomer({
        id,
        businessId,
        name: name.trim(),
        phone: finalPhone,
        email: email.trim(),
        address: address.trim(),
        birthday: birthday.trim(),
        notes: notes.trim(),
        tags: tags.trim(),
        rating,
        isVip: isVip ? 1 : 0,
        loyaltyPoints: 0,
        favoriteProductIds: '',
        synced: 0,
        lastUpdated: now,
        deleted: 0
      });

      Alert.alert('Success', 'Customer profile registered successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to register customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenWrapper title="Add Customer">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, gap: 16 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Add Customer</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Form fields */}
          <CustomerNameInput
            label="Customer Name *"
            placeholder="Enter full name"
            value={name}
            onChangeText={setName}
            required
          />

          <CustomerPhoneInput
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            selectedCountryCode={countryCode}
            onCountryCodeChange={setCountryCode}
          />

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Email Address</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="e.g. customer@email.com"
              placeholderTextColor={theme.textSecondary + '80'}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Address</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="Gulshan, DHA, Clifton..."
              placeholderTextColor={theme.textSecondary + '80'}
              value={address}
              onChangeText={setAddress}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Birthday</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary + '80'}
              value={birthday}
              onChangeText={setBirthday}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Tags (Comma Separated)</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="e.g. VIP, Regular, Friend"
              placeholderTextColor={theme.textSecondary + '80'}
              value={tags}
              onChangeText={setTags}
            />
          </View>

          {/* Toggle VIP */}
          <TouchableOpacity
            style={[
              styles.vipToggle,
              {
                backgroundColor: isVip ? '#F59E0B' + '20' : theme.backgroundElement,
                borderColor: isVip ? '#F59E0B' : theme.border
              }
            ]}
            onPress={() => setIsVip(!isVip)}
          >
            <Ionicons name={isVip ? 'ribbon' : 'ribbon-outline'} size={20} color={isVip ? '#F59E0B' : theme.textSecondary} />
            <Text style={[styles.vipToggleText, { color: isVip ? '#F59E0B' : theme.text }]}>
              Mark as Premium VIP Customer
            </Text>
          </TouchableOpacity>

          {/* Rating */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Customer Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((stars) => (
                <TouchableOpacity key={stars} onPress={() => setRating(stars)}>
                  <Ionicons
                    name={stars <= rating ? 'star' : 'star-outline'}
                    size={28}
                    color={stars <= rating ? '#F59E0B' : '#D1D5DB'}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Internal Notes</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, minHeight: 70, textAlignVertical: 'top' }]}
              placeholder="Add client preferences, history notes, details..."
              placeholderTextColor={theme.textSecondary + '80'}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: submitting ? 0.6 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.submitBtnText}>Save Profile</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, fontWeight: '600' },
  vipToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginVertical: 8 },
  vipToggleText: { fontSize: 13, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', gap: 10, marginVertical: 4 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 12 },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' }
});
