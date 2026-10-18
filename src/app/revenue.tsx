import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Card } from '../components/Card';
import { ReceiptModal } from '../components/ReceiptModal';
import ScreenWrapper from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { useTheme } from '../hooks/use-theme';
import { shareRevenueStatementPDF } from '../services/pdfGenerator';
import * as sqlite from '../services/sqlite';

type Timeframe = 'daily' | 'weekly' | 'monthly' | 'annually' | 'all';

export default function RevenueScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { invoices, expenses, returnsExchanges, loadingData, refreshData } = useDatabase();

  const [timeframe, setTimeframe] = useState<Timeframe>('monthly');
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);

  // Receipt Modal state
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<sqlite.Invoice | null>(null);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<sqlite.InvoiceItem[]>([]);

  // ─── Filter data by Timeframe ─────────────────────────────────────────────
  const now = new Date();

  const { filteredInvoices, filteredExpenses, filteredReturns, periodLabel } = useMemo(() => {
    let cutoff = new Date(0);
    let label = 'All Recorded History';

    if (timeframe === 'daily') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      label = `Today (${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`;
    } else if (timeframe === 'weekly') {
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startStr = cutoff.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const endStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      label = `Past 7 Days (${startStr} – ${endStr})`;
    } else if (timeframe === 'monthly') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      label = `Current Month (${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })})`;
    } else if (timeframe === 'annually') {
      cutoff = new Date(now.getFullYear(), 0, 1);
      label = `Calendar Year ${now.getFullYear()}`;
    }

    const finv = invoices.filter(inv => {
      if (timeframe === 'all') return true;
      return new Date(inv.createdAt) >= cutoff;
    });

    const fexp = expenses.filter(exp => {
      if (timeframe === 'all') return true;
      return new Date(exp.date || exp.lastUpdated) >= cutoff;
    });

    const fret = (returnsExchanges || []).filter(ret => {
      if (timeframe === 'all') return true;
      return new Date(ret.createdAt) >= cutoff;
    });

    return { filteredInvoices: finv, filteredExpenses: fexp, filteredReturns: fret, periodLabel: label };
  }, [timeframe, invoices, expenses, returnsExchanges]);

  // ─── Revenue & Performance Metrics ────────────────────────────────────────
  const totalRevenue = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  }, [filteredInvoices]);

  const totalExpenseAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  }, [filteredExpenses]);

  const totalRefundAmount = useMemo(() => {
    return (filteredReturns || []).reduce((sum, ret) => sum + (Number(ret.refundAmount) || 0), 0);
  }, [filteredReturns]);

  const netRevenue = totalRevenue - totalExpenseAmount - totalRefundAmount;
  const invoiceCount = filteredInvoices.length;
  const averageOrderValue = invoiceCount > 0 ? totalRevenue / invoiceCount : 0;

  // ─── Payment Methods Breakdown ────────────────────────────────────────────
  const paymentBreakdown = useMemo(() => {
    let cash = 0;
    let digital = 0;
    let discounted = 0;

    filteredInvoices.forEach(inv => {
      const pm = (inv as any).paymentMethod?.toLowerCase() || '';
      if (pm.includes('card') || pm.includes('bank') || pm.includes('online') || pm.includes('upi')) {
        digital += inv.total;
      } else if (inv.discount > 0) {
        discounted += inv.total;
      } else {
        cash += inv.total;
      }
    });

    const total = totalRevenue || 1;
    return [
      { name: 'Cash Inflow', amount: cash, pct: Math.round((cash / total) * 100), color: '#16A34A', icon: 'cash-outline' },
      { name: 'Digital & Card POS', amount: digital, pct: Math.round((digital / total) * 100), color: '#2563EB', icon: 'card-outline' },
      { name: 'Special / Discounted', amount: discounted, pct: Math.round((discounted / total) * 100), color: '#D97706', icon: 'pricetag-outline' },
    ];
  }, [filteredInvoices, totalRevenue]);

  // ─── Chart Data Construction ──────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (timeframe === 'daily') {
      // 6 time blocks for today
      const buckets = [
        { label: '12 AM', fullLabel: '12:00 AM - 04:00 AM', amount: 0 },
        { label: '4 AM', fullLabel: '04:00 AM - 08:00 AM', amount: 0 },
        { label: '8 AM', fullLabel: '08:00 AM - 12:00 PM', amount: 0 },
        { label: '12 PM', fullLabel: '12:00 PM - 04:00 PM', amount: 0 },
        { label: '4 PM', fullLabel: '04:00 PM - 08:00 PM', amount: 0 },
        { label: '8 PM', fullLabel: '08:00 PM - 12:00 AM', amount: 0 },
      ];
      filteredInvoices.forEach(inv => {
        const hour = new Date(inv.createdAt).getHours();
        const bIdx = Math.min(5, Math.floor(hour / 4));
        buckets[bIdx].amount += inv.total;
      });
      return buckets;
    }

    if (timeframe === 'weekly') {
      // Last 7 days day-by-day
      const days: { label: string; fullLabel: string; dateStr: string; amount: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        days.push({
          label: d.toLocaleDateString('en-PK', { weekday: 'short' }),
          fullLabel: d.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'short' }),
          dateStr: d.toISOString().split('T')[0],
          amount: 0,
        });
      }
      filteredInvoices.forEach(inv => {
        const invDate = inv.createdAt.split('T')[0];
        const match = days.find(d => d.dateStr === invDate);
        if (match) match.amount += inv.total;
      });
      return days;
    }

    if (timeframe === 'monthly') {
      // 4 weeks of the month
      const weeks = [
        { label: 'Wk 1', fullLabel: 'Days 1-7 of Month', amount: 0 },
        { label: 'Wk 2', fullLabel: 'Days 8-14 of Month', amount: 0 },
        { label: 'Wk 3', fullLabel: 'Days 15-21 of Month', amount: 0 },
        { label: 'Wk 4', fullLabel: 'Days 22-End of Month', amount: 0 },
      ];
      filteredInvoices.forEach(inv => {
        const dateNum = new Date(inv.createdAt).getDate();
        if (dateNum <= 7) weeks[0].amount += inv.total;
        else if (dateNum <= 14) weeks[1].amount += inv.total;
        else if (dateNum <= 21) weeks[2].amount += inv.total;
        else weeks[3].amount += inv.total;
      });
      return weeks;
    }

    if (timeframe === 'annually') {
      // 12 Months
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, idx) => ({
        label: m,
        fullLabel: new Date(2026, idx, 1).toLocaleDateString('en-PK', { month: 'long' }),
        amount: 0,
      }));
      filteredInvoices.forEach(inv => {
        const mIdx = new Date(inv.createdAt).getMonth();
        if (months[mIdx]) months[mIdx].amount += inv.total;
      });
      return months;
    }

    // All time: Group by past and current years
    const currentYear = now.getFullYear();
    const baseYears = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear];
    const yearsMap: Record<string, number> = {};
    baseYears.forEach(y => { yearsMap[y.toString()] = 0; });

    filteredInvoices.forEach(inv => {
      const yr = new Date(inv.createdAt).getFullYear().toString();
      yearsMap[yr] = (yearsMap[yr] || 0) + inv.total;
    });

    return Object.entries(yearsMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([yr, amt]) => ({
        label: yr,
        fullLabel: `Year ${yr}`,
        amount: amt,
      }));
  }, [timeframe, filteredInvoices, now]);

  const maxChartAmount = useMemo(() => {
    const max = Math.max(...chartData.map(d => d.amount), 0);
    return max > 0 ? max : 1000;
  }, [chartData]);

  // ─── Filtered Ledger Rows ─────────────────────────────────────────────────
  const ledgerInvoices = useMemo(() => {
    return filteredInvoices
      .filter(inv => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const idMatch = inv.id.toLowerCase().includes(q);
        const nameMatch = (inv.customerName || '').toLowerCase().includes(q);
        const phoneMatch = (inv.customerPhone || '').toLowerCase().includes(q);
        return idMatch || nameMatch || phoneMatch;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filteredInvoices, searchQuery]);

  // ─── Export Bank-Grade Revenue Statement PDF ──────────────────────────────
  const handleExportStatement = async () => {
    if (!user) return;
    setExporting(true);
    try {
      await shareRevenueStatementPDF({
        business: user,
        timeframe,
        periodLabel,
        totalRevenue,
        totalExpenses: totalExpenseAmount,
        netRevenue,
        invoiceCount,
        averageOrderValue,
        invoices: filteredInvoices,
        expenses: filteredExpenses,
      });
    } catch (err: any) {
      console.error(err);
      Alert.alert('Export Error', err?.message || 'Failed to export statement.');
    } finally {
      setExporting(false);
    }
  };

  // ─── Open Invoice Receipt ─────────────────────────────────────────────────
  const handleOpenReceipt = async (inv: sqlite.Invoice) => {
    try {
      const items = await sqlite.getInvoiceItems(inv.id);
      setSelectedInvoice(inv);
      setSelectedInvoiceItems(items);
      setReceiptVisible(true);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not open invoice details.');
    }
  };

  return (
    <ScreenWrapper
      title="Revenue Analytics"
      hideAddProduct={true}
      headerRight={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: '#1A1A1A' }]}
            onPress={handleExportStatement}
            disabled={exporting}
            activeOpacity={0.75}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="document-text-outline" size={16} color="#FFFFFF" />
            )}
            <Text style={styles.exportBtnText}>
              {exporting ? 'Generating...' : 'Export Statement'}
            </Text>
          </TouchableOpacity>
        </View>
      }
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Top Banner & Timeframe Switcher ────────────────────────────── */}
        <View style={styles.topBannerRow}>
          <View>
            <Text style={[styles.mainHeading, { color: theme.text }]}>Revenue & Inflow Treasury</Text>
            <Text style={[styles.mainSubtitle, { color: theme.textSecondary }]}>
              {periodLabel} · Real-time financial ledger & transaction statements
            </Text>
          </View>

          {/* Timeframe Pills */}
          <View style={[styles.timeframeContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {(['daily', 'weekly', 'monthly', 'annually', 'all'] as Timeframe[]).map((tf) => {
              const isSelected = timeframe === tf;
              const labels: Record<Timeframe, string> = {
                daily: 'Daily',
                weekly: 'Weekly',
                monthly: 'Monthly',
                annually: 'Annually',
                all: 'All Time',
              };
              return (
                <TouchableOpacity
                  key={tf}
                  style={[
                    styles.timeframeBtn,
                    isSelected && { backgroundColor: '#C5A880' },
                  ]}
                  onPress={() => {
                    setTimeframe(tf);
                    setSelectedBarIndex(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.timeframeBtnText,
                      { color: isSelected ? '#16171B' : theme.textSecondary },
                      isSelected && { fontWeight: '800' },
                    ]}
                  >
                    {labels[tf]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ─── Executive KPI Cards ────────────────────────────────────────── */}
        <View style={styles.kpiGrid}>
          {/* Total Gross Revenue */}
          <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.kpiHeaderRow}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="cash-outline" size={18} color="#10B981" />
              </View>
              <View style={[styles.trendBadge, { backgroundColor: '#10B98118' }]}>
                <Ionicons name="arrow-up" size={11} color="#10B981" />
                <Text style={[styles.trendBadgeText, { color: '#10B981' }]}>Inflow</Text>
              </View>
            </View>
            <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>TOTAL GROSS REVENUE</Text>
            <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1}>
              {totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>
              {invoiceCount} paid sales orders recorded
            </Text>
          </Card>

          {/* Operating Costs */}
          <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.kpiHeaderRow}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#EF444415' }]}>
                <Ionicons name="wallet-outline" size={18} color="#EF4444" />
              </View>
              <View style={[styles.trendBadge, { backgroundColor: '#EF444418' }]}>
                <Ionicons name="arrow-down" size={11} color="#EF4444" />
                <Text style={[styles.trendBadgeText, { color: '#EF4444' }]}>Outflow</Text>
              </View>
            </View>
            <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>OPERATING EXPENSES</Text>
            <Text style={[styles.kpiValue, { color: '#DC2626' }]} numberOfLines={1}>
              {totalExpenseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>
              {filteredExpenses.length} business cost entries
            </Text>
          </Card>

          {/* Customer Refunds */}
          <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.kpiHeaderRow}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#F9731615' }]}>
                <Ionicons name="swap-horizontal-outline" size={18} color="#F97316" />
              </View>
              <View style={[styles.trendBadge, { backgroundColor: '#F9731618' }]}>
                <Ionicons name="arrow-undo-outline" size={11} color="#F97316" />
                <Text style={[styles.trendBadgeText, { color: '#F97316' }]}>Refunds</Text>
              </View>
            </View>
            <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>CUSTOMER REFUNDS</Text>
            <Text style={[styles.kpiValue, { color: '#F97316' }]} numberOfLines={1}>
              {totalRefundAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>
              {filteredReturns.length} cash returns processed
            </Text>
          </Card>

          {/* Net Profit */}
          <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.kpiHeaderRow}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#3B82F615' }]}>
                <Ionicons name="pie-chart-outline" size={18} color="#3B82F6" />
              </View>
              <View style={[styles.trendBadge, { backgroundColor: netRevenue >= 0 ? '#10B98118' : '#EF444418' }]}>
                <Text style={[styles.trendBadgeText, { color: netRevenue >= 0 ? '#10B981' : '#EF4444' }]}>
                  {netRevenue >= 0 ? 'Net Profit' : 'Deficit'}
                </Text>
              </View>
            </View>
            <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>NET OPERATING REVENUE</Text>
            <Text style={[styles.kpiValue, { color: netRevenue >= 0 ? '#16A34A' : '#DC2626' }]} numberOfLines={1}>
              {netRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>
              After deducting expenses & cash refunds
            </Text>
          </Card>

          {/* Average Order Value (AOV) */}
          <Card style={[styles.kpiCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.kpiHeaderRow}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#F59E0B15' }]}>
                <Ionicons name="receipt-outline" size={18} color="#F59E0B" />
              </View>
              <View style={[styles.trendBadge, { backgroundColor: '#F59E0B18' }]}>
                <Text style={[styles.trendBadgeText, { color: '#F59E0B' }]}>AOV</Text>
              </View>
            </View>
            <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>AVERAGE TICKET SIZE</Text>
            <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1}>
              {averageOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>
              Average revenue generated per sale
            </Text>
          </Card>
        </View>

        {/* ─── Visual Graphs Section ──────────────────────────────────────── */}
        <View style={styles.chartsGrid}>
          {/* Main Revenue Timeline Graph */}
          <Card style={[styles.mainChartCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.chartHeaderRow}>
              <View>
                <Text style={[styles.chartTitle, { color: theme.text }]}>Revenue Trend & Inflow Waves</Text>
                <Text style={[styles.chartSub, { color: theme.textSecondary }]}>
                  Visual comparison across {timeframe} intervals (hover or tap bars for details)
                </Text>
              </View>

              {selectedBarIndex !== null && chartData[selectedBarIndex] && (
                <View style={[styles.activeTooltipPill, { backgroundColor: '#1A1A1A' }]}>
                  <Text style={styles.activeTooltipLabel}>
                    {(chartData[selectedBarIndex] as any).fullLabel || chartData[selectedBarIndex].label}:
                  </Text>
                  <Text style={styles.activeTooltipAmount}>
                    {chartData[selectedBarIndex].amount.toLocaleString('en-IN')}
                  </Text>
                </View>
              )}
            </View>

            {/* Bar Chart Canvas */}
            <View style={styles.chartArea}>
              {/* Background Grid Lines */}
              <View style={styles.chartGridLines}>
                {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                  <View key={ratio} style={styles.gridLineRow}>
                    <Text style={[styles.gridLineLabel, { color: theme.textSecondary }]}>
                      {Math.round(maxChartAmount * ratio).toLocaleString('en-IN')}
                    </Text>
                    <View style={[styles.gridLineDash, { backgroundColor: theme.border }]} />
                  </View>
                ))}
              </View>

              {/* Bars Row */}
              <View style={styles.barsContainer}>
                {chartData.map((item, idx) => {
                  const barHeightPct = maxChartAmount > 0 ? (item.amount / maxChartAmount) * 100 : 0;
                  const isHovered = selectedBarIndex === idx;
                  const isPeak = item.amount === maxChartAmount && maxChartAmount > 0;

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={styles.barColumn}
                      onPress={() => setSelectedBarIndex(idx)}
                      // @ts-ignore
                      onMouseEnter={() => setSelectedBarIndex(idx)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: `${Math.max(barHeightPct, 4)}%`,
                              backgroundColor: isHovered
                                ? '#C5A880'
                                : isPeak
                                ? '#16A34A'
                                : item.amount > 0
                                ? '#22C55E'
                                : '#1E293B',
                            },
                          ]}
                        />
                      </View>
                      
                      {/* X-Axis Baseline & Label */}
                      <View style={styles.barLabelWrapper}>
                        <Text
                          style={[
                            styles.barLabelText,
                            { color: isHovered ? theme.text : theme.textSecondary },
                            isHovered && { fontWeight: '800' },
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Card>

          {/* Payment Method Distribution */}
          <Card style={[styles.sideChartCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.chartTitle, { color: theme.text }]}>Payment Channels</Text>
            <Text style={[styles.chartSub, { color: theme.textSecondary }]}>
              Inflow breakdown by collection method
            </Text>

            <View style={{ gap: 16, marginTop: 18 }}>
              {paymentBreakdown.map((channel, i) => (
                <View key={i} style={styles.channelRow}>
                  <View style={styles.channelHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name={channel.icon as any} size={16} color={channel.color} />
                      <Text style={[styles.channelName, { color: theme.text }]}>{channel.name}</Text>
                    </View>
                    <Text style={[styles.channelAmount, { color: theme.text }]}>
                      {channel.amount.toLocaleString('en-IN')} ({channel.pct}%)
                    </Text>
                  </View>
                  <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${channel.pct}%`, backgroundColor: channel.color },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>

            {/* Certified Bank Statement Info Banner */}
            <View style={[styles.statementCalloutBox, { backgroundColor: '#C5A88015', borderColor: '#C5A88040' }]}>
              <Ionicons name="shield-checkmark" size={20} color="#C5A880" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.statementCalloutTitle, { color: theme.text }]}>
                  Bank-Statement Grade PDF Available
                </Text>
                <Text style={[styles.statementCalloutSub, { color: theme.textSecondary }]}>
                  Generate certified inflow statements with verification stamps, running balances, and account reference headers.
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* ─── Itemized Statement Ledger (Bank Statement Style) ──────────── */}
        <Card style={[styles.ledgerCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.ledgerHeaderRow}>
            <View>
              <Text style={[styles.chartTitle, { color: theme.text }]}>Transaction Statement Ledger</Text>
              <Text style={[styles.chartSub, { color: theme.textSecondary }]}>
                Chronological bank-style record of incoming revenue payments and invoices
              </Text>
            </View>

            {/* Ledger Search */}
            <View style={[styles.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="search-outline" size={15} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search invoice #, customer name, phone..."
                placeholderTextColor={theme.textSecondary + '80'}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={15} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Table Header */}
          <View style={[styles.tableHeader, { backgroundColor: theme.backgroundSelected, borderBottomColor: theme.border }]}>
            <Text style={[styles.thCell, { flex: 1.2, color: theme.textSecondary }]}>DATE & TIME</Text>
            <Text style={[styles.thCell, { flex: 1, color: theme.textSecondary }]}>REFERENCE #</Text>
            <Text style={[styles.thCell, { flex: 1.8, color: theme.textSecondary }]}>CUSTOMER / PARTICULARS</Text>
            <Text style={[styles.thCell, { flex: 1.2, color: theme.textSecondary }]}>CHANNEL</Text>
            <Text style={[styles.thCell, { flex: 1.2, textAlign: 'right', color: theme.textSecondary }]}>INFLOW</Text>
            <Text style={[styles.thCell, { flex: 0.8, textAlign: 'center', color: theme.textSecondary }]}>RECEIPT</Text>
          </View>

          {/* Table Rows */}
          {ledgerInvoices.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={42} color={theme.textSecondary} style={{ opacity: 0.5 }} />
              <Text style={[styles.emptyStateTitle, { color: theme.text }]}>No Inflow Transactions</Text>
              <Text style={[styles.emptyStateSub, { color: theme.textSecondary }]}>
                No invoices recorded for the selected timeframe ({periodLabel}).
              </Text>
            </View>
          ) : (
            ledgerInvoices.map((inv, idx) => {
              const formattedDate = new Date(inv.createdAt).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });
              const refId = inv.id.length > 8 ? inv.id.slice(0, 8).toUpperCase() : inv.id.toUpperCase();
              const channel = (inv as any).paymentMethod || (inv.discount > 0 ? 'Discounted Cash' : 'Cash / Counter');

              return (
                <View
                  key={inv.id}
                  style={[
                    styles.tableRow,
                    {
                      borderBottomColor: theme.border,
                      backgroundColor: idx % 2 === 0 ? theme.backgroundElement : theme.background,
                    },
                  ]}
                >
                  <Text style={[styles.tdCell, { flex: 1.2, color: theme.textSecondary, fontSize: 11 }]}>
                    {formattedDate}
                  </Text>
                  <Text style={[styles.tdCell, { flex: 1, fontWeight: '700', color: theme.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>
                    #{refId}
                  </Text>
                  <View style={{ flex: 1.8 }}>
                    <Text style={[styles.tdCell, { fontWeight: '700', color: theme.text }]}>
                      {inv.customerName || 'Walk-in Customer'}
                    </Text>
                    {inv.customerPhone ? (
                      <Text style={{ fontSize: 10, color: theme.textSecondary }}>{inv.customerPhone}</Text>
                    ) : null}
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <View style={[styles.channelBadge, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                      <Text style={[styles.channelBadgeText, { color: theme.textSecondary }]}>{channel}</Text>
                    </View>
                  </View>
                  <Text style={[styles.tdCell, { flex: 1.2, textAlign: 'right', fontWeight: '800', color: '#16A34A', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>
                    +{inv.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <View style={{ flex: 0.8, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={[styles.viewReceiptBtn, { backgroundColor: theme.primaryLight }]}
                      onPress={() => handleOpenReceipt(inv)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="eye-outline" size={13} color={theme.primary} />
                      <Text style={[styles.viewReceiptBtnText, { color: theme.primary }]}>View</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>

      {/* ─── Receipt Modal for Viewing Invoices ───────────────────────────── */}
      {selectedInvoice && (
        <ReceiptModal
          visible={receiptVisible}
          onClose={() => setReceiptVisible(false)}
          invoice={selectedInvoice}
          items={selectedInvoiceItems}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 24,
    gap: 20,
  },
  topBannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  mainHeading: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  mainSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  timeframeContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  timeframeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
  },
  timeframeBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    cursor: 'pointer',
  } as any,
  exportBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12.5,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  kpiSub: {
    fontSize: 11,
  },
  chartsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  mainChartCard: {
    flex: 2,
    minWidth: 320,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  sideChartCard: {
    flex: 1,
    minWidth: 260,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  chartSub: {
    fontSize: 12,
    marginTop: 2,
  },
  activeTooltipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  activeTooltipLabel: {
    color: '#888E9B',
    fontSize: 11,
    fontWeight: '600',
  },
  activeTooltipAmount: {
    color: '#FAF7F2',
    fontSize: 12,
    fontWeight: '800',
  },
  chartArea: {
    height: 240,
    position: 'relative',
    marginTop: 8,
  },
  chartGridLines: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 34,
    justifyContent: 'space-between',
  },
  gridLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridLineLabel: {
    fontSize: 9.5,
    width: 68,
    fontWeight: '600',
  },
  gridLineDash: {
    flex: 1,
    height: 1,
    opacity: 0.5,
  },
  barsContainer: {
    height: '100%',
    marginLeft: 76,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: 22,
    maxWidth: '85%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 4,
  },
  barLabelWrapper: {
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  barLabelText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  channelRow: {
    gap: 6,
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  channelName: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  channelAmount: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  statementCalloutBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
  },
  statementCalloutTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  statementCalloutSub: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  ledgerCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  ledgerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 260,
  },
  searchInput: {
    fontSize: 12,
    flex: 1,
    padding: 0,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  tdCell: {
    fontSize: 12,
  },
  channelBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  channelBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  viewReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewReceiptBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  emptyStateSub: {
    fontSize: 12,
    marginTop: 4,
  },
});
