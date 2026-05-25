import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { useRealtimeSubscription } from '../../lib/hooks';

const ROLES = ['owner', 'staff', 'admin'] as const;
type UserRole = typeof ROLES[number] | 'banned';

const ROLE_BADGES: Record<string, { bg: string; text: string }> = {
  admin:   { bg: '#EDE9FE', text: '#7C3AED' },
  owner:   { bg: COLORS.infoLight, text: COLORS.info },
  staff:   { bg: COLORS.successLight, text: COLORS.success },
  banned:  { bg: COLORS.errorLight, text: COLORS.error },
};

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  business_name: string;
  created_at: string;
}

export function AdminUsersScreen() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('All');
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('owner');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at, business:businesses!fk_users_business(name)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[AdminUsers] fetch error:', error);
      setFetchError(error.message);
      setUsers([]);
    } else {
      setUsers(
        (data ?? []).map((u: any) => ({
          id: u.id,
          full_name: u.full_name ?? u.email ?? '—',
          email: u.email,
          role: (u.role ?? 'staff') as UserRole,
          business_name: u.business?.name ?? '—',
          created_at: u.created_at,
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useRealtimeSubscription('admin-users-rt', 'users', fetchUsers);

  const handleEditOpen = (user: UserRow) => {
    setEditTarget(user);
    setEditRole(user.role);
  };

  const handleSaveRole = async () => {
    if (!editTarget) return;
    setSaving(true);
    const { error } = await supabase.from('users').update({ role: editRole }).eq('id', editTarget.id);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setEditTarget(null);
    fetchUsers();
  };

  const handleToggleBan = (user: UserRow) => {
    const isBanned = user.role === 'banned';
    Alert.alert(
      isBanned ? 'Activate User' : 'Ban User',
      isBanned
        ? `Restore ${user.full_name}'s access?`
        : `Ban ${user.full_name}? They will lose access to the platform.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBanned ? 'Activate' : 'Ban',
          style: isBanned ? 'default' : 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('users')
              .update({ role: isBanned ? 'owner' : 'banned' })
              .eq('id', user.id);
            if (error) Alert.alert('Error', error.message);
            else fetchUsers();
          },
        },
      ]
    );
  };

  const roles = ['All', ...ROLES, 'banned'];
  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = filterRole === 'All' || u.role === filterRole;
    return matchSearch && matchRole;
  });

  return (
    <View style={styles.root}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email…"
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.roleFilters}>
            {roles.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.filterBtn, filterRole === r && styles.filterBtnActive]}
                onPress={() => setFilterRole(r)}
              >
                <Text style={[styles.filterText, filterRole === r && styles.filterTextActive]}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <View style={styles.totalPill}>
          <Text style={styles.totalText}>{filtered.length} users</Text>
        </View>
      </View>

      {fetchError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={32} color={COLORS.error} />
          <Text style={styles.errorTitle}>Unable to load users</Text>
          <Text style={styles.errorMsg}>{fetchError}</Text>
          <Text style={styles.errorHint}>
            If this is an RLS error, run scripts/fix-admin-rls.sql in Supabase SQL Editor.{`\n`}
            Also ensure your account has role = 'admin' in the users table.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchUsers}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 1.8 }]}>User</Text>
            <Text style={styles.th}>Role</Text>
            <Text style={[styles.th, { flex: 1.5 }]}>Business</Text>
            <Text style={styles.th}>Joined</Text>
            <Text style={[styles.th, { flex: 0.7 }]}>Actions</Text>
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>No users found</Text>
          ) : filtered.map(user => (
            <View key={user.id} style={styles.row}>
              <View style={[styles.cell, { flex: 1.8, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }]}>
                <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}>
                  <Text style={styles.avatarText}>{(user.full_name || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName} numberOfLines={1}>{user.full_name}</Text>
                  <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
                </View>
              </View>
              <View style={styles.cell}>
                <View style={[styles.badge, { backgroundColor: ROLE_BADGES[user.role]?.bg ?? COLORS.border }]}>
                  <Text style={[styles.badgeText, { color: ROLE_BADGES[user.role]?.text ?? COLORS.text }]}>{user.role}</Text>
                </View>
              </View>
              <View style={[styles.cell, { flex: 1.5 }]}>
                <Text style={styles.cellText} numberOfLines={1}>{user.business_name}</Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.cellMuted}>{format(new Date(user.created_at), 'dd MMM yyyy')}</Text>
              </View>
              <View style={[styles.cell, { flex: 0.7, flexDirection: 'row', gap: 5 }]}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditOpen(user)}>
                  <Ionicons name="create-outline" size={15} color={COLORS.info} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: user.role === 'banned' ? COLORS.successLight : COLORS.errorLight }]}
                  onPress={() => handleToggleBan(user)}
                >
                  <Ionicons
                    name={user.role === 'banned' ? 'checkmark-circle-outline' : 'ban-outline'}
                    size={15}
                    color={user.role === 'banned' ? COLORS.success : COLORS.error}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      )}

      {/* Edit Role Modal */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Role</Text>
              <TouchableOpacity onPress={() => setEditTarget(null)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>{editTarget?.full_name}</Text>
            <View style={styles.roleGrid}>
              {ROLES.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleOption, editRole === r && { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' }]}
                  onPress={() => setEditRole(r)}
                >
                  <View style={[styles.roleCheck, editRole === r && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}>
                    {editRole === r && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
                  </View>
                  <Text style={[styles.roleLabel, editRole === r && { color: COLORS.primary, fontWeight: '700' }]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveRole} disabled={saving}>
              {saving ? <ActivityIndicator color={COLORS.white} size="small" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
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
  roleFilters: { flexDirection: 'row', gap: 4 },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  filterTextActive: { color: COLORS.white, fontWeight: '600' },
  totalPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    backgroundColor: COLORS.infoLight,
    borderRadius: RADIUS.full,
  },
  totalText: { fontSize: FONTS.sizes.xs, color: COLORS.info, fontWeight: '600' },
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
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.white, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  userName: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  userEmail: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  cellText: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  cellMuted: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  actionBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: COLORS.infoLight, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: COLORS.textMuted, fontSize: FONTS.sizes.sm, padding: SPACING.xl },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  modal: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl, width: '100%', maxWidth: 360 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  modalSub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.base },
  roleGrid: { gap: SPACING.xs, marginBottom: SPACING.base },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  roleCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleLabel: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
  },
  saveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.base },
  errorBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.sm,
  },
  errorTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.error },
  errorMsg: {
    fontSize: FONTS.sizes.sm, color: COLORS.textSecondary,
    textAlign: 'center', fontFamily: 'monospace',
  },
  errorHint: {
    fontSize: FONTS.sizes.xs, color: COLORS.textMuted,
    textAlign: 'center', marginTop: SPACING.sm,
  },
  retryBtn: {
    marginTop: SPACING.md, paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  retryBtnText: { color: COLORS.white, fontWeight: '700' },
});
