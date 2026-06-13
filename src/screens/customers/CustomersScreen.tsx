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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, FONTS, RADIUS, SPACING } from '../../lib/constants';

type CustomerRow = {
  id: string;
  business_id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  credit_balance: number;
  loyalty_points: number;
  created_at: string;
};

export function CustomersScreen() {
  const { business } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const resetForm = () => {
    setEditId(null);
    setFullName('');
    setPhone('');
    setEmail('');
    setAddress('');
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
    setModalVisible(true);
  };

  const fetchRows = useCallback(async (silent = false) => {
    if (!business?.id) {
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);

    const { data, error } = await supabase
      .from('customers')
      .select('id, business_id, full_name, phone, email, address, credit_balance, loyalty_points, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Error', error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as CustomerRow[]) ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useRealtimeSubscription('customers-rt', 'customers', () => fetchRows(true), !!business?.id);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.full_name.toLowerCase().includes(q)
        || (r.phone ?? '').toLowerCase().includes(q)
        || (r.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  const handleSave = async () => {
    if (!business?.id) return;

    const name = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!name) {
      Alert.alert('Name required', 'Please enter customer full name.');
      return;
    }

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
      business_id: business.id,
    };

    if (editId) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editId);
      if (error) {
        setSaving(false);
        Alert.alert('Update failed', error.message);
        return;
      }
      setSaving(false);
      setModalVisible(false);
      resetForm();
      fetchRows(true);
      return;
    }

    const { error } = await supabase.from('customers').insert(payload);
    setSaving(false);

    if (error) {
      Alert.alert('Create failed', error.message);
      return;
    }

    setModalVisible(false);
    resetForm();
    fetchRows(true);
  };

  const handleDelete = (row: CustomerRow) => {
    Alert.alert('Delete customer', `Delete ${row.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('customers').delete().eq('id', row.id);
          if (error) {
            Alert.alert('Delete failed', error.message);
            return;
          }
          fetchRows(true);
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topRow, isMobile && styles.topRowMobile]}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, phone or email"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={openNewModal}>
          <Ionicons name="person-add-outline" size={16} color={COLORS.white} />
          <Text style={styles.addBtnText}>New Customer</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING['2xl'] }}>
        {filteredRows.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No customers found</Text>
            <Text style={styles.emptySub}>Create your first customer to track contacts and purchase history.</Text>
          </View>
        ) : (
          filteredRows.map((row) => (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{row.full_name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{row.phone || 'No phone'}{row.email ? ` • ${row.email}` : ''}</Text>
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

              {!!row.address && (
                <Text style={styles.addressText} numberOfLines={2}>{row.address}</Text>
              )}

              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Text style={styles.statLabel}>Credit</Text>
                  <Text style={styles.statVal}>TZS {Number(row.credit_balance ?? 0).toLocaleString()}</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statLabel}>Loyalty</Text>
                  <Text style={styles.statVal}>{Number(row.loyalty_points ?? 0)} pts</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      )}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? 'Edit Customer' : 'New Customer'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <TextInput
                style={styles.fieldInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Customer full name"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.fieldInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. 0712 345 678"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.fieldInput}
                value={email}
                onChangeText={setEmail}
                placeholder="example@email.com"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Address</Text>
              <TextInput
                style={[styles.fieldInput, styles.multilineInput]}
                value={address}
                onChangeText={setAddress}
                placeholder="Street, area, city"
                placeholderTextColor={COLORS.textMuted}
                multiline
              />
            </View>

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
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.base,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    zIndex: 20,
    elevation: 20,
  },
  topRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.base,
  },
  topRowMobile: {
    flexDirection: 'column',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONTS.sizes.sm,
  },
  addBtn: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
  },
  addBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: FONTS.sizes.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['2xl'],
    gap: SPACING.xs,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
  },
  emptySub: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
    textAlign: 'center',
    maxWidth: 340,
  },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  name: {
    color: COLORS.text,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
  },
  cardActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  addressText: {
    marginTop: SPACING.xs,
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
  },
  statsRow: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  statPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
  statVal: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.base,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: SPACING.base,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
  },
  fieldWrap: {
    marginBottom: SPACING.sm,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    marginBottom: 4,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    color: COLORS.text,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.sm,
  },
  multilineInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  modalActions: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.xs,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: FONTS.sizes.xs,
  },
  saveBtn: {
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minWidth: 92,
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: FONTS.sizes.xs,
  },
});
