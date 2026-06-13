import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { format } from 'date-fns';

type TicketRow = {
  id: string;
  subject: string;
  body: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
};

type ThreadMessageRow = {
  id: string;
  ticket_id: string;
  sender_role: 'owner' | 'admin';
  message: string;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  open: COLORS.info,
  in_progress: COLORS.warning,
  resolved: COLORS.success,
  closed: COLORS.textMuted,
};

const PRIORITY_COLORS: Record<string, string> = {
  low: COLORS.success,
  normal: COLORS.info,
  high: COLORS.warning,
  urgent: COLORS.error,
};

export function SupportScreen() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<TicketRow['priority']>('normal');

  const [activeTicket, setActiveTicket] = useState<TicketRow | null>(null);
  const [thread, setThread] = useState<ThreadMessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadSaving, setThreadSaving] = useState(false);
  const [threadText, setThreadText] = useState('');
  const [threadError, setThreadError] = useState<string | null>(null);

  const fetchTickets = useCallback(async (silent = false) => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, subject, body, status, priority, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      Alert.alert('Error', error.message);
      setTickets([]);
      setLoading(false);
      return;
    }

    setTickets((data as TicketRow[]) ?? []);
    setLoading(false);
  }, [user?.id]);

  const fetchThread = useCallback(async (ticketId: string, silent = false) => {
    if (!silent) setThreadLoading(true);
    setThreadError(null);
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .select('id, ticket_id, sender_role, message, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      setThread([]);
      setThreadLoading(false);
      setThreadError(error.message);
      return;
    }

    setThread((data as ThreadMessageRow[]) ?? []);
    setThreadLoading(false);
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useRealtimeSubscription('owner-support-rt', 'support_tickets', () => fetchTickets(true), !!user?.id);
  useRealtimeSubscription(
    'owner-support-messages-rt',
    'support_ticket_messages',
    () => {
      if (activeTicket?.id) fetchThread(activeTicket.id, true);
      fetchTickets(true);
    },
    !!user?.id,
  );

  const openCount = useMemo(() => tickets.filter((t) => t.status === 'open').length, [tickets]);

  const handleCreate = async () => {
    if (!user?.id) {
      Alert.alert('Unavailable', 'User session missing. Please sign in again.');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      Alert.alert('Required', 'Please add subject and message body.');
      return;
    }

    setSaving(true);
    const { data: createdTicket, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject: subject.trim(),
        body: body.trim(),
        priority,
        status: 'open',
      })
      .select('id')
      .maybeSingle();

    if (!error && createdTicket?.id) {
      const { error: threadInsertError } = await supabase.from('support_ticket_messages').insert({
        ticket_id: createdTicket.id,
        sender_user_id: user.id,
        sender_role: 'owner',
        message: body.trim(),
      });

      if (threadInsertError) {
        setSaving(false);
        Alert.alert('Messaging Not Ready', `${threadInsertError.message}\n\nRun scripts/support-messaging-module.sql in Supabase SQL Editor.`);
        return;
      }
    }

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setModalOpen(false);
    setSubject('');
    setBody('');
    setPriority('normal');
    fetchTickets();
  };

  const handleCloseTicket = (ticket: TicketRow) => {
    Alert.alert('Close Ticket', 'This marks the ticket as closed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close',
        onPress: async () => {
          const { error } = await supabase
            .from('support_tickets')
            .update({ status: 'closed' })
            .eq('id', ticket.id)
            .eq('user_id', user?.id ?? '');

          if (error) {
            Alert.alert('Error', error.message);
            return;
          }

          fetchTickets();
        },
      },
    ]);
  };

  const handleDelete = (ticket: TicketRow) => {
    Alert.alert('Delete Ticket', 'Deleted tickets cannot be restored.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('support_tickets')
            .delete()
            .eq('id', ticket.id)
            .eq('user_id', user?.id ?? '');

          if (error) {
            Alert.alert('Error', error.message);
            return;
          }

          fetchTickets();
        },
      },
    ]);
  };

  const openThread = (ticket: TicketRow) => {
    setActiveTicket(ticket);
    setThreadText('');
    fetchThread(ticket.id);
  };

  const handleSendThreadMessage = async () => {
    if (!user?.id || !activeTicket || !threadText.trim()) return;

    setThreadSaving(true);
    const { error } = await supabase.from('support_ticket_messages').insert({
      ticket_id: activeTicket.id,
      sender_user_id: user.id,
      sender_role: 'owner',
      message: threadText.trim(),
    });

    if (!error && activeTicket.status === 'closed') {
      await supabase
        .from('support_tickets')
        .update({ status: 'open' })
        .eq('id', activeTicket.id)
        .eq('user_id', user.id);
      setActiveTicket({ ...activeTicket, status: 'open' });
    }

    setThreadSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setThreadText('');
    fetchThread(activeTicket.id, true);
    fetchTickets(true);
  };

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.subtitle}>{tickets.length} tickets · {openCount} open</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
          <Ionicons name="add" size={14} color={COLORS.white} />
          <Text style={styles.addBtnText}>New Ticket</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.listWrap} showsVerticalScrollIndicator={false}>
        {tickets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="help-buoy-outline" size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No support tickets yet</Text>
          </View>
        ) : (
          tickets.map((ticket) => (
            <View key={ticket.id} style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.subject}>{ticket.subject}</Text>
                <Text style={styles.dateText}>{format(new Date(ticket.created_at), 'dd MMM · HH:mm')}</Text>
              </View>

              <Text style={styles.body}>{ticket.body}</Text>

              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: STATUS_COLORS[ticket.status] + '22' }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLORS[ticket.status] }]}>{ticket.status.replace('_', ' ')}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: PRIORITY_COLORS[ticket.priority] + '22' }]}>
                  <Text style={[styles.badgeText, { color: PRIORITY_COLORS[ticket.priority] }]}>{ticket.priority}</Text>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openThread(ticket)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.primary} />
                  <Text style={[styles.actionText, { color: COLORS.primary }]}>Open Chat</Text>
                </TouchableOpacity>

                {ticket.status !== 'closed' && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleCloseTicket(ticket)}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.success} />
                    <Text style={[styles.actionText, { color: COLORS.success }]}>Close</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(ticket)}>
                  <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                  <Text style={[styles.actionText, { color: COLORS.error }]}>Delete</Text>
                </TouchableOpacity>
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

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Create Support Ticket</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Subject"
              placeholderTextColor={COLORS.textMuted}
              value={subject}
              onChangeText={setSubject}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe your issue"
              placeholderTextColor={COLORS.textMuted}
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={5}
            />

            <View style={styles.priorityRow}>
              {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityChip, priority === p && styles.priorityChipActive]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[styles.priorityText, priority === p && styles.priorityTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.saveBtnText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!activeTicket} transparent animationType="slide" onRequestClose={() => setActiveTicket(null)}>
        <View style={styles.modalOverlayBottom}>
          <View style={styles.threadModal}>
            <View style={styles.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Support Chat</Text>
                <Text style={styles.threadSubTitle} numberOfLines={1}>{activeTicket?.subject}</Text>
              </View>
              <TouchableOpacity onPress={() => setActiveTicket(null)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {threadLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.lg }} />
            ) : threadError ? (
              <View style={styles.threadErrorBox}>
                <Text style={styles.threadErrorTitle}>Thread unavailable</Text>
                <Text style={styles.threadErrorText}>{threadError}</Text>
                <Text style={styles.threadErrorText}>Run scripts/support-messaging-module.sql in Supabase SQL Editor.</Text>
              </View>
            ) : (
              <ScrollView style={styles.threadList} contentContainerStyle={styles.threadListContent}>
                {thread.length === 0 ? (
                  <Text style={styles.emptyText}>No replies yet</Text>
                ) : (
                  thread.map((msg) => {
                    const mine = msg.sender_role === 'owner';
                    return (
                      <View key={msg.id} style={[styles.msgBubble, mine ? styles.msgBubbleMine : styles.msgBubbleAdmin]}>
                        <Text style={styles.msgLabel}>{mine ? 'You' : 'Admin'}</Text>
                        <Text style={styles.msgText}>{msg.message}</Text>
                        <Text style={styles.msgTime}>{format(new Date(msg.created_at), 'dd MMM · HH:mm')}</Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}

            <View style={styles.threadInputRow}>
              <TextInput
                style={styles.threadInput}
                placeholder="Write a reply to admin"
                placeholderTextColor={COLORS.textMuted}
                value={threadText}
                onChangeText={setThreadText}
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity
                style={[styles.threadSendBtn, (!threadText.trim() || threadSaving || !!threadError) && { opacity: 0.5 }]}
                onPress={handleSendThreadMessage}
                disabled={!threadText.trim() || threadSaving || !!threadError}
              >
                {threadSaving ? <ActivityIndicator color={COLORS.white} size="small" /> : <Ionicons name="send" size={16} color={COLORS.white} />}
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
    backgroundColor: 'transparent',
    zIndex: 20,
    elevation: 20,
  },
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
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm },
  subject: { flex: 1, fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  dateText: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  body: { marginTop: SPACING.xs, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  badgeRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.full },
  badgeText: { fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'capitalize' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
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
  modalOverlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
  },
  threadModal: {
    height: '80%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.base,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  modalTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  threadSubTitle: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
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
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
  priorityChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  priorityChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  priorityText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, textTransform: 'capitalize' },
  priorityTextActive: { color: COLORS.white, fontWeight: '700' },
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
  threadList: { flex: 1, marginBottom: SPACING.sm },
  threadListContent: { gap: SPACING.sm, paddingBottom: SPACING.sm },
  msgBubble: {
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    maxWidth: '88%',
  },
  msgBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary + '55',
  },
  msgBubbleAdmin: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceAlt,
    borderColor: COLORS.border,
  },
  msgLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '700', marginBottom: 3 },
  msgText: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  msgTime: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 4 },
  threadInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.xs },
  threadInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    color: COLORS.text,
    fontSize: FONTS.sizes.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 54,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  threadSendBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadErrorBox: {
    borderWidth: 1,
    borderColor: COLORS.error + '55',
    backgroundColor: COLORS.errorLight,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    gap: 4,
  },
  threadErrorTitle: { fontSize: FONTS.sizes.sm, color: COLORS.error, fontWeight: '700' },
  threadErrorText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
});
