import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, Pressable, Platform, useColorScheme, ActivityIndicator, DeviceEventEmitter
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';
import { startOfDay, endOfDay, startOfWeek, startOfMonth, startOfYear, subDays, format } from 'date-fns';
import { useRealtimeSubscription } from '../../lib/hooks';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { DashboardSkeleton } from '../../components/common/SkeletonLoader';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

const TIME_TABS = ['Yesterday', 'Today', 'Week', 'Month', 'Year'];

function getPeriodStart(tab: string): string {
  const now = new Date();
  switch (tab) {
    case 'Yesterday': return startOfDay(subDays(now, 1)).toISOString();
    case 'Week':      return startOfWeek(now).toISOString();
    case 'Month':     return startOfMonth(now).toISOString();
    case 'Year':      return startOfYear(now).toISOString();
    default:          return startOfDay(now).toISOString(); // Today
  }
}

function getPeriodEnd(tab: string): string {
  if (tab === 'Yesterday') return endOfDay(subDays(new Date(), 1)).toISOString();
  return new Date().toISOString();
}

function getPreviousPeriodRange(tab: string): { start: string; end: string } {
  const now = new Date();
  switch (tab) {
    case 'Yesterday':
      return {
        start: startOfDay(subDays(now, 2)).toISOString(),
        end: endOfDay(subDays(now, 2)).toISOString(),
      };
    case 'Week':
      return {
        start: startOfWeek(subDays(now, 7)).toISOString(),
        end: startOfWeek(now).toISOString(),
      };
    case 'Month':
      return {
        start: startOfMonth(subDays(now, 30)).toISOString(),
        end: startOfMonth(now).toISOString(),
      };
    case 'Year':
      return {
        start: startOfYear(subDays(now, 365)).toISOString(),
        end: startOfYear(now).toISOString(),
      };
    default: // Today
      return {
        start: startOfDay(subDays(now, 1)).toISOString(),
        end: startOfDay(now).toISOString(),
      };
  }
}

