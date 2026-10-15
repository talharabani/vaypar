import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, FlatList, Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import * as salonDb from '../../services/salonDb';

export default function ServicesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [services, setServices] = useState<salonDb.SalonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<salonDb.SalonService | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Hair');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('30');
  const [description, setDescription] = useState('');

  const loadServices = async () => {
    try {
      const svcs = await salonDb.getServices(businessId);
      setServices(svcs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, [businessId]);

  const openAddModal = () => {
    setSelectedService(null);
    setName('');
    setCategory('Hair');
    setPrice('');
    setDuration('30');
    setDescription('');
    setModalVisible(true);
  };

  const openEditModal = (svc: salonDb.SalonService) => {
    setSelectedService(svc);
    setName(svc.name);
    setCategory(svc.category);
    setPrice(svc.price.toString());
    setDuration(svc.durationMinutes.toString());
    setDescription(svc.description);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !price.trim() || !duration.trim()) {
      Alert.alert('Required', 'Please fill in all required fields.');
      return;
    }

    try {
      const id = selectedService?.id ?? 'svc_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const now = new Date().toISOString();

      await salonDb.upsertService({
        id,
        businessId,
        name: name.trim(),
        category,
        price: parseFloat(price),
        durationMinutes: parseInt(duration, 10),
        description: description.trim(),
        synced: 0,
        lastUpdated: now,
        deleted: 0
      });

      setModalVisible(false);
      loadServices();
    } catch (err) {
      Alert.alert('Error', 'Failed to save service');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Confirm Delete', 'Are you sure you want to delete this service?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await salonDb.deleteService(id);
            loadServices();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete service');
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

  return (
    <ScreenWrapper title="Salon Services">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Services Catalog</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.primary }]} onPress={openAddModal}>
          <Ionicons name="add" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={services}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={[styles.categoryText, { color: theme.primary }]}>{item.category}</Text>
                <Text style={[styles.nameText, { color: theme.text }]}>{item.name}</Text>
              </View>
              <Text style={[styles.priceText, { color: theme.text }]}>PKR {item.price}</Text>
            </View>
            {item.description ? (
              <Text style={[styles.descText, { color: theme.textSecondary }]}>{item.description}</Text>
            ) : null}
            <View style={styles.cardFooter}>
              <View style={styles.duration}>
                <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
                <Text style={[styles.durationText, { color: theme.textSecondary }]}>{item.durationMinutes} min</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEditModal(item)}>
                  <Ionicons name="create-outline" size={18} color={theme.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item.id)}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {selectedService ? 'Edit Service' : 'Add Service'}
            </Text>

            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="Service Name *"
              placeholderTextColor={theme.textSecondary + '80'}
              value={name}
              onChangeText={setName}
            />

            <View style={styles.pickerRow}>
              {salonDb.SERVICE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: category === cat ? theme.primary + '15' : 'transparent',
                      borderColor: category === cat ? theme.primary : theme.border
                    }
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={{ color: category === cat ? theme.primary : theme.textSecondary, fontSize: 12 }}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="Price (PKR) *"
              placeholderTextColor={theme.textSecondary + '80'}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />

            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="Duration (Minutes) *"
              placeholderTextColor={theme.textSecondary + '80'}
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
            />

            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, minHeight: 60 }]}
              placeholder="Description"
              placeholderTextColor={theme.textSecondary + '80'}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, { borderColor: theme.border, borderWidth: 1 }]} onPress={() => setModalVisible(false)}>
                <Text style={{ color: theme.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={handleSave}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  categoryText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  nameText: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  priceText: { fontSize: 16, fontWeight: '800' },
  descText: { fontSize: 13, marginBottom: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationText: { fontSize: 12, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { padding: 20, borderRadius: 20, borderWidth: 1, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignItems: 'center', minWidth: 80 }
});
