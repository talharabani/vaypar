import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../context/AuthContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import { Input } from '../../components/Input';
import { CustomerNameInput } from '../../components/CustomerNameInput';
import { CustomerPhoneInput } from '../../components/CustomerPhoneInput';
import { Button } from '../../components/Button';
import * as warrantyDb from '../../services/warrantyDb';
import { useRecentActivity } from '../../context/RecentActivityContext';
import { validateCustomerName, validateCustomerPhone, detectCountryCode } from '../../utils/phoneUtils';

// ─── Constants ────────────────────────────────────────────────────────────────

const WARRANTY_STATUS_COLORS: Record<warrantyDb.WarrantyStatus, string> = {
  active: '#10B981',
  expired: '#EF4444',
  voided: '#6B7280',
};

const WARRANTY_STATUS_LABELS: Record<warrantyDb.WarrantyStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  voided: 'Voided',
};

const CLAIM_STATUS_COLORS: Record<warrantyDb.ClaimStatus, string> = {
  pending: '#F59E0B',
  approved: '#3B82F6',
  rejected: '#EF4444',
  resolved: '#10B981',
};

const CLAIM_STATUS_LABELS: Record<warrantyDb.ClaimStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  resolved: 'Resolved',
};

const WARRANTY_DURATIONS_MONTHS = [3, 6, 12, 18, 24, 36, 48, 60];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addMonthsToDate(startDate: string, months: number): string {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function daysUntilExpiry(endDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function computeWarrantyStatus(warranty: warrantyDb.Warranty): warrantyDb.WarrantyStatus {
  if (warranty.status === 'voided') return 'voided';
  const days = daysUntilExpiry(warranty.endDate);
  return days < 0 ? 'expired' : 'active';
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WarrantyScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const businessId = user?.businessId ?? '';
  const { logVisit } = useRecentActivity();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [warranties, setWarranties] = useState<warrantyDb.Warranty[]>([]);
  const [claims, setClaims] = useState<warrantyDb.WarrantyClaim[]>([]);
  const [stats, setStats] = useState<warrantyDb.WarrantyStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'warranties' | 'claims'>('warranties');
  const [expandedWarrantyId, setExpandedWarrantyId] = useState<string | null>(null);

  // Add Warranty Modal
  const [addWarrantyVisible, setAddWarrantyVisible] = useState(false);
  const [wCustomerName, setWCustomerName] = useState('');
  const [wCustomerPhone, setWCustomerPhone] = useState('');
  const [wCountryCode, setWCountryCode] = useState(() => detectCountryCode(user?.phone));
  const [wProductName, setWProductName] = useState('');
  const [wSerialNumber, setWSerialNumber] = useState('');
  const [wInvoiceId, setWInvoiceId] = useState('');
  const [wStartDate, setWStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [wDurationMonths, setWDurationMonths] = useState(12);
  const [wNotes, setWNotes] = useState('');
  const [wFormError, setWFormError] = useState('');

  // Add Claim Modal
  const [addClaimVisible, setAddClaimVisible] = useState(false);
  const [claimWarrantyId, setClaimWarrantyId] = useState('');
  const [claimIssue, setClaimIssue] = useState('');
  const [claimFormError, setClaimFormError] = useState('');

  // Resolve Claim Modal
  const [resolveClaimId, setResolveClaimId] = useState<string | null>(null);
  const [resolveStatus, setResolveStatus] = useState<warrantyDb.ClaimStatus>('approved');
  const [resolveDetails, setResolveDetails] = useState('');
  const [resolveFormError, setResolveFormError] = useState('');

  // ─── Data Loading ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!businessId) return;
    try {
      await warrantyDb.initWarrantyTables();
      const [ws, cs, s] = await Promise.all([
        warrantyDb.getWarranties(businessId, searchQuery),
        warrantyDb.getWarrantyClaims(businessId),
        warrantyDb.getWarrantyStats(businessId),
      ]);
      setWarranties(ws);
      setClaims(cs);
      setStats(s);
    } catch (e) {
      console.error('[WarrantyScreen] Failed to load data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, searchQuery]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Map claims to warrantId for quick lookup
  const claimsByWarrantyId = useMemo(() => {
    const map: Record<string, warrantyDb.WarrantyClaim[]> = {};
    for (const claim of claims) {
      if (!map[claim.warrantyId]) map[claim.warrantyId] = [];
      map[claim.warrantyId].push(claim);
    }
    return map;
  }, [claims]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleAddWarranty = async () => {
    setWFormError('');
    if (!wCustomerName.trim()) { setWFormError('Customer name is required.'); return; }
    const nameVal = validateCustomerName(wCustomerName);
    if (!nameVal.isValid) { setWFormError(nameVal.error || 'Invalid customer name.'); return; }
    
    let finalPhone = wCustomerPhone.trim();
    if (wCustomerPhone.trim()) {
      const phoneVal = validateCustomerPhone(wCustomerPhone, wCountryCode);
      if (!phoneVal.isValid) { setWFormError(phoneVal.error || 'Invalid phone number.'); return; }
      finalPhone = phoneVal.fullPhone;
    }

    if (!wProductName.trim()) { setWFormError('Product name is required.'); return; }
    if (!wStartDate.match(/^\d{4}-\d{2}-\d{2}$/)) { setWFormError('Start date must be YYYY-MM-DD.'); return; }

    const endDate = addMonthsToDate(wStartDate, wDurationMonths);
    const now = new Date().toISOString();
    const newWarranty: warrantyDb.Warranty = {
      id: 'wrn_' + Math.random().toString(36).substring(2, 11),
      businessId,
      customerName: wCustomerName.trim(),
      customerPhone: finalPhone,
      productName: wProductName.trim(),
      serialNumber: wSerialNumber.trim(),
      invoiceId: wInvoiceId.trim(),
      startDate: wStartDate,
      endDate,
      status: 'active',
      notes: wNotes.trim(),
      synced: 0,
      lastUpdated: now,
      deleted: 0,
    };
    try {
      await warrantyDb.upsertWarranty(newWarranty);
      setAddWarrantyVisible(false);
      setWCustomerName(''); setWCustomerPhone(''); setWProductName('');
      setWSerialNumber(''); setWInvoiceId(''); setWStartDate(new Date().toISOString().split('T')[0]);
      setWDurationMonths(12); setWNotes('');
      await loadData();
    } catch (e) { setWFormError('Failed to save warranty.'); }
  };

  const handleAddClaim = async () => {
    setClaimFormError('');
    if (!claimWarrantyId) { setClaimFormError('Please select a warranty first.'); return; }
    if (!claimIssue.trim()) { setClaimFormError('Issue description is required.'); return; }

    const now = new Date().toISOString();
    const newClaim: warrantyDb.WarrantyClaim = {
      id: 'clm_' + Math.random().toString(36).substring(2, 11),
      warrantyId: claimWarrantyId,
      businessId,
      claimDate: new Date().toISOString().split('T')[0],
      issueDescription: claimIssue.trim(),
      resolutionStatus: 'pending',
      resolutionDetails: '',
      resolutionDate: null,
      synced: 0,
      lastUpdated: now,
      deleted: 0,
    };
    try {
      await warrantyDb.upsertWarrantyClaim(newClaim);
      setAddClaimVisible(false);
      setClaimWarrantyId(''); setClaimIssue('');
      await loadData();
    } catch (e) { setClaimFormError('Failed to submit claim.'); }
  };

  const handleResolveClaim = async () => {
    setResolveFormError('');
    if (!resolveClaimId) return;
    if (!resolveDetails.trim()) { setResolveFormError('Resolution details are required.'); return; }

    const now = new Date().toISOString();
    const existing = claims.find(c => c.id === resolveClaimId);
    if (!existing) return;

    const updated: warrantyDb.WarrantyClaim = {
      ...existing,
      resolutionStatus: resolveStatus,
      resolutionDetails: resolveDetails.trim(),
      resolutionDate: new Date().toISOString().split('T')[0],
      synced: 0,
      lastUpdated: now,
    };
    try {
      await warrantyDb.upsertWarrantyClaim(updated);
      setResolveClaimId(null);
      setResolveDetails(''); setResolveStatus('approved');
      await loadData();
    } catch (e) { setResolveFormError('Failed to save resolution.'); }
  };

  const handleDeleteWarranty = (id: string) => {
    Alert.alert('Delete Warranty', 'Remove this warranty and all its claims?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await warrantyDb.deleteWarranty(id);
        await loadData();
      }},
    ]);
  };

  const handleDeleteClaim = (id: string) => {
    Alert.alert('Delete Claim', 'Remove this claim record?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await warrantyDb.deleteWarrantyClaim(id);
        await loadData();
      }},
    ]);
  };

  // ─── Rendering ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  const activeWarranties = warranties.filter(w => computeWarrantyStatus(w) === 'active');

  return (
    <ScreenWrapper title="Warranty">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Warranties</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Serial numbers • Claims • Expiry tracking
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              onPress={() => { setClaimWarrantyId(''); setAddClaimVisible(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
              <Text style={[styles.headerBtnText, { color: theme.danger }]}>Claim</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: theme.primary }]}
              onPress={() => setAddWarrantyVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={[styles.headerBtnText, { color: '#FFF' }]}>Register</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Row */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: '#10B98115', borderColor: '#10B98130' }]}>
              <Ionicons name="shield-checkmark" size={20} color="#10B981" />
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.activeCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Active</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B30' }]}>
              <Ionicons name="time" size={20} color="#F59E0B" />
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.expiringCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Expiring Soon</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#EF444415', borderColor: '#EF444430' }]}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.openClaimsCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Open Claims</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#3B82F615', borderColor: '#3B82F630' }]}>
              <Ionicons name="checkmark-done" size={20} color="#3B82F6" />
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.resolvedClaimsCount}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Resolved</Text>
            </View>
          </View>
        )}

        {/* Search */}
        <View style={[styles.searchContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by name, serial no., product..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Tab Bar */}
        <View style={[styles.tabBar, { backgroundColor: theme.backgroundSelected }]}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'warranties' && { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            onPress={() => setActiveTab('warranties')}
          >
            <Ionicons name="shield-outline" size={15} color={activeTab === 'warranties' ? theme.primary : theme.textSecondary} />
            <Text style={[styles.tabBtnText, { color: activeTab === 'warranties' ? theme.primary : theme.textSecondary }]}>
              Warranties ({warranties.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'claims' && { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            onPress={() => setActiveTab('claims')}
          >
            <Ionicons name="alert-circle-outline" size={15} color={activeTab === 'claims' ? theme.primary : theme.textSecondary} />
            <Text style={[styles.tabBtnText, { color: activeTab === 'claims' ? theme.primary : theme.textSecondary }]}>
              Claims ({claims.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── WARRANTIES LIST ─── */}
        {activeTab === 'warranties' && (
          <View style={styles.listSection}>
            {warranties.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="shield-outline" size={48} color={theme.textSecondary + '40'} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No Warranties Found</Text>
                <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                  Register product warranties to track coverage and claims.
                </Text>
                <Button title="Register First Warranty" onPress={() => setAddWarrantyVisible(true)} style={{ marginTop: 12 }} />
              </View>
            ) : warranties.map(warranty => {
              const computedStatus = computeWarrantyStatus(warranty);
              const statusColor = WARRANTY_STATUS_COLORS[computedStatus];
              const days = daysUntilExpiry(warranty.endDate);
              const isExpanded = expandedWarrantyId === warranty.id;
              const warrantyClaims = claimsByWarrantyId[warranty.id] || [];
              const isExpiringSoon = computedStatus === 'active' && days >= 0 && days <= 30;

              return (
                <View key={warranty.id} style={[styles.warrantyCard, { backgroundColor: theme.backgroundElement, borderColor: isExpiringSoon ? '#F59E0B50' : theme.border }]}>
                  {/* Card Header Row */}
                  <TouchableOpacity
                    onPress={() => {
                      const nextExpanded = isExpanded ? null : warranty.id;
                      setExpandedWarrantyId(nextExpanded);
                      if (nextExpanded) {
                        logVisit({
                          recordId: warranty.id,
                          type: 'warranty',
                          title: `Warranty: ${warranty.productName}`,
                          subtitle: `${warranty.customerName} · S/N: ${warranty.serialNumber || 'N/A'}`,
                          icon: 'shield-checkmark',
                          color: '#F59E0B',
                          route: '/warranty',
                        });
                      }
                    }}
                    activeOpacity={0.8}
                    style={styles.cardHeaderRow}
                  >
                    <View style={[styles.shieldBadge, { backgroundColor: statusColor + '15' }]}>
                      <Ionicons name="shield-checkmark" size={22} color={statusColor} />
                    </View>
                    <View style={styles.cardHeaderInfo}>
                      <Text style={[styles.productName, { color: theme.text }]} numberOfLines={1}>
                        {warranty.productName}
                      </Text>
                      <Text style={[styles.customerName, { color: theme.textSecondary }]} numberOfLines={1}>
                        {warranty.customerName}
                        {warranty.customerPhone ? ` • ${warranty.customerPhone}` : ''}
                      </Text>
                    </View>
                    <View style={styles.cardHeaderRight}>
                      <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusPillText, { color: statusColor }]}>{WARRANTY_STATUS_LABELS[computedStatus]}</Text>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} style={{ marginTop: 4 }} />
                    </View>
                  </TouchableOpacity>

                  {/* Quick Info Strip */}
                  <View style={styles.infoStrip}>
                    {warranty.serialNumber ? (
                      <View style={styles.infoChip}>
                        <Ionicons name="barcode-outline" size={13} color={theme.textSecondary} />
                        <Text style={[styles.infoChipText, { color: theme.text }]}>S/N: {warranty.serialNumber}</Text>
                      </View>
                    ) : null}
                    <View style={styles.infoChip}>
                      <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
                      <Text style={[styles.infoChipText, { color: theme.text }]}>
                        {formatDate(warranty.startDate)} → {formatDate(warranty.endDate)}
                      </Text>
                    </View>
                    {computedStatus === 'active' && (
                      <View style={[styles.infoChip, { backgroundColor: (isExpiringSoon ? '#F59E0B' : theme.primary) + '10' }]}>
                        <Ionicons name="hourglass-outline" size={13} color={isExpiringSoon ? '#F59E0B' : theme.primary} />
                        <Text style={[styles.infoChipText, { color: isExpiringSoon ? '#F59E0B' : theme.primary }]}>
                          {days > 0 ? `${days} days left` : 'Expires today'}
                        </Text>
                      </View>
                    )}
                    {warrantyClaims.length > 0 && (
                      <View style={[styles.infoChip, { backgroundColor: '#EF444410' }]}>
                        <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
                        <Text style={[styles.infoChipText, { color: '#EF4444' }]}>{warrantyClaims.length} claim{warrantyClaims.length > 1 ? 's' : ''}</Text>
                      </View>
                    )}
                  </View>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <View style={[styles.expandedSection, { borderTopColor: theme.border }]}>
                      {warranty.invoiceId ? (
                        <Text style={[styles.expandedRow, { color: theme.textSecondary }]}>
                          <Text style={{ fontWeight: '700', color: theme.text }}>Invoice: </Text>{warranty.invoiceId}
                        </Text>
                      ) : null}
                      {warranty.notes ? (
                        <Text style={[styles.expandedRow, { color: theme.textSecondary }]}>
                          <Text style={{ fontWeight: '700', color: theme.text }}>Notes: </Text>{warranty.notes}
                        </Text>
                      ) : null}

                      {/* Claims under this warranty */}
                      {warrantyClaims.length > 0 && (
                        <View style={styles.claimsNested}>
                          <Text style={[styles.nestedTitle, { color: theme.textSecondary }]}>CLAIMS HISTORY</Text>
                          {warrantyClaims.map(claim => (
                            <View key={claim.id} style={[styles.claimRow, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                              <View style={styles.claimRowHeader}>
                                <View style={[styles.claimStatusBadge, { backgroundColor: CLAIM_STATUS_COLORS[claim.resolutionStatus] + '20' }]}>
                                  <Text style={[styles.claimStatusText, { color: CLAIM_STATUS_COLORS[claim.resolutionStatus] }]}>
                                    {CLAIM_STATUS_LABELS[claim.resolutionStatus]}
                                  </Text>
                                </View>
                                <Text style={[styles.claimDate, { color: theme.textSecondary }]}>{formatDate(claim.claimDate)}</Text>
                              </View>
                              <Text style={[styles.claimIssue, { color: theme.text }]}>{claim.issueDescription}</Text>
                              {claim.resolutionDetails ? (
                                <Text style={[styles.claimResolution, { color: theme.textSecondary }]}>
                                  Resolution: {claim.resolutionDetails}
                                </Text>
                              ) : null}
                              {claim.resolutionStatus === 'pending' && (
                                <TouchableOpacity
                                  style={[styles.resolveBtn, { backgroundColor: theme.primary }]}
                                  onPress={() => { setResolveClaimId(claim.id); setResolveDetails(''); setResolveStatus('approved'); }}
                                >
                                  <Text style={styles.resolveBtnText}>Resolve Claim</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Action Buttons */}
                      <View style={styles.actionRow}>
                        {computedStatus === 'active' && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: theme.primary + '15' }]}
                            onPress={() => { setClaimWarrantyId(warranty.id); setClaimIssue(''); setAddClaimVisible(true); }}
                          >
                            <Ionicons name="alert-circle-outline" size={14} color={theme.primary} />
                            <Text style={[styles.actionBtnText, { color: theme.primary }]}>File Claim</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#EF444415' }]}
                          onPress={() => handleDeleteWarranty(warranty.id)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#EF4444" />
                          <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ─── CLAIMS LIST ─── */}
        {activeTab === 'claims' && (
          <View style={styles.listSection}>
            {claims.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="alert-circle-outline" size={48} color={theme.textSecondary + '40'} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No Claims Filed</Text>
                <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                  File warranty claims from a registered warranty card.
                </Text>
              </View>
            ) : claims.map(claim => {
              const warranty = warranties.find(w => w.id === claim.warrantyId);
              const statusColor = CLAIM_STATUS_COLORS[claim.resolutionStatus];
              return (
                <View key={claim.id} style={[styles.warrantyCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.shieldBadge, { backgroundColor: statusColor + '15' }]}>
                      <Ionicons name="alert-circle" size={22} color={statusColor} />
                    </View>
                    <View style={styles.cardHeaderInfo}>
                      <Text style={[styles.productName, { color: theme.text }]} numberOfLines={1}>
                        {warranty?.productName ?? 'Unknown Product'}
                      </Text>
                      <Text style={[styles.customerName, { color: theme.textSecondary }]} numberOfLines={1}>
                        {warranty?.customerName ?? ''}{warranty?.serialNumber ? ` • S/N: ${warranty.serialNumber}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[styles.statusPillText, { color: statusColor }]}>
                        {CLAIM_STATUS_LABELS[claim.resolutionStatus]}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoStrip}>
                    <View style={styles.infoChip}>
                      <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
                      <Text style={[styles.infoChipText, { color: theme.text }]}>Claimed: {formatDate(claim.claimDate)}</Text>
                    </View>
                    {claim.resolutionDate && (
                      <View style={styles.infoChip}>
                        <Ionicons name="checkmark-circle-outline" size={13} color={theme.textSecondary} />
                        <Text style={[styles.infoChipText, { color: theme.text }]}>Resolved: {formatDate(claim.resolutionDate)}</Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.expandedSection, { borderTopColor: theme.border }]}>
                    <Text style={[styles.expandedRow, { color: theme.text }]}>
                      <Text style={{ fontWeight: '700' }}>Issue: </Text>{claim.issueDescription}
                    </Text>
                    {claim.resolutionDetails ? (
                      <Text style={[styles.expandedRow, { color: theme.textSecondary }]}>
                        <Text style={{ fontWeight: '700', color: theme.text }}>Resolution: </Text>{claim.resolutionDetails}
                      </Text>
                    ) : null}

                    <View style={styles.actionRow}>
                      {claim.resolutionStatus === 'pending' && (
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#10B98115' }]}
                          onPress={() => { setResolveClaimId(claim.id); setResolveDetails(''); setResolveStatus('approved'); }}
                        >
                          <Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />
                          <Text style={[styles.actionBtnText, { color: '#10B981' }]}>Resolve</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#EF444415' }]}
                        onPress={() => handleDeleteClaim(claim.id)}
                      >
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                        <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ==========================================
          ADD WARRANTY MODAL
          ========================================== */}
      <Modal visible={addWarrantyVisible} animationType="slide" transparent onRequestClose={() => setAddWarrantyVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Register Warranty</Text>
              <TouchableOpacity onPress={() => setAddWarrantyVisible(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 32 }}>
              {wFormError ? <Text style={[styles.formError, { color: theme.danger }]}>{wFormError}</Text> : null}
              <CustomerNameInput label="Customer Name *" value={wCustomerName} onChangeText={setWCustomerName} placeholder="e.g. Ahmed Ali" required />
              <CustomerPhoneInput label="Customer Phone" value={wCustomerPhone} onChangeText={setWCustomerPhone} selectedCountryCode={wCountryCode} onCountryCodeChange={setWCountryCode} />
              <Input label="Product Name *" value={wProductName} onChangeText={setWProductName} placeholder={'e.g. Samsung 65" LED TV'} />
              <Input label="Serial Number" value={wSerialNumber} onChangeText={setWSerialNumber} placeholder="e.g. SN123456789" autoCapitalize="characters" />
              <Input label="Invoice / Bill No." value={wInvoiceId} onChangeText={setWInvoiceId} placeholder="e.g. INV-001" />
              <Input label="Start Date (YYYY-MM-DD) *" value={wStartDate} onChangeText={setWStartDate} placeholder="2026-08-04" keyboardType="numeric" />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Warranty Duration</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.durationRow}>
                {WARRANTY_DURATIONS_MONTHS.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.durationChip, {
                      backgroundColor: wDurationMonths === m ? theme.primary : theme.backgroundSelected,
                      borderColor: wDurationMonths === m ? theme.primary : theme.border,
                    }]}
                    onPress={() => setWDurationMonths(m)}
                  >
                    <Text style={[styles.durationChipText, { color: wDurationMonths === m ? '#FFF' : theme.text }]}>
                      {m >= 12 ? `${m / 12}yr` : `${m}mo`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {wStartDate.match(/^\d{4}-\d{2}-\d{2}$/) && (
                <View style={[styles.datePreview, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
                  <Ionicons name="calendar" size={16} color={theme.primary} />
                  <Text style={[styles.datePreviewText, { color: theme.primary }]}>
                    Expires: {formatDate(addMonthsToDate(wStartDate, wDurationMonths))}
                  </Text>
                </View>
              )}

              <Input label="Notes" value={wNotes} onChangeText={setWNotes} placeholder="Optional notes..." multiline numberOfLines={3} style={{ height: 68, textAlignVertical: 'top' }} />
              <Button title="Register Warranty" onPress={handleAddWarranty} style={{ marginTop: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==========================================
          ADD CLAIM MODAL
          ========================================== */}
      <Modal visible={addClaimVisible} animationType="slide" transparent onRequestClose={() => setAddClaimVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>File a Warranty Claim</Text>
              <TouchableOpacity onPress={() => setAddClaimVisible(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 32 }}>
              {claimFormError ? <Text style={[styles.formError, { color: theme.danger }]}>{claimFormError}</Text> : null}

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Select Active Warranty *</Text>
              {activeWarranties.length === 0 ? (
                <View style={[styles.noActiveWarning, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                  <Ionicons name="information-circle-outline" size={20} color={theme.textSecondary} />
                  <Text style={[styles.noActiveText, { color: theme.textSecondary }]}>No active warranties found. Register one first.</Text>
                </View>
              ) : (
                <ScrollView style={styles.warrantySelectList} nestedScrollEnabled>
                  {activeWarranties.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.warrantySelectItem, {
                        backgroundColor: claimWarrantyId === w.id ? theme.primary + '15' : theme.backgroundSelected,
                        borderColor: claimWarrantyId === w.id ? theme.primary : theme.border,
                      }]}
                      onPress={() => setClaimWarrantyId(w.id)}
                    >
                      <Ionicons name="shield-checkmark" size={16} color={claimWarrantyId === w.id ? theme.primary : theme.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.warrantySelectProduct, { color: claimWarrantyId === w.id ? theme.primary : theme.text }]} numberOfLines={1}>
                          {w.productName}
                        </Text>
                        <Text style={[styles.warrantySelectMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                          {w.customerName}{w.serialNumber ? ` • S/N: ${w.serialNumber}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <Input
                label="Issue Description *"
                value={claimIssue}
                onChangeText={setClaimIssue}
                placeholder="Describe the fault or problem..."
                multiline
                numberOfLines={4}
                style={{ height: 80, textAlignVertical: 'top' }}
              />
              <Button title="Submit Claim" onPress={handleAddClaim} style={{ marginTop: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==========================================
          RESOLVE CLAIM MODAL
          ========================================== */}
      <Modal visible={!!resolveClaimId} animationType="slide" transparent onRequestClose={() => setResolveClaimId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Resolve Claim</Text>
              <TouchableOpacity onPress={() => setResolveClaimId(null)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 32 }}>
              {resolveFormError ? <Text style={[styles.formError, { color: theme.danger }]}>{resolveFormError}</Text> : null}

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Resolution Outcome *</Text>
              <View style={styles.resolutionGrid}>
                {(['approved', 'resolved', 'rejected'] as warrantyDb.ClaimStatus[]).map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.resolutionChip, {
                      backgroundColor: resolveStatus === s ? CLAIM_STATUS_COLORS[s] + '20' : theme.backgroundSelected,
                      borderColor: resolveStatus === s ? CLAIM_STATUS_COLORS[s] : theme.border,
                    }]}
                    onPress={() => setResolveStatus(s)}
                  >
                    <Text style={[styles.resolutionChipText, { color: resolveStatus === s ? CLAIM_STATUS_COLORS[s] : theme.textSecondary }]}>
                      {CLAIM_STATUS_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                label="Resolution Details *"
                value={resolveDetails}
                onChangeText={setResolveDetails}
                placeholder="e.g. Replaced display unit, Customer notified..."
                multiline
                numberOfLines={4}
                style={{ height: 80, textAlignVertical: 'top' }}
              />
              <Button title="Save Resolution" onPress={handleResolveClaim} style={{ marginTop: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1,
  },
  headerBtnText: { fontSize: 13, fontWeight: '700' },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, minWidth: 90, padding: 12, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  statLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 16, borderWidth: 1, marginBottom: 16,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontWeight: '500',
    ...Platform.select({ web: { outlineStyle: 'none' } as any, default: {} }),
  },

  tabBar: {
    flexDirection: 'row', padding: 4, borderRadius: 18, marginBottom: 20, gap: 4,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: 'transparent',
  },
  tabBtnText: { fontSize: 13, fontWeight: '700' },

  listSection: { gap: 12 },
  emptyState: {
    padding: 36, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', gap: 8, marginTop: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center' },

  warrantyCard: {
    borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 4,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  shieldBadge: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  cardHeaderInfo: { flex: 1 },
  productName: { fontSize: 16, fontWeight: '800' },
  customerName: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  cardHeaderRight: { alignItems: 'flex-end', gap: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '800' },

  infoStrip: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#00000008',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  infoChipText: { fontSize: 11, fontWeight: '600' },

  expandedSection: { borderTopWidth: 1, padding: 16, gap: 8 },
  expandedRow: { fontSize: 13, lineHeight: 20 },

  claimsNested: { marginTop: 8, gap: 8 },
  nestedTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  claimRow: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  claimRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  claimStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  claimStatusText: { fontSize: 10, fontWeight: '800' },
  claimDate: { fontSize: 11, fontWeight: '500' },
  claimIssue: { fontSize: 13, fontWeight: '600' },
  claimResolution: { fontSize: 12, fontStyle: 'italic' },
  resolveBtn: {
    marginTop: 6, paddingVertical: 7, borderRadius: 10, alignItems: 'center',
  },
  resolveBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  actionBtn: {
    flex: 1, minWidth: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 9, borderRadius: 10,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalContainer: {
    width: '100%', maxWidth: 480, maxHeight: '90%',
    borderWidth: 1, borderRadius: 24, overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalScroll: { paddingHorizontal: 20, paddingTop: 12 },
  formError: { fontSize: 13, fontWeight: '600', marginBottom: 12, marginLeft: 6 },
  inputLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 12, marginLeft: 6 },

  durationRow: { flexDirection: 'row', marginBottom: 12 },
  durationChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5,
    marginRight: 8, minWidth: 52, alignItems: 'center',
  },
  durationChipText: { fontSize: 13, fontWeight: '700' },

  datePreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8,
  },
  datePreviewText: { fontSize: 13, fontWeight: '700' },

  warrantySelectList: { maxHeight: 200, marginBottom: 8 },
  warrantySelectItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 6,
  },
  warrantySelectProduct: { fontSize: 13, fontWeight: '700' },
  warrantySelectMeta: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  noActiveWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  noActiveText: { fontSize: 12, fontWeight: '600', flex: 1 },

  resolutionGrid: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  resolutionChip: {
    flex: 1, minWidth: 90, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, alignItems: 'center',
  },
  resolutionChipText: { fontSize: 12, fontWeight: '700' },
});