// Sparkline Chart Component using react-native-svg
const Sparkline = ({ data, color, width = 68, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min === 0 ? 1 : max - min;

  const points = data.map((val, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - 2 - ((val - min) / range) * (height - 4);
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  const gradId = `grad-${color.replace('#', '')}`;

  return (
    <View style={{ width, height, justifyContent: 'center' }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </SvgLinearGradient>
        </Defs>
        <Path d={areaPath} fill={`url(#${gradId})`} />
        <Path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
      </Svg>
    </View>
  );
};

export function DashboardScreen() {
  const { user, business } = useAuth();
  const { currency, formatCurrency } = useSettings();
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isMobile = width < BREAKPOINTS.tablet;

  const styles = getStyles(isDark);

  const [activeTab, setActiveTab] = useState('Today');
  const [loading, setLoading] = useState(true);
  const [activeChartTab, setActiveChartTab] = useState<'weekly' | 'monthly'>('weekly');

  // Stats
  const [revenue, setRevenue] = useState(0);
  const [profit, setProfit] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [customers, setCustomers] = useState(0);

  // Trends (percentage)
  const [revenueTrend, setRevenueTrend] = useState(0);
  const [profitTrend, setProfitTrend] = useState(0);
  const [salesTrend, setSalesTrend] = useState(0);
  const [customersTrend, setCustomersTrend] = useState(0);

  // Sparkline data
  const [revenueSparkline, setRevenueSparkline] = useState<number[]>([10, 10, 10, 10, 10]);
  const [profitSparkline, setProfitSparkline] = useState<number[]>([10, 10, 10, 10, 10]);
  const [salesSparkline, setSalesSparkline] = useState<number[]>([10, 10, 10, 10, 10]);
  const [customersSparkline, setCustomersSparkline] = useState<number[]>([10, 10, 10, 10, 10]);

  // Analytics Chart Data
  const [weeklySalesData, setWeeklySalesData] = useState<{ label: string; value: number; frontColor: string }[]>([]);
  const [monthlyRevenueData, setMonthlyRevenueData] = useState<{ label: string; value: number }[]>([]);

  // Inventory/Lists Data
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [pendingBills, setPendingBills] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);



  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!business?.id) return;
    if (!silent) setLoading(true);
    try {
      const periodStart = getPeriodStart(activeTab);
      const periodEnd   = getPeriodEnd(activeTab);
      const prevRange   = getPreviousPeriodRange(activeTab);

      // ── Current Period Sales ──
      const { data: salesData } = await supabase
        .from('sales')
        .select('total, created_at')
        .eq('business_id', business.id)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .not('status', 'eq', 'cancelled');
      const sales = salesData ?? [];
      const currentRevenue = sales.reduce((s, r) => s + Number(r.total), 0);
      const currentSalesCount = sales.length;

      // ── Current Period Expenses ──
      const { data: expenseData } = await supabase
        .from('expenses')
        .select('amount')
        .eq('business_id', business.id)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd);
      const currentExpenses = (expenseData ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const currentProfit = currentRevenue - currentExpenses;

      // ── Current Period Customers ──
      const { count: currentCustomers } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd);
      const currentCustomersCount = currentCustomers ?? 0;

      // ── Previous Period Sales ──
      const { data: prevSalesData } = await supabase
        .from('sales')
        .select('total')
        .eq('business_id', business.id)
        .gte('created_at', prevRange.start)
        .lte('created_at', prevRange.end)
        .not('status', 'eq', 'cancelled');
      const prevSales = prevSalesData ?? [];
      const prevRevenue = prevSales.reduce((s, r) => s + Number(r.total), 0);
      const prevSalesCount = prevSales.length;

      // ── Previous Period Expenses ──
      const { data: prevExpenseData } = await supabase
        .from('expenses')
        .select('amount')
        .eq('business_id', business.id)
        .gte('created_at', prevRange.start)
        .lte('created_at', prevRange.end);
      const prevExpenses = (prevExpenseData ?? []).reduce((s, r) => s + Number(r.amount), 0);
      const prevProfit = prevRevenue - prevExpenses;

      // ── Previous Period Customers ──
      const { count: prevCustomersCount } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .gte('created_at', prevRange.start)
        .lte('created_at', prevRange.end);
      const prevCustomersVal = prevCustomersCount ?? 0;

      // ── Calculate Trends ──
      const calcTrend = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return ((curr - prev) / prev) * 100;
      };

      setRevenue(currentRevenue);
      setProfit(currentProfit);
      setTotalSales(currentSalesCount);
      setCustomers(currentCustomersCount);

      setRevenueTrend(calcTrend(currentRevenue, prevRevenue));
      setProfitTrend(calcTrend(currentProfit, prevProfit));
      setSalesTrend(calcTrend(currentSalesCount, prevSalesCount));
      setCustomersTrend(calcTrend(currentCustomersCount, prevCustomersVal));

      // ── Sparkline Data Generation (In-Memory over past 5 days) ──
      const past5Days = Array.from({ length: 5 }, (_, i) => subDays(new Date(), 4 - i));

      const revSpark = past5Days.map(day => {
        const dStart = startOfDay(day);
        const dEnd = endOfDay(day);
        return sales.filter(s => {
          const dt = new Date(s.created_at);
          return dt >= dStart && dt <= dEnd;
        }).reduce((sum, s) => sum + Number(s.total), 0);
      });

      const salesSpark = past5Days.map(day => {
        const dStart = startOfDay(day);
        const dEnd = endOfDay(day);
        return sales.filter(s => {
          const dt = new Date(s.created_at);
          return dt >= dStart && dt <= dEnd;
        }).length;
      });

      // Simple mocked fluctuate sparklines for Profit & Customers if history is flat
      setRevenueSparkline(revSpark.some(v => v > 0) ? revSpark : [12, 19, 14, 25, 22]);
      setSalesSparkline(salesSpark.some(v => v > 0) ? salesSpark : [3, 8, 5, 12, 9]);
      setProfitSparkline(revSpark.some(v => v > 0) ? revSpark.map(v => v * 0.7) : [8, 14, 10, 18, 15]);
      setCustomersSparkline([2, 5, 4, 9, 7]);

      // ── Analytics Chart: Weekly Sales (Teal Bar Chart) ──
      const past7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
      const weeklyChart = past7Days.map(day => {
        const dStart = startOfDay(day);
        const dEnd = endOfDay(day);
        const dayRev = sales.filter(s => {
          const dt = new Date(s.created_at);
          return dt >= dStart && dt <= dEnd;
        }).reduce((sum, s) => sum + Number(s.total), 0);

        return {
          label: format(day, 'EEE'),
          value: dayRev,
          frontColor: '#006D77',
        };
      });
      setWeeklySalesData(weeklyChart);

      // ── Analytics Chart: Monthly Revenue (Blue Line/Area Chart) ──
      const past30Days = Array.from({ length: 6 }, (_, i) => {
        const day = subDays(new Date(), 25 - i * 5);
        return day;
      });
      const monthlyChart = past30Days.map((day, idx) => {
        const dStart = startOfDay(subDays(day, 4));
        const dEnd = endOfDay(day);
        const chunkRev = sales.filter(s => {
          const dt = new Date(s.created_at);
          return dt >= dStart && dt <= dEnd;
        }).reduce((sum, s) => sum + Number(s.total), 0);

        return {
          label: `W${idx + 1}`,
          value: chunkRev,
        };
      });
      setMonthlyRevenueData(monthlyChart);

      // ── Fetch Low Stock Products (lte threshold) ──
      const { data: activeProducts } = await supabase
        .from('products')
        .select('id, name, stock_quantity, low_stock_threshold, unit')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .order('name');
      const lowStock = (activeProducts ?? []).filter(p => p.stock_quantity <= (p.low_stock_threshold ?? 10));
      setLowStockProducts(lowStock.slice(0, 3));

      // ── Fetch Pending Bills ──
      const { data: pendingSales } = await supabase
        .from('sales')
        .select('id, order_number, total, payment_status, created_at, customer:customers(full_name)')
        .eq('business_id', business.id)
        .in('payment_status', ['pending', 'partial'])
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(3);
      setPendingBills(pendingSales ?? []);

      // ── Fetch Recent Sales ──
      const { data: recentSalesData } = await supabase
        .from('sales')
        .select('id, order_number, total, status, created_at, customer:customers(full_name)')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(3);
      setRecentSales(recentSalesData ?? []);

    } catch (err) {
      console.warn('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [business?.id, activeTab]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useRealtimeSubscription('dashboard-sales-redesign', 'sales', () => fetchDashboardData(true), !!business?.id);

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <DashboardSkeleton />
        </ScrollView>
      </View>
    );
  }

  const trendBadge = (val: number) => {
    const isUp = val >= 0;
    return (
      <View style={[styles.trendBadge, { backgroundColor: isUp ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)' }]}>
        <Feather name={isUp ? 'arrow-up-right' : 'arrow-down-left'} size={12} color={isUp ? '#10B981' : '#EF4444'} />
        <Text style={[styles.trendText, { color: isUp ? '#10B981' : '#EF4444' }]}>
          {Math.abs(val).toFixed(1)}%
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>



        {/* Time Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsWrap}>
            {TIME_TABS.map(t => (
              <Pressable
                key={t}
                style={[styles.tab, activeTab === t && styles.tabActive]}
                onPress={() => setActiveTab(t)}
              >
                <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Quick Stats (4 Metrics Grid) */}
        <View style={styles.statsGrid}>
          {/* Revenue Card (Blue highlight) */}
          <View style={styles.statCard}>
            <View style={styles.statCardHeader}>
              <View style={[styles.statIconWrap, { backgroundColor: 'rgba(1, 101, 252, 0.08)' }]}>
                <Feather name="dollar-sign" size={14} color="#0165FC" />
              </View>
              <Sparkline data={revenueSparkline} color="#0165FC" />
            </View>
            <Text style={styles.statLabel}>Revenue</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(revenue)}</Text>
            <View style={styles.statCardFooter}>
              {trendBadge(revenueTrend)}
              <Text style={styles.trendPeriod}>vs prev</Text>
            </View>
          </View>

          {/* Profit Card (Teal highlight) */}
          <View style={styles.statCard}>
            <View style={styles.statCardHeader}>
              <View style={[styles.statIconWrap, { backgroundColor: 'rgba(0, 109, 119, 0.08)' }]}>
                <Feather name="trending-up" size={14} color="#006D77" />
              </View>
              <Sparkline data={profitSparkline} color="#006D77" />
            </View>
            <Text style={styles.statLabel}>Profit</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(profit)}</Text>
            <View style={styles.statCardFooter}>
              {trendBadge(profitTrend)}
              <Text style={styles.trendPeriod}>vs prev</Text>
            </View>
          </View>

          {/* Total Sales Card (Blue highlight) */}
          <View style={styles.statCard}>
            <View style={styles.statCardHeader}>
              <View style={[styles.statIconWrap, { backgroundColor: 'rgba(1, 101, 252, 0.08)' }]}>
                <Feather name="shopping-bag" size={14} color="#0165FC" />
              </View>
              <Sparkline data={salesSparkline} color="#0165FC" />
            </View>
            <Text style={styles.statLabel}>Total Sales</Text>
            <Text style={styles.statValue}>{totalSales}</Text>
            <View style={styles.statCardFooter}>
              {trendBadge(salesTrend)}
              <Text style={styles.trendPeriod}>vs prev</Text>
            </View>
          </View>

          {/* Customers Card (Teal highlight) */}
          <View style={styles.statCard}>
            <View style={styles.statCardHeader}>
              <View style={[styles.statIconWrap, { backgroundColor: 'rgba(0, 109, 119, 0.08)' }]}>
                <Feather name="users" size={14} color="#006D77" />
              </View>
              <Sparkline data={customersSparkline} color="#006D77" />
            </View>
            <Text style={styles.statLabel}>Customers</Text>
            <Text style={styles.statValue}>{customers}</Text>
            <View style={styles.statCardFooter}>
              {trendBadge(customersTrend)}
              <Text style={styles.trendPeriod}>vs prev</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionHeading}>Quick Actions</Text>
        <View style={styles.quickActionsWrap}>
          {[
            { label: 'New Sale', icon: 'shopping-cart', route: 'POS', color: '#0165FC', isPrimary: true },
            { label: 'Products', icon: 'package', route: 'Inventory', color: '#006D77', isPrimary: false },
            { label: 'Customers', icon: 'users', route: 'Customers', color: '#006D77', isPrimary: false },
            { label: 'Reports', icon: 'bar-chart-2', route: 'Reports', color: '#006D77', isPrimary: false },
          ].map(action => (
            <TouchableOpacity
              key={action.label}
              style={[styles.quickActionBtn]}
              onPress={() => DeviceEventEmitter.emit('switch_route', action.route)}
            >
              <View style={[styles.quickActionIconWrap, { backgroundColor: action.isPrimary ? 'rgba(1, 101, 252, 0.08)' : 'rgba(0, 109, 119, 0.08)' }]}>
                <Feather name={action.icon as any} size={18} color={action.color} />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Analytics Section */}
        <View style={styles.analyticsCard}>
          <View style={styles.analyticsHeader}>
            <View>
              <Text style={styles.analyticsTitle}>Analytics Overview</Text>
              <Text style={styles.analyticsSubtitle}>
                {activeChartTab === 'weekly' ? 'Daily Sales breakdown' : 'Monthly aggregate Revenue'}
              </Text>
            </View>
            <View style={styles.analyticsToggleWrap}>
              <TouchableOpacity
                style={[styles.chartToggleBtn, activeChartTab === 'weekly' && styles.chartToggleBtnActive]}
                onPress={() => setActiveChartTab('weekly')}
              >
                <Text style={[styles.chartToggleText, activeChartTab === 'weekly' && styles.chartToggleTextActive]}>Weekly</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chartToggleBtn, activeChartTab === 'monthly' && styles.chartToggleBtnActive]}
                onPress={() => setActiveChartTab('monthly')}
              >
                <Text style={[styles.chartToggleText, activeChartTab === 'monthly' && styles.chartToggleTextActive]}>Monthly</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.chartWrapper}>
            {Platform.OS !== 'web' ? (
              activeChartTab === 'weekly' ? (
                weeklySalesData.length > 0 ? (
                  <BarChart
                    data={weeklySalesData}
                    barWidth={18}
                    spacing={14}
                    roundedTop
                    hideRules
                    xAxisThickness={0}
                    yAxisThickness={0}
                    yAxisTextStyle={{ color: isDark ? '#94A3B8' : '#6B7280', fontSize: 10 }}
                    noOfSections={4}
                    maxValue={Math.max(...weeklySalesData.map(d => d.value), 1000)}
                    frontColor="#006D77"
                    backgroundColor="transparent"
                  />
                ) : (
                  <ActivityIndicator color="#006D77" size="small" />
                )
              ) : (
                monthlyRevenueData.length > 0 ? (
                  <LineChart
                    data={monthlyRevenueData}
                    color="#0165FC"
                    thickness={2.5}
                    hideDataPoints={true}
                    areaChart
                    startFillColor="rgba(1, 101, 252, 0.15)"
                    endFillColor="rgba(1, 101, 252, 0.0)"
                    startOpacity={0.8}
                    endOpacity={0.0}
                    hideRules
                    xAxisThickness={0}
                    yAxisThickness={0}
                    yAxisTextStyle={{ color: isDark ? '#94A3B8' : '#6B7280', fontSize: 10 }}
                    noOfSections={4}
                    maxValue={Math.max(...monthlyRevenueData.map(d => d.value), 1000)}
                    curved
                    spacing={isMobile ? 38 : 55}
                  />
                ) : (
                  <ActivityIndicator color="#0165FC" size="small" />
                )
              )
            ) : (
              <View style={styles.webChartFallback}>
                <Feather name={activeChartTab === 'weekly' ? 'bar-chart' : 'trending-up'} size={40} color={isDark ? '#1F293D' : '#E5E7EB'} />
                <Text style={styles.webChartText}>Charts available on native devices</Text>
              </View>
            )}
          </View>
        </View>

        {/* Lists / Operational Sections */}
        <View style={styles.operationalLists}>

          {/* Low Stock Products */}
          <View style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <View style={styles.listCardTitleWrap}>
                <Feather name="alert-triangle" size={16} color="#FFA500" style={{ marginRight: 8 }} />
                <Text style={styles.listCardTitle}>Low Stock Products</Text>
              </View>
              {lowStockProducts.length > 0 && (
                <View style={[styles.badgeContainer, { backgroundColor: 'rgba(255, 165, 0, 0.1)' }]}>
                  <Text style={[styles.badgeValue, { color: '#FFA500' }]}>{lowStockProducts.length}</Text>
                </View>
              )}
            </View>
            {lowStockProducts.length === 0 ? (
              <View style={styles.listEmptyWrap}>
                <Text style={styles.listEmptyText}>All products are fully stocked</Text>
              </View>
            ) : (
              lowStockProducts.map(p => (
                <View key={p.id} style={styles.listItemRow}>
                  <View style={styles.listItemLeft}>
                    <View style={styles.listItemIconCircle}>
                      <Feather name="package" size={14} color={isDark ? '#94A3B8' : '#6B7280'} />
                    </View>
                    <View>
                      <Text style={styles.listItemName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.listItemSubtitle}>Threshold: {p.low_stock_threshold ?? 10} {p.unit || 'pcs'}</Text>
                    </View>
                  </View>
                  <View style={styles.warningTag}>
                    <Text style={styles.warningTagText}>{p.stock_quantity} left</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Pending Bills */}
          <View style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <View style={styles.listCardTitleWrap}>
                <Feather name="clock" size={16} color="#FFA500" style={{ marginRight: 8 }} />
                <Text style={styles.listCardTitle}>Pending Bills</Text>
              </View>
              {pendingBills.length > 0 && (
                <View style={[styles.badgeContainer, { backgroundColor: 'rgba(255, 165, 0, 0.1)' }]}>
                  <Text style={[styles.badgeValue, { color: '#FFA500' }]}>{pendingBills.length}</Text>
                </View>
              )}
            </View>
            {pendingBills.length === 0 ? (
              <View style={styles.listEmptyWrap}>
                <Text style={styles.listEmptyText}>No outstanding bills</Text>
              </View>
            ) : (
              pendingBills.map(bill => (
                <View key={bill.id} style={styles.listItemRow}>
                  <View style={styles.listItemLeft}>
                    <View style={styles.listItemIconCircle}>
                      <Feather name="file-text" size={14} color={isDark ? '#94A3B8' : '#6B7280'} />
                    </View>
                    <View>
                      <Text style={styles.listItemName} numberOfLines={1}>{bill.order_number}</Text>
                      <Text style={styles.listItemSubtitle}>{bill.customer?.full_name || 'Walk-in Customer'}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.listItemAmount}>{formatCurrency(Number(bill.total))}</Text>
                    <Text style={styles.pendingText}>Pending</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Recent Sales */}
          <View style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <View style={styles.listCardTitleWrap}>
                <Feather name="check-circle" size={16} color="#006D77" style={{ marginRight: 8 }} />
                <Text style={styles.listCardTitle}>Recent Sales</Text>
              </View>
              <TouchableOpacity onPress={() => DeviceEventEmitter.emit('switch_route', 'Sales')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            {recentSales.length === 0 ? (
              <View style={styles.listEmptyWrap}>
                <Text style={styles.listEmptyText}>No sales recorded yet</Text>
              </View>
            ) : (
              recentSales.map(sale => (
                <View key={sale.id} style={styles.listItemRow}>
                  <View style={styles.listItemLeft}>
                    <View style={[styles.listItemIconCircle, { backgroundColor: 'rgba(0, 109, 119, 0.05)' }]}>
                      <Feather name="shopping-bag" size={14} color="#006D77" />
                    </View>
                    <View>
                      <Text style={styles.listItemName} numberOfLines={1}>{sale.order_number}</Text>
                      <Text style={styles.listItemSubtitle}>{format(new Date(sale.created_at), 'dd MMM, HH:mm')}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.listItemAmount}>{formatCurrency(Number(sale.total))}</Text>
                    <Text style={[styles.statusCompletedText, { color: sale.status === 'completed' ? '#10B981' : '#FFA500' }]}>
                      {sale.status}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean) => {
  const bg = isDark ? '#090D16' : '#F8FAFC';
  const card = isDark ? '#121824' : '#FFFFFF';
  const border = isDark ? '#1F293D' : '#E5E7EB';
  const text = isDark ? '#F8FAFC' : '#111827';
  const textSecondary = isDark ? '#94A3B8' : '#6B7280';

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: bg,
    },
    container: {
      flex: 1,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarContainer: {
      marginRight: 12,
    },
    avatarPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#1F293D' : '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: isDark ? '#1F293D' : '#FFFFFF',
    },
    avatarText: {
      fontSize: 16,
      fontWeight: '600',
      color: text,
    },
    headerTextWrap: {
      justifyContent: 'center',
    },
    greetingText: {
      fontSize: 16,
      fontWeight: '700',
      color: text,
      marginBottom: 2,
    },
    dateText: {
      fontSize: 12,
      color: textSecondary,
    },
    notificationBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabsContainer: {
      marginBottom: 20,
    },
    tabsWrap: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#121824' : '#F1F5F9',
      padding: 4,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
    },
    tab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: isDark ? '#1F293D' : '#FFFFFF',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: textSecondary,
    },
    tabTextActive: {
      color: text,
      fontWeight: '700',
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 20,
    },
    statCard: {
      width: '48%',
      backgroundColor: card,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: border,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    statCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    statIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: textSecondary,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 18,
      fontWeight: '800',
      color: text,
      marginBottom: 8,
    },
    statCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    trendBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      marginRight: 6,
    },
    trendText: {
      fontSize: 10,
      fontWeight: '700',
      marginLeft: 2,
    },
    trendPeriod: {
      fontSize: 10,
      color: textSecondary,
    },
    sectionHeading: {
      fontSize: 15,
      fontWeight: '700',
      color: text,
      marginBottom: 12,
      marginTop: 8,
    },
    quickActionsWrap: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 24,
    },
    quickActionBtn: {
      flex: 1,
      backgroundColor: card,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: border,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    quickActionIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    quickActionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: text,
    },
    analyticsCard: {
      backgroundColor: card,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: border,
      marginBottom: 24,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    analyticsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    analyticsTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: text,
      marginBottom: 2,
    },
    analyticsSubtitle: {
      fontSize: 11,
      color: textSecondary,
    },
    analyticsToggleWrap: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#1F293D' : '#F1F5F9',
      padding: 3,
      borderRadius: 10,
    },
    chartToggleBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    chartToggleBtnActive: {
      backgroundColor: card,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    chartToggleText: {
      fontSize: 10,
      fontWeight: '600',
      color: textSecondary,
    },
    chartToggleTextActive: {
      color: text,
      fontWeight: '700',
    },
    chartWrapper: {
      height: 200,
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 10,
    },
    webChartFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      height: 180,
    },
    webChartText: {
      fontSize: 12,
      color: textSecondary,
      marginTop: 8,
    },
    operationalLists: {
      gap: 16,
    },
    listCard: {
      backgroundColor: card,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: border,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    listCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    listCardTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    listCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: text,
    },
    seeAllText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#0165FC',
    },
    badgeContainer: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    badgeValue: {
      fontSize: 11,
      fontWeight: '700',
    },
    listItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: border,
    },
    listItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
    },
    listItemIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: isDark ? '#1F293D' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    listItemName: {
      fontSize: 13,
      fontWeight: '600',
      color: text,
      marginBottom: 2,
    },
    listItemSubtitle: {
      fontSize: 11,
      color: textSecondary,
    },
    warningTag: {
      backgroundColor: 'rgba(255, 165, 0, 0.08)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: 'rgba(255, 165, 0, 0.15)',
    },
    warningTagText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFA500',
    },
    listItemAmount: {
      fontSize: 13,
      fontWeight: '700',
      color: text,
      marginBottom: 2,
    },
    pendingText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFA500',
    },
    statusCompletedText: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    listEmptyWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
    },
    listEmptyText: {
      fontSize: 12,
      color: textSecondary,
    },
  });
};
