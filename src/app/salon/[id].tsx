import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    ScrollView,
    StyleSheet, Text,
    TouchableOpacity,
    View
} from 'react-native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useTheme } from '../../hooks/use-theme';
import * as salonDb from '../../services/salonDb';

export default function AppointmentDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [appointment, setAppointment] = useState<salonDb.SalonAppointment | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAppointment = async () => {
    if (!id) return;
    try {
      const apt = await salonDb.getAppointmentById(id);
      setAppointment(apt);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointment();
  }, [id]);

  const handleStatusChange = async (status: salonDb.AppointmentStatus) => {
    if (!id) return;
    try {
      await salonDb.updateAppointmentStatus(id, status);
      Alert.alert('Status Updated', `Appointment marked as ${status}`);
      loadAppointment();
    } catch (err) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    Alert.alert('Delete Appointment', 'Are you sure you want to delete this appointment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await salonDb.deleteAppointment(id);
            router.back();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete appointment');
          }
        }
      }
    ]);
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

  if (!appointment) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>Appointment not found.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title={appointment.customerName}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Appointment Details</Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={[styles.section, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.clientLabel, { color: theme.textSecondary }]}>Client</Text>
          <Text style={[styles.clientName, { color: theme.text }]}>{appointment.customerName}</Text>
          {appointment.customerPhone ? (
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={14} color={theme.textSecondary} />
              <Text style={{ color: theme.textSecondary }}>{appointment.customerPhone}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.section, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Service Info</Text>
          <View style={styles.row}>
            <Text style={{ color: theme.textSecondary }}>Service</Text>
            <Text style={[styles.valueText, { color: theme.text }]}>{appointment.serviceName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={{ color: theme.textSecondary }}>Price</Text>
            <Text style={[styles.valueText, { color: theme.primary, fontWeight: '800' }]}>PKR {appointment.price}</Text>
          </View>
          <View style={styles.row}>
            <Text style={{ color: theme.textSecondary }}>Duration</Text>
            <Text style={[styles.valueText, { color: theme.text }]}>{appointment.durationMinutes} min</Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Schedule Info</Text>
          <View style={styles.row}>
            <Text style={{ color: theme.textSecondary }}>Date</Text>
            <Text style={[styles.valueText, { color: theme.text }]}>{appointment.appointmentDate}</Text>
          </View>
          <View style={styles.row}>
            <Text style={{ color: theme.textSecondary }}>Time</Text>
            <Text style={[styles.valueText, { color: theme.text }]}>{appointment.appointmentTime}</Text>
          </View>
          {appointment.staffName ? (
            <View style={styles.row}>
              <Text style={{ color: theme.textSecondary }}>Stylist / Staff</Text>
              <Text style={[styles.valueText, { color: theme.text }]}>{appointment.staffName}</Text>
            </View>
          ) : null}
        </View>

        {appointment.notes ? (
          <View style={[styles.section, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Notes</Text>
            <Text style={{ color: theme.textSecondary }}>{appointment.notes}</Text>
          </View>
        ) : null}

        <View style={styles.statusSection}>
          <Text style={[styles.statusLabel, { color: theme.text }]}>Update Status</Text>
          <View style={styles.statusRow}>
            {(['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'] as salonDb.AppointmentStatus[]).map((st) => (
              <TouchableOpacity
                key={st}
                style={[
                  styles.statusBtn,
                  {
                    backgroundColor: appointment.status === st ? theme.primary : theme.backgroundElement,
                    borderColor: appointment.status === st ? theme.primary : theme.border
                  }
                ]}
                onPress={() => handleStatusChange(st)}
              >
                <Text style={{ color: appointment.status === st ? '#FFF' : theme.textSecondary, fontSize: 12, textTransform: 'capitalize' }}>
                  {st.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  container: { flex: 1 },
  section: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 8 },
  clientLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  clientName: { fontSize: 20, fontWeight: '800' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valueText: { fontSize: 14, fontWeight: '600' },
  statusSection: { gap: 10, marginTop: 10 },
  statusLabel: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', paddingLeft: 4 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 }
});
