import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { COLORS, FONTS, SPACING, RADIUS, BREAKPOINTS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';

type PeriodTab = 'Today' | 'Week' | 'Month' | 'Year';
type SectionTab = 'Subscriptions' | 'By Business';



interface PaymentRow {
  id: string;
  business_id: string;
  business_name: string;
  payment_type: string;
  amount: number;
  payer_phone: string | null;
  status: string;
  initiated_at: string;
  metadata?: { plan?: string } | null;
}



interface SubscriptionStats {
  totalRevenue: number;
  completedRevenue: number;
  pendingRevenue: number;
  totalTransactions: number;
  byPlan: { plan: string; amount: number; count: number }[];
}

const PERIOD_TABS: PeriodTab[] = ['Today', 'Week', 'Month', 'Year'];
const SECTION_TABS: SectionTab[] = ['Subscriptions', 'By Business'];

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

const STATUS_COLORS: Record<string, string> = {
  completed: COLORS.success,
  paid: COLORS.success,
  pending: COLORS.warning,
  failed: COLORS.error,
  expired: COLORS.textMuted,
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
  const [sectionTab, setSectionTab] = useState<SectionTab>('Subscriptions');
  const [loading, setLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [payRows, setPayRows] = useState<PaymentRow[]>([]);
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;


  const fetchPayments = useCallback(async () => {
    setPayLoading(true);
    const fromDate = getFromDate(tab);
    const { data, error } = await supabase
      .from('payments')
      .select('id, business_id, payment_type, amount, payer_phone, status, initiated_at, metadata, business:businesses(name)')
      .eq('payment_type', 'subscription')
      .gte('initiated_at', fromDate.toISOString())
      .order('initiated_at', { ascending: false })
      .limit(1200);

    if (error) {
      console.error('[AdminRevenue] payments fetch error:', error);
      setFetchError(prev => prev ?? error.message);
      setPayRows([]);
      setPayLoading(false);
      return;
    }

    setPayRows(
      (data ?? []).map((row: any) => ({
        id: row.id,
        business_id: row.business_id,
        business_name: row.business?.name ?? 'Unknown Business',
        payment_type: row.payment_type,
        amount: Number(row.amount) || 0,
        payer_phone: row.payer_phone,
        status: row.status,
        initiated_at: row.initiated_at,
        metadata: row.metadata ?? null,
      }))
    );
    setPayLoading(false);
  }, [tab]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useRealtimeSubscription('admin-revenue-payments', 'payments', fetchPayments);



  const subStats: SubscriptionStats = useMemo(() => {
    const completedRows = payRows.filter(row => row.status === 'completed' || row.status === 'paid');
    const pendingRows = payRows.filter(row => row.status === 'pending');
    const planMap: Record<string, { plan: string; amount: number; count: number }> = {};

    for (const row of completedRows) {
      const plan = row.metadata?.plan ?? 'subscription';
      if (!planMap[plan]) {
        planMap[plan] = { plan, amount: 0, count: 0 };
      }
      planMap[plan].amount += row.amount;
      planMap[plan].count += 1;
    }

    return {
      totalRevenue: payRows.reduce((sum, row) => sum + row.amount, 0),
      completedRevenue: completedRows.reduce((sum, row) => sum + row.amount, 0),
      pendingRevenue: pendingRows.reduce((sum, row) => sum + row.amount, 0),
      totalTransactions: payRows.length,
      byPlan: Object.values(planMap).sort((a, b) => b.amount - a.amount),
    };
  }, [payRows]);

  const businessSummaries = useMemo(() => {
    const summaryMap: Record<string, {
      business_id: string;
      name: string;
      subTotal: number;
      subCount: number;
    }> = {};

    for (const row of payRows) {
      const businessId = row.business_id;
      if (!summaryMap[businessId]) {
        summaryMap[businessId] = {
          business_id: businessId,
          name: row.business_name,
          subTotal: 0,
          subCount: 0,
        };
      }
      summaryMap[businessId].name = summaryMap[businessId].name || row.business_name;
      summaryMap[businessId].subTotal += row.amount;
      summaryMap[businessId].subCount += 1;
    }

    return Object.values(summaryMap).sort((a, b) => b.subTotal - a.subTotal);
  }, [payRows]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, isMobile && styles.containerMobile]}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.tabsRow, isMobile && styles.tabsRowMobile]}>
        {PERIOD_TABS.map(period => (
          <TouchableOpacity
            key={period}
            style={[styles.tabBtn, tab === period && styles.tabBtnActive]}
            onPress={() => setTab(period)}
          >
            <Text style={[styles.tabText, tab === period && styles.tabTextActive]}>{period}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.tabsRow, isMobile && styles.tabsRowMobile]}>
        {SECTION_TABS.map(section => (
          <TouchableOpacity
            key={section}
            style={[styles.sectionBtn, sectionTab === section && styles.sectionBtnActive]}
            onPress={() => setSectionTab(section)}
          >
            <Text style={[styles.sectionText, sectionTab === section && styles.sectionTextActive]}>{section}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {fetchError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={34} color={COLORS.error} />
          <Text style={styles.errorTitle}>Unable to load revenue analytics</Text>
          <Text style={styles.errorMsg}>{fetchError}</Text>
          <Text style={styles.errorHint}>Run scripts/fix-admin-rls.sql and ensure admin has select access to sales and payments.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchPayments()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>


          {sectionTab === 'Subscriptions' && (
            <>
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: COLORS.infoLight }]}>
                    <Ionicons name="wallet-outline" size={18} color={COLORS.info} />
                  </View>
                  <Text style={styles.metricLabel}>Total Plan Revenue</Text>
                  <Text style={styles.metricValue}>TZS {subStats.totalRevenue.toLocaleString()}</Text>
                </View>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: COLORS.successLight }]}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} />
                  </View>
                  <Text style={styles.metricLabel}>Confirmed</Text>
                  <Text style={styles.metricValue}>TZS {subStats.completedRevenue.toLocaleString()}</Text>
                </View>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: COLORS.warningLight }]}>
                    <Ionicons name="hourglass-outline" size={18} color={COLORS.warning} />
                  </View>
                  <Text style={styles.metricLabel}>Pending</Text>
                  <Text style={styles.metricValue}>TZS {subStats.pendingRevenue.toLocaleString()}</Text>
                </View>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: COLORS.accent + '20' }]}>
                    <Ionicons name="swap-horizontal-outline" size={18} color={COLORS.accent} />
                  </View>
                  <Text style={styles.metricLabel}>Transactions</Text>
                  <Text style={styles.metricValue}>{subStats.totalTransactions.toLocaleString()}</Text>
                </View>
              </View>

              {subStats.byPlan.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Revenue by Plan</Text>
                  <Text style={styles.cardSubtitle}>Confirmed subscription payments</Text>
                  <View style={[styles.row, isMobile && styles.rowMobile]}>
                    {subStats.byPlan.map(plan => (
                      <View key={plan.plan} style={styles.planStatCard}>
                        <Text style={styles.planStatName}>{plan.plan.charAt(0).toUpperCase() + plan.plan.slice(1)}</Text>
                        <Text style={styles.planStatAmount}>TZS {plan.amount.toLocaleString()}</Text>
                        <Text style={styles.planStatCount}>{plan.count} payments</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>All Plan Payment Transactions</Text>
                <Text style={styles.cardSubtitle}>{payRows.length} transactions in period</Text>
                {payLoading ? (
                  <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.base }} />
                ) : payRows.length === 0 ? (
                  <Text style={styles.emptyText}>No subscription payments in this period</Text>
                ) : isMobile ? payRows.map(row => (
                  <View key={row.id} style={styles.mobileTxCard}>
                    <View style={styles.mobileTxHead}>
                      <Text style={styles.mobileTxTitle}>{row.business_name}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[row.status] ?? COLORS.textMuted) + '22' }]}> 
                        <Text style={[styles.statusText, { color: STATUS_COLORS[row.status] ?? COLORS.textMuted }]}>{row.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.mobileTxMeta}>Plan: {row.metadata?.plan ?? row.payment_type}</Text>
                    <Text style={styles.mobileTxAmount}>TZS {row.amount.toLocaleString()}</Text>
                    <Text style={styles.mobileTxMeta}>Phone: {row.payer_phone ?? '—'}</Text>
                    <Text style={styles.mobileTxMeta}>{format(new Date(row.initiated_at), 'dd MMM yy, HH:mm')}</Text>
                  </View>
                )) : (
                  <>
                    <View style={[styles.txRow, styles.txHead]}>
                      <Text style={[styles.txCell, { flex: 1.6 }]}>Business</Text>
                      <Text style={[styles.txCell, { flex: 0.8 }]}>Plan</Text>
                      <Text style={[styles.txCell, { flex: 1 }]}>Amount</Text>
                      <Text style={[styles.txCell, { flex: 1 }]}>Phone</Text>
                      <Text style={[styles.txCell, { flex: 0.9 }]}>Status</Text>
                      <Text style={[styles.txCell, { flex: 1.2 }]}>Date</Text>
                    </View>
                    {payRows.map(row => (
                      <View key={row.id} style={styles.txRow}>
                        <Text style={[styles.txCell, { flex: 1.6 }]} numberOfLines={1}>{row.business_name}</Text>
                        <Text style={[styles.txCell, { flex: 0.8, textTransform: 'capitalize' }]}>{row.metadata?.plan ?? row.payment_type}</Text>
                        <Text style={[styles.txCell, { flex: 1, fontWeight: '700', color: COLORS.text }]}>TZS {row.amount.toLocaleString()}</Text>
                        <Text style={[styles.txCell, { flex: 1 }]} numberOfLines={1}>{row.payer_phone ?? '—'}</Text>
                        <View style={{ flex: 0.9, justifyContent: 'center' }}>
                          <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[row.status] ?? COLORS.textMuted) + '22' }]}> 
                            <Text style={[styles.statusText, { color: STATUS_COLORS[row.status] ?? COLORS.textMuted }]}>{row.status}</Text>
                          </View>
                        </View>
                        <Text style={[styles.txCell, { flex: 1.2 }]} numberOfLines={1}>{format(new Date(row.initiated_at), 'dd MMM yy, HH:mm')}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            </>
          )}

          {sectionTab === 'By Business' && (
            <>
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: COLORS.successLight }]}>
                    <Ionicons name="storefront-outline" size={18} color={COLORS.success} />
                  </View>
                  <Text style={styles.metricLabel}>Subscribed Businesses</Text>
                  <Text style={styles.metricValue}>{businessSummaries.length.toLocaleString()}</Text>
                </View>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: COLORS.accent + '20' }]}>
                    <Ionicons name="card-outline" size={18} color={COLORS.accent} />
                  </View>
                  <Text style={styles.metricLabel}>Total Plan Fees</Text>
                  <Text style={styles.metricValue}>TZS {businessSummaries.reduce((sum, item) => sum + item.subTotal, 0).toLocaleString()}</Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Plan Payments per Business</Text>
                <Text style={styles.cardSubtitle}>Total subscription payments combined</Text>
                {businessSummaries.length === 0 ? (
                  <Text style={styles.emptyText}>No data for this period</Text>
                ) : isMobile ? businessSummaries.map(item => (
                  <View key={item.business_id} style={styles.mobileTxCard}>
                    <Text style={styles.mobileTxTitle}>{item.name}</Text>
                    <Text style={styles.mobileTxMeta}>Plan fees: TZS {Math.round(item.subTotal).toLocaleString()} ({item.subCount} subs)</Text>
                  </View>
                )) : (
                  <>
                    <View style={[styles.txRow, styles.txHead]}>
                      <Text style={[styles.txCell, { flex: 2 }]}>Business</Text>
                      <Text style={[styles.txCell, { flex: 1.5 }]}>Plan Fees</Text>
                      <Text style={[styles.txCell, { flex: 1 }]}>Sub Count</Text>
                    </View>
                    {businessSummaries.map((item, index) => (
                      <View key={item.business_id} style={[styles.txRow, index % 2 === 1 && styles.txRowAlt]}>
                        <Text style={[styles.txCell, { flex: 2, color: COLORS.text, fontWeight: '600' }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.txCell, { flex: 1.5 }]}>{item.subTotal > 0 ? `TZS ${item.subTotal.toLocaleString()}` : '—'}</Text>
                        <Text style={[styles.txCell, { flex: 1 }]}>{item.subCount > 0 ? item.subCount : '—'}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            </>
          )}
        </>
      )}
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1, backgroundColor: COLORS.background },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.24)',
    zIndex: 20,
    elevation: 20,
  },
  container: { padding: SPACING.xl, gap: SPACING.base },
  containerMobile: { padding: SPACING.base },

  tabsRow: { flexDirection: 'row', gap: SPACING.xs },
  tabsRowMobile: { flexWrap: 'wrap' },
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

  sectionBtn: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionBtnActive: { backgroundColor: COLORS.accent + '18', borderColor: COLORS.accent },
  sectionText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '600' },
  sectionTextActive: { color: COLORS.accentDark },

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
  rowMobile: { flexDirection: 'column' },
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

  planStatCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    gap: 6,
  },
  planStatName: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '700' },
  planStatAmount: { fontSize: FONTS.sizes.md, color: COLORS.primary, fontWeight: '700' },
  planStatCount: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
  },
  txHead: { paddingTop: 0 },
  txRowAlt: { backgroundColor: COLORS.surfaceAlt },
  txCell: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },

  mobileTxCard: {
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    marginBottom: SPACING.sm,
    gap: 6,
  },
  mobileTxHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  mobileTxTitle: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '700' },
  mobileTxMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  mobileTxAmount: { fontSize: FONTS.sizes.base, color: COLORS.primary, fontWeight: '700' },

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
