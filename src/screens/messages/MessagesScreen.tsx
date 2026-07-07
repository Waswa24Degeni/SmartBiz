import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { format } from 'date-fns';

type TeamThreadRow = {
  id: string;
  subject: string;
  updated_at: string;
  team_thread_participants: { user_id: string; last_read_at: string | null }[];
};

type TeamMessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: { full_name: string; role: string } | null;
};

type TeamMemberRow = {
  id: string;
  full_name: string;
  role: string;
};

export function MessagesScreen() {
  const { user, business } = useAuth();
  
  // State: Thread List
  const [threads, setThreads] = useState<TeamThreadRow[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  
  // State: Active Thread
  const [activeThread, setActiveThread] = useState<TeamThreadRow | null>(null);
  const [messages, setMessages] = useState<TeamMessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // State: Compose New Thread
  const [composeVisible, setComposeVisible] = useState(false);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [savingNewThread, setSavingNewThread] = useState(false);

  // 1. Fetch Threads
  const fetchThreads = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoadingThreads(true);

    const { data, error } = await supabase
      .from('team_threads')
      .select(`
        id, subject, updated_at,
        team_thread_participants ( user_id, last_read_at )
      `)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      if (!silent) Alert.alert('Error', error.message);
    } else {
      setThreads(data as any);
    }
    
    setLoadingThreads(false);
  }, [user?.id]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Realtime updates for threads
  useRealtimeSubscription('team-threads-rt', 'team_threads', () => fetchThreads(true), !!user?.id);
  useRealtimeSubscription('team-messages-rt', 'team_messages', () => {
    fetchThreads(true);
    if (activeThread) fetchMessages(activeThread.id, true);
  }, !!user?.id);

  // 2. Fetch Messages for Active Thread
  const fetchMessages = useCallback(async (threadId: string, silent = false) => {
    if (!silent) setLoadingMessages(true);
    
    // Mark as read
    await supabase
      .from('team_thread_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .eq('user_id', user?.id ?? '');

    // Fetch messages
    const { data, error } = await supabase
      .from('team_messages')
      .select(`
        id, sender_id, body, created_at,
        sender:users!team_messages_sender_id_fkey(full_name, role)
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) {
      if (!silent) Alert.alert('Error', error.message);
    } else {
      setMessages(data as any);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
    
    setLoadingMessages(false);
  }, [user?.id]);

  useEffect(() => {
    if (activeThread) {
      fetchMessages(activeThread.id);
    } else {
      setMessages([]);
    }
  }, [activeThread, fetchMessages]);

  // 3. Fetch Team Members for Compose
  const fetchTeamMembers = useCallback(async () => {
    if (!user?.id) return;

    setTeamLoading(true);
    const resolvedBusinessId = business?.id ?? user.business_id;

    if (!resolvedBusinessId) {
      setTeamMembers([]);
      setSelectedRecipients([]);
      setTeamLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, role')
      .eq('business_id', resolvedBusinessId)
      .in('role', ['owner', 'staff', 'admin'])
      .order('full_name', { ascending: true });

    if (error) {
      Alert.alert('Error', error.message);
      setTeamMembers([]);
    } else {
      const rows = (data as TeamMemberRow[]).filter((member) => member.id !== user.id);
      setTeamMembers(rows);
    }
    setTeamLoading(false);
  }, [user?.id, business?.id, user?.business_id]);

  useEffect(() => {
    if (composeVisible) fetchTeamMembers();
  }, [composeVisible, fetchTeamMembers]);

  // 4. Create New Thread
  const handleCreateThread = async () => {
    if (!user?.id) return;
    if (!composeTitle.trim() || !composeBody.trim()) {
      Alert.alert('Required', 'Please enter both a subject and a message.');
      return;
    }
    if (selectedRecipients.length === 0) {
      Alert.alert('Recipients Required', 'Select at least one teammate.');
      return;
    }

    setSavingNewThread(true);

    try {
      // Create thread
      const { data: threadData, error: threadError } = await supabase
        .from('team_threads')
        .insert({
          business_id: business?.id ?? user.business_id,
          subject: composeTitle.trim(),
          created_by: user.id
        })
        .select('id')
        .single();

      if (threadError) throw threadError;

      const threadId = threadData.id;

      // Add participants (selected + sender)
      const participants = [...selectedRecipients, user.id].map(uid => ({
        thread_id: threadId,
        user_id: uid,
        last_read_at: uid === user.id ? new Date().toISOString() : null,
      }));

      const { error: partError } = await supabase.from('team_thread_participants').insert(participants);
      if (partError) throw partError;

      // Add initial message
      const { error: msgError } = await supabase.from('team_messages').insert({
        thread_id: threadId,
        sender_id: user.id,
        body: composeBody.trim()
      });
      if (msgError) throw msgError;

      setComposeVisible(false);
      setComposeTitle('');
      setComposeBody('');
      setSelectedRecipients([]);
      fetchThreads();
      
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingNewThread(false);
    }
  };

  // 5. Send Reply
  const handleSendReply = async () => {
    if (!activeThread || !user?.id || !replyBody.trim()) return;

    setSendingReply(true);
    const { error } = await supabase.from('team_messages').insert({
      thread_id: activeThread.id,
      sender_id: user.id,
      body: replyBody.trim()
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setReplyBody('');
      fetchMessages(activeThread.id, true);
    }
    setSendingReply(false);
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipients(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  // Render
  const unreadCount = threads.filter(t => {
    const me = t.team_thread_participants.find(p => p.user_id === user?.id);
    if (!me || !me.last_read_at) return true;
    return new Date(me.last_read_at) < new Date(t.updated_at);
  }).length;

  if (activeThread) {
    return (
      <View style={styles.root}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => {
            setActiveThread(null);
            fetchThreads(true);
          }}>
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{activeThread.subject}</Text>
        </View>

        {loadingMessages ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
        ) : (
          <ScrollView 
            ref={scrollViewRef}
            contentContainerStyle={styles.chatScroll} 
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === user?.id;
              const showAvatar = idx === 0 || messages[idx-1].sender_id !== msg.sender_id;
              
              return (
                <View key={msg.id} style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowThem]}>
                  {!isMe && showAvatar && (
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{(msg.sender?.full_name || '?')[0].toUpperCase()}</Text>
                    </View>
                  )}
                  {!isMe && !showAvatar && <View style={{ width: 32 }} />}
                  
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    {!isMe && showAvatar && (
                      <Text style={styles.senderName}>{msg.sender?.full_name || 'Teammate'}</Text>
                    )}
                    <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{msg.body}</Text>
                    <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.replyBox}>
          <TextInput
            style={styles.replyInput}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.textMuted}
            value={replyBody}
            onChangeText={setReplyBody}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity 
            style={[styles.sendBtn, (!replyBody.trim() || sendingReply) && styles.sendBtnDisabled]} 
            onPress={handleSendReply}
            disabled={!replyBody.trim() || sendingReply}
          >
            {sendingReply ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Ionicons name="send" size={16} color={COLORS.white} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Team Chat</Text>
          <Text style={styles.subtitle}>{threads.length} threads · {unreadCount} unread</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setComposeVisible(true)}>
          <Ionicons name="add" size={14} color={COLORS.white} />
          <Text style={styles.addBtnText}>New Thread</Text>
        </TouchableOpacity>
      </View>

      {loadingThreads ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.listWrap} showsVerticalScrollIndicator={false}>
          {threads.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No conversations yet</Text>
            </View>
          ) : (
            threads.map((t) => {
              const me = t.team_thread_participants.find(p => p.user_id === user?.id);
              const isUnread = !me || !me.last_read_at || new Date(me.last_read_at) < new Date(t.updated_at);
              
              return (
                <TouchableOpacity 
                  key={t.id} 
                  style={[styles.threadCard, isUnread && styles.threadCardUnread]}
                  onPress={() => setActiveThread(t)}
                >
                  <View style={styles.threadTop}>
                    <Text style={styles.threadTitle} numberOfLines={1}>{t.subject}</Text>
                    <Text style={styles.threadTime}>{format(new Date(t.updated_at), 'dd MMM HH:mm')}</Text>
                  </View>
                  <View style={styles.threadBottom}>
                    <Text style={styles.threadInfo}>
                      {t.team_thread_participants.length} participant{t.team_thread_participants.length !== 1 ? 's' : ''}
                    </Text>
                    {isUnread && <View style={styles.unreadDot} />}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Compose Modal */}
      <Modal visible={composeVisible} transparent animationType="slide" onRequestClose={() => setComposeVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>New Conversation</Text>
              <TouchableOpacity onPress={() => setComposeVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.recipientsWrap}>
              <Text style={styles.recipientsLabel}>Recipients</Text>
              {teamLoading ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : teamMembers.length === 0 ? (
                <Text style={styles.noRecipientsText}>No teammates found.</Text>
              ) : (
                <View style={styles.recipientsChips}>
                  {teamMembers.map((member) => {
                    const selected = selectedRecipients.includes(member.id);
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[styles.recipientChip, selected && styles.recipientChipSelected]}
                        onPress={() => toggleRecipient(member.id)}
                      >
                        <Text style={[styles.recipientChipText, selected && styles.recipientChipTextSelected]}>
                          {member.full_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Subject"
              placeholderTextColor={COLORS.textMuted}
              value={composeTitle}
              onChangeText={setComposeTitle}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="First message..."
              placeholderTextColor={COLORS.textMuted}
              value={composeBody}
              onChangeText={setComposeBody}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setComposeVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, savingNewThread && { opacity: 0.7 }]} onPress={handleCreateThread} disabled={savingNewThread}>
                {savingNewThread ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.saveBtnText}>Start Thread</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '600' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, paddingHorizontal: SPACING.base },
  
  listWrap: { padding: SPACING.base, gap: SPACING.sm },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING['2xl'], gap: SPACING.sm },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted },
  
  threadCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
  },
  threadCardUnread: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.infoLight,
  },
  threadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
  threadTitle: { flex: 1, fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  threadTime: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  threadBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.xs },
  threadInfo: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  
  chatScroll: { padding: SPACING.base, gap: SPACING.md },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: SPACING.xs },
  messageRowMe: { justifyContent: 'flex-end' },
  messageRowThem: { justifyContent: 'flex-start' },
  avatar: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: { fontSize: 10, color: COLORS.white, fontWeight: 'bold' },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
  },
  bubbleMe: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 2,
  },
  bubbleThem: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 2,
  },
  senderName: { fontSize: 10, color: COLORS.primary, fontWeight: '700', marginBottom: 2 },
  bubbleText: { fontSize: FONTS.sizes.sm, color: COLORS.text, lineHeight: 20 },
  bubbleTextMe: { color: COLORS.white },
  bubbleTime: { fontSize: 9, color: COLORS.textMuted, alignSelf: 'flex-end', marginTop: 4 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },
  
  replyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.base,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
  },
  replyInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.base,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 100,
    color: COLORS.text,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.border },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: '90%',
  },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  
  recipientsWrap: { marginBottom: SPACING.md },
  recipientsLabel: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.xs },
  recipientsChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  recipientChip: {
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
  },
  recipientChipSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.infoLight },
  recipientChipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  recipientChipTextSelected: { color: COLORS.primary, fontWeight: '700' },
  noRecipientsText: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  
  input: {
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceAlt,
    padding: SPACING.sm, marginBottom: SPACING.md,
    color: COLORS.text,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  
  modalActions: { flexDirection: 'row', gap: SPACING.sm },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md },
  saveBtnText: { color: COLORS.white, fontWeight: '700' },
});
