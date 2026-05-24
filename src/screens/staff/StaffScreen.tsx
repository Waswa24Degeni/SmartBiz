import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING, BREAKPOINTS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

interface StaffRow {
  id: string;
  business_id: string;
  user_id: string;
  role: 'manager' | 'cashier' | 'waiter';
  is_active: boolean;
  permissions: string[];
  shift_start?: string | null;
  shift_end?: string | null;
  user?: {
    id: string;
    full_name: string;
    email: string;
    phone?: string | null;
  } | null;
}

const PERMISSION_OPTIONS = [
  { key: 'dashboard',   label: 'Dashboard' },
  { key: 'inventory',   label: 'Inventory' },
  { key: 'pos',         label: 'POS' },
  { key: 'reports',     label: 'Reports' },
  { key: 'messages',    label: 'Messages' },
  { key: 'bills',       label: 'Bills' },
  { key: 'customers',   label: 'Customers' },
  { key: 'pos',         label: 'Wallet' },
  { key: 'settings',    label: 'Settings' },
  { key: 'support',     label: 'Support' },
  { key: 'staff_manage', label: 'Staff Management' },
] as const;

const ROLE_DEFAULT_PERMS: Record<'manager' | 'cashier' | 'waiter', string[]> = {
  manager: ['dashboard', 'inventory', 'pos', 'reports', 'messages', 'bills', 'customers', 'settings', 'support'],
  cashier: ['dashboard', 'pos', 'bills', 'messages'],  // pos key also grants Wallet access
  waiter:  ['pos', 'bills', 'messages'],
};

const onboardingClient = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

function generateTempPassword() {
  const random = Math.random().toString(36).slice(2, 10);
  return `Sb@${random}9`;
}

