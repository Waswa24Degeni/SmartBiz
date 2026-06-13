import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, BREAKPOINTS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { useRealtimeSubscription } from '../../lib/hooks';

const TIME_TABS = ['Today', 'Week', 'Month', 'Year'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:   { bg: COLORS.successLight, text: COLORS.success },
  trial:    { bg: COLORS.warningLight, text: COLORS.warning },
  expired:  { bg: COLORS.errorLight,   text: COLORS.error },
  inactive: { bg: COLORS.errorLight,   text: COLORS.error },
};

const PLAN_COLORS: Record<string, string> = {
  free:     COLORS.textMuted,
  starter:  COLORS.info,
  business: COLORS.success,
  premium:  COLORS.accent,
};

const PLAN_ICONS: Record<string, string> = {
  free:     'gift-outline',
  starter:  'rocket-outline',
  business: 'briefcase-outline',
  premium:  'diamond-outline',
};

interface AdminStats {
  totalBusinesses: number;
  activeUsers: number;
  activeSubscriptions: number;
  subscriptionRevenue: number;
  recentBusinesses: any[];
  planDist: { plan: string; count: number; color: string }[];
}

export function AdminDashboardScreen() {
  const [tab, setTab] = useState('Month');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const [stats, setStats] = useState<AdminStats>({
    totalBusinesses: 0,
    activeUsers: 0,
    activeSubscriptions: 0,
    subscriptionRevenue: 0,
    recentBusinesses: [],
    planDist: [],
  });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const [
      { count: totalBusinesses, error: bizErr },
      { count: activeUsers, error: userErr },
      { count: activeSubs },
      { data: recentBiz },
      { data: planData },
      { data: paymentData },
    ] = await Promise.all([
      supabase.from('businesses').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('businesses')
        .select('id, name, category, is_verified, created_at, subscriptions(plan, status)')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('subscriptions').select('plan'),
      supabase.from('payments').select('amount').eq('payment_type', 'subscription').in('status', ['paid', 'completed'])
    ]);

    if (bizErr || userErr) {
      const err = bizErr ?? userErr;
      console.error('[AdminDashboard] fetch error:', err);
      setFetchError(err!.message);
      setLoading(false);
      return;
    }

    // aggregate subscription revenue
    const subscriptionRevenue = (paymentData ?? []).reduce((sum: number, row: any) => sum + (Number(row.amount) || 0), 0);

    // Aggregate plan distribution
    const planMap: Record<string, number> = {};
    for (const s of (planData ?? [])) {
      planMap[s.plan] = (planMap[s.plan] ?? 0) + 1;
    }
    const planDist = Object.entries(planMap).map(([plan, count]) => ({
      plan,
      count,
      color: PLAN_COLORS[plan] ?? COLORS.textMuted,
    }));

    setStats({
      totalBusinesses: totalBusinesses ?? 0,
      activeUsers: activeUsers ?? 0,
      activeSubscriptions: activeSubs ?? 0,
      subscriptionRevenue,
      recentBusinesses: (recentBiz ?? []).map(b => ({
        id: b.id,
        name: b.name,
        category: b.category,
        plan: (b as any).subscriptions?.[0]?.plan ?? 'free',
        status: b.is_verified ? 'active' : 'trial',
        joined: format(new Date(b.created_at), 'dd MMM yyyy'),
      })),
      planDist,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useRealtimeSubscription('admin-dash-biz', 'businesses', fetchStats);
  useRealtimeSubscription('admin-dash-subs', 'subscriptions', fetchStats);

  const STAT_CARDS = [
    { label: 'Total Businesses',    value: stats.totalBusinesses.toLocaleString(),      icon: 'business-outline',  color: COLORS.primary },
    { label: 'Active Users',        value: stats.activeUsers.toLocaleString(),           icon: 'people-outline',    color: COLORS.info },
    { label: 'Active Subscriptions',value: stats.activeSubscriptions.toLocaleString(),   icon: 'pricetag-outline',  color: COLORS.success },
    { label: 'Plan Revenue',        value: `TZS ${stats.subscriptionRevenue.toLocaleString()}`, icon: 'cash-outline', color: COLORS.accent },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.container, isMobile && styles.containerMobile]} showsVerticalScrollIndicator={false}>
      {/* Time tabs */}
      <View style={[styles.tabs, isMobile && styles.tabsMobile]}>
        {TIME_TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {fetchError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={32} color={COLORS.error} />
          <Text style={styles.errorTitle}>Unable to load dashboard</Text>
          <Text style={styles.errorMsg}>{fetchError}</Text>
          <Text style={styles.errorHint}>Run scripts/fix-admin-rls.sql in Supabase SQL Editor to grant admin access.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchStats}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Stat cards */}
          <View style={[styles.statsGrid, isMobile && styles.statsGridMobile]}>
            {STAT_CARDS.map(stat => (
              <View key={stat.label} style={[styles.statCard, isMobile && styles.statCardMobile]}>
                <View style={[styles.statIcon, { backgroundColor: stat.color + '20' }]}>
                  <Ionicons name={stat.icon as any} size={22} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.row, isMobile && styles.rowMobile]}>
            {/* Recent Businesses */}
            <View style={[styles.card, { flex: 2 }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Recent Businesses</Text>
              </View>
              {stats.recentBusinesses.length === 0 ? (
                <Text style={styles.emptyText}>No businesses yet</Text>
              ) : isMobile ? stats.recentBusinesses.map(biz => (
                <View key={biz.id} style={styles.mobileListCard}>
                  <View style={styles.mobileListHead}>
                    <Text style={styles.mobileListTitle}>{biz.name}</Text>
                    <View style={[styles.badge, { backgroundColor: STATUS_COLORS[biz.status]?.bg ?? COLORS.border }]}>
                      <Text style={[styles.badgeText, { color: STATUS_COLORS[biz.status]?.text ?? COLORS.text }]}>{biz.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.mobileMetaText}>{biz.category}</Text>
                  <Text style={[styles.mobileMetaText, { color: PLAN_COLORS[biz.plan] ?? COLORS.text, textTransform: 'capitalize' }]}>{biz.plan} plan</Text>
                  <Text style={styles.mobileMetaText}>Joined {biz.joined}</Text>
                </View>
              )) : (
                <>
                  <View style={styles.tableHead}>
                    {['Business', 'Category', 'Plan', 'Status', 'Joined'].map(h => (
                      <Text key={h} style={[styles.th, h === 'Business' && { flex: 1.5 }]}>{h}</Text>
                    ))}
                  </View>
                  {stats.recentBusinesses.map(biz => (
                    <View key={biz.id} style={styles.tableRow}>
                      <Text style={[styles.td, styles.tdBold, { flex: 1.5 }]} numberOfLines={1}>{biz.name}</Text>
                      <Text style={styles.td} numberOfLines={1}>{biz.category}</Text>
                      <Text style={[styles.td, { color: PLAN_COLORS[biz.plan] ?? COLORS.text, textTransform: 'capitalize' }]}>{biz.plan}</Text>
                      <View style={styles.td}>
                        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[biz.status]?.bg ?? COLORS.border }]}>
                          <Text style={[styles.badgeText, { color: STATUS_COLORS[biz.status]?.text ?? COLORS.text }] }>
                            {biz.status}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.td}>{biz.joined}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>

            {/* Plan Distribution */}
            <View style={[styles.card, { flex: 1 }]}>
              <Text style={styles.cardTitle}>Plan Distribution</Text>
              <Text style={styles.cardSubtitle}>
                Total: {stats.planDist.reduce((s, p) => s + p.count, 0)} subscriptions
              </Text>
              {stats.planDist.length === 0 ? (
                <Text style={styles.emptyText}>No subscriptions yet</Text>
              ) : stats.planDist.map(p => {
                const total = stats.planDist.reduce((s, x) => s + x.count, 0);
                const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
                return (
                  <View key={p.plan} style={styles.planRow}>
                    <View style={styles.planLabelRow}>
                      <Ionicons
                        name={(PLAN_ICONS[p.plan] ?? 'pricetag-outline') as any}
                        size={16}
                        color={p.color}
                      />
                      <Text style={styles.planName}>{p.plan.charAt(0).toUpperCase() + p.plan.slice(1)}</Text>
                      <Text style={styles.planPct}>{pct}%</Text>
                    </View>
                    <View style={styles.planBarBg}>
                      <View style={[styles.planBar, { width: `${pct}%` as any, backgroundColor: p.color }]} />
                    </View>
                    <Text style={styles.planCount}>{p.count} businesses</Text>
                  </View>
                );
              })}
            </View>
          </View>
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
  tabs: { flexDirection: 'row', gap: SPACING.xs },
  tabsMobile: { flexWrap: 'wrap' },
  tab: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.white, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', gap: SPACING.base },
  statsGridMobile: { flexWrap: 'wrap' },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statCardMobile: { minWidth: '48%' },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  statValue: { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  statChangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: SPACING.sm,
  },
  statChangeText: { fontSize: FONTS.sizes.xs, color: COLORS.success },
  row: { flexDirection: 'row', gap: SPACING.base },
  rowMobile: { flexDirection: 'column' },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.base },
  cardTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  cardSubtitle: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2, marginBottom: SPACING.base },
  cardAction: { fontSize: FONTS.sizes.sm, color: COLORS.accent, fontWeight: '600' },
  tableHead: { flexDirection: 'row', paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  th: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceAlt },
  td: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  tdBold: { color: COLORS.text, fontWeight: '600' },
  mobileListCard: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
    gap: 4,
  },
  mobileListHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.sm },
  mobileListTitle: { flex: 1, fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  mobileMetaText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  planRow: { marginTop: SPACING.base },
  planLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  planName: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '600' },
  planPct: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  planBarBg: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
  planBar: { height: 6, borderRadius: 3 },
  planCount: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 3 },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.base },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  errorTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.error },
  errorMsg: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', fontFamily: 'monospace' },
  errorHint: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm },
  retryBtn: { marginTop: SPACING.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl, backgroundColor: COLORS.primary, borderRadius: RADIUS.md },
  retryBtnText: { color: COLORS.white, fontWeight: '700' },
});
