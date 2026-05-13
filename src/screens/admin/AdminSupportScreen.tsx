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

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; icon: string }> = {
  urgent: { bg: COLORS.errorLight, text: COLORS.error, icon: 'warning-outline' },
  high:   { bg: COLORS.errorLight,   text: COLORS.error,   icon: 'arrow-up-circle' },
  normal: { bg: COLORS.infoLight, text: COLORS.info, icon: 'ellipse-outline' },
  medium: { bg: COLORS.warningLight, text: COLORS.warning, icon: 'remove-circle' },
  low:    { bg: COLORS.successLight, text: COLORS.success, icon: 'arrow-down-circle' },
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  open:        { bg: COLORS.infoLight,    text: COLORS.info,    label: 'Open' },
  in_progress: { bg: COLORS.warningLight, text: COLORS.warning, label: 'In Progress' },
  resolved:    { bg: COLORS.successLight, text: COLORS.success, label: 'Resolved' },
  closed:      { bg: COLORS.border,       text: COLORS.textMuted, label: 'Closed' },
};

const NEXT_STATUS: Record<string, string> = {
  open: 'in_progress',
  in_progress: 'resolved',
  resolved: 'closed',
};

interface TicketRow {
  id: string;
  subject: string;
  body: string;
  status: string;
  priority: string;
  created_at: string;
  user_name: string;
  business_name: string;
}

