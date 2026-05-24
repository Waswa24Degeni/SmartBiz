import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  type: 'low_stock' | 'subscription' | 'sales' | 'system' | 'payment';
  is_read: boolean;
  created_at: string;
};

const TYPE_META: Record<NotificationRow['type'], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  low_stock: { label: 'Low Stock', color: COLORS.warning, icon: 'cube-outline' },
  subscription: { label: 'Subscription', color: COLORS.info, icon: 'calendar-outline' },
  sales: { label: 'Sales', color: COLORS.success, icon: 'cash-outline' },
  system: { label: 'System', color: COLORS.textMuted, icon: 'settings-outline' },
  payment: { label: 'Payment', color: COLORS.accent, icon: 'card-outline' },
};

export function NotificationsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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
      return;
    }

    setItems((data as NotificationRow[]) ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useRealtimeSubscription('notifications-screen-rt', 'notifications', () => fetchItems(), !!user?.id);

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const toggleRead = async (item: NotificationRow) => {
    if (!user?.id) return;
    setBusyId(item.id);
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: !item.is_read })
      .eq('id', item.id)
      .eq('user_id', user.id);

    setBusyId(null);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    fetchItems();
  };

  const deleteNotification = async (item: NotificationRow) => {
    if (!user?.id) return;
    setBusyId(item.id);
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', item.id)
      .eq('user_id', user.id);

    setBusyId(null);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    fetchItems();
  };

  const markAllRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    fetchItems();
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>{items.length} total · {unreadCount} unread</Text>
        </View>
        <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead} disabled={unreadCount === 0}>
          <Ionicons name="checkmark-done-outline" size={16} color={unreadCount === 0 ? COLORS.textMuted : COLORS.white} />
          <Text style={[styles.markAllText, unreadCount === 0 && { color: COLORS.textMuted }]}>Mark All Read</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listWrap}>
          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>System alerts, sales updates, and support messages will appear here.</Text>
            </View>
          ) : (
            items.map((item) => {
              const meta = TYPE_META[item.type] ?? TYPE_META.system;
              return (
                <View key={item.id} style={[styles.card, !item.is_read && styles.cardUnread]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeChip, { backgroundColor: meta.color + '18' }]}>
                      <Ionicons name={meta.icon} size={13} color={meta.color} />
                      <Text style={[styles.typeChipText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={styles.time}>{format(new Date(item.created_at), 'dd MMM · HH:mm')}</Text>
                  </View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardBody}>{item.body}</Text>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => toggleRead(item)} disabled={busyId === item.id}>
                      <Ionicons name={item.is_read ? 'mail-unread-outline' : 'mail-open-outline'} size={14} color={COLORS.info} />
                      <Text style={[styles.actionText, { color: COLORS.info }]}>{item.is_read ? 'Mark Unread' : 'Mark Read'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => deleteNotification(item)} disabled={busyId === item.id}>
                      <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                      <Text style={[styles.actionText, { color: COLORS.error }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  markAllText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: FONTS.sizes.sm,
  },
  listWrap: {
    paddingBottom: SPACING['2xl'],
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptyText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 380,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  cardUnread: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '08',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  typeChipText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  time: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
  },
  cardTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardBody: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 1,
  },
  actionText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
});