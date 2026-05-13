import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { COLORS, FONTS, SPACING, RADIUS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';

type PeriodTab = 'Today' | 'Week' | 'Month' | 'Year';

interface RevenueRow {
  id: string;
  business_id: string;
  total: number;
  payment_status: string;
  payment_method: string;
  created_at: string;
  businesses?: { name: string }[] | null;
}

interface RevenueStats {
  grossRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  totalSales: number;
  avgOrderValue: number;
  topBusinesses: { name: string; amount: number; count: number }[];
  paymentMix: { method: string; amount: number; count: number }[];
  recentPayments: RevenueRow[];
  chartSeries: { day: string; amount: number }[];
}

const TABS: PeriodTab[] = ['Today', 'Week', 'Month', 'Year'];

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  bank_card: 'Card',
  credit: 'Credit',
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: COLORS.success,
  mobile_money: COLORS.info,
  bank_card: COLORS.accent,
  credit: COLORS.warning,
};

function getFromDate(tab: PeriodTab): Date {
  const now = new Date();
  if (tab === 'Today') return subDays(now, 1);
  if (tab === 'Week') return subDays(now, 7);
  if (tab === 'Month') return subDays(now, 30);
  return subDays(now, 365);
}

export function AdminRevenueScreen() {
  const [tab, setTab] = useState<PeriodTab>('Month');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rows, setRows] = useState<RevenueRow[]>([]);

  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const fromDate = getFromDate(tab);
    const { data, error } = await supabase
      .from('sales')
      .select('id, business_id, total, payment_status, payment_method, created_at, businesses(name)')
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(1200);

    if (error) {
      console.error('[AdminRevenue] fetch error:', error);
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    setRows((data as unknown as RevenueRow[]) ?? []);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  // realtime refresh when sales change
  useRealtimeSubscription('admin-revenue-sales', 'sales', fetchRevenue);

  const stats: RevenueStats = useMemo(() => {
    const grossRevenue = rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
    const paidRows = rows.filter(r => r.payment_status === 'paid');
    const paidRevenue = paidRows.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
    const pendingRevenue = rows
      .filter(r => r.payment_status !== 'paid')
      .reduce((sum, r) => sum + (Number(r.total) || 0), 0);

    const totalSales = rows.length;
    const avgOrderValue = totalSales ? grossRevenue / totalSales : 0;

    const byBusiness: Record<string, { name: string; amount: number; count: number }> = {};
    const byMethod: Record<string, { method: string; amount: number; count: number }> = {};
    const byDay: Record<string, number> = {};

    for (const r of rows) {
      const amount = Number(r.total) || 0;
      const bizName = r.businesses?.[0]?.name ?? 'Unknown Business';
      if (!byBusiness[r.business_id]) {
        byBusiness[r.business_id] = { name: bizName, amount: 0, count: 0 };
      }
      byBusiness[r.business_id].amount += amount;
      byBusiness[r.business_id].count += 1;

      const method = r.payment_method ?? 'cash';
      if (!byMethod[method]) {
        byMethod[method] = { method, amount: 0, count: 0 };
      }
      byMethod[method].amount += amount;
      byMethod[method].count += 1;

      const dayKey = format(new Date(r.created_at), tab === 'Year' ? 'MMM yyyy' : 'dd MMM');
      byDay[dayKey] = (byDay[dayKey] ?? 0) + amount;
    }

    const topBusinesses = Object.values(byBusiness)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const paymentMix = Object.values(byMethod).sort((a, b) => b.amount - a.amount);

    const chartSeries = Object.entries(byDay)
      .map(([day, amount]) => ({ day, amount }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-10);

    return {
      grossRevenue,
      paidRevenue,
      pendingRevenue,
      totalSales,
      avgOrderValue,
      topBusinesses,
      paymentMix,
      recentPayments: rows.slice(0, 8),
      chartSeries,
    };
  }, [rows, tab]);

  const chartMax = Math.max(...stats.chartSeries.map(s => s.amount), 1);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.tabsRow}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.xl }} />
      ) : fetchError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={34} color={COLORS.error} />
          <Text style={styles.errorTitle}>Unable to load revenue analytics</Text>
          <Text style={styles.errorMsg}>{fetchError}</Text>
          <Text style={styles.errorHint}>Run scripts/fix-admin-rls.sql and ensure admin has select access to sales.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchRevenue}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <View style={[styles.metricIcon, { backgroundColor: COLORS.successLight }]}>
                <Ionicons name="cash-outline" size={18} color={COLORS.success} />
              </View>
              <Text style={styles.metricLabel}>Gross Revenue</Text>
              <Text style={styles.metricValue}>TZS {stats.grossRevenue.toLocaleString()}</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={[styles.metricIcon, { backgroundColor: COLORS.infoLight }]}>
                <Ionicons name="checkmark-done-outline" size={18} color={COLORS.info} />
              </View>
              <Text style={styles.metricLabel}>Paid Revenue</Text>
              <Text style={styles.metricValue}>TZS {stats.paidRevenue.toLocaleString()}</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={[styles.metricIcon, { backgroundColor: COLORS.warningLight }]}>
                <Ionicons name="time-outline" size={18} color={COLORS.warning} />
              </View>
              <Text style={styles.metricLabel}>Pending Revenue</Text>
              <Text style={styles.metricValue}>TZS {stats.pendingRevenue.toLocaleString()}</Text>
            </View>

            <View style={styles.metricCard}>
              <View style={[styles.metricIcon, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="receipt-outline" size={18} color={COLORS.accent} />
              </View>
              <Text style={styles.metricLabel}>Avg Order Value</Text>
              <Text style={styles.metricValue}>TZS {Math.round(stats.avgOrderValue).toLocaleString()}</Text>
              <Text style={styles.metricSmall}>{stats.totalSales.toLocaleString()} sales</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.card, { flex: 1.4 }]}> 
              <Text style={styles.cardTitle}>Revenue Trend</Text>
              <Text style={styles.cardSubtitle}>Last {stats.chartSeries.length} intervals</Text>
              <View style={styles.chartWrap}>
                {stats.chartSeries.length === 0 ? (
                  <Text style={styles.emptyText}>No data for selected period</Text>
                ) : (
                  <View style={styles.barRow}>
                    {stats.chartSeries.map((p) => {
                      const height = Math.max(8, Math.round((p.amount / chartMax) * 120));
                      return (
                        <View key={p.day} style={styles.barCol}>
                          <View style={[styles.bar, { height }]} />
                          <Text style={styles.barLabel} numberOfLines={1}>{p.day}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            <View style={[styles.card, { flex: 1 }]}> 
              <Text style={styles.cardTitle}>Payment Mix</Text>
              <Text style={styles.cardSubtitle}>By payment method</Text>
              {stats.paymentMix.length === 0 ? (
                <Text style={styles.emptyText}>No payments yet</Text>
              ) : stats.paymentMix.map(p => (
                <View key={p.method} style={styles.mixRow}>
                  <View style={styles.mixLeft}>
                    <View style={[styles.mixDot, { backgroundColor: PAYMENT_COLORS[p.method] ?? COLORS.textMuted }]} />
                    <Text style={styles.mixLabel}>{PAYMENT_LABELS[p.method] ?? p.method}</Text>
                  </View>
                  <View>
                    <Text style={styles.mixValue}>TZS {Math.round(p.amount).toLocaleString()}</Text>
                    <Text style={styles.mixCount}>{p.count} txns</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.card, { flex: 1 }]}> 
              <Text style={styles.cardTitle}>Top Businesses</Text>
              <Text style={styles.cardSubtitle}>Highest revenue contributors</Text>
              {stats.topBusinesses.length === 0 ? (
                <Text style={styles.emptyText}>No business revenue yet</Text>
              ) : stats.topBusinesses.map((b, idx) => (
                <View key={`${b.name}-${idx}`} style={styles.listRow}>
                  <View style={styles.rankBadge}><Text style={styles.rankText}>{idx + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bizName} numberOfLines={1}>{b.name}</Text>
                    <Text style={styles.bizMeta}>{b.count} sales</Text>
                  </View>
                  <Text style={styles.bizAmount}>TZS {Math.round(b.amount).toLocaleString()}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.card, { flex: 1.25 }]}> 
              <Text style={styles.cardTitle}>Recent Payments</Text>
              <Text style={styles.cardSubtitle}>Live from sales stream</Text>
              {stats.recentPayments.length === 0 ? (
                <Text style={styles.emptyText}>No recent payments</Text>
              ) : stats.recentPayments.map((r) => (
                <View key={r.id} style={styles.paymentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paymentBiz} numberOfLines={1}>{r.businesses?.[0]?.name ?? 'Unknown Business'}</Text>
                    <Text style={styles.paymentMeta}>
                      {format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')} • {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.paymentAmount}>TZS {Math.round(Number(r.total) || 0).toLocaleString()}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: r.payment_status === 'paid' ? COLORS.successLight : COLORS.warningLight }]}>
                      <Text style={[styles.statusText, { color: r.payment_status === 'paid' ? COLORS.success : COLORS.warning }]}> 
                        {r.payment_status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: SPACING.xl, gap: SPACING.base },

  tabsRow: { flexDirection: 'row', gap: SPACING.xs },
  tabBtn: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.white, fontWeight: '600' },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.base },
  metricCard: {
    flex: 1,
    minWidth: 170,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    gap: 4,
  },
  metricIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  metricLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: '700' },
  metricValue: { fontSize: FONTS.sizes.lg, color: COLORS.text, fontWeight: '700' },
  metricSmall: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },

  row: { flexDirection: 'row', gap: SPACING.base, flexWrap: 'wrap' },
  card: {
    minWidth: 280,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
  },
  cardTitle: { fontSize: FONTS.sizes.base, color: COLORS.text, fontWeight: '700' },
  cardSubtitle: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2, marginBottom: SPACING.sm },

  chartWrap: { minHeight: 180, justifyContent: 'flex-end' },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  barCol: { flex: 1, alignItems: 'center' },
  bar: { width: '100%', maxWidth: 28, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: COLORS.primary },
  barLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 6 },

  mixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
  },
  mixLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mixDot: { width: 10, height: 10, borderRadius: 5 },
  mixLabel: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  mixValue: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '700', textAlign: 'right' },
  mixCount: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, textAlign: 'right' },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
    gap: SPACING.xs,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.primary },
  bizName: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '600' },
  bizMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  bizAmount: { fontSize: FONTS.sizes.sm, color: COLORS.success, fontWeight: '700' },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
  },
  paymentBiz: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '600' },
  paymentMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  paymentAmount: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '700' },
  statusBadge: { marginTop: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full },
  statusText: { fontSize: FONTS.sizes.xs, textTransform: 'capitalize', fontWeight: '600' },

  emptyText: { textAlign: 'center', color: COLORS.textMuted, fontSize: FONTS.sizes.sm, paddingVertical: SPACING.lg },
  errorBox: { alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.xs },
  errorTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.error },
  errorMsg: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', fontFamily: 'monospace' },
  errorHint: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, textAlign: 'center' },
  retryBtn: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  retryBtnText: { color: COLORS.white, fontWeight: '700' },
});