export function AdminSupportScreen() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [replyTarget, setReplyTarget] = useState<TicketRow | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySaving, setReplySaving] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('support_tickets')
      .select(`id, subject, body, status, priority, created_at, user:users(full_name, business:businesses!fk_users_business(name))`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AdminSupport] fetch error:', error);
      setFetchError(error.message);
      setTickets([]);
      setLoading(false);
      return;
    }
    setTickets(
      (data ?? []).map((t: any) => ({
        id: t.id,
        subject: t.subject,
        body: t.body,
        status: t.status,
        priority: t.priority ?? 'medium',
        created_at: t.created_at,
        user_name: t.user?.full_name ?? 'Unknown',
        business_name: t.user?.business?.name ?? '—',
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useRealtimeSubscription('admin-support-rt', 'support_tickets', fetchTickets);

  const handleStatusChange = async (ticket: TicketRow) => {
    const nextStatus = NEXT_STATUS[ticket.status] ?? 'closed';
    const { label: nextLabel } = STATUS_CONFIG[nextStatus] ?? { label: nextStatus };
    Alert.alert(
      'Update Status',
      `Mark ticket "${ticket.subject.slice(0, 40)}" as ${nextLabel}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextLabel,
          onPress: async () => {
            const { error } = await supabase
              .from('support_tickets')
              .update({ status: nextStatus })
              .eq('id', ticket.id);
            if (error) Alert.alert('Error', error.message);
            else fetchTickets();
          },
        },
      ]
    );
  };

  const handleSendReply = async () => {
    if (!replyTarget || !replyText.trim()) return;
    setReplySaving(true);
    // Update ticket status to in_progress if still open, and optionally store the reply note in body
    const updates: Record<string, string> = {
      status: replyTarget.status === 'open' ? 'in_progress' : replyTarget.status,
    };
    const { error } = await supabase
      .from('support_tickets')
      .update(updates)
      .eq('id', replyTarget.id);
    setReplySaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Reply Noted', 'Ticket status updated. Integrate email/push to deliver the reply.');
    setReplyText('');
    setReplyTarget(null);
    fetchTickets();
  };

  const open = tickets.filter(t => t.status === 'open').length;
  const inProgress = tickets.filter(t => t.status === 'in_progress').length;
  const resolved = tickets.filter(t => t.status === 'resolved').length;

  const statuses = ['all', 'open', 'in_progress', 'resolved', 'closed'];
  const filtered = tickets.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = t.subject.toLowerCase().includes(q) || t.business_name.toLowerCase().includes(q) || t.user_name.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <View style={styles.root}>
      {/* Summary */}
      <View style={styles.summaryRow}>
        {[
          { label: 'Open',        count: open,       color: COLORS.error,   bg: COLORS.errorLight,   icon: 'alert-circle-outline' },
          { label: 'In Progress', count: inProgress, color: COLORS.warning, bg: COLORS.warningLight, icon: 'time-outline' },
          { label: 'Resolved',    count: resolved,   color: COLORS.success, bg: COLORS.successLight, icon: 'checkmark-circle-outline' },
        ].map(s => (
          <View key={s.label} style={styles.summaryCard}>
            <View style={[styles.sumIcon, { backgroundColor: s.bg }]}>
              <Ionicons name={s.icon as any} size={18} color={s.color} />
            </View>
            <Text style={[styles.sumCount, { color: s.color }]}>{s.count}</Text>
            <Text style={styles.sumLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tickets…"
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {statuses.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.filterBtn, filterStatus === s && styles.filterBtnActive]}
                onPress={() => setFilterStatus(s)}
              >
                <Text style={[styles.filterText, filterStatus === s && styles.filterTextActive]}>
                  {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : fetchError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={32} color={COLORS.error} />
          <Text style={styles.errorTitle}>Unable to load tickets</Text>
          <Text style={styles.errorMsg}>{fetchError}</Text>
          <Text style={styles.errorHint}>Run scripts/fix-admin-rls.sql in Supabase SQL Editor.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchTickets}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 0.8 }]}>Ticket</Text>
            <Text style={[styles.th, { flex: 2.5 }]}>Subject</Text>
            <Text style={[styles.th, { flex: 1.5 }]}>Business</Text>
            <Text style={styles.th}>Priority</Text>
            <Text style={styles.th}>Status</Text>
            <Text style={styles.th}>Date</Text>
            <Text style={[styles.th, { flex: 0.8 }]}>Action</Text>
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>No tickets found</Text>
          ) : filtered.map(ticket => (
            <View key={ticket.id} style={styles.row}>
              <Text style={[styles.td, { flex: 0.8, color: COLORS.info, fontWeight: '700', fontSize: FONTS.sizes.xs }]}>
                #{ticket.id.slice(-6).toUpperCase()}
              </Text>
              <View style={[styles.cell, { flex: 2.5 }]}>
                <Text style={styles.subject} numberOfLines={2}>{ticket.subject}</Text>
                <Text style={styles.userText}>{ticket.user_name}</Text>
              </View>
              <Text style={[styles.td, { flex: 1.5 }]} numberOfLines={1}>{ticket.business_name}</Text>
              <View style={styles.cell}>
                <View style={[styles.badge, { backgroundColor: PRIORITY_CONFIG[ticket.priority]?.bg ?? COLORS.border }]}>
                  <Ionicons
                    name={PRIORITY_CONFIG[ticket.priority]?.icon as any}
                    size={11}
                    color={PRIORITY_CONFIG[ticket.priority]?.text ?? COLORS.text}
                  />
                  <Text style={[styles.badgeText, { color: PRIORITY_CONFIG[ticket.priority]?.text ?? COLORS.text }]}>
                    {ticket.priority}
                  </Text>
                </View>
              </View>
              <View style={styles.cell}>
                <TouchableOpacity
                  onPress={() => handleStatusChange(ticket)}
                  style={[styles.badge, { backgroundColor: STATUS_CONFIG[ticket.status]?.bg ?? COLORS.border }]}
                >
                  <Text style={[styles.badgeText, { color: STATUS_CONFIG[ticket.status]?.text ?? COLORS.text }]}>
                    {STATUS_CONFIG[ticket.status]?.label ?? ticket.status}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.tdMuted}>{format(new Date(ticket.created_at), 'dd MMM')}</Text>
              <View style={[styles.cell, { flex: 0.8 }]}>
                <TouchableOpacity
                  style={styles.replyBtn}
                  onPress={() => { setReplyTarget(ticket); setReplyText(''); }}
                >
                  <Ionicons name="chatbubble-outline" size={13} color={COLORS.primary} />
                  <Text style={styles.replyText}>Reply</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Reply Modal */}
      <Modal visible={!!replyTarget} transparent animationType="slide" onRequestClose={() => setReplyTarget(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reply to Ticket</Text>
              <TouchableOpacity onPress={() => setReplyTarget(null)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            {replyTarget && (
              <>
                <View style={styles.ticketPreview}>
                  <Text style={styles.previewLabel}>Subject:</Text>
                  <Text style={styles.previewText}>{replyTarget.subject}</Text>
                  <Text style={[styles.previewLabel, { marginTop: SPACING.xs }]}>From:</Text>
                  <Text style={styles.previewText}>{replyTarget.user_name} · {replyTarget.business_name}</Text>
                  {replyTarget.body ? (
                    <>
                      <Text style={[styles.previewLabel, { marginTop: SPACING.xs }]}>Message:</Text>
                      <Text style={styles.previewText}>{replyTarget.body}</Text>
                    </>
                  ) : null}
                </View>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Type your reply…"
                  placeholderTextColor={COLORS.textMuted}
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                  numberOfLines={4}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!replyText.trim() || replySaving) && { opacity: 0.5 }]}
                  onPress={handleSendReply}
                  disabled={!replyText.trim() || replySaving}
                >
                  <Ionicons name="send" size={16} color={COLORS.white} />
                  <Text style={styles.sendBtnText}>{replySaving ? 'Sending…' : 'Send Reply'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.base,
    padding: SPACING.base,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexWrap: 'wrap',
  },
  summaryCard: {
    flex: 1,
    minWidth: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
  },
  sumIcon: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  sumCount: { fontSize: FONTS.sizes.lg, fontWeight: '700' },
  sumLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
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
  filters: { flexDirection: 'row', gap: 4 },
  filterBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  filterTextActive: { color: COLORS.white, fontWeight: '600' },
  scroll: { flex: 1, padding: SPACING.base },
  tableHead: { flexDirection: 'row', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.base, backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.md, marginBottom: SPACING.xs },
  th: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.base, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 4, borderWidth: 1, borderColor: COLORS.border },
  cell: { flex: 1 },
  td: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },
  tdMuted: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  subject: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  userText: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary, alignSelf: 'flex-start' },
  replyText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: COLORS.textMuted, fontSize: FONTS.sizes.sm, padding: SPACING.xl },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.base },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  ticketPreview: { backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.md, padding: SPACING.base, marginBottom: SPACING.base, borderWidth: 1, borderColor: COLORS.border },
  previewLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  previewText: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  replyInput: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: SPACING.base,
  },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.sm + 2 },
  sendBtnText: { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.base },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  errorTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.error },
  errorMsg: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', fontFamily: 'monospace' },
  errorHint: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm },
  retryBtn: { marginTop: SPACING.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl, backgroundColor: COLORS.primary, borderRadius: RADIUS.md },
  retryBtnText: { color: COLORS.white, fontWeight: '700' },
});

