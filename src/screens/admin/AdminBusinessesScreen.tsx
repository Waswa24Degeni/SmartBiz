import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, BREAKPOINTS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { useRealtimeSubscription } from '../../lib/hooks';

const PLAN_COLORS: Record<string, string> = {
  free: COLORS.textMuted,
  starter: COLORS.info,
  business: COLORS.success,
  premium: COLORS.accent,
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: COLORS.successLight, text: COLORS.success },
  trial: { bg: COLORS.warningLight, text: COLORS.warning },
  suspended: { bg: COLORS.errorLight, text: COLORS.error },
  inactive: { bg: COLORS.border, text: COLORS.textSecondary },
};

interface BizRow {
  id: string;
  name: string;
  category: string;
  owner_name: string;
  plan: string;
  status: string;
  is_verified: boolean;
  user_count: number;
  created_at: string;
  sub_id?: string;
}

interface BizDetail extends BizRow {
  email?: string;
  phone?: string;
  address?: string;
  currency?: string;
}

export function AdminBusinessesScreen() {
  const [businesses, setBusinesses] = useState<BizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [detailTarget, setDetailTarget] = useState<BizDetail | null>(null);
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  const fetchBusinesses = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('businesses')
      .select(`
        id, name, category, is_verified, created_at, email, phone, address, currency,
        owner:users!businesses_owner_id_fkey(full_name),
        subscriptions(id, plan, status),
        staff(id)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AdminBusinesses] fetch error:', error);
      setFetchError(error.message);
      setBusinesses([]);
      setLoading(false);
      return;
    }

    setBusinesses(
      (data ?? []).map((b: any) => {
        const sub = b.subscriptions?.[0];
        const subStatus = sub?.status ?? 'inactive';
        const status = !b.is_verified
          ? 'trial'
          : subStatus === 'suspended'
            ? 'suspended'
            : subStatus === 'active'
              ? 'active'
              : 'inactive';

        return {
          id: b.id,
          name: b.name,
          category: b.category ?? '-',
          owner_name: b.owner?.full_name ?? '-',
          plan: sub?.plan ?? 'free',
          status,
          is_verified: b.is_verified ?? false,
          user_count: b.staff?.length ?? 0,
          created_at: b.created_at,
          sub_id: sub?.id,
          email: b.email,
          phone: b.phone,
          address: b.address,
          currency: b.currency,
        };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  useRealtimeSubscription('admin-biz-rt', 'businesses', fetchBusinesses);

  const handleVerifyToggle = async (biz: BizRow) => {
    const newVal = !biz.is_verified;
    Alert.alert(
      newVal ? 'Verify Business' : 'Unverify Business',
      `${newVal ? 'Verify' : 'Unverify'} "${biz.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newVal ? 'Verify' : 'Unverify',
          onPress: async () => {
            const { error } = await supabase.from('businesses').update({ is_verified: newVal }).eq('id', biz.id);
            if (error) Alert.alert('Error', error.message);
            else fetchBusinesses();
          },
        },
      ]
    );
  };

  const handleSuspendToggle = async (biz: BizRow) => {
    if (!biz.sub_id) {
      Alert.alert('No Subscription', 'This business has no active subscription to suspend.');
      return;
    }

    const isSuspended = biz.status === 'suspended';
    Alert.alert(
      isSuspended ? 'Restore Subscription' : 'Suspend Subscription',
      `${isSuspended ? 'Restore' : 'Suspend'} "${biz.name}"'s subscription?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isSuspended ? 'Restore' : 'Suspend',
          style: isSuspended ? 'default' : 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('subscriptions')
              .update({ status: isSuspended ? 'active' : 'suspended' })
              .eq('id', biz.sub_id);
            if (error) Alert.alert('Error', error.message);
            else fetchBusinesses();
          },
        },
      ]
    );
  };

  const categories = ['All', ...Array.from(new Set(businesses.map(b => b.category).filter(Boolean)))];

  const filtered = businesses.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch = b.name.toLowerCase().includes(q) || b.owner_name.toLowerCase().includes(q);
    const matchCat = catFilter === 'All' || b.category === catFilter;
    return matchSearch && matchCat;
  });

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search businesses or owners..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.catRow}>
            {categories.slice(0, 8).map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catBtn, catFilter === cat && styles.catBtnActive]}
                onPress={() => setCatFilter(cat)}
              >
                <Text style={[styles.catText, catFilter === cat && styles.catTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={styles.totalPill}>
          <Text style={styles.totalText}>{filtered.length} businesses</Text>
        </View>
      </View>

      {fetchError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={32} color={COLORS.error} />
          <Text style={styles.errorTitle}>Unable to load businesses</Text>
          <Text style={styles.errorMsg}>{fetchError}</Text>
          <Text style={styles.errorHint}>Run scripts/fix-admin-rls.sql in Supabase SQL Editor to grant admin access.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchBusinesses}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>No businesses found</Text>
          ) : isMobile ? (
            filtered.map((biz) => (
              <View key={biz.id} style={styles.mobileCard}>
                <View style={styles.mobileHead}>
                  <View style={[styles.bizIcon, { backgroundColor: COLORS.primary + '18' }]}>
                    <Ionicons name="business-outline" size={16} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bizName}>{biz.name}</Text>
                    <Text style={styles.bizCat}>{biz.category}</Text>
                  </View>
                </View>

                <View style={styles.mobileBadgeRow}>
                  <View style={[styles.badge, { backgroundColor: (PLAN_COLORS[biz.plan] ?? COLORS.textMuted) + '20' }]}>
                    <Text style={[styles.badgeText, { color: PLAN_COLORS[biz.plan] ?? COLORS.textMuted, textTransform: 'capitalize' }]}>{biz.plan}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLORS[biz.status]?.bg ?? COLORS.border }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLORS[biz.status]?.text ?? COLORS.text }]}>{biz.status}</Text>
                  </View>
                </View>

                <Text style={styles.mobileMeta}>Owner: {biz.owner_name}</Text>
                <Text style={styles.mobileMeta}>Joined: {format(new Date(biz.created_at), 'dd MMM yyyy')}</Text>

                <View style={styles.mobileActions}>
                  <TouchableOpacity style={styles.mobileActionBtn} onPress={() => setDetailTarget(biz as BizDetail)}>
                    <Ionicons name="eye-outline" size={14} color={COLORS.info} />
                    <Text style={[styles.mobileActionText, { color: COLORS.info }]}>View</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.mobileActionBtn, { backgroundColor: biz.is_verified ? COLORS.warningLight : COLORS.successLight }]}
                    onPress={() => handleVerifyToggle(biz)}
                  >
                    <Ionicons
                      name={biz.is_verified ? 'shield-checkmark-outline' : 'shield-outline'}
                      size={14}
                      color={biz.is_verified ? COLORS.warning : COLORS.success}
                    />
                    <Text style={[styles.mobileActionText, { color: biz.is_verified ? COLORS.warning : COLORS.success }]}>
                      {biz.is_verified ? 'Unverify' : 'Verify'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.mobileActionBtn, { backgroundColor: biz.status === 'suspended' ? COLORS.successLight : COLORS.errorLight }]}
                    onPress={() => handleSuspendToggle(biz)}
                  >
                    <Ionicons
                      name={biz.status === 'suspended' ? 'play-outline' : 'ban-outline'}
                      size={14}
                      color={biz.status === 'suspended' ? COLORS.success : COLORS.error}
                    />
                    <Text style={[styles.mobileActionText, { color: biz.status === 'suspended' ? COLORS.success : COLORS.error }]}> 
                      {biz.status === 'suspended' ? 'Restore' : 'Suspend'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <>
              <View style={styles.tableHead}>
                <Text style={[styles.th, { flex: 1.8 }]}>Business</Text>
                <Text style={styles.th}>Owner</Text>
                <Text style={styles.th}>Plan</Text>
                <Text style={styles.th}>Status</Text>
                <Text style={styles.th}>Joined</Text>
                <Text style={[styles.th, { flex: 0.8 }]}>Actions</Text>
              </View>

              {filtered.map((biz) => (
                <View key={biz.id} style={styles.row}>
                  <View style={[styles.cell, { flex: 1.8, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }]}> 
                    <View style={[styles.bizIcon, { backgroundColor: COLORS.primary + '18' }]}>
                      <Ionicons name="business-outline" size={16} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bizName} numberOfLines={1}>{biz.name}</Text>
                      <Text style={styles.bizCat} numberOfLines={1}>{biz.category}</Text>
                    </View>
                  </View>

                  <View style={styles.cell}>
                    <Text style={styles.cellText} numberOfLines={1}>{biz.owner_name}</Text>
                  </View>

                  <View style={styles.cell}>
                    <View style={[styles.badge, { backgroundColor: (PLAN_COLORS[biz.plan] ?? COLORS.textMuted) + '20' }]}>
                      <Text style={[styles.badgeText, { color: PLAN_COLORS[biz.plan] ?? COLORS.textMuted, textTransform: 'capitalize' }]}>
                        {biz.plan}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cell}>
                    <View style={[styles.badge, { backgroundColor: STATUS_COLORS[biz.status]?.bg ?? COLORS.border }]}>
                      <Text style={[styles.badgeText, { color: STATUS_COLORS[biz.status]?.text ?? COLORS.text }]}>{biz.status}</Text>
                    </View>
                  </View>

                  <View style={styles.cell}>
                    <Text style={styles.cellMuted}>{format(new Date(biz.created_at), 'dd MMM yyyy')}</Text>
                  </View>

                  <View style={[styles.cell, { flex: 0.8, flexDirection: 'row', gap: 4 }]}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setDetailTarget(biz as BizDetail)}>
                      <Ionicons name="eye-outline" size={14} color={COLORS.info} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: biz.is_verified ? COLORS.warningLight : COLORS.successLight }]}
                      onPress={() => handleVerifyToggle(biz)}
                    >
                      <Ionicons
                        name={biz.is_verified ? 'shield-checkmark-outline' : 'shield-outline'}
                        size={14}
                        color={biz.is_verified ? COLORS.warning : COLORS.success}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: biz.status === 'suspended' ? COLORS.successLight : COLORS.errorLight }]}
                      onPress={() => handleSuspendToggle(biz)}
                    >
                      <Ionicons
                        name={biz.status === 'suspended' ? 'play-outline' : 'ban-outline'}
                        size={14}
                        color={biz.status === 'suspended' ? COLORS.success : COLORS.error}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      )}

      <Modal visible={!!detailTarget} transparent animationType="slide" onRequestClose={() => setDetailTarget(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{detailTarget?.name}</Text>
              <TouchableOpacity onPress={() => setDetailTarget(null)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {detailTarget && (
              <View style={styles.detailGrid}>
                {[
                  { icon: 'person-outline', label: 'Owner', val: detailTarget.owner_name },
                  { icon: 'grid-outline', label: 'Category', val: detailTarget.category },
                  { icon: 'pricetag-outline', label: 'Plan', val: detailTarget.plan },
                  { icon: 'mail-outline', label: 'Email', val: detailTarget.email ?? '-' },
                  { icon: 'call-outline', label: 'Phone', val: detailTarget.phone ?? '-' },
                  { icon: 'location-outline', label: 'Address', val: detailTarget.address ?? '-' },
                  { icon: 'cash-outline', label: 'Currency', val: detailTarget.currency ?? '-' },
                  { icon: 'calendar-outline', label: 'Joined', val: format(new Date(detailTarget.created_at), 'dd MMM yyyy') },
                ].map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <Ionicons name={row.icon as any} size={15} color={COLORS.textMuted} style={{ width: 20 }} />
                    <Text style={styles.detailLabel}>{row.label}:</Text>
                    <Text style={styles.detailVal} numberOfLines={1}>{row.val}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { flex: 1, backgroundColor: detailTarget?.is_verified ? COLORS.warningLight : COLORS.successLight }]}
                onPress={() => {
                  if (detailTarget) {
                    handleVerifyToggle(detailTarget);
                    setDetailTarget(null);
                  }
                }}
              >
                <Ionicons
                  name={detailTarget?.is_verified ? 'shield-checkmark-outline' : 'shield-outline'}
                  size={15}
                  color={detailTarget?.is_verified ? COLORS.warning : COLORS.success}
                />
                <Text style={[styles.modalBtnText, { color: detailTarget?.is_verified ? COLORS.warning : COLORS.success }]}>
                  {detailTarget?.is_verified ? 'Unverify' : 'Verify'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { flex: 1, backgroundColor: detailTarget?.status === 'suspended' ? COLORS.successLight : COLORS.errorLight }]}
                onPress={() => {
                  if (detailTarget) {
                    handleSuspendToggle(detailTarget);
                    setDetailTarget(null);
                  }
                }}
              >
                <Ionicons
                  name={detailTarget?.status === 'suspended' ? 'play-outline' : 'ban-outline'}
                  size={15}
                  color={detailTarget?.status === 'suspended' ? COLORS.success : COLORS.error}
                />
                <Text style={[styles.modalBtnText, { color: detailTarget?.status === 'suspended' ? COLORS.success : COLORS.error }]}>
                  {detailTarget?.status === 'suspended' ? 'Restore' : 'Suspend'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.24)',
    zIndex: 20,
    elevation: 20,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.base,
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },
  catRow: { flexDirection: 'row', gap: 4 },
  catBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  catTextActive: { color: COLORS.white, fontWeight: '600' },
  totalPill: { paddingHorizontal: SPACING.sm, paddingVertical: 6, backgroundColor: COLORS.successLight, borderRadius: RADIUS.full },
  totalText: { fontSize: FONTS.sizes.xs, color: COLORS.success, fontWeight: '600' },

  scroll: { flex: 1, padding: SPACING.base },
  tableHead: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.base,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  th: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.base,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cell: { flex: 1 },
  bizIcon: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  bizName: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  bizCat: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  cellText: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  cellMuted: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  actionBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: COLORS.infoLight, alignItems: 'center', justifyContent: 'center' },

  mobileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  mobileHead: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  mobileBadgeRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  mobileMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  mobileActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  mobileActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.infoLight,
  },
  mobileActionText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },

  emptyText: { textAlign: 'center', color: COLORS.textMuted, fontSize: FONTS.sizes.sm, padding: SPACING.xl },

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

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.base,
  },
  modal: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.base,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  detailGrid: { gap: SPACING.sm },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
  },
  detailLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, width: 72 },
  detailVal: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },
  modalActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.base },
  modalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  modalBtnText: { fontSize: FONTS.sizes.sm, fontWeight: '700' },
});
