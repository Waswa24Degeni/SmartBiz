import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, ActivityIndicator, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/common/Card';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';
import { DashboardStats } from '../../types';
import { startOfDay, startOfWeek, startOfMonth, startOfYear, subDays } from 'date-fns';
import { useRealtimeSubscription } from '../../lib/hooks';

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
  if (tab === 'Yesterday') return startOfDay(new Date()).toISOString();
  return new Date().toISOString();
}

export function DashboardScreen() {
  const { business } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const isSmallPhone = width < 390;

  const [activeTab, setActiveTab] = useState('Today');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    today_sales: 0, monthly_sales: 0, total_profit: 0,
    total_orders: 0, new_customers: 0, low_stock_count: 0, pending_invoices: 0,
  });
  const [trending, setTrending] = useState<{ name: string; orders: number }[]>([]);
  const [bestStaff, setBestStaff] = useState<{ name: string; role: string; sales: number }[]>([]);
  const [chartData, setChartData] = useState<{ labels: string[]; values: number[] }>({
    labels: ['9AM', '12PM', '3PM', '6PM', '9PM'],
    values: [0, 0, 0, 0, 0],
  });

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!business?.id) return;
    if (!silent) setLoading(true);
    try {
      const periodStart = getPeriodStart(activeTab);
      const periodEnd   = getPeriodEnd(activeTab);

      // Period sales
      const { data: salesData } = await supabase
        .from('sales')
        .select('id, total, cashier_id, created_at')
        .eq('business_id', business.id)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .not('status', 'eq', 'cancelled');

      const sales = salesData ?? [];
      const totalRevenue = sales.reduce((s, r) => s + Number(r.total), 0);

      // Monthly revenue (always current month)
      const monthStart = startOfMonth(new Date()).toISOString();
      const { data: monthData } = await supabase
        .from('sales')
        .select('total')
        .eq('business_id', business.id)
        .gte('created_at', monthStart)
        .not('status', 'eq', 'cancelled');
      const monthlySales = (monthData ?? []).reduce((s, r) => s + Number(r.total), 0);

      // New customers for period
      const { count: newCustomers } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .gte('created_at', periodStart);

      // Low stock (column-to-column compare not available via JS client — fetch & filter)
      const { data: prodData } = await supabase
        .from('products')
        .select('stock_quantity, low_stock_threshold')
        .eq('business_id', business.id)
        .eq('is_active', true);
      const lowStockCount = (prodData ?? []).filter(
        p => p.stock_quantity <= p.low_stock_threshold,
      ).length;

      // Pending invoices
      const { count: pendingInvoices } = await supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .in('payment_status', ['pending', 'overdue'])
        .not('status', 'eq', 'cancelled');

      setStats({
        today_sales: totalRevenue,
        monthly_sales: monthlySales,
        total_profit: totalRevenue * 0.3,
        total_orders: sales.length,
        new_customers: newCustomers ?? 0,
        low_stock_count: lowStockCount,
        pending_invoices: pendingInvoices ?? 0,
      });

      // Trending products from sale_items
      const saleIds = sales.map(s => s.id);
      if (saleIds.length > 0) {
        const { data: itemData } = await supabase
          .from('sale_items')
          .select('product_id, quantity, product:products(name)')
          .in('sale_id', saleIds);
        if (itemData) {
          const map = new Map<string, { name: string; orders: number }>();
          for (const it of itemData) {
            const key = it.product_id;
            const pName = (it.product as any)?.name ?? 'Unknown';
            const existing = map.get(key);
            if (existing) existing.orders += it.quantity;
            else map.set(key, { name: pName, orders: it.quantity });
          }
          setTrending(
            Array.from(map.values()).sort((a, b) => b.orders - a.orders).slice(0, 6),
          );
        }
      } else {
        setTrending([]);
      }

      // Best staff (cashiers with highest total)
      if (sales.length > 0) {
        const cashierIds = [...new Set(sales.map(s => s.cashier_id).filter(Boolean))];
        if (cashierIds.length > 0) {
          const { data: users } = await supabase
            .from('users')
            .select('id, full_name, role')
            .in('id', cashierIds);
          if (users) {
            setBestStaff(
              users.map(u => ({
                name: u.full_name,
                role: u.role === 'owner' ? 'Supervisor' : 'Cashier',
                sales: sales
                  .filter(s => s.cashier_id === u.id)
                  .reduce((sum, s) => sum + Number(s.total), 0),
              })).sort((a, b) => b.sales - a.sales),
            );
          }
        } else {
          setBestStaff([]);
        }
      } else {
        setBestStaff([]);
      }

      // Hourly chart (today buckets: 9AM, 12PM, 3PM, 6PM, 9PM)
      const now = new Date();
      const hourBuckets = [9, 12, 15, 18, 21];
      const values = hourBuckets.map(h => {
        const from = new Date(now); from.setHours(h, 0, 0, 0);
        const to   = new Date(now); to.setHours(h + 2, 59, 59, 999);
        return sales
          .filter(s => { const d = new Date(s.created_at); return d >= from && d <= to; })
          .reduce((sum, s) => sum + Number(s.total), 0);
      });
      setChartData({
        labels: ['9AM', '12PM', '3PM', '6PM', '9PM'],
        values,
      });
    } finally {
      setLoading(false);
    }
  }, [business?.id, activeTab]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  useRealtimeSubscription('dashboard-sales', 'sales', () => fetchDashboardData(true), !!business?.id);

  const chartValues = chartData.values.some(v => v > 0) ? chartData.values : [0, 0, 0, 0, 0];
  const maxChartValue = Math.max(...chartValues, 1);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
        showsVerticalScrollIndicator={false}
      >
      {/* Time selector */}
      <View style={styles.header}>
        <View style={styles.headerRight}>
          {!isMobile && (
            <View style={styles.tabsWrap}>
              {TIME_TABS.map(t => (
                <Pressable
                  key={t}
                  style={[styles.tab, activeTab === t && styles.tabActive]}
                  onPress={() => setActiveTab(t)}
                >
                  {activeTab === t && (
                    <LinearGradient
                      colors={['#14B8A6', '#0D9488']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Mobile time selector */}
      {isMobile && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.mobileTabsScroll}
          contentContainerStyle={styles.mobileTabsScrollContent}
        >
          <View style={[styles.tabsWrap, styles.tabsWrapMobile]}>
            {TIME_TABS.map(t => (
              <Pressable
                key={t}
                style={[styles.tab, styles.tabMobile, activeTab === t && styles.tabActive]}
                onPress={() => setActiveTab(t)}
              >
                {activeTab === t && (
                  <LinearGradient
                    colors={['#14B8A6', '#0D9488']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Quick stat cards */}
      <View style={[styles.quickStatsRow, isMobile && styles.quickStatsWrap]}>
        {([
          { label: 'Revenue',   value: `TZS ${stats.today_sales >= 1000 ? (stats.today_sales / 1000).toFixed(1) + 'K' : stats.today_sales.toLocaleString()}`, icon: 'cash-outline',    color: COLORS.success,  gradColors: ['#34D399', '#059669'] as const, bgTint: '#D1FAE5' },
          { label: 'Orders',    value: stats.total_orders.toString(),    icon: 'receipt-outline', color: COLORS.accent,   gradColors: ['#E8B84B', '#C49A2A'] as const, bgTint: '#FEF3C7' },
          { label: 'Customers', value: stats.new_customers.toString(),   icon: 'people-outline',  color: COLORS.primary,  gradColors: ['#14B8A6', '#0D9488'] as const, bgTint: '#D1FAE5' },
          { label: 'Low Stock', value: stats.low_stock_count.toString(), icon: 'warning-outline', color: COLORS.warning,  gradColors: ['#FBB960', '#D97706'] as const, bgTint: '#FEF3C7' },
        ] as const).map(s => (
          <View
            key={s.label}
            style={[styles.quickStatCard, isMobile && styles.quickStatCardMobile, isSmallPhone && styles.quickStatCardSmallPhone]}
          >
            <LinearGradient
              colors={[s.bgTint + 'CC', s.bgTint + '66']}
              style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.lg }]}
            />
            <View style={[styles.quickStatIcon]}>
              <LinearGradient
                colors={[s.gradColors[0], s.gradColors[1]]}
                style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
              />
              <Ionicons name={s.icon as any} size={19} color={COLORS.white} />
            </View>
            <Text
              style={[styles.quickStatValue, isSmallPhone && styles.quickStatValueSmallPhone]}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {s.value}
            </Text>
            <Text
              style={[styles.quickStatLabel, isSmallPhone && styles.quickStatLabelSmall, { color: s.color }]}
            >
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Charts row */}
      <View style={[styles.chartsRow, isMobile && styles.chartsCol]}>
        {/* Sales activity chart */}
        <Card style={styles.chartCard} title={`Sales Activity`} subtitle={activeTab}>
          <View style={[styles.nativeChartWrap, isMobile && styles.nativeChartWrapMobile]}>
            {chartValues.map((value, i) => {
              const h = Math.max(8, Math.round((value / maxChartValue) * (isMobile ? 96 : 120)));
              return (
                <View key={`${chartData.labels[i]}-${i}`} style={styles.nativeChartCol}>
                  <LinearGradient
                    colors={['#14B8A6', '#0D9488']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.nativeChartBar, { height: h }]}
                  />
                  <Text style={[styles.nativeChartLabel, isSmallPhone && styles.nativeChartLabelSmall]}>{chartData.labels[i]}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Revenue summary — desktop only */}
        {!isMobile && (
          <Card style={styles.revenueCard} title="Period Summary">
            <View style={styles.revenueCircle}>
              <LinearGradient
                colors={['#14B8A6', '#0D9488']}
                style={[StyleSheet.absoluteFill, { borderRadius: 70 }]}
              />
              <Text style={styles.revenueAmount}>
                {stats.today_sales >= 1000
                  ? `TZS ${Math.round(stats.today_sales / 1000)}K`
                  : `TZS ${stats.today_sales.toLocaleString()}`}
              </Text>
              <Text style={styles.revenuePeriod}>{activeTab}</Text>
            </View>
            <View style={styles.revenueLegend}>
              {[
                { label: 'Period Revenue', color: COLORS.success, value: `TZS ${stats.today_sales.toLocaleString()}` },
                { label: 'Monthly Total',  color: COLORS.primary, value: `TZS ${stats.monthly_sales.toLocaleString()}` },
                { label: 'Pending',        color: COLORS.warning, value: `${stats.pending_invoices} invoices` },
              ].map(l => (
                <View key={l.label} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                  <Text style={styles.legendText}>{l.label}</Text>
                  <Text style={styles.legendVal}>{l.value}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Stat mini-cards — desktop only */}
        {!isMobile && (
          <View style={styles.statsCol}>
            <Card style={styles.statCard} accent={COLORS.error}>
              <Text style={styles.statLabel}>Total Orders</Text>
              <Text style={styles.statValue}>{stats.total_orders}</Text>
            </Card>
            <Card style={styles.statCard} accent={COLORS.accent}>
              <Text style={styles.statLabel}>Customers</Text>
              <Text style={styles.statValue}>{stats.new_customers}</Text>
            </Card>
          </View>
        )}
      </View>

      {/* Bottom tables */}
      <View style={[styles.tablesRow, isMobile && styles.tablesCol]}>
        {/* Best staff */}
        <Card style={styles.tableCard} title="Best Staff" subtitle="Performance this period">
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeadText, { flex: 2 }]}>Name</Text>
            <Text style={styles.tableHeadText}>Revenue</Text>
          </View>
          {bestStaff.length === 0 ? (
            <Text style={styles.emptyText}>No data for this period</Text>
          ) : bestStaff.map((emp, i) => (
            <View key={i} style={[styles.tableRow, isMobile && styles.tableRowMobile]}>
              <View style={[styles.empAvatar, isSmallPhone && styles.empAvatarSmall]}>
                <Text style={styles.empAvatarText}>{emp.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.empName}>{emp.name}</Text>
                <Text style={styles.empRole}>{emp.role}</Text>
              </View>
              <View style={styles.salesBadge}>
                <Text style={styles.salesBadgeText} adjustsFontSizeToFit minimumFontScale={0.85}>TZS {emp.sales >= 1000 ? (emp.sales / 1000).toFixed(1) + 'K' : emp.sales.toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Trending products */}
        <Card style={styles.tableCard} title="Trending Products" subtitle="Top sellers this period">
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeadText, { flex: 2 }]}>Item</Text>
            <Text style={styles.tableHeadText}>Sold</Text>
          </View>
          {trending.length === 0 ? (
            <Text style={styles.emptyText}>No data for this period</Text>
          ) : trending.map((dish, i) => (
            <View key={i} style={[styles.tableRow, isMobile && styles.tableRowMobile]}>
              <View style={[styles.rankBadge, i === 0 && styles.rankBadgeGold, i === 1 && styles.rankBadgeSilver]}>
                <Text style={[styles.rankText, (i === 0 || i === 1) && { color: COLORS.white }]}>#{i + 1}</Text>
              </View>
              <Text style={[styles.empName, { flex: 2 }]}>{dish.name}</Text>
              <Text style={styles.empSales}>{dish.orders}</Text>
            </View>
          ))}
        </Card>
      </View>
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING['3xl'] },
  contentMobile: { paddingHorizontal: SPACING.base, paddingTop: SPACING.sm, paddingBottom: SPACING['2xl'] },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.lg, flexWrap: 'wrap', gap: SPACING.sm,
  },
  headerTitle: { fontSize: FONTS.sizes['2xl'], fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  headerSub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
  tabsWrap: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.xs,
  },
  tabsWrapMobile: {
    padding: 2,
  },
  mobileTabsScroll: {
    marginBottom: SPACING.md,
  },
  mobileTabsScrollContent: {
    paddingRight: SPACING.base,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.md - 2,
    overflow: 'hidden',
    position: 'relative',
  },
  tabMobile: {
    paddingHorizontal: SPACING.sm + 2,
  },
  tabActive: {},
  tabText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '500', position: 'relative', zIndex: 1 },
  tabTextActive: { color: COLORS.white, fontWeight: '700' },
  // Quick stats
  quickStatsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  quickStatsWrap: { flexWrap: 'wrap', rowGap: SPACING.md, columnGap: SPACING.xs, justifyContent: 'space-between' },
  quickStatCard: {
    flex: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    marginBottom: 0,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.sm,
  } as any,
  quickStatCardMobile: { flex: undefined, width: '49%', marginBottom: 0, padding: SPACING.sm + 2 },
  quickStatCardSmallPhone: { width: '48.5%' },
  quickStatIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  quickStatValue: { fontSize: FONTS.sizes.xl, lineHeight: 24, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5, flexShrink: 1 },
  quickStatValueSmallPhone: { fontSize: FONTS.sizes.lg, lineHeight: 22 },
  quickStatLabel: { fontSize: FONTS.sizes.sm, lineHeight: 16, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 1 },
  quickStatLabelSmall: { fontSize: 11, lineHeight: 14 },
  // Charts
  chartsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  chartsCol: { flexDirection: 'column' },
  chartCard: { flex: 2, minWidth: 0 },
  nativeChartWrap: {
    height: 160,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
    gap: SPACING.sm,
  },
  nativeChartWrapMobile: {
    height: 132,
    gap: SPACING.xs,
    paddingHorizontal: 2,
  },
  nativeChartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  nativeChartBar: {
    width: '90%',
    maxWidth: 28,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 8,
  },
  nativeChartLabel: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 14,
    color: COLORS.textSecondary,
  },
  nativeChartLabelSmall: { fontSize: 10, lineHeight: 13, marginTop: 4 },
  revenueCard: { width: 210 },
  revenueCircle: {
    width: 130, height: 130, borderRadius: 65,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    marginVertical: SPACING.md, overflow: 'hidden', position: 'relative',
    ...SHADOWS.md,
  } as any,
  revenueAmount: { fontSize: FONTS.sizes.sm, fontWeight: '800', color: COLORS.white, textAlign: 'center', position: 'relative', zIndex: 1 },
  revenuePeriod: { fontSize: FONTS.sizes.xs, color: 'rgba(255,255,255,0.7)', position: 'relative', zIndex: 1 },
  revenueLegend: { gap: SPACING.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: SPACING.xs },
  legendText: { fontSize: FONTS.sizes.sm, lineHeight: 16, color: COLORS.textSecondary, flex: 1 },
  legendVal: { fontSize: FONTS.sizes.sm, lineHeight: 16, color: COLORS.text, fontWeight: '700' },
  statsCol: { width: 160, gap: SPACING.md },
  statCard: { marginBottom: 0 },
  statLabel: { fontSize: FONTS.sizes.sm, lineHeight: 16, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: SPACING.xs },
  statValue: { fontSize: FONTS.sizes['3xl'], fontWeight: '800', color: COLORS.text, letterSpacing: -1 },
  // Tables
  tablesRow: { flexDirection: 'row', gap: SPACING.md },
  tablesCol: { flexDirection: 'column' },
  tableCard: { flex: 1 },
  tableHeader: { flexDirection: 'row', marginBottom: SPACING.sm, paddingBottom: SPACING.xs, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableHeadText: { fontSize: FONTS.sizes.sm, lineHeight: 16, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  tableRowMobile: { paddingVertical: SPACING.xs + 2 },
  empAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primary + '20', alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.primary + '30' },
  empAvatarSmall: { width: 30, height: 30, borderRadius: 15, marginRight: SPACING.xs },
  empAvatarText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  empName: { fontSize: FONTS.sizes.sm, lineHeight: 17, color: COLORS.text, fontWeight: '600', flexShrink: 1 },
  empRole: { fontSize: 11, lineHeight: 14, color: COLORS.textSecondary },
  empSales: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  salesBadge: { minWidth: 74, backgroundColor: COLORS.successLight, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  salesBadgeText: { fontSize: 11, lineHeight: 14, color: COLORS.success, fontWeight: '700' },
  rankBadge: { width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm },
  rankBadgeGold: { backgroundColor: COLORS.accent },
  rankBadgeSilver: { backgroundColor: COLORS.textMuted },
  rankText: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: COLORS.textSecondary },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.lg },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.24)',
    zIndex: 20,
    elevation: 20,
  },
});
