import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { format } from 'date-fns';

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

export function MessagesScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composeVisible, setComposeVisible] = useState(false);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async (silent = false) => {
    if (!user?.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!refreshing && !silent) setLoading(true);

    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, body, type, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      Alert.alert('Error', error.message);
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setItems((data as NotificationRow[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id, refreshing]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useRealtimeSubscription('owner-messages-rt', 'notifications', () => fetchItems(true), !!user?.id);

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const handleCreate = async () => {
    if (!user?.id) {
      Alert.alert('Unavailable', 'User session missing. Please sign in again.');
      return;
    }
    if (!composeTitle.trim() || !composeBody.trim()) {
      Alert.alert('Required', 'Please enter both title and message.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('notifications').insert({
      user_id: user.id,
      title: composeTitle.trim(),
      body: composeBody.trim(),
      type: 'system',
      is_read: false,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setComposeVisible(false);
    setComposeTitle('');
    setComposeBody('');
    fetchItems();
  };

  const handleToggleRead = async (row: NotificationRow) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: !row.is_read })
      .eq('id', row.id)
      .eq('user_id', user?.id ?? '');

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    fetchItems();
  };

  const handleDelete = (row: NotificationRow) => {
    Alert.alert('Delete Message', 'This message will be removed permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', row.id)
            .eq('user_id', user?.id ?? '');

          if (error) {
            Alert.alert('Error', error.message);
            return;
          }

          fetchItems();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.subtitle}>{items.length} total · {unreadCount} unread</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setComposeVisible(true)}>
          <Ionicons name="add" size={14} color={COLORS.white} />
          <Text style={styles.addBtnText}>New Message</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.listWrap} showsVerticalScrollIndicator={false}>
          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-ellipses-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No messages yet</Text>
            </View>
          ) : (
            items.map((row) => (
              <View key={row.id} style={[styles.card, !row.is_read && styles.cardUnread]}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{row.title}</Text>
                  <Text style={styles.cardTime}>{format(new Date(row.created_at), 'dd MMM · HH:mm')}</Text>
                </View>
                <Text style={styles.cardBody}>{row.body}</Text>

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleRead(row)}>
                    <Ionicons
                      name={row.is_read ? 'mail-unread-outline' : 'mail-open-outline'}
                      size={14}
                      color={COLORS.info}
                    />
                    <Text style={[styles.actionText, { color: COLORS.info }]}>Mark {row.is_read ? 'Unread' : 'Read'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(row)}>
                    <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                    <Text style={[styles.actionText, { color: COLORS.error }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={composeVisible} transparent animationType="fade" onRequestClose={() => setComposeVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Create Message</Text>
              <TouchableOpacity onPress={() => setComposeVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Title"
              placeholderTextColor={COLORS.textMuted}
              value={composeTitle}
              onChangeText={setComposeTitle}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Message body"
              placeholderTextColor={COLORS.textMuted}
              value={composeBody}
              onChangeText={setComposeBody}
              multiline
              numberOfLines={5}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setComposeVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.base,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  title: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  subtitle: { marginTop: 2, fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
  },
  addBtnText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  listWrap: { padding: SPACING.base, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
  },
  cardUnread: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.infoLight,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm },
  cardTitle: { flex: 1, fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  cardTime: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  cardBody: { marginTop: SPACING.xs, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  actionsRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING['2xl'], gap: SPACING.sm },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.base,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
  },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  modalTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    color: COLORS.text,
    fontSize: FONTS.sizes.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: SPACING.sm },
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
