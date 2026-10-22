/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { LogoUploader } from '../components/LogoUploader';
import ScreenWrapper from '../components/ScreenWrapper';
import { BUSINESS_CATEGORIES, BusinessCategoryId, CATEGORY_GROUPS } from '../constants/businessCategories';
import { useAuth } from '../context/AuthContext';
import { useBusinessCategory } from '../context/BusinessContext';
import { useDatabase } from '../context/DatabaseContext';
import { useOnboarding } from '../context/OnboardingContext';
import { useTheme } from '../hooks/use-theme';
import * as sqlite from '../services/sqlite';
import {
  isSupabaseConfigured,
  getSupabaseConfig,
  configureSupabase,
  resetSupabaseConfig
} from '../services/supabase';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

export default function SettingsScreen() {
  const { user, updateProfile, logout, isDemoMode, setUserPin, getUserPin } = useAuth();
  const [pinCode, setPinCode] = useState('1234');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const { 
    triggerSync, 
    syncing, 
    networkConnected, 
    syncMessage,
    products,
    invoices,
    expenses
  } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const { category, categoryId, updateCategory } = useBusinessCategory();
  const { restartTour, replayTour, openChecklist } = useOnboarding();

  const handleTakeTour = () => {
    restartTour();
    router.push('/');
  };

  // Supabase Configuration State
  const [supabaseModalVisible, setSupabaseModalVisible] = useState(false);
  const [supabaseUrlInput, setSupabaseUrlInput] = useState('');
  const [supabaseKeyInput, setSupabaseKeyInput] = useState('');
  const [supabaseSaving, setSupabaseSaving] = useState(false);
  const [supabaseConfigState, setSupabaseConfigState] = useState(getSupabaseConfig());

  // Category picker modal
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [pickerGroup, setPickerGroup] = useState(CATEGORY_GROUPS[0]);
  const [savingCategory, setSavingCategory] = useState(false);

  // Role helpers
  const isOwner = user?.role === 'owner';
  const isManager = user?.role === 'manager';
  const isCashier = user?.role === 'cashier';

  // Role badge colours
  const roleBadgeColor = isOwner
    ? theme.primary
    : isManager
      ? theme.secondary
      : theme.success;
  const roleLabel = isOwner ? 'Business Owner' : isManager ? 'Manager' : 'Cashier';

  // Business Profile Form State
  const [businessName, setBusinessName] = useState(user?.businessName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [logoUri, setLogoUri] = useState(user?.logoUri || '');

  // Dynamic Custom Business Settings state
  const [ownerName, setOwnerName] = useState(user?.name || '');
  const [businessEmail, setBusinessEmail] = useState(user?.email || '');
  const [businessDesc, setBusinessDesc] = useState('');
  const [openingHours, setOpeningHours] = useState('9:00 AM - 10:00 PM');
  const [taxInfo, setTaxInfo] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [language, setLanguage] = useState('Urdu / English');
  const [timeZone, setTimeZone] = useState('Asia/Karachi');
  const [website, setWebsite] = useState('');
  const [socialLinks, setSocialLinks] = useState('');

  const [updating, setUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Sync profile inputs when user state hydrates or updates
  useEffect(() => {
    if (user) {
      if (user.businessName) setBusinessName(user.businessName);
      if (user.phone) setPhone(user.phone);
      if (user.address) setAddress(user.address);
      if (user.logoUri) setLogoUri(user.logoUri);
      if (user.name) setOwnerName(user.name);
      if (user.email) setBusinessEmail(user.email);
    }
  }, [user?.businessName, user?.phone, user?.address, user?.logoUri, user?.name, user?.email]);

  // Unsynced Counts State
  const [unsyncedCount, setUnsyncedCount] = useState({ products: 0, invoices: 0, expenses: 0 });

  // System Diagnostics state
  const [analyticsVisible, setAnalyticsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'health' | 'logs'>('metrics');

  // Load unsynced items count from SQLite
  const loadUnsyncedCounts = useCallback(async () => {
    if (!user) return;
    try {
      const p = await sqlite.getUnsyncedProducts(user.businessId, user.id);
      const i = await sqlite.getUnsyncedInvoices(user.businessId, user.id);
      const e = await sqlite.getUnsyncedExpenses(user.businessId, user.id);
      setUnsyncedCount({
        products: p.length,
        invoices: i.length,
        expenses: e.length
      });
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const handleOpenSupabaseModal = () => {
    const cfg = getSupabaseConfig();
    setSupabaseUrlInput(cfg.isConfigured ? cfg.url : '');
    setSupabaseKeyInput('');
    setSupabaseConfigState(cfg);
    setSupabaseModalVisible(true);
  };

  const handleSaveSupabaseConfig = async () => {
    if (!supabaseUrlInput.trim().startsWith('https://')) {
      Alert.alert('Invalid URL', 'Supabase Project URL must start with https:// (e.g. https://your-project.supabase.co)');
      return;
    }
    if (!supabaseKeyInput.trim() || supabaseKeyInput.trim().length < 20) {
      Alert.alert('Invalid Key', 'Please enter your Supabase Anon Public Key.');
      return;
    }
    setSupabaseSaving(true);
    try {
      const res = await configureSupabase(supabaseUrlInput.trim(), supabaseKeyInput.trim());
      if (!res.success) {
        Alert.alert('Connection Failed', res.error || 'Could not connect to Supabase project.');
        return;
      }
      setSupabaseConfigState(getSupabaseConfig());
      setSupabaseModalVisible(false);
      Alert.alert('Supabase Connected!', 'Authenticated with your Supabase cloud project. Running cloud synchronization now...');
      await triggerSync();
      await loadUnsyncedCounts();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save configuration');
    } finally {
      setSupabaseSaving(false);
    }
  };

  const handleResetSupabaseConfig = async () => {
    await resetSupabaseConfig();
    setSupabaseConfigState(getSupabaseConfig());
    setSupabaseModalVisible(false);
    Alert.alert('Reset to Local Mode', 'Supabase configuration reset. Running in local-first offline mode.');
    await loadUnsyncedCounts();
  };

  useEffect(() => {
    loadUnsyncedCounts();
    setSupabaseConfigState(getSupabaseConfig());
    if (getUserPin) {
      getUserPin().then(pin => {
        if (pin) setPinCode(pin);
      }).catch(() => {});
    }
  }, [products, invoices, expenses, user, loadUnsyncedCounts, getUserPin]);

  const handleSavePin = async () => {
    if (!/^\d{4}$/.test(pinCode.trim())) {
      Alert.alert('Invalid PIN', 'Quick PIN must be exactly 4 digits.');
      return;
    }
    setPinSaving(true);
    setPinSuccess(false);
    try {
      if (setUserPin) {
        await setUserPin(pinCode.trim());
      }
      setPinSuccess(true);
      setTimeout(() => setPinSuccess(false), 3000);
      Alert.alert('PIN Updated', `Terminal Quick PIN set to ${pinCode.trim()} for ${user?.name || 'Account'}.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update PIN.');
    } finally {
      setPinSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!businessName.trim()) {
      Alert.alert('Validation Error', 'Business name cannot be empty.');
      return;
    }

    setUpdating(true);
    setUpdateSuccess(false);
    try {
      await updateProfile(
        businessName.trim(),
        phone.trim(),
        address.trim(),
        logoUri.trim()
      );
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000); // Reset indicator
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update SQLite profile.');
    } finally {
      setUpdating(false);
    }
  };


  const handleShareStoreLink = () => {
    const slug = slugify(businessName || 'my-store');
    const storeUrl = `http://localhost:8082/store/${slug}`;
    const msg = `Hello! 🛒 Browse our products and place your order online:\n\n${storeUrl}\n\n— ${businessName || 'Our Store'}`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`).catch(() => {});
  };

  const handleManualSync = async () => {
    if (isDemoMode) {
      Alert.alert('Demo Mode Warning', 'Cloud synchronization is disabled in local-only demo mode.');
      return;
    }
    await triggerSync();
    await loadUnsyncedCounts();
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      logout();
      return;
    }
    
    Alert.alert(
      'Sign Out',
      isDemoMode 
        ? 'Sign out will clear local demo business data. Proceed?'
        : 'Are you sure you want to sign out of your business account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            await logout();
          }
        }
      ]
    );
  };

  const totalUnsynced = unsyncedCount.products + unsyncedCount.invoices + unsyncedCount.expenses;

  return (
    <ScreenWrapper title="Settings">
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
      {/* 1. Account Identity summary */}
      <Card style={styles.identityCard}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { backgroundColor: roleBadgeColor + '20' }]}>
            <Ionicons
              name={isOwner ? 'business' : isManager ? 'briefcase' : 'person'}
              size={28}
              color={roleBadgeColor}
            />
          </View>
          <View style={styles.identityInfo}>
            <Text style={[styles.identityEmail, { color: theme.textSecondary }]}>
              {isDemoMode ? 'Offline Demo Session' : user?.email}
            </Text>
            <Text style={[styles.identityRole, { color: theme.text }]}>
              {user?.name ? user.name : roleLabel} —{' '}
              <Text style={{ color: roleBadgeColor, fontWeight: '700' }}>{roleLabel}</Text>
            </Text>
          </View>
        </View>
        {/* Role permission summary badge */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {(isOwner || isManager) && (
            <View style={{ backgroundColor: theme.success + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: theme.success, fontSize: 12, fontWeight: '600' }}>✓ Invoicing</Text>
            </View>
          )}
          {(isOwner || isManager) && (
            <View style={{ backgroundColor: theme.secondary + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: theme.secondary, fontSize: 12, fontWeight: '600' }}>✓ Expenses & Reports</Text>
            </View>
          )}
          {isOwner && (
            <View style={{ backgroundColor: theme.primary + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>✓ Staff Management</Text>
            </View>
          )}
          {isOwner && (
            <View style={{ backgroundColor: theme.warning + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: theme.warning, fontSize: 12, fontWeight: '600' }}>✓ Business Settings</Text>
            </View>
          )}
          {isCashier && (
            <View style={{ backgroundColor: theme.success + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: theme.success, fontSize: 12, fontWeight: '600' }}>✓ POS Billing Only</Text>
            </View>
          )}
        </View>
      </Card>

      {/* 2. Business Profile edit form — OWNER ONLY */}
      {isOwner && (
        <Card style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Business Profile & Customization</Text>
        <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
          Keep your public storefront, contact info, and tax identity up-to-date.
        </Text>

        <Input
          label="Business / Store Name *"
          placeholder="e.g. Vaypar Pakistan"
          value={businessName}
          onChangeText={setBusinessName}
        />

        {/* Business Logo uploader */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 8, marginTop: 4 }}>
          Business Logo
        </Text>
        <LogoUploader
          value={logoUri}
          onChange={setLogoUri}
          initials={(businessName || user?.businessName || 'V').charAt(0).toUpperCase()}
          size={80}
          label={logoUri ? 'Tap to change logo' : 'Tap to upload logo'}
        />

        {/* Owner Information */}
        <NeumorphicInputMocked
          label="Owner Name / Contact Person"
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="e.g. Muhammad Ali"
        />

        <Input
          label="Business Helpdesk Phone"
          placeholder="e.g. +92 300 1234567"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <NeumorphicInputMocked
          label="Business Email Address"
          value={businessEmail}
          onChangeText={setBusinessEmail}
          placeholder="e.g. contact@business.pk"
          keyboardType="email-address"
        />

        <Input
          label="Physical Address"
          placeholder="e.g. DHA Phase 5, Karachi, Pakistan"
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={2}
          style={styles.addressInput}
        />

        <NeumorphicInputMocked
          label="Business Description"
          value={businessDesc}
          onChangeText={setBusinessDesc}
          placeholder="Describe your business, services, products..."
          multiline
        />

        <NeumorphicInputMocked
          label="Opening Hours"
          value={openingHours}
          onChangeText={setOpeningHours}
          placeholder="e.g. Mon-Sat: 9:00 AM - 10:00 PM"
        />

        <NeumorphicInputMocked
          label="Tax Information (NTN / GST Number)"
          value={taxInfo}
          onChangeText={setTaxInfo}
          placeholder="e.g. NTN: 1234567-8"
        />

        <NeumorphicInputMocked
          label="Currency Code"
          value={currency}
          onChangeText={setCurrency}
          placeholder="e.g. PKR"
        />

        <NeumorphicInputMocked
          label="Language Code"
          value={language}
          onChangeText={setLanguage}
          placeholder="e.g. English / Urdu"
        />

        <NeumorphicInputMocked
          label="Time Zone"
          value={timeZone}
          onChangeText={setTimeZone}
          placeholder="e.g. GMT+5 (Asia/Karachi)"
        />

        <NeumorphicInputMocked
          label="Website URL"
          value={website}
          onChangeText={setWebsite}
          placeholder="e.g. https://mybusiness.pk"
        />

        <NeumorphicInputMocked
          label="Social Media Links (Comma separated)"
          value={socialLinks}
          onChangeText={setSocialLinks}
          placeholder="e.g. facebook.com/mybiz, instagram.com/mybiz"
        />

        <Button
          title={updating ? 'Updating...' : updateSuccess ? 'Settings Saved Successfully!' : 'Save Business Settings'}
          variant={updateSuccess ? 'outline' : 'primary'}
          size="medium"
          onPress={handleSaveProfile}
          loading={updating}
          icon={updateSuccess ? <Ionicons name="checkmark-done" size={18} color={theme.success} /> : undefined}
          style={styles.saveBtn}
        />
      </Card>
      )}

      {/* Business Category Card — Read-only info assigned at signup */}
      <Card style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Store Category</Text>
        <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
          Selected during store registration to customize workflows, navigation, and widgets for your industry.
        </Text>

        <View style={[styles.categoryDisplay, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Text style={{ fontSize: 32, marginRight: 14 }}>{category.emoji}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[{ color: theme.text, fontWeight: '800', fontSize: 16 }]}>{category.label}</Text>
              <View style={{ backgroundColor: theme.primary + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>{category.group}</Text>
              </View>
            </View>
            <Text style={[{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }]}>{category.description}</Text>
          </View>
        </View>

        <Button
          title="Migrate Business Category"
          variant="outline"
          size="medium"
          icon={<Ionicons name="swap-horizontal" size={18} color={theme.primary} />}
          onPress={() => setCategoryModalVisible(true)}
          style={{ marginTop: 12 }}
        />

        <View style={[styles.infoNotice, { backgroundColor: theme.primary + '0D', borderColor: theme.primary + '30' }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={theme.primary} style={{ marginRight: 8, marginTop: 1 }} />
          <Text style={[styles.infoNoticeText, { color: theme.textSecondary }]}>
            All sales, expenses, inventory, and ledgers are strictly isolated to your registered business account ({user?.businessName || 'Your Store'}). Changing category updates active dashboard modules instantly.
          </Text>
        </View>
      </Card>

      {/* ── Quick PIN & Terminal POS Security Card ── */}
      <Card style={styles.sectionCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#C5A880', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="grid" size={18} color="#16171B" />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Quick PIN & POS Lock</Text>
          </View>
          <View style={{ backgroundColor: '#16171B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ color: '#C5A880', fontWeight: '800', fontSize: 12 }}>ACTIVE PIN: {pinCode || '1234'}</Text>
          </View>
        </View>

        <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
          Set a 4-digit numeric PIN for fast terminal access on shared POS cash registers without typing passwords.
        </Text>

        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end', marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Your 4-Digit Terminal PIN"
              placeholder="e.g. 1234"
              value={pinCode}
              onChangeText={(t) => setPinCode(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
          <View style={{ marginBottom: 8 }}>
            <Button
              title={pinSaving ? 'Saving...' : pinSuccess ? 'PIN Saved!' : 'Save PIN'}
              variant={pinSuccess ? 'outline' : 'primary'}
              size="medium"
              onPress={handleSavePin}
              loading={pinSaving}
              icon={pinSuccess ? <Ionicons name="checkmark" size={16} color={theme.success} /> : <Ionicons name="shield-checkmark-outline" size={16} color="#FFF" />}
            />
          </View>
        </View>

      </Card>

      {/* Online Store Card — OWNER ONLY */}
      {isOwner && (
        <Card style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>🛒 Your Public Online Store</Text>
          <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
            Share this link with customers. They can browse your live product catalog and place orders directly via WhatsApp.
          </Text>

          <View style={[styles.urlBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Ionicons name="link-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.urlText, { color: theme.text }]} numberOfLines={1} selectable>
              {`localhost:8082/store/${slugify(businessName || 'my-store')}`}
            </Text>
          </View>

          <View style={styles.storeActionsRow}>
            <Button
              title="Preview Store"
              variant="outline"
              size="medium"
              icon={<Ionicons name="eye-outline" size={18} color={theme.primary} />}
              onPress={() => {
                const url = `/store/${slugify(businessName || 'my-store')}`;
                if (Platform.OS === 'web') {
                  window.open(url, '_blank');
                } else {
                  router.push(url as any);
                }
              }}
              style={{ flex: 1 }}
            />
            <Button
              title="Share via WhatsApp"
              variant="primary"
              size="medium"
              icon={<Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />}
              onPress={handleShareStoreLink}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      )}



      {/* Data Operations Card */}
      <Card style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Data Operations (Bulk Import/Export)</Text>
        <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
          Migrate your product inventory list or restaurant menus via spreadsheet CSV or Excel files. Review history logs and revert imports dynamically.
        </Text>
        <Button
          title="Bulk Import / Export Products"
          variant="primaryLight"
          size="medium"
          icon={<Ionicons name="cloud-upload-outline" size={18} color={theme.primary} />}
          onPress={() => router.push('/products/import')}
        />
      </Card>

      {/* Help & Guided Tour Card */}
      <Card style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Help & Guided Tour</Text>
        <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
          Need a refresher? Restart the interactive guided tour anytime to explore key features, live financial metrics, and POS shortcuts.
        </Text>
        <View style={{ gap: 10 }}>
          <Button
            title="Take a Tour"
            variant="primaryLight"
            size="medium"
            icon={<Ionicons name="compass-outline" size={18} color={theme.primary} />}
            onPress={handleTakeTour}
            style={{ width: '100%' }}
          />
          <Button
            title="Reopen Setup Checklist"
            variant="outline"
            size="medium"
            icon={<Ionicons name="list-outline" size={18} color={theme.textSecondary} />}
            onPress={openChecklist}
            style={{ width: '100%' }}
          />
        </View>
      </Card>

      {/* Logout / Session action */}
      <Button
        title="Sign Out"
        variant="danger"
        size="large"
        icon={<Ionicons name="log-out-outline" size={20} color="#FFFFFF" />}
        onPress={handleLogout}
        style={styles.logoutBtn}
      />
      </ScrollView>

      {/* Category Migration Modal */}
      <Modal
        visible={categoryModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.categoryModalContainer, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.modalHeaderRow, { borderBottomColor: theme.border }]}>
              <View>
                <Text style={[styles.modalHeading, { color: theme.text }]}>Migrate Store Category</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Instantly reconfigure active industry modules and workflows.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Industry Group Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {['All', ...CATEGORY_GROUPS].map(grp => {
                const isSelected = pickerGroup === grp;
                return (
                  <TouchableOpacity
                    key={grp}
                    style={[
                      styles.groupFilterChip,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.background,
                        borderColor: isSelected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => setPickerGroup(grp)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : theme.textSecondary }}>
                      {grp}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Categories List */}
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {BUSINESS_CATEGORIES.filter(c => pickerGroup === 'All' || c.group === pickerGroup).map(cat => {
                const isActive = cat.id === categoryId;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryOptionRow,
                      {
                        backgroundColor: isActive ? theme.primary + '12' : theme.background,
                        borderColor: isActive ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={async () => {
                      setSavingCategory(true);
                      try {
                        await updateCategory(cat.id);
                        setCategoryModalVisible(false);
                      } catch (err) {
                        Alert.alert('Error', 'Failed to update category');
                      } finally {
                        setSavingCategory(false);
                      }
                    }}
                    disabled={savingCategory}
                  >
                    <Text style={{ fontSize: 28, marginRight: 12 }}>{cat.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.categoryOptionTitle, { color: theme.text }]}>{cat.label}</Text>
                        <View style={{ backgroundColor: theme.primary + '18', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: theme.primary }}>{cat.group}</Text>
                        </View>
                      </View>
                      <Text style={[styles.categoryOptionDesc, { color: theme.textSecondary }]}>
                        {cat.description}
                      </Text>
                    </View>
                    {isActive ? (
                      <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={theme.border} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Card>
        </View>
      </Modal>

      {/* ─── Supabase Configuration Modal ─── */}
      <Modal
        visible={supabaseModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSupabaseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.categoryModalContainer, { backgroundColor: theme.backgroundElement, maxHeight: '90%' }]}>
            <View style={[styles.modalHeaderRow, { borderBottomColor: theme.border }]}>
              <View>
                <Text style={[styles.modalHeading, { color: theme.text }]}>Configure Supabase Cloud</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Connect your live project for accurate logins and multi-tenant cloud sync.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSupabaseModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }}>
              <View style={{ gap: 12, paddingVertical: 8 }}>
                <Input
                  label="Supabase Project URL"
                  placeholder="https://your-project-id.supabase.co"
                  value={supabaseUrlInput}
                  onChangeText={setSupabaseUrlInput}
                  keyboardType="url"
                  autoCapitalize="none"
                />

                <Input
                  label="Supabase Anon Public API Key"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseKeyInput}
                  onChangeText={setSupabaseKeyInput}
                  autoCapitalize="none"
                  multiline
                  numberOfLines={2}
                />

                {/* Instructions Pill */}
                <View style={{ backgroundColor: theme.background, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                    📌 How to connect your Supabase database:
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 16 }}>
                    1. Open your project on <Text style={{ color: theme.primary, fontWeight: '700' }}>supabase.com</Text>{'\n'}
                    2. Go to Project Settings → API{'\n'}
                    3. Copy Project URL and <Text style={{ fontWeight: '700' }}>anon public</Text> key{'\n'}
                    4. Execute <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: theme.text }}>supabase/migrations/001_initial_schema.sql</Text> in Supabase SQL Editor
                  </Text>
                </View>

                <Button
                  title={supabaseSaving ? 'Verifying & Connecting...' : 'Connect & Sync Supabase'}
                  variant="primary"
                  size="large"
                  icon={<Ionicons name="link" size={18} color="#FFFFFF" />}
                  onPress={handleSaveSupabaseConfig}
                  loading={supabaseSaving}
                />

                {supabaseConfigState.isConfigured && (
                  <Button
                    title="Disconnect / Revert to Local Mode"
                    variant="danger"
                    size="medium"
                    icon={<Ionicons name="trash-outline" size={18} color="#FFFFFF" />}
                    onPress={handleResetSupabaseConfig}
                  />
                )}
              </View>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  identityCard: {
    padding: 16,
    marginBottom: 8,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityInfo: {
    flex: 1,
  },
  identityEmail: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  identityRole: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionCard: {
    padding: 20,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
    fontWeight: '500',
  },
  addressInput: {
    height: 70,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  saveBtn: {
    marginTop: 16,
    width: '100%',
  },
  syncStatusBlock: {
    marginVertical: 10,
    gap: 6,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  syncValue: {
    fontSize: 13,
  },
  unsyncedBreakdown: {
    marginTop: 4,
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  breakdownText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  syncMessageText: {
    fontSize: 12,
    fontWeight: '700',
    marginVertical: 8,
    textAlign: 'center',
  },
  syncBtn: {
    marginTop: 8,
    width: '100%',
  },
  logoutBtn: {
    marginTop: 16,
    width: '100%',
  },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  urlText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  storeActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  diagGroupTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 4,
  },
  diagCard: {
    padding: 16,
    marginVertical: 4,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(226, 232, 240, 0.4)',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  logText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    lineHeight: 18,
    marginBottom: 8,
  },
  categoryDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
  },
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  categoryModalContainer: {
    width: '100%',
    maxHeight: '85%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    paddingBottom: 12,
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  groupFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  categoryOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  categoryOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  categoryOptionDesc: {
    fontSize: 11,
    marginTop: 2,
  },
});



interface NeumorphicInputMockedProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address';
}

function NeumorphicInputMocked({ label, value, onChangeText, placeholder, multiline = false, keyboardType = 'default' }: NeumorphicInputMockedProps) {
  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      multiline={multiline}
      keyboardType={keyboardType}
    />
  );
}


