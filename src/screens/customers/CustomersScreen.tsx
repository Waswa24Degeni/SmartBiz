import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, FONTS, RADIUS, SPACING, SHADOWS } from '../../lib/constants';
import { ListSkeleton } from '../../components/common/SkeletonLoader';
import { format } from 'date-fns';

type CustomerRow = {
  id: string;
  business_id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_balance: number;
  loyalty_points: number;
  created_at: string;
  // Computed
  total_spent?: number;
  order_count?: number;
};

type PurchaseRecord = {
  id: string;
  order_number: string;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
};

export function CustomersScreen() {
  const { business } = useAuth();
  const { currency } = useSettings();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState('');
  const [customerSalesMap, setCustomerSalesMap] = useState<Map<string, { total: number; count: number }>>(new Map());

  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Customer detail
  const [detailCustomer, setDetailCustomer] = useState<CustomerRow | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  // Form
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setEditId(null);
    setFullName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
  };

  const openNewModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (row: CustomerRow) => {
    setEditId(row.id);
    setFullName(row.full_name ?? '');
    setPhone(row.phone ?? '');
    setEmail(row.email ?? '');
    setAddress(row.address ?? '');
    setNotes(row.notes ?? '');
    setModalVisible(true);
  };

  // ─── Fetch customers + sales aggregates ────────────────────

  const fetchRows = useCallback(async (silent = false) => {
    if (!business?.id) { setLoading(false); return; }
    if (!silent) setLoading(true);

    const { data, error } = await supabase
      .from('customers')
      .select('id, business_id, full_name, phone, email, address, notes, credit_balance, loyalty_points, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Error', error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const customers = (data as CustomerRow[]) ?? [];

    // Fetch sales aggregates per customer
    const { data: salesAgg } = await supabase
      .from('sales')
      .select('customer_id, total')
      .eq('business_id', business.id)
      .not('status', 'eq', 'cancelled')
      .not('customer_id', 'is', null);

    const salesMap = new Map<string, { total: number; count: number }>();
    (salesAgg ?? []).forEach((s: any) => {
      if (!s.customer_id) return;
      const existing = salesMap.get(s.customer_id) ?? { total: 0, count: 0 };
      existing.total += Number(s.total) || 0;
      existing.count += 1;
      salesMap.set(s.customer_id, existing);
    });
    setCustomerSalesMap(salesMap);

    // Enrich customers with sales data
    const enriched = customers.map(c => ({
      ...c,
      total_spent: salesMap.get(c.id)?.total ?? 0,
      order_count: salesMap.get(c.id)?.count ?? 0,
    }));

    setRows(enriched);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useRealtimeSubscription('customers-rt', 'customers', () => fetchRows(true), !!business?.id);

  // ─── Customer Detail (Purchase History) ────────────────────

  const openDetail = async (customer: CustomerRow) => {
    setDetailCustomer(customer);
    setPurchasesLoading(true);
    setPurchases([]);

    const { data } = await supabase
      .from('sales')
      .select('id, order_number, total, status, payment_status, created_at')
      .eq('business_id', business!.id)
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setPurchases((data as PurchaseRecord[]) ?? []);
    setPurchasesLoading(false);
  };

  // ─── Filter ────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.full_name.toLowerCase().includes(q) ||
      (r.phone ?? '').toLowerCase().includes(q) ||
      (r.email ?? '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  // ─── Stats ─────────────────────────────────────────────────

  const totalCustomers = rows.length;
  const totalSpentAll = useMemo(() => rows.reduce((s, r) => s + (r.total_spent ?? 0), 0), [rows]);
  const totalBalance = useMemo(() => rows.reduce((s, r) => s + Number(r.credit_balance ?? 0), 0), [rows]);

  // ─── Save ──────────────────────────────────────────────────

  const handleSave = async () => {
    if (!business?.id) return;
    const name = fullName.trim();
    if (!name) { Alert.alert('Name required', 'Please enter customer full name.'); return; }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setSaving(true);
    const payload = {
      full_name: name,
      phone: phone.trim() || null,
      email: normalizedEmail || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      business_id: business.id,
    };

    if (editId) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editId);
      if (error) { setSaving(false); Alert.alert('Update failed', error.message); return; }
    } else {
      const { error } = await supabase.from('customers').insert(payload);
      if (error) { setSaving(false); Alert.alert('Create failed', error.message); return; }
    }

    setSaving(false);
    setModalVisible(false);
    resetForm();
    fetchRows(true);
  };

  const handleDelete = (row: CustomerRow) => {
    Alert.alert('Delete customer', `Delete ${row.full_name}?\n\nThis will not delete their purchase history.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('customers').delete().eq('id', row.id);
          if (error) { Alert.alert('Delete failed', error.message); return; }
          fetchRows(true);
        },
      },
    ]);
  };

  // ─── Render ────────────────────────────────────────────────

  const statusColor = (s: string) =>
    s === 'completed' ? COLORS.success : s === 'cancelled' ? COLORS.error : COLORS.secondary;
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Customers</Text>
          <Text style={styles.headerSubtitle}>Manage your clients and their purchase history</Text>
        </View>
        <Text style={styles.headerDate}>Today • {format(new Date(), 'MMMM dd, yyyy')}</Text>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={{ flex: 1, padding: SPACING.md }}>
          <ListSkeleton count={6} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING['2xl'] }}>
          {/* Customer Overview Card */}
          <View style={styles.overviewCard}>
            <View style={styles.overviewLeft}>
              <Text style={styles.overviewLabel}>Total Customers</Text>
              <Text style={styles.overviewValue}>{totalCustomers}</Text>
              <Text style={styles.overviewCount}>Active Profiles</Text>

              <View style={styles.overviewBudgetRow}>
                <View>
                  <Text style={styles.overviewBudgetSub}>Total Revenue Generated</Text>
                  <Text style={styles.overviewBudgetValue}>{currency} {totalSpentAll.toLocaleString()}</Text>
                </View>
              </View>
            </View>

            <View style={styles.overviewRight}>
              <View style={styles.circularFrame}>
                <Ionicons name="people" size={32} color={COLORS.white} />
              </View>

              <TouchableOpacity style={styles.addBtn} onPress={openNewModal}>
                <Ionicons name="add" size={16} color={COLORS.primary} />
                <Text style={styles.addBtnText}>Add Customer</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* AI Insights */}
          <View style={styles.insightsWrap}>
            <Text style={styles.insightsTitle}>Customer Insights</Text>
            <View style={styles.insightsList}>
              <View style={styles.insightCard}>
                <Text style={styles.insightText}>💡 Outstanding balance across all customers is {currency} {totalBalance.toLocaleString()}.</Text>
              </View>
              {rows.length > 0 && (
                <View style={styles.insightCard}>
                  <Text style={styles.insightText}>💡 Top customer {[...rows].sort((a,b) => (b.total_spent??0) - (a.total_spent??0))[0]?.full_name} has spent {currency} {([...rows].sort((a,b) => (b.total_spent??0) - (a.total_spent??0))[0]?.total_spent??0).toLocaleString()}.</Text>
                </View>
              )}
            </View>
          </View>

          {/* Filters Section */}
          <View style={styles.filtersSection}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search customers..."
                value={query}
                onChangeText={setQuery}
                placeholderTextColor={COLORS.textMuted}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.ledgerHeader}>Customer Directory</Text>

          {filteredRows.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name="people-outline" size={44} color={COLORS.textMuted} /></View>
              <Text style={styles.emptyTitle}>No customers found</Text>
              <Text style={styles.emptySub}>Create your first customer to track contacts and purchase history.</Text>
            </View>
          ) : (
            filteredRows.map(row => (
              <TouchableOpacity key={row.id} style={styles.card} onPress={() => openDetail(row)} activeOpacity={0.7}>
                <View style={styles.cardTop}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>
                      {row.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{row.full_name}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {row.phone || 'No phone'}{row.email ? ` • ${row.email}` : ''}
                    </Text>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openEditModal(row)}>
                      <Ionicons name="create-outline" size={15} color={COLORS.info} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(row)}>
                      <Ionicons name="trash-outline" size={15} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                </View>

                {!!row.notes && (
                  <View style={styles.notesRow}>
                    <Ionicons name="document-text-outline" size={12} color={COLORS.textMuted} />
                    <Text style={styles.notesText} numberOfLines={1}>{row.notes}</Text>
                  </View>
                )}

                <View style={styles.statsRow}>
                  <View style={styles.statPill}>
                    <Text style={styles.statLabel}>Total Spent</Text>
                    <Text style={[styles.statVal, { color: COLORS.success }]}>
                      {currency} {(row.total_spent ?? 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.statPill}>
                    <Text style={styles.statLabel}>Orders</Text>
                    <Text style={styles.statVal}>{row.order_count ?? 0}</Text>
                  </View>
                  <View style={styles.statPill}>
                    <Text style={styles.statLabel}>Balance</Text>
                    <Text style={[styles.statVal, Number(row.credit_balance) > 0 ? { color: COLORS.secondary } : {}]}>
                      {currency} {Number(row.credit_balance ?? 0).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* ─── Customer Detail Modal ──────────────────────────── */}
      <Modal visible={!!detailCustomer} animationType="slide" transparent onRequestClose={() => setDetailCustomer(null)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Customer Profile</Text>
              <TouchableOpacity onPress={() => setDetailCustomer(null)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {detailCustomer && (
              <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
                {/* Profile Card */}
                <View style={styles.profileCard}>
                  <View style={styles.profileAvatar}>
                    <Text style={styles.profileAvatarText}>
                      {detailCustomer.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.profileName}>{detailCustomer.full_name}</Text>
                  {detailCustomer.phone && <Text style={styles.profileSub}>{detailCustomer.phone}</Text>}
                  {detailCustomer.email && <Text style={styles.profileSub}>{detailCustomer.email}</Text>}
                  {detailCustomer.address && (
                    <Text style={styles.profileSub}><Ionicons name="location-outline" size={12} /> {detailCustomer.address}</Text>
                  )}
                  <Text style={styles.profileSince}>
                    Customer since {format(new Date(detailCustomer.created_at), 'MMM yyyy')}
                  </Text>
                </View>

                {/* Stats */}
                <View style={styles.detailStatsRow}>
                  <View style={[styles.detailStatCard, { borderTopColor: COLORS.success }]}>
                    <Text style={styles.detailStatLabel}>Total Spent</Text>
                    <Text style={styles.detailStatValue}>
                      {currency} {(detailCustomer.total_spent ?? 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.detailStatCard, { borderTopColor: COLORS.primary }]}>
                    <Text style={styles.detailStatLabel}>Total Orders</Text>
                    <Text style={styles.detailStatValue}>{detailCustomer.order_count ?? 0}</Text>
                  </View>
                  <View style={[styles.detailStatCard, { borderTopColor: COLORS.secondary }]}>
                    <Text style={styles.detailStatLabel}>Balance</Text>
                    <Text style={styles.detailStatValue}>
                      {currency} {Number(detailCustomer.credit_balance ?? 0).toLocaleString()}
                    </Text>
                  </View>
                </View>

                {/* Notes */}
                {detailCustomer.notes && (
                  <View style={styles.notesCard}>
                    <Text style={styles.notesCardTitle}>Notes</Text>
                    <Text style={styles.notesCardText}>{detailCustomer.notes}</Text>
                  </View>
                )}

                {/* Purchase History */}
                <View style={styles.purchaseSection}>
                  <Text style={styles.purchaseTitle}>Purchase History</Text>
                  {purchasesLoading ? (
                    <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.lg }} />
                  ) : purchases.length === 0 ? (
                    <View style={styles.purchaseEmpty}>
                      <Ionicons name="bag-outline" size={32} color={COLORS.textMuted} />
                      <Text style={styles.purchaseEmptyText}>No purchases yet</Text>
                    </View>
                  ) : (
                    purchases.map(p => (
                      <View key={p.id} style={styles.purchaseRow}>
                        <View style={styles.purchaseLeft}>
                          <Text style={styles.purchaseOrder}>#{p.order_number}</Text>
                          <Text style={styles.purchaseDate}>{format(new Date(p.created_at), 'dd MMM yyyy, HH:mm')}</Text>
                        </View>
                        <View style={styles.purchaseRight}>
                          <Text style={styles.purchaseAmount}>{currency} {Number(p.total).toLocaleString()}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: statusColor(p.status) + '15' }]}>
                            <Text style={[styles.statusBadgeText, { color: statusColor(p.status) }]}>
                              {p.status}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Add/Edit Modal ─────────────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? 'Edit Customer' : 'New Customer'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Full Name *</Text>
                <TextInput style={styles.fieldInput} value={fullName} onChangeText={setFullName} placeholder="Customer full name" placeholderTextColor={COLORS.textMuted} autoCapitalize="words" />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <TextInput style={styles.fieldInput} value={phone} onChangeText={setPhone} placeholder="e.g. 0712 345 678" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput style={styles.fieldInput} value={email} onChangeText={setEmail} placeholder="example@email.com" placeholderTextColor={COLORS.textMuted} keyboardType="email-address" autoCapitalize="none" />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Address</Text>
                <TextInput style={[styles.fieldInput, styles.multilineInput]} value={address} onChangeText={setAddress} placeholder="Street, area, city" placeholderTextColor={COLORS.textMuted} multiline />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput style={[styles.fieldInput, styles.multilineInput]} value={notes} onChangeText={setNotes} placeholder="Internal notes about this customer..." placeholderTextColor={COLORS.textMuted} multiline />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.saveBtnText}>{editId ? 'Update' : 'Save'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: { padding: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  headerTitle: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  headerSubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  headerDate: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: '600', marginTop: SPACING.sm },

  // Overview Card
  overviewCard: { margin: SPACING.md, backgroundColor: COLORS.primary, borderRadius: RADIUS.xl, padding: SPACING.lg, flexDirection: 'row', justifyContent: 'space-between', ...SHADOWS.md },
  overviewLeft: { flex: 1 },
  overviewLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  overviewValue: { color: COLORS.white, fontSize: 32, fontWeight: '800', marginBottom: 4 },
  overviewCount: { color: 'rgba(255,255,255,0.9)', fontSize: FONTS.sizes.sm, fontWeight: '500' },
  overviewBudgetRow: { marginTop: SPACING.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: SPACING.sm },
  overviewBudgetSub: { color: 'rgba(255,255,255,0.7)', fontSize: FONTS.sizes.xs, marginBottom: 2 },
  overviewBudgetValue: { color: COLORS.white, fontSize: FONTS.sizes.base, fontWeight: '700' },
  overviewRight: { alignItems: 'flex-end', justifyContent: 'space-between', paddingLeft: SPACING.md },
  circularFrame: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.white, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.full },
  addBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' },

  // Insights
  insightsWrap: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  insightsTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  insightsList: { gap: SPACING.xs },
  insightCard: { backgroundColor: COLORS.surface, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  insightText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },

  // Filters
  filtersSection: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, height: 44, gap: SPACING.sm },
  searchInput: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text } as any,
  ledgerHeader: { fontSize: FONTS.sizes.md, fontWeight: '700', color: COLORS.text, marginLeft: SPACING.md, marginBottom: SPACING.sm },

  // Empty
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING['2xl'], gap: SPACING.xs },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  emptyTitle: { color: COLORS.text, fontSize: FONTS.sizes.base, fontWeight: '700' },
  emptySub: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', maxWidth: 340 },

  // Card
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.primary },
  name: { color: COLORS.text, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  meta: { marginTop: 2, color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
  cardActions: { flexDirection: 'row', gap: SPACING.xs },
  iconBtn: {
    width: 30, height: 30, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceAlt,
  },

  // Notes in card
  notesRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, marginLeft: 54 },
  notesText: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontStyle: 'italic', flex: 1 },

  statsRow: { marginTop: SPACING.sm, flexDirection: 'row', gap: SPACING.xs },
  statPill: {
    flex: 1, backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm,
  },
  statLabel: { color: COLORS.textMuted, fontSize: 10 },
  statVal: { marginTop: 2, color: COLORS.text, fontSize: FONTS.sizes.xs, fontWeight: '700' },

  // Detail Modal
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  detailCard: { backgroundColor: COLORS.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '90%' },
  detailHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  detailTitle: { fontSize: FONTS.sizes.md, fontWeight: '700', color: COLORS.text },

  profileCard: { alignItems: 'center', padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border },
  profileAvatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primary + '20',
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  profileAvatarText: { fontSize: FONTS.sizes.xl, fontWeight: '700', color: COLORS.primary },
  profileName: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  profileSub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  profileSince: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: SPACING.sm },

  detailStatsRow: { flexDirection: 'row', gap: SPACING.sm },
  detailStatCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.base,
    borderWidth: 1, borderColor: COLORS.border, borderTopWidth: 3, alignItems: 'center',
  },
  detailStatLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  detailStatValue: { fontSize: FONTS.sizes.md, fontWeight: '700', color: COLORS.text, marginTop: 4 },

  notesCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.base,
    borderWidth: 1, borderColor: COLORS.border,
  },
  notesCardTitle: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.xs },
  notesCardText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },

  purchaseSection: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.base,
    borderWidth: 1, borderColor: COLORS.border,
  },
  purchaseTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  purchaseEmpty: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.sm },
  purchaseEmptyText: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  purchaseRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceAlt,
  },
  purchaseLeft: {},
  purchaseOrder: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  purchaseDate: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  purchaseRight: { alignItems: 'flex-end', gap: 4 },
  purchaseAmount: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  statusBadgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },

  // Add/Edit Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: SPACING.base },
  modalCard: {
    width: '100%', maxWidth: 460, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: SPACING.base, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { color: COLORS.text, fontSize: FONTS.sizes.base, fontWeight: '700' },
  fieldWrap: { marginBottom: SPACING.sm },
  fieldLabel: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginBottom: 4 },
  fieldInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt, color: COLORS.text, paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm, fontSize: FONTS.sizes.sm,
  } as any,
  multilineInput: { minHeight: 76, textAlignVertical: 'top' },
  modalActions: { marginTop: SPACING.sm, flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.xs },
  cancelBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: FONTS.sizes.xs },
  saveBtn: {
    borderRadius: RADIUS.md, backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, minWidth: 92, alignItems: 'center',
  },
  saveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.xs },
});