function normalizeEmail(raw: string) {
  return raw
    .trim()
    .replace(/^['\"]+|['\"]+$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getRoleColor(role: StaffRow['role']) {
  if (role === 'manager') return COLORS.info;
  if (role === 'cashier') return COLORS.success;
  return COLORS.accent;
}

export function StaffScreen() {
  const { business, user } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const isNarrow = width < 400;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<StaffRow[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [tempPassword, setTempPassword] = useState(generateTempPassword());
  const [role, setRole] = useState<'manager' | 'cashier' | 'waiter'>('cashier');
  const [isActive, setIsActive] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([...ROLE_DEFAULT_PERMS.cashier]);

  const canManageStaff = user?.role === 'owner' || user?.role === 'admin';

  const resetForm = () => {
    setEmail('');
    setFullName('');
    setTempPassword(generateTempPassword());
    setRole('cashier');
    setIsActive(true);
    setPermissions([...ROLE_DEFAULT_PERMS.cashier]);
    setEditTarget(null);
  };

  const fetchRows = useCallback(async () => {
    if (!business?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('staff')
      .select('id, business_id, user_id, role, is_active, permissions, shift_start, shift_end, user:users(id, full_name, email, phone)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });

    if (error) {
      setLoading(false);
      Alert.alert('Error', `Could not load staff: ${error.message}`);
      return;
    }

    const mapped = (data ?? []).map((r: any) => ({
      ...r,
      permissions: Array.isArray(r.permissions) ? r.permissions : [],
      user: Array.isArray(r.user) ? r.user[0] : r.user,
    }));
    setRows(mapped as StaffRow[]);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (!business?.id) return;
    const ch = supabase
      .channel(`staff-module:${business.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff', filter: `business_id=eq.${business.id}` }, () => fetchRows())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [business?.id, fetchRows]);

  const openCreate = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (row: StaffRow) => {
    setEditTarget(row);
    setEmail(row.user?.email ?? '');
    setFullName(row.user?.full_name ?? '');
    setRole(row.role);
    setIsActive(row.is_active);
    setTempPassword('');
    setPermissions(row.permissions?.length ? row.permissions : [...ROLE_DEFAULT_PERMS[row.role]]);
    setModalVisible(true);
  };

  const findUserByEmail = async (emailLower: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, business_id, role')
      .ilike('email', emailLower)
      .maybeSingle();
    return { data, error };
  };

  const togglePermission = (key: string) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  };

  const applyRoleDefaults = (nextRole: 'manager' | 'cashier' | 'waiter') => {
    setRole(nextRole);
    setPermissions([...ROLE_DEFAULT_PERMS[nextRole]]);
  };

  const handleSave = async () => {
    if (!business?.id) return;
    if (!canManageStaff) {
      Alert.alert('Access denied', 'Only owners can manage staff.');
      return;
    }

    const emailTrimmed = normalizeEmail(email);
    setEmail(emailTrimmed);
    if (!emailTrimmed) {
      Alert.alert('Required', 'Please enter staff email.');
      return;
    }
    if (!isValidEmail(emailTrimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address (example: name@domain.com).');
      return;
    }

    setSaving(true);

    // Staff account must already exist in auth/users. We only link it to business and permissions.
    let { data: foundUser, error: userErr } = await findUserByEmail(emailTrimmed);

    if (userErr) {
      setSaving(false);
      Alert.alert('Error', userErr.message);
      return;
    }

    let createdNewAccount = false;

    if (!foundUser && !editTarget) {
      if (!fullName.trim()) {
        setSaving(false);
        Alert.alert('Required', 'Please enter staff full name for the new account.');
        return;
      }
      if (!tempPassword || tempPassword.length < 8) {
        setSaving(false);
        Alert.alert('Weak password', 'Please provide at least 8 characters for temporary password.');
        return;
      }

      const { error: signErr } = await onboardingClient.auth.signUp({
        email: emailTrimmed,
        password: tempPassword,
        options: {
          data: { full_name: fullName.trim() },
        },
      });

      if (signErr) {
        const msg = (signErr.message || '').toLowerCase();
        const isAlready = msg.includes('already');
        const isRateLimited =
          msg.includes('rate') ||
          msg.includes('too many') ||
          msg.includes('over_email_send_rate_limit');

        if (!isAlready) {
          setSaving(false);
          if (isRateLimited) {
            Alert.alert(
              'Email rate limit exceeded',
              'Too many account emails were sent recently. Wait a few minutes, then try Add Staff again with the same email.',
            );
          } else {
            Alert.alert('Cannot create account', signErr.message);
          }
          return;
        }
      }

      createdNewAccount = true;

      // Wait briefly for trigger/profile row to appear.
      for (let i = 0; i < 5; i += 1) {
        const retry = await findUserByEmail(emailTrimmed);
        if (retry.error) {
          setSaving(false);
          Alert.alert('Error', retry.error.message);
          return;
        }
        if (retry.data) {
          foundUser = retry.data;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }

    if (!foundUser) {
      setSaving(false);
      Alert.alert(
        'Account created, not ready yet',
        'We created the staff auth account, but profile row is not visible yet. Wait a few seconds and try Add Staff again.',
      );
      return;
    }

    if (foundUser.business_id && foundUser.business_id !== business.id) {
      setSaving(false);
      Alert.alert('Blocked', 'This user already belongs to another business.');
      return;
    }

    const { error: upUserErr } = await supabase
      .from('users')
      .update({
        business_id: business.id,
        role: 'staff',
        updated_at: new Date().toISOString(),
      })
      .eq('id', foundUser.id);

    if (upUserErr) {
      setSaving(false);
      Alert.alert('Error', upUserErr.message);
      return;
    }

    const payload = {
      business_id: business.id,
      user_id: foundUser.id,
      role,
      is_active: isActive,
      permissions,
    };

    if (editTarget) {
      const { error } = await supabase
        .from('staff')
        .update(payload)
        .eq('id', editTarget.id);

      setSaving(false);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
    } else {
      // If already linked, update. Otherwise insert.
      const existing = rows.find((r) => r.user_id === foundUser.id);
      if (existing) {
        const { error } = await supabase
          .from('staff')
          .update(payload)
          .eq('id', existing.id);
        setSaving(false);
        if (error) {
          Alert.alert('Error', error.message);
          return;
        }
      } else {
        const { error } = await supabase
          .from('staff')
          .insert(payload);
        setSaving(false);
        if (error) {
          Alert.alert('Error', error.message);
          return;
        }
      }
    }

    setModalVisible(false);
    resetForm();
    fetchRows();

    if (createdNewAccount) {
      Alert.alert(
        'Staff account created',
        `Temporary password: ${tempPassword}\n\nAsk staff to log in and change password immediately.`,
      );
    }
  };

  const deactivate = (row: StaffRow) => {
    Alert.alert('Deactivate Staff', `Deactivate ${row.user?.full_name ?? row.user?.email ?? 'staff'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('staff')
            .update({ is_active: false })
            .eq('id', row.id);
          if (error) {
            Alert.alert('Error', error.message);
            return;
          }
          fetchRows();
        },
      },
    ]);
  };

  const activeCount = useMemo(() => rows.filter((r) => r.is_active).length, [rows]);

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />;
  }

  if (!canManageStaff) {
    return (
      <View style={[styles.section, isMobile && styles.sectionMobile]}>
        <Text style={styles.sectionTitle}>Staff</Text>
        <View style={styles.formCard}>
          <Text style={styles.emptyText}>You do not have permission to manage staff.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.section, isMobile && styles.sectionMobile]}
      contentContainerStyle={{ paddingBottom: SPACING['2xl'] }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View>
          <Text style={[styles.sectionTitle, isMobile && styles.sectionTitleMobile]}>Staff & Permissions</Text>
          <Text style={styles.sectionSubtitle}>Control employee module access by permissions.</Text>
        </View>
        <TouchableOpacity style={[styles.addBtn, isMobile && styles.addBtnMobile]} onPress={openCreate}>
          <Ionicons name="add" size={16} color={COLORS.white} />
          <Text style={styles.addBtnText}>Add Staff</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.statsRow, isMobile && styles.statsRowMobile]}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{rows.length}</Text>
          <Text style={styles.statLabel}>Total Staff</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activeCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        {rows.length === 0 ? (
          <Text style={styles.emptyText}>No staff assigned yet.</Text>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={[styles.staffRow, isMobile && styles.staffRowMobile]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName}>{row.user?.full_name ?? row.user?.email ?? 'Unknown'}</Text>
                <Text style={styles.staffEmail}>{row.user?.email ?? '-'}</Text>
                <View style={styles.metaRow}>
                  <View style={[styles.roleBadge, { backgroundColor: getRoleColor(row.role) + '20' }]}>
                    <Text style={[styles.roleBadgeText, { color: getRoleColor(row.role) }]}>{row.role}</Text>
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: row.is_active ? COLORS.successLight : COLORS.errorLight }]}>
                    <Text style={[styles.roleBadgeText, { color: row.is_active ? COLORS.success : COLORS.error }]}>
                      {row.is_active ? 'active' : 'inactive'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.permText}>Perms: {row.permissions?.join(', ') || 'none'}</Text>
              </View>
              <View style={[styles.actionCol, isMobile && styles.actionColMobile]}>
                <TouchableOpacity style={[styles.actionBtn, isMobile && styles.actionBtnMobile]} onPress={() => openEdit(row)}>
                  <Ionicons name="create-outline" size={16} color={COLORS.info} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, isMobile && styles.actionBtnMobile]} onPress={() => deactivate(row)}>
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <ScrollView
            contentContainerStyle={[
              styles.modalBox,
              isMobile && styles.modalBoxMobile,
              isNarrow && styles.modalBoxNarrow,
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editTarget ? 'Edit Staff' : 'Add Staff'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Staff Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="staff@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!editTarget}
              placeholderTextColor={COLORS.textMuted}
            />

            {!editTarget && (
              <>
                <Text style={styles.label}>Full Name (for new account)</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Jane Doe"
                  placeholderTextColor={COLORS.textMuted}
                />

                <Text style={styles.label}>Temporary Password (for new account)</Text>
                <TextInput
                  style={styles.input}
                  value={tempPassword}
                  onChangeText={setTempPassword}
                  placeholder="Temporary password"
                  autoCapitalize="none"
                  secureTextEntry
                  placeholderTextColor={COLORS.textMuted}
                />
              </>
            )}

            <Text style={styles.label}>Role</Text>
            <View style={styles.chipsWrap}>
              {(['manager', 'cashier', 'waiter'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, role === r && styles.chipActive]}
                  onPress={() => applyRoleDefaults(r)}
                >
                  <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Permissions</Text>
            <View style={styles.permissionGrid}>
              {PERMISSION_OPTIONS.map((p, idx) => {
                const selected = permissions.includes(p.key);
                return (
                  <TouchableOpacity
                    key={`${p.key}-${idx}`}
                    style={[styles.permChip, selected && styles.permChipActive]}
                    onPress={() => togglePermission(p.key)}
                  >
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={15} color={selected ? COLORS.white : COLORS.textMuted} />
                    <Text style={[styles.permChipText, selected && styles.permChipTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.chipsWrap}>
                <TouchableOpacity style={[styles.chip, isActive && styles.chipActive]} onPress={() => setIsActive(true)}>
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>Active</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.chip, !isActive && styles.chipActive]} onPress={() => setIsActive(false)}>
                  <Text style={[styles.chipText, !isActive && styles.chipTextActive]}>Inactive</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.cancelBtn, isMobile && styles.modalBtnMobile]} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, isMobile && styles.modalBtnMobile, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    flex: 1,
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  sectionMobile: {
    padding: SPACING.base,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.base,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '800',
    color: COLORS.text,
  },
  sectionTitleMobile: {
    fontSize: FONTS.sizes.xl,
  },
  sectionSubtitle: {
    marginTop: 4,
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    minHeight: 44,
  },
  addBtnMobile: {
    width: '100%',
    justifyContent: 'center',
  },
  addBtnText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.base,
  },
  statsRowMobile: {
    flexDirection: 'column',
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
  },
  statValue: {
    color: COLORS.text,
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '800',
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
    paddingVertical: SPACING.xl,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceAlt,
    gap: SPACING.sm,
  },
  staffRowMobile: {
    flexDirection: 'column',
    gap: SPACING.xs,
  },
  staffName: {
    color: COLORS.text,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
  staffEmail: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  roleBadgeText: {
    fontSize: FONTS.sizes.xs,
    textTransform: 'capitalize',
    fontWeight: '700',
  },
  permText: {
    marginTop: 6,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
  },
  actionCol: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  actionColMobile: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
  },
  actionBtnMobile: {
    width: 44,
    height: 44,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: SPACING.base,
  },
  modalBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    gap: SPACING.xs,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  modalBoxMobile: {
    maxWidth: '100%',
    padding: SPACING.sm + 2,
  },
  modalBoxNarrow: {
    padding: SPACING.sm,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
  },
  label: {
    marginTop: SPACING.xs,
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    color: COLORS.text,
    fontSize: FONTS.sizes.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: 6,
  },
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
  chipText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
  permissionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: 6,
  },
  permChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    minHeight: 36,
  },
  permChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  permChipText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },
  permChipTextActive: {
    color: COLORS.white,
  },
  statusRow: {
    marginTop: SPACING.xs,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  modalBtnMobile: {
    minHeight: 46,
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: '700',
  },
});
