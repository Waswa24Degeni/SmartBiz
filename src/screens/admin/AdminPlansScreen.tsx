import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, BREAKPOINTS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { generateIdempotencyKey } from '../../lib/snippe';
import { format } from 'date-fns';
import { useRealtimeSubscription } from '../../lib/hooks';

const PLAN_META: Record<string, { price: string; period: string; color: string; bgColor: string; features: string[]; popular?: boolean }> = {
  free: {
    price: 'TZS 0', period: 'Forever', color: COLORS.textSecondary, bgColor: '#F3F4F6',
    features: ['1 Business', '1 user', '100 products', 'Basic reports', 'Mobile app'],
  },
  starter: {
    price: 'TZS 15,000', period: '/month', color: COLORS.info, bgColor: COLORS.infoLight,
    features: ['2 Businesses', '3 users', '500 products', 'Advanced reports', 'Email support'],
  },
  business: {
    price: 'TZS 35,000', period: '/month', color: COLORS.success, bgColor: COLORS.successLight, popular: true,
    features: ['2 Businesses', '10 users', 'Unlimited products', 'Full analytics', 'Priority support', 'Staff management'],
  },
  premium: {
    price: 'TZS 80,000', period: '/month', color: COLORS.accent, bgColor: COLORS.warningLight,
    features: ['2 Businesses', 'Unlimited users', 'Unlimited products', 'Custom reports', '24/7 support', 'API access'],
  },
};

const PLAN_PRICE_MAP: Record<string, number> = { free: 0, starter: 15000, business: 35000, premium: 80000 };
const MOBILE_MONEY_MIN_AMOUNT = 500;

function normalizeTzPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `255${digits.slice(1)}`;
  if (digits.length === 9) return `255${digits}`;
  return digits;
}

function isValidTzPhone(raw: string): boolean {
  return /^255\d{9}$/.test(normalizeTzPhone(raw));
}

interface SubRow {
  id: string;
  business_id: string;
  business_name: string;
  plan: string;
  status: string;
  billing_cycle: string;
  starts_at: string;
  expires_at: string;
}

interface BusinessOption {
  id: string;
  name: string;
}

interface PlanDef {
  id: string;
  name: string;
  price: number;
  period: string;
  color: string;
  bg_color: string;
  features: string[];
  is_popular: boolean;
}

