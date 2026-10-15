import React, { useState, useMemo, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Dimensions, 
  Platform, 
  TouchableOpacity 
} from 'react-native';
import Svg, { 
  Path, 
  Circle, 
  Defs, 
  LinearGradient, 
  Stop, 
  Line, 
  G,
  Text as SvgText,
  Rect
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/use-theme';

interface InteractiveRevenueChartProps {
  invoices: any[];
  expenses: any[];
}

type TimeframeOption = '7D' | '30D' | '6M' | 'ALL';

const TIMEFRAMES: { id: TimeframeOption; label: string }[] = [
  { id: '7D', label: '7 Days' },
  { id: '30D', label: '30 Days' },
  { id: '6M', label: '6 Months' },
  { id: 'ALL', label: 'All Time' },
];

export function InteractiveRevenueChart({ invoices = [], expenses = [] }: InteractiveRevenueChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(Dimensions.get('window').width - 32);
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeOption>('7D');
  const [activeView, setActiveView] = useState<'all' | 'revenue' | 'expenses'>('all');

  const height = 230;
  const padding = { top: 28, right: 24, bottom: 32, left: 52 };
  const chartWidth = Math.max(260, width - padding.left - padding.right);
  const chartHeight = height - padding.top - padding.bottom;

  // Process and aggregate real database metrics dynamically
  const chartData = useMemo(() => {
    const now = new Date();
    const intervals: { label: string; fullDate: string; start: Date; end: Date }[] = [];

    if (activeTimeframe === '7D') {
      // Last 7 days (Day -6 to today)
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
        const fullDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        intervals.push({ label, fullDate, start, end });
      }
    } else if (activeTimeframe === '30D') {
      // 6 intervals of 5 days
      for (let i = 5; i >= 0; i--) {
        const endDay = new Date(now);
        endDay.setDate(now.getDate() - i * 5);
        const startDay = new Date(now);
        startDay.setDate(now.getDate() - (i + 1) * 5 + 1);
        const start = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), 0, 0, 0);
        const end = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59);
        const label = endDay.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
        intervals.push({ label, fullDate: label, start, end });
      }
    } else if (activeTimeframe === '6M') {
      // Past 6 calendar months
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        intervals.push({ label, fullDate: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), start, end });
      }
    } else {
      // All time: Past 6 bi-monthly periods
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i * 2, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth() + 2, 0, 23, 59, 59);
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        intervals.push({ label, fullDate: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), start, end });
      }
    }

    const safeDate = (val: any) => {
      if (!val) return null;
      const parsed = new Date(val);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    let totalPeriodSales = 0;
    let totalPeriodExpenses = 0;

    const dataPoints = intervals.map((interval) => {
      const intervalSales = invoices.reduce((sum, inv) => {
        const d = safeDate(inv.createdAt || inv.date);
        if (d && d >= interval.start && d <= interval.end) {
          return sum + (Number(inv.total) || 0);
        }
        return sum;
      }, 0);

      const intervalExpenses = expenses.reduce((sum, exp) => {
        const d = safeDate(exp.date || exp.createdAt);
        if (d && d >= interval.start && d <= interval.end) {
          return sum + (Number(exp.amount) || 0);
        }
        return sum;
      }, 0);

      totalPeriodSales += intervalSales;
      totalPeriodExpenses += intervalExpenses;

      return {
        label: interval.label,
        fullDate: interval.fullDate,
        sales: intervalSales,
        expenses: intervalExpenses,
      };
    });

    const maxSales = Math.max(...dataPoints.map((p) => p.sales), 0);
    const maxExpenses = Math.max(...dataPoints.map((p) => p.expenses), 0);
    const maxObserved = Math.max(maxSales, maxExpenses);

    // Dynamic upper threshold
    let maxVal = 10000;
    if (maxObserved > 0) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(maxObserved)));
      maxVal = Math.ceil((maxObserved * 1.25) / magnitude) * magnitude;
      if (maxVal <= maxObserved) maxVal = Math.ceil(maxObserved * 1.2);
    }

    // SVG Point Coordinates
    const numPoints = dataPoints.length;
    const salesPoints: { x: number; y: number; val: number; label: string; fullDate: string }[] = [];
    const expensePoints: { x: number; y: number; val: number; label: string }[] = [];

    for (let i = 0; i < numPoints; i++) {
      const x = padding.left + (i / (numPoints - 1)) * chartWidth;
      const salesY = padding.top + chartHeight - (dataPoints[i].sales / maxVal) * chartHeight;
      const expenseY = padding.top + chartHeight - (dataPoints[i].expenses / maxVal) * chartHeight;

      salesPoints.push({
        x,
        y: salesY,
        val: dataPoints[i].sales,
        label: dataPoints[i].label,
        fullDate: dataPoints[i].fullDate,
      });
      expensePoints.push({
        x,
        y: expenseY,
        val: dataPoints[i].expenses,
        label: dataPoints[i].label,
      });
    }

    // Smooth Bezier path
    const createSmoothPath = (pts: { x: number; y: number }[]) => {
      if (pts.length === 0) return '';
      let path = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const cp1x = pts[i].x + (pts[i + 1].x - pts[i].x) / 2;
        const cp1y = pts[i].y;
        const cp2x = pts[i].x + (pts[i + 1].x - pts[i].x) / 2;
        const cp2y = pts[i + 1].y;
        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
      }
      return path;
    };

    const salesLine = createSmoothPath(salesPoints);
    const expenseLine = createSmoothPath(expensePoints);

    const salesArea =
      salesPoints.length > 0
        ? `${salesLine} L ${salesPoints[salesPoints.length - 1].x} ${padding.top + chartHeight} L ${salesPoints[0].x} ${padding.top + chartHeight} Z`
        : '';

    // Find peak sales point
    let peakPoint = null;
    if (maxSales > 0) {
      peakPoint = salesPoints.reduce((max, p) => (p.val > (max?.val || 0) ? p : max), salesPoints[0]);
    }

    return {
      dataPoints,
      salesPoints,
      expensePoints,
      salesLine,
      expenseLine,
      salesArea,
      maxVal,
      maxSales,
      maxExpenses,
      maxObserved,
      totalPeriodSales,
      totalPeriodExpenses,
      peakPoint,
    };
  }, [invoices, expenses, activeTimeframe, chartWidth, chartHeight, padding]);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = React.useRef<any>(null);

  const handlePointer = (e: any) => {
    const native = e?.nativeEvent || e || {};
    let clientX = e?.clientX ?? native?.clientX;
    let x: number | undefined;

    const el = containerRef.current;
    const domNode = el?.getBoundingClientRect ? el : el?._nativeRef;
    if (domNode && typeof domNode.getBoundingClientRect === 'function' && typeof clientX === 'number') {
      const rect = domNode.getBoundingClientRect();
      x = clientX - rect.left;
    }
    if (x === undefined) {
      x = native.offsetX ?? native.locationX;
    }
    if (typeof x === 'number' && chartWidth > 0 && chartData.dataPoints.length > 0) {
      const numPts = chartData.dataPoints.length;
      if (numPts <= 1) {
        setHoveredIndex(0);
        return;
      }
      const clampedX = Math.max(padding.left, Math.min(x, padding.left + chartWidth));
      const ratio = (clampedX - padding.left) / chartWidth;
      const idx = Math.round(ratio * (numPts - 1));
      setHoveredIndex(Math.max(0, Math.min(idx, numPts - 1)));
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = containerRef.current;
    const node: HTMLElement | null =
      el && typeof el.addEventListener === 'function'
        ? el
        : el?.getScrollableNode?.() || el?._nativeRef || null;
    if (!node) return;

    const onMouseMove = (e: MouseEvent) => {
      handlePointer(e);
    };

    const onMouseLeave = () => {
      setHoveredIndex(null);
    };

    node.addEventListener('mousemove', onMouseMove);
    node.addEventListener('mouseleave', onMouseLeave);

    return () => {
      node.removeEventListener('mousemove', onMouseMove);
      node.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [chartWidth, chartData.dataPoints.length, padding.left]);

  const handlePointerLeave = () => {
    setHoveredIndex(null);
  };

  const activeHoverPoint = hoveredIndex !== null && chartData.dataPoints[hoveredIndex]
    ? {
        data: chartData.dataPoints[hoveredIndex],
        sales: chartData.salesPoints[hoveredIndex],
        expense: chartData.expensePoints[hoveredIndex],
      }
    : null;

  const formatYTick = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${Math.round(val / 1000)}k`;
    return `${Math.round(val)}`;
  };

  const activeOption = TIMEFRAMES.find(t => t.id === activeTimeframe);

  return (
    <View 
      style={[
        styles.card, 
        { 
          backgroundColor: theme.backgroundElement, 
          borderColor: theme.border,
          ...Platform.select({
            web: {
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            } as any,
            default: {}
          })
        }
      ]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setWidth(w);
      }}
    >
      {/* Header: Title, Real Legends & Timeframe Badge */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>
            Revenue vs Expenses
          </Text>
          <Text style={{ fontSize: 11, color: '#888E9B', fontWeight: '500', marginTop: 1 }}>
            Live cashflow trends computed from your recorded bills
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {/* Revenue Legend */}
          <TouchableOpacity 
            style={[styles.legendRow, activeView === 'expenses' && { opacity: 0.4 }]}
            onPress={() => setActiveView(activeView === 'revenue' ? 'all' : 'revenue')}
          >
            <View style={[styles.legendDot, { backgroundColor: '#C5A880' }]} />
            <Text style={styles.legendLabel}>Revenue</Text>
          </TouchableOpacity>

          {/* Expenses Legend */}
          <TouchableOpacity 
            style={[styles.legendRow, activeView === 'revenue' && { opacity: 0.4 }]}
            onPress={() => setActiveView(activeView === 'expenses' ? 'all' : 'expenses')}
          >
            <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.legendLabel}>Expenses</Text>
          </TouchableOpacity>

          {/* Active Timeframe Indicator */}
          <View style={styles.dropdownBtn}>
            <Ionicons name="calendar-outline" size={13} color="#6C727F" />
            <Text style={styles.dropdownText}>{activeOption?.label || '7 Days'}</Text>
          </View>
        </View>
      </View>

      {/* SVG Canvas Area with Interactive Pointer / Mouse Move Tracking */}
      <View 
        ref={containerRef}
        style={[
          styles.chartContainer,
          Platform.select({
            web: {
              cursor: 'crosshair',
              userSelect: 'none',
            } as any,
            default: {}
          })
        ]}
        // @ts-ignore
        onPointerMove={handlePointer}
        // @ts-ignore
        onPointerLeave={handlePointerLeave}
        // @ts-ignore
        onMouseMove={handlePointer}
        // @ts-ignore
        onMouseLeave={handlePointerLeave}
        onTouchMove={handlePointer}
        onTouchEnd={handlePointerLeave}
      >
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="realSalesAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#C5A880" stopOpacity={0.25} />
              <Stop offset="100%" stopColor="#C5A880" stopOpacity={0.0} />
            </LinearGradient>
          </Defs>

          {/* Transparent interactive catch-all overlay rect for mouse tracking */}
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            // @ts-ignore
            onMouseMove={handlePointer}
            // @ts-ignore
            onPointerMove={handlePointer}
            // @ts-ignore
            onMouseLeave={handlePointerLeave}
          />

          {/* Dynamic Grid lines & Y-axis labels */}
          {[1, 0.75, 0.5, 0.25, 0].map((fraction, idx) => {
            const y = padding.top + (idx / 4) * chartHeight;
            const val = chartData.maxVal * fraction;
            return (
              <G key={idx}>
                <Line 
                  x1={padding.left} 
                  y1={y} 
                  x2={width - padding.right} 
                  y2={y} 
                  stroke={theme.border} 
                  strokeWidth={1}
                />
                <SvgText
                  x={padding.left - 8}
                  y={y + 4}
                  fill="#9AA1B0"
                  fontSize={10}
                  fontWeight="600"
                  textAnchor="end"
                >
                  {formatYTick(val)}
                </SvgText>
              </G>
            );
          })}

          {/* Area Fill for Real Sales */}
          {activeView !== 'expenses' && chartData.maxObserved > 0 && (
            <Path d={chartData.salesArea} fill="url(#realSalesAreaGrad)" />
          )}

          {/* Real Expenses Line (Emerald) */}
          {activeView !== 'revenue' && (
            <Path 
              d={chartData.expenseLine} 
              stroke="#22C55E" 
              strokeWidth={2} 
              strokeLinecap="round" 
              fill="none"
            />
          )}

          {/* Real Sales Revenue Line (Bronze / Obsidian) */}
          {activeView !== 'expenses' && (
            <Path 
              d={chartData.salesLine} 
              stroke="#C5A880" 
              strokeWidth={3} 
              strokeLinecap="round" 
              fill="none"
            />
          )}

          {/* X-axis tick labels */}
          {chartData.salesPoints.map((pt, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <SvgText
                key={idx}
                x={pt.x}
                y={padding.top + chartHeight + 18}
                fill={isHovered ? '#16171B' : '#9AA1B0'}
                fontSize={isHovered ? 11 : 10}
                fontWeight={isHovered ? '800' : '600'}
                textAnchor="middle"
              >
                {pt.label}
              </SvgText>
            );
          })}

          {/* Active Hover Crosshair Line */}
          {activeHoverPoint && (
            <Line
              x1={activeHoverPoint.sales.x}
              y1={padding.top - 6}
              x2={activeHoverPoint.sales.x}
              y2={padding.top + chartHeight + 4}
              stroke="#C5A880"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.8}
            />
          )}

          {/* Active Hover Dots on Lines */}
          {activeHoverPoint && (
            <G>
              {/* Expense point indicator */}
              {activeView !== 'revenue' && (
                <G>
                  <Circle
                    cx={activeHoverPoint.expense.x}
                    cy={activeHoverPoint.expense.y}
                    r={6}
                    fill="rgba(34, 197, 94, 0.25)"
                  />
                  <Circle
                    cx={activeHoverPoint.expense.x}
                    cy={activeHoverPoint.expense.y}
                    r={4}
                    fill="#16171B"
                    stroke="#22C55E"
                    strokeWidth={2}
                  />
                </G>
              )}

              {/* Revenue point indicator */}
              {activeView !== 'expenses' && (
                <G>
                  <Circle
                    cx={activeHoverPoint.sales.x}
                    cy={activeHoverPoint.sales.y}
                    r={8}
                    fill="rgba(197, 168, 128, 0.25)"
                  />
                  <Circle
                    cx={activeHoverPoint.sales.x}
                    cy={activeHoverPoint.sales.y}
                    r={5}
                    fill="#16171B"
                    stroke="#C5A880"
                    strokeWidth={2.5}
                  />
                  <Circle
                    cx={activeHoverPoint.sales.x}
                    cy={activeHoverPoint.sales.y}
                    r={2}
                    fill="#FFFFFF"
                  />
                </G>
              )}
            </G>
          )}

          {/* Static Peak Dot (when not actively hovering) */}
          {!activeHoverPoint && chartData.peakPoint && chartData.peakPoint.val > 0 && activeView !== 'expenses' && (
            <G>
              <Circle
                cx={chartData.peakPoint.x}
                cy={chartData.peakPoint.y}
                r={5}
                fill="#16171B"
                stroke="#C5A880"
                strokeWidth={3}
              />
            </G>
          )}
        </Svg>

        {/* Dynamic Analytics Tooltip on Mouse Move */}
        {activeHoverPoint && (
          <View 
            style={[
              styles.analyticsTooltip,
              {
                left: Math.max(10, Math.min(activeHoverPoint.sales.x - 85, width - 180)),
                top: Math.max(6, Math.min(activeHoverPoint.sales.y - 78, chartHeight - 55)),
                pointerEvents: 'none',
              } as any
            ]}
          >
            <View style={styles.tooltipHeaderRow}>
              <Ionicons name="time-outline" size={11} color="#C5A880" />
              <Text style={styles.tooltipHeaderDate}>
                {activeHoverPoint.data.fullDate || activeHoverPoint.data.label}
              </Text>
            </View>

            <View style={styles.tooltipMetricsRow}>
              <View style={styles.tooltipMetricItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={[styles.miniDot, { backgroundColor: '#C5A880' }]} />
                  <Text style={styles.tooltipMetricLabel}>Revenue</Text>
                </View>
                <Text style={styles.tooltipMetricVal}>
                  {activeHoverPoint.data.sales.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.tooltipMetricItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={[styles.miniDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={styles.tooltipMetricLabel}>Expenses</Text>
                </View>
                <Text style={[styles.tooltipMetricVal, { color: '#22C55E' }]}>
                  {activeHoverPoint.data.expenses.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            {/* Net Cashflow Row */}
            <View style={styles.tooltipNetRow}>
              <Text style={styles.tooltipNetLabel}>Net Margin</Text>
              <Text style={[
                styles.tooltipNetVal,
                { color: activeHoverPoint.data.sales - activeHoverPoint.data.expenses >= 0 ? '#4ADE80' : '#F87171' }
              ]}>
                {activeHoverPoint.data.sales - activeHoverPoint.data.expenses >= 0 ? '+' : ''}
                {(activeHoverPoint.data.sales - activeHoverPoint.data.expenses).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        )}

        {/* Resting Peak Pill (only if not hovering) */}
        {!activeHoverPoint && chartData.peakPoint && chartData.peakPoint.val > 0 && activeView !== 'expenses' && (
          <View 
            style={[
              styles.floatingTooltip, 
              {
                left: Math.min(Math.max(10, chartData.peakPoint.x - 55), width - 130),
                top: Math.max(4, chartData.peakPoint.y - 42),
                pointerEvents: 'none',
              } as any
            ]}
          >
            <Text style={styles.tooltipSub}>Peak · {chartData.peakPoint.fullDate}</Text>
            <Text style={styles.tooltipVal}>{chartData.peakPoint.val.toLocaleString('en-IN')}</Text>
          </View>
        )}

        {/* Empty State Overlay if no activity */}
        {chartData.maxObserved === 0 && (
          <View style={styles.emptyChartOverlay}>
            <Ionicons name="stats-chart-outline" size={24} color="#9AA1B0" />
            <Text style={styles.emptyChartTitle}>No transactions recorded in this period</Text>
            <Text style={styles.emptyChartSub}>Generate bills or record expenses to view real dynamic cashflow</Text>
          </View>
        )}
      </View>

      {/* Real Timeframe Selector & Period Summaries */}
      <View style={styles.categoryRow}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {TIMEFRAMES.map(tf => {
            const isSel = activeTimeframe === tf.id;
            return (
              <TouchableOpacity
                key={tf.id}
                onPress={() => {
                  setActiveTimeframe(tf.id);
                  setHoveredIndex(null);
                }}
                style={[
                  styles.categoryPill,
                  {
                    backgroundColor: isSel ? theme.primary : theme.backgroundSelected,
                    borderColor: isSel ? theme.primary : theme.border,
                  }
                ]}
                activeOpacity={0.7}
              >
                <Text style={{
                  fontSize: 11.5,
                  fontWeight: '700',
                  color: isSel ? '#FFFFFF' : '#6C727F'
                }}>
                  {tf.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Live Period Metrics (Clean Numbers without PKR) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 9.5, color: '#9AA1B0', fontWeight: '600' }}>
              {activeHoverPoint ? `Selected (${activeHoverPoint.data.label})` : 'Period Revenue'}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#111318' }}>
              {activeHoverPoint 
                ? activeHoverPoint.data.sales.toLocaleString('en-IN')
                : chartData.totalPeriodSales.toLocaleString('en-IN')}
            </Text>
          </View>
          <View style={{ width: 1, height: 22, backgroundColor: '#E5E7EB' }} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 9.5, color: '#9AA1B0', fontWeight: '600' }}>
              {activeHoverPoint ? 'Expenses' : 'Expenses'}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626' }}>
              {activeHoverPoint
                ? activeHoverPoint.data.expenses.toLocaleString('en-IN')
                : chartData.totalPeriodExpenses.toLocaleString('en-IN')}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    marginVertical: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6C727F',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F4F5F7',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  dropdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111318',
  },
  chartContainer: {
    position: 'relative',
    height: 230,
    width: '100%',
  },
  floatingTooltip: {
    position: 'absolute',
    backgroundColor: '#16171B',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tooltipSub: {
    color: '#9AA1B0',
    fontSize: 8.5,
    fontWeight: '600',
  },
  tooltipVal: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  analyticsTooltip: {
    position: 'absolute',
    backgroundColor: '#111318',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 165,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(197, 168, 128, 0.35)',
    zIndex: 99,
  },
  tooltipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 6,
  },
  tooltipHeaderDate: {
    color: '#E2E8F0',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tooltipMetricsRow: {
    gap: 4,
  },
  tooltipMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tooltipMetricLabel: {
    color: '#9AA1B0',
    fontSize: 10,
    fontWeight: '600',
  },
  tooltipMetricVal: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  tooltipNetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  tooltipNetLabel: {
    color: '#888E9B',
    fontSize: 9.5,
    fontWeight: '600',
  },
  tooltipNetVal: {
    fontSize: 11,
    fontWeight: '800',
  },
  emptyChartOverlay: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  emptyChartTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C727F',
    marginTop: 6,
  },
  emptyChartSub: {
    fontSize: 10.5,
    color: '#9AA1B0',
    marginTop: 2,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
});
