import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import * as gymDb from '../../services/gymDb';

function uid() { return 'plan_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36); }

function PlanCard({ plan, onEdit, onDelete }: { plan: gymDb.GymPlan; onEdit: () => void; onDelete: () => void }) {
  const theme = useTheme();
  const durationLabel =
    plan.durationDays <= 31 ? 'Monthly' :
    plan.durationDays <= 92 ? 'Quarterly' :
    plan.durationDays <= 185 ? 'Half Yearly' : 'Annual';

  return (
    <View style={[styles.planCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.planBadge, { backgroundColor: theme.primary + '18' }]}>
        <Ionicons name="pricetag" size={20} color={theme.primary} />
      </View>
      <View style={styles.planInfo}>
        <Text style={[styles.planName, { color: theme.text }]}>{plan.name}</Text>
        <Text style={[styles.planDuration, { color: theme.textSecondary }]}>
          {plan.durationDays} days · {durationLabel}
        </Text>
        {plan.description ? (
          <Text style={[styles.planDesc, { color: theme.textSecondary }]}>{plan.description}</Text>
        ) : null}
      </View>
      <View style={styles.planRight}>
        <Text style={[styles.planPrice, { color: theme.primary }]}>
          PKR {plan.price.toLocaleString()}
        </Text>
        <View style={styles.planActions}>
          <TouchableOpacity onPress={onEdit} style={[styles.planActionBtn, { borderColor: theme.border }]}>
            <Ionicons name="pencil-outline" size={15} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[styles.planActionBtn, { borderColor: theme.danger + '40' }]}>
            <Ionicons name="trash-outline" size={15} color={theme.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function PlansScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';

  const [plans, setPlans] = useState<gymDb.GymPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<gymDb.GymPlan | null>(null);

  // Form
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('30');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await gymDb.initGymTables();
    const p = await gymDb.getGymPlans(businessId);
    setPlans(p);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setName(''); setPrice(''); setDuration('30'); setDescription('');
    setModalVisible(true);
  };

  const openEdit = (plan: gymDb.GymPlan) => {
    setEditing(plan);
    setName(plan.name); setPrice(plan.price.toString());
    setDuration(plan.durationDays.toString()); setDescription(plan.description ?? '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Plan name is required.'); return; }
    const p = parseFloat(price);
    const d = parseInt(duration);
    if (isNaN(p) || p <= 0) { Alert.alert('Invalid', 'Enter valid price.'); return; }
    if (isNaN(d) || d <= 0) { Alert.alert('Invalid', 'Enter valid duration.'); return; }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      await gymDb.upsertGymPlan({
        id: editing?.id ?? uid(),
        businessId,
        name: name.trim(),
        price: p,
        durationDays: d,
        description: description.trim(),
        isActive: 1,
        lastUpdated: now,
      });
      setModalVisible(false);
      load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = (plan: gymDb.GymPlan) => {
    Alert.alert('Delete Plan', `Delete "${plan.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await gymDb.deleteGymPlan(plan.id); load(); },
      },
    ]);
  };

  const DURATION_PRESETS = [
    { label: '1 Month', days: '30' },
    { label: '3 Months', days: '90' },
    { label: '6 Months', days: '180' },
    { label: '1 Year', days: '365' },
  ];

  return (
    <ScreenWrapper title="Gym Plans">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Membership Plans</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={openAdd}
        >
          <Ionicons name="add" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          {plans.filter(p => p.isActive).length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="pricetag-outline" size={64} color={theme.textSecondary + '40'} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No plans yet. Tap + to create your first plan.
              </Text>
            </View>
          ) : (
            plans
              .filter(p => p.isActive)
              .map(p => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  onEdit={() => openEdit(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))
          )}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editing ? 'Edit Plan' : 'New Membership Plan'}
            </Text>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Plan Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Monthly, Quarterly"
              placeholderTextColor={theme.textSecondary}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Price (PKR) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. 2500"
              placeholderTextColor={theme.textSecondary}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Duration (days) *</Text>
            {/* Preset buttons */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 8 }}>
              {DURATION_PRESETS.map(preset => (
                <TouchableOpacity
                  key={preset.days}
                  onPress={() => setDuration(preset.days)}
                  style={[styles.presetChip, {
                    backgroundColor: duration === preset.days ? theme.primary : theme.background,
                    borderColor: duration === preset.days ? theme.primary : theme.border,
                  }]}
                >
                  <Text style={{ color: duration === preset.days ? '#FFF' : theme.textSecondary, fontWeight: '700', fontSize: 12 }}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Custom days"
              placeholderTextColor={theme.textSecondary}
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Optional plan description"
              placeholderTextColor={theme.textSecondary}
              value={description}
              onChangeText={setDescription}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.primary }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={{ color: '#FFF', fontWeight: '700' }}>{editing ? 'Update' : 'Create'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  planCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1,
    padding: 14, marginBottom: 10,
  },
  planBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  planInfo: { flex: 1, marginLeft: 12 },
  planName: { fontSize: 15, fontWeight: '700' },
  planDuration: { fontSize: 12, marginTop: 2 },
  planDesc: { fontSize: 11, marginTop: 2 },
  planRight: { alignItems: 'flex-end', gap: 6 },
  planPrice: { fontSize: 16, fontWeight: '800' },
  planActions: { flexDirection: 'row', gap: 6 },
  planActionBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 16 },
  emptyText: { fontSize: 14, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 14 },
  presetChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