export function AdminPlansScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  const [tab, setTab] = useState<'Plans' | 'History'>('Plans');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [planCounts, setPlanCounts] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<SubRow[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  const [createVisible, setCreateVisible] = useState(false);
  const [createBusinessId, setCreateBusinessId] = useState('');
  const [createPlan, setCreatePlan] = useState('starter');
  const [createStatus, setCreateStatus] = useState('active');
  const [createSaving, setCreateSaving] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<SubRow | null>(null);
  const [editPlan, setEditPlan] = useState('starter');
  const [editStatus, setEditStatus] = useState('active');
  const [editSaving, setEditSaving] = useState(false);

  // Plan definition editing (edit the plan card itself)
  const [planDefs, setPlanDefs] = useState<Record<string, PlanDef>>({});
  const [planDefsLoading, setPlanDefsLoading] = useState(true);
  const [planEditVisible, setPlanEditVisible] = useState(false);
  const [planEditKey, setPlanEditKey] = useState('');
  const [planEditPrice, setPlanEditPrice] = useState('');
  const [planEditPeriod, setPlanEditPeriod] = useState('');
  const [planEditFeatures, setPlanEditFeatures] = useState<string[]>([]);
  const [planEditPopular, setPlanEditPopular] = useState(false);
  const [planEditSaving, setPlanEditSaving] = useState(false);
  const [newFeature, setNewFeature] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('subscriptions')
      .select(`id, business_id, plan, status, billing_cycle, starts_at, expires_at, business:businesses(name)`)
      .order('starts_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[AdminPlans] fetch error:', error);
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    const counts: Record<string, number> = {};
    let rev = 0;
    for (const s of (data ?? [])) {
      counts[s.plan] = (counts[s.plan] ?? 0) + 1;
      if (s.status === 'active') rev += PLAN_PRICE_MAP[s.plan] ?? 0;
    }
    setPlanCounts(counts);
    setTotalRevenue(rev);
    setHistory(
      (data ?? []).map((s: any) => ({
        id: s.id,
        business_id: s.business_id,
        business_name: s.business?.name ?? '—',
        plan: s.plan,
        status: s.status,
        billing_cycle: s.billing_cycle ?? '—',
        starts_at: s.starts_at,
        expires_at: s.expires_at,
      }))
    );
    setLoading(false);
  }, []);

  const fetchBusinesses = useCallback(async () => {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(200);

    if (error) return;
    const rows = (data as BusinessOption[]) ?? [];
    setBusinesses(rows);
    if (!createBusinessId && rows.length > 0) {
      setCreateBusinessId(rows[0].id);
    }
  }, [createBusinessId]);

  const fetchPlanDefs = useCallback(async () => {
    setPlanDefsLoading(true);
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true });

    const result: Record<string, PlanDef> = {};
    // seed defaults from PLAN_META first
    for (const key of planOrder) {
      const meta = PLAN_META[key];
      if (!meta) continue;
      result[key] = {
        id: key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        price: PLAN_PRICE_MAP[key] ?? 0,
        period: meta.period,
        color: meta.color,
        bg_color: meta.bgColor,
        features: [...meta.features],
        is_popular: meta.popular ?? false,
      };
    }
    // override with DB rows
    for (const row of (data ?? [])) {
      result[row.id] = {
        id: row.id,
        name: row.name ?? (row.id.charAt(0).toUpperCase() + row.id.slice(1)),
        price: row.price ?? 0,
        period: row.period ?? '/month',
        color: row.color ?? PLAN_META[row.id]?.color ?? '#6B7280',
        bg_color: row.bg_color ?? PLAN_META[row.id]?.bgColor ?? '#F3F4F6',
        features: Array.isArray(row.features) ? row.features : (PLAN_META[row.id]?.features ?? []),
        is_popular: row.is_popular ?? false,
      };
    }
    setPlanDefs(result);
    setPlanDefsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    fetchBusinesses();
    fetchPlanDefs();
  }, [fetchData, fetchBusinesses, fetchPlanDefs]);
  useRealtimeSubscription('admin-plans-subs', 'subscriptions', fetchData);
  useRealtimeSubscription('admin-plans-biz', 'businesses', fetchBusinesses);

  const openEdit = (row: SubRow) => {
    setEditTarget(row);
    setEditPlan(row.plan);
    setEditStatus(row.status);
    setEditVisible(true);
  };

  const openPlanEdit = (planKey: string) => {
    const def = planDefs[planKey];
    if (!def) return;
    setPlanEditKey(planKey);
    setPlanEditPrice(String(def.price));
    setPlanEditPeriod(def.period);
    setPlanEditFeatures([...def.features]);
    setPlanEditPopular(def.is_popular);
    setNewFeature('');
    setPlanEditVisible(true);
  };

  const handleSavePlanDef = async () => {
    const price = parseInt(planEditPrice, 10) || 0;
    const meta = PLAN_META[planEditKey];
    setPlanEditSaving(true);
    const { error } = await supabase
      .from('subscription_plans')
      .upsert(
        {
          id: planEditKey,
          name: planEditKey.charAt(0).toUpperCase() + planEditKey.slice(1),
          price,
          period: planEditPeriod,
          features: planEditFeatures,
          is_popular: planEditPopular,
          color: meta?.color ?? '#6B7280',
          bg_color: meta?.bgColor ?? '#F3F4F6',
          sort_order: planOrder.indexOf(planEditKey),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
    setPlanEditSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setPlanEditVisible(false);
    fetchPlanDefs();
  };

  const handleResetPlanDef = (planKey: string) => {
    Alert.alert(
      'Reset Plan',
      `Reset "${planKey}" to default values?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('subscription_plans')
              .delete()
              .eq('id', planKey);
            if (error) { Alert.alert('Error', error.message); return; }
            fetchPlanDefs();
          },
        },
      ],
    );
  };

  const handleCreateSubscription = async () => {
    if (!createBusinessId) {
      Alert.alert('Required', 'Please select a business.');
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime());
    const planPeriod = planDefs[createPlan]?.period?.toLowerCase() || '';
    if (planPeriod.includes('year')) {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    setCreateSaving(true);

    // ── For paid plans, initiate Snippe mobile-money payment ──────────────
    const planAmount = PLAN_PRICE_MAP[createPlan] ?? 0;
    let snippeReference: string | null = null;

    if (planAmount > 0) {
      if (planAmount < MOBILE_MONEY_MIN_AMOUNT) {
        setCreateSaving(false);
        Alert.alert('Invalid amount', `Subscription payment must be at least TZS ${MOBILE_MONEY_MIN_AMOUNT.toLocaleString()}.`);
        return;
      }

      // 1. Load owner phone from business_payment_config or users table
      const { data: bizPayCfg } = await supabase
        .from('business_payment_config')
        .select('receive_phone, receive_name, receive_email')
        .eq('business_id', createBusinessId)
        .maybeSingle();

      let ownerPhone = (bizPayCfg as any)?.receive_phone ?? '';
      let ownerName  = (bizPayCfg as any)?.receive_name  ?? 'Business Owner';
      let ownerEmail = (bizPayCfg as any)?.receive_email ?? '';

      // Fall back to the user attached to this business
      if (!ownerPhone) {
        const { data: bizUser } = await supabase
          .from('users')
          .select('phone, full_name, email')
          .eq('business_id', createBusinessId)
          .maybeSingle();
        ownerPhone = (bizUser as any)?.phone ?? '';
        if (!ownerName || ownerName === 'Business Owner') ownerName = (bizUser as any)?.full_name ?? ownerName;
        if (!ownerEmail) ownerEmail = (bizUser as any)?.email ?? '';
      }

      if (!ownerPhone) {
        setCreateSaving(false);
        Alert.alert(
          'Owner phone missing',
          'The business owner has not configured a payment phone number. Ask them to set it in Settings → Payment.',
        );
        return;
      }

      const normalizedOwnerPhone = normalizeTzPhone(ownerPhone);
      if (!isValidTzPhone(normalizedOwnerPhone)) {
        setCreateSaving(false);
        Alert.alert('Invalid owner phone', 'Owner payment phone must be a valid Tanzania mobile number.');
        return;
      }

      const cleanOwnerName = ownerName.trim();
      if (!cleanOwnerName || cleanOwnerName.length < 3 || cleanOwnerName.length > 80) {
        setCreateSaving(false);
        Alert.alert('Invalid owner name', 'Owner name must be between 3 and 80 characters.');
        return;
      }

      // 2. Initiate payment via Edge Function (API key stays server-side)
      const { data: paymentResult, error: paymentErr } = await supabase.functions.invoke(
        'initiate-payment',
        {
          body: {
            payment_type:    'subscription',
            channel:         'mobile',
            amount:          planAmount,
            business_id:     createBusinessId,
            idempotency_key: generateIdempotencyKey('sub'),
            payer_phone:     normalizedOwnerPhone,
            payer_name:      cleanOwnerName,
            payer_email:     ownerEmail || undefined,
            metadata: { plan: createPlan },
          },
        },
      );

      if (paymentErr || !(paymentResult as any)?.success) {
        setCreateSaving(false);
        Alert.alert(
          'Payment initiation failed',
          (paymentResult as any)?.message ?? paymentErr?.message ?? 'Could not initiate mobile money request.',
        );
        return;
      }

      snippeReference = (paymentResult as any).gateway_reference ?? null;
    }
    // ─────────────────────────────────────────────────────────────────────

    const { error } = await supabase.from('subscriptions').insert({
      business_id:   createBusinessId,
      plan:          createPlan,
      status:        createStatus,
      billing_cycle: 'monthly',
      starts_at:     now.toISOString(),
      expires_at:    expiresAt.toISOString(),
    });
    setCreateSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setCreateVisible(false);
    fetchData();

    if (snippeReference) {
      Alert.alert(
        'Payment sent',
        `A USSD push was sent to the business owner's phone. They must enter their PIN to complete the TZS ${planAmount.toLocaleString()} payment.`,
      );
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;

    setEditSaving(true);
    const { error } = await supabase
      .from('subscriptions')
      .update({ plan: editPlan, status: editStatus })
      .eq('id', editTarget.id);
    setEditSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setEditVisible(false);
    setEditTarget(null);
    fetchData();
  };

  const handleDelete = (row: SubRow) => {
    Alert.alert('Delete Subscription', `Remove subscription for ${row.business_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('subscriptions').delete().eq('id', row.id);
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            fetchData();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Unexpected error');
          }
        },
      },
    ]);
  };

  const totalActive = Object.values(planCounts).reduce((s, c) => s + c, 0);
  const planOrder = ['free', 'starter', 'business', 'premium'];

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Summary */}
      <View style={[styles.summaryRow, isMobile && styles.summaryRowMobile]}>
        <View style={[styles.summaryCard, isMobile && styles.summaryCardMobile]}>
          <Ionicons name="people-outline" size={20} color={COLORS.primary} />
          <Text style={styles.summaryValue}>{totalActive}</Text>
          <Text style={styles.summaryLabel}>Active Subscriptions</Text>
        </View>
        <View style={[styles.summaryCard, isMobile && styles.summaryCardMobile]}>
          <Ionicons name="cash-outline" size={20} color={COLORS.success} />
          <Text style={styles.summaryValue}>TZS {totalRevenue.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Monthly Revenue</Text>
        </View>
        <View style={[styles.summaryCard, isMobile && styles.summaryCardMobile]}>
          <Ionicons name="pricetag-outline" size={20} color={COLORS.accent} />
          <Text style={styles.summaryValue}>{planOrder.filter(p => (planCounts[p] ?? 0) > 0).length}</Text>
          <Text style={styles.summaryLabel}>Active Plans</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['Plans', 'History'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.createBtn} onPress={() => setCreateVisible(true)}>
          <Ionicons name="add" size={14} color={COLORS.white} />
          <Text style={styles.createBtnText}>New Subscription</Text>
        </TouchableOpacity>
      </View>

      {fetchError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={32} color={COLORS.error} />
          <Text style={styles.errorTitle}>Unable to load plans</Text>
          <Text style={styles.errorMsg}>{fetchError}</Text>
          <Text style={styles.errorHint}>Run scripts/fix-admin-rls.sql in Supabase SQL Editor.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : tab === 'Plans' ? (
        <View style={styles.plansGrid}>
          {planOrder.map(planKey => {
            const def = planDefs[planKey] ?? {
              id: planKey,
              name: planKey.charAt(0).toUpperCase() + planKey.slice(1),
              price: PLAN_PRICE_MAP[planKey] ?? 0,
              period: PLAN_META[planKey]?.period ?? '/month',
              color: PLAN_META[planKey]?.color ?? '#6B7280',
              bg_color: PLAN_META[planKey]?.bgColor ?? '#F3F4F6',
              features: PLAN_META[planKey]?.features ?? [],
              is_popular: PLAN_META[planKey]?.popular ?? false,
            };
            const count = planCounts[planKey] ?? 0;
            return (
              <View key={planKey} style={[styles.planCard, def.is_popular && styles.planCardPopular]}>
                {def.is_popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>MOST POPULAR</Text>
                  </View>
                )}
                <View style={[styles.planIconRow, { backgroundColor: def.bg_color }]}>
                  <Ionicons name="pricetag-outline" size={24} color={def.color} />
                </View>
                <Text style={[styles.planName, { color: def.color }]}>{def.name}</Text>
                <Text style={styles.planPrice}>
                  {def.price === 0 ? 'TZS 0' : `TZS ${def.price.toLocaleString()}`}
                </Text>
                <Text style={styles.planPeriod}>{def.period}</Text>
                <View style={styles.planDivider} />
                <View style={styles.bizCount}>
                  <Ionicons name="people-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.bizCountText}>{count} {count === 1 ? 'Subscriber' : 'Subscribers'}</Text>
                </View>
                <View style={styles.featuresList}>
                  {def.features.map((f, i) => (
                    <View key={i} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={14} color={def.color} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>
                {/* Plan card actions */}
                <View style={styles.planDivider} />
                <View style={styles.planActions}>
                  <TouchableOpacity
                    style={[styles.planActionBtn, { borderColor: COLORS.info + '40' }]}
                    onPress={() => openPlanEdit(planKey)}
                  >
                    <Ionicons name="create-outline" size={13} color={COLORS.info} />
                    <Text style={[styles.planActionText, { color: COLORS.info }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.planActionBtn, { borderColor: COLORS.error + '40' }]}
                    onPress={() => handleResetPlanDef(planKey)}
                  >
                    <Ionicons name="refresh-outline" size={13} color={COLORS.error} />
                    <Text style={[styles.planActionText, { color: COLORS.error }]}>Reset</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={[styles.card, isMobile && { backgroundColor: 'transparent', borderWidth: 0, padding: 0 }]}>
          {!isMobile && (
            <View style={styles.tableHead}>
              <Text style={[styles.th, { flex: 1.5 }]}>Business</Text>
              <Text style={styles.th}>Plan</Text>
              <Text style={styles.th}>Status</Text>
              <Text style={styles.th}>Billing</Text>
              <Text style={styles.th}>Expires</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Actions</Text>
            </View>
          )}
          {history.length === 0 ? (
            <Text style={styles.emptyText}>No subscriptions yet</Text>
          ) : isMobile ? (
            history.map(item => (
              <View key={item.id} style={styles.mobileHistCard}>
                <View style={styles.mobileHistTop}>
                  <Text style={styles.mobileHistBiz}>{item.business_name}</Text>
                  <View style={[styles.badge, { backgroundColor: item.status === 'active' ? COLORS.successLight : COLORS.border }]}>
                    <Text style={[styles.badgeText, { color: item.status === 'active' ? COLORS.success : COLORS.textMuted }]}>{item.status}</Text>
                  </View>
                </View>
                <View style={styles.mobileHistDetails}>
                  <View style={[styles.badge, { backgroundColor: COLORS.primary + '15', alignSelf: 'flex-start' }]}>
                    <Text style={[styles.badgeText, { color: COLORS.primary }]}>{item.plan}</Text>
                  </View>
                  <Text style={styles.tdMuted}>Billing: {item.billing_cycle}</Text>
                  <Text style={styles.tdMuted}>Expires: {item.expires_at ? format(new Date(item.expires_at), 'dd MMM yyyy') : '—'}</Text>
                </View>
                <View style={styles.mobileHistActions}>
                  <TouchableOpacity style={styles.mobileRowBtn} onPress={() => openEdit(item)}>
                    <Ionicons name="create-outline" size={14} color={COLORS.info} />
                    <Text style={[styles.rowBtnText, { color: COLORS.info }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.mobileRowBtn} onPress={() => handleDelete(item)}>
                    <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                    <Text style={[styles.rowBtnText, { color: COLORS.error }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : history.map(item => (
            <View key={item.id} style={styles.histRow}>
              <Text style={[styles.td, { flex: 1.5 }]} numberOfLines={1}>{item.business_name}</Text>
              <View style={styles.td}>
                <View style={[styles.badge, { backgroundColor: COLORS.primary + '15' }]}>
                  <Text style={[styles.badgeText, { color: COLORS.primary, textTransform: 'capitalize' }]}>{item.plan}</Text>
                </View>
              </View>
              <View style={styles.td}>
                <View style={[styles.badge, { backgroundColor: item.status === 'active' ? COLORS.successLight : COLORS.border }]}>
                  <Text style={[styles.badgeText, { color: item.status === 'active' ? COLORS.success : COLORS.textMuted, textTransform: 'capitalize' }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.td}>{item.billing_cycle}</Text>
              <Text style={styles.tdMuted}>{item.expires_at ? format(new Date(item.expires_at), 'dd MMM yyyy') : '—'}</Text>
              <View style={[styles.td, { flex: 1.2, flexDirection: 'row', gap: 8 }]}>
                <TouchableOpacity style={styles.rowBtn} onPress={() => openEdit(item)}>
                  <Ionicons name="create-outline" size={13} color={COLORS.info} />
                  <Text style={[styles.rowBtnText, { color: COLORS.info }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rowBtn} onPress={() => handleDelete(item)}>
                  <Ionicons name="trash-outline" size={13} color={COLORS.error} />
                  <Text style={[styles.rowBtnText, { color: COLORS.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>New Subscription</Text>
              <TouchableOpacity onPress={() => setCreateVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Business</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsWrap}>
              {businesses.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.chip, createBusinessId === b.id && styles.chipActive]}
                  onPress={() => setCreateBusinessId(b.id)}
                >
                  <Text style={[styles.chipText, createBusinessId === b.id && styles.chipTextActive]}>{b.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Plan</Text>
            <View style={styles.chipsWrap}>
              {['free', 'starter', 'business', 'premium'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, createPlan === p && styles.chipActive]}
                  onPress={() => setCreatePlan(p)}
                >
                  <Text style={[styles.chipText, createPlan === p && styles.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.chipsWrap}>
              {['active', 'trial', 'expired', 'cancelled'].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, createStatus === s && styles.chipActive]}
                  onPress={() => setCreateStatus(s)}
                >
                  <Text style={[styles.chipText, createStatus === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, createSaving && { opacity: 0.7 }]} onPress={handleCreateSubscription} disabled={createSaving}>
                {createSaving ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.saveBtnText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Edit Subscription</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Business</Text>
            <TextInput editable={false} style={styles.readOnlyInput} value={editTarget?.business_name ?? ''} />

            <Text style={styles.fieldLabel}>Plan</Text>
            <View style={styles.chipsWrap}>
              {['free', 'starter', 'business', 'premium'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, editPlan === p && styles.chipActive]}
                  onPress={() => setEditPlan(p)}
                >
                  <Text style={[styles.chipText, editPlan === p && styles.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.chipsWrap}>
              {['active', 'trial', 'expired', 'cancelled'].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, editStatus === s && styles.chipActive]}
                  onPress={() => setEditStatus(s)}
                >
                  <Text style={[styles.chipText, editStatus === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, editSaving && { opacity: 0.7 }]} onPress={handleSaveEdit} disabled={editSaving}>
                {editSaving ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* ── Plan Definition Edit Modal ────────────────────── */}
      <Modal
        visible={planEditVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPlanEditVisible(false)}
      >
        <View style={styles.overlay}>
          <ScrollView
            contentContainerStyle={[styles.modalBox, { maxHeight: '90%' }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>
                Edit Plan — {planEditKey.charAt(0).toUpperCase() + planEditKey.slice(1)}
              </Text>
              <TouchableOpacity onPress={() => setPlanEditVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Price (TZS)</Text>
            <TextInput
              style={styles.readOnlyInput}
              value={planEditPrice}
              onChangeText={v => setPlanEditPrice(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.fieldLabel}>Period</Text>
            <View style={styles.chipsWrap}>
              {['Forever', '/month', '/year'].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, planEditPeriod === p && styles.chipActive]}
                  onPress={() => setPlanEditPeriod(p)}
                >
                  <Text style={[styles.chipText, planEditPeriod === p && styles.chipTextActive]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.popularToggleRow}>
              <Text style={styles.fieldLabel}>Mark as Most Popular</Text>
              <Switch
                value={planEditPopular}
                onValueChange={v => setPlanEditPopular(v)}
                trackColor={{ false: COLORS.border, true: COLORS.success }}
                thumbColor={COLORS.white}
              />
            </View>

            <Text style={styles.fieldLabel}>Features</Text>
            {planEditFeatures.map((f, i) => (
              <View key={i} style={styles.featureEditRow}>
                <Text style={styles.featureEditText} numberOfLines={1}>{f}</Text>
                <TouchableOpacity
                  onPress={() =>
                    setPlanEditFeatures(prev => prev.filter((_, idx) => idx !== i))
                  }
                >
                  <Ionicons name="close-circle" size={18} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.addFeatureRow}>
              <TextInput
                style={[styles.readOnlyInput, { flex: 1 }]}
                value={newFeature}
                onChangeText={setNewFeature}
                placeholder="New feature…"
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="done"
                onSubmitEditing={() => {
                  const trimmed = newFeature.trim();
                  if (trimmed) {
                    setPlanEditFeatures(prev => [...prev, trimmed]);
                    setNewFeature('');
                  }
                }}
              />
              <TouchableOpacity
                style={styles.addFeatureBtn}
                onPress={() => {
                  const trimmed = newFeature.trim();
                  if (trimmed) {
                    setPlanEditFeatures(prev => [...prev, trimmed]);
                    setNewFeature('');
                  }
                }}
              >
                <Ionicons name="add" size={18} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPlanEditVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, planEditSaving && { opacity: 0.7 }]}
                onPress={handleSavePlanDef}
                disabled={planEditSaving}
              >
                {planEditSaving ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  container: { padding: SPACING.xl, gap: SPACING.lg },
  summaryRow: { flexDirection: 'row', gap: SPACING.base },
  summaryRowMobile: { flexWrap: 'wrap' },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: SPACING.base,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryCardMobile: { minWidth: '45%' },
  summaryValue: { fontSize: FONTS.sizes.xl, fontWeight: '700', color: COLORS.text },
  summaryLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  tabRow: { flexDirection: 'row', gap: SPACING.xs },
  createBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
  },
  createBtnText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  tabBtn: { paddingHorizontal: SPACING.base, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.white, fontWeight: '600' },
  plansGrid: { flexDirection: 'row', gap: SPACING.base, flexWrap: 'wrap' },
  planCard: { flex: 1, minWidth: 200, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.base, borderWidth: 1, borderColor: COLORS.border },
  planCardPopular: { borderColor: COLORS.success, borderWidth: 2 },
  popularBadge: { backgroundColor: COLORS.success, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  popularText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  planIconRow: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  planName: { fontSize: FONTS.sizes.md, fontWeight: '700' },
  planPrice: { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text, marginTop: 4 },
  planPeriod: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  planDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  bizCount: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.sm },
  bizCountText: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  featuresList: { gap: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  planActions: { flexDirection: 'row', gap: SPACING.xs, marginTop: 0 },
  planActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: 6,
  },
  planActionText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  popularToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  featureEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.sm,
    marginBottom: 4,
  },
  featureEditText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text, marginRight: SPACING.xs },
  addFeatureRow: { flexDirection: 'row', gap: SPACING.xs, alignItems: 'center', marginTop: 4 },
  addFeatureBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    padding: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.base, borderWidth: 1, borderColor: COLORS.border },
  tableHead: { flexDirection: 'row', paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: SPACING.xs },
  th: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
  },
  mobileHistCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  mobileHistTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mobileHistBiz: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text, flex: 1 },
  mobileHistDetails: { gap: 4, paddingVertical: SPACING.xs },
  mobileHistActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  mobileRowBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, backgroundColor: COLORS.infoLight, borderRadius: RADIUS.md },
  td: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },
  tdMuted: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  rowBtnText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: COLORS.textMuted, fontSize: FONTS.sizes.sm, padding: SPACING.xl },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  errorTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.error },
  errorMsg: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', fontFamily: 'monospace' },
  errorHint: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm },
  retryBtn: { marginTop: SPACING.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl, backgroundColor: COLORS.primary, borderRadius: RADIUS.md },
  retryBtnText: { color: COLORS.white, fontWeight: '700' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.base,
  },
  modalBox: {
    width: '100%',
    maxWidth: 520,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: SPACING.base,
    gap: SPACING.xs,
  },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  modalTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  fieldLabel: {
    marginTop: SPACING.xs,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  readOnlyInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    color: COLORS.text,
    fontSize: FONTS.sizes.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  chipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textTransform: 'capitalize' },
  chipTextActive: { color: COLORS.white, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
  },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
  },
  saveBtnText: { color: COLORS.white, fontWeight: '700' },
});
