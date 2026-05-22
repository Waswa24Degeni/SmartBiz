import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert, TouchableOpacity, Modal, FlatList, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';
import { Toggle } from '../../components/common/Toggle';
import { Button } from '../../components/common/Button';
import { supabase } from '../../lib/supabase';
import { SNIPPE_BANKS } from '../../lib/snippe';

interface AdminPayCfg {
  receive_method:           'mobile' | 'bank';
  receive_phone:            string;
  receive_name:             string;
  receive_email:            string;
  receive_bank_code:        string;
  receive_bank_account:     string;
  receive_bank_account_name:string;
  is_live:                  boolean;
}

interface PaymentRow {
  id: string;
  business_name: string;
  payment_type: string;
  amount: number;
  payer_phone: string | null;
  status: string;
  gateway_reference: string | null;
  created_at: string;
  updated_at: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  completed: COLORS.success,
  pending:   COLORS.warning,
  failed:    COLORS.error,
  expired:   COLORS.textMuted,
};

export function AdminPaymentScreen() {
  const [tab, setTab] = useState<'Config' | 'History'>('Config');
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  // ─── Config state ───────────────────────────────────────────
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgSaving,  setCfgSaving]  = useState(false);
  const [configId, setConfigId]     = useState<string | null>(null);
  const [cfg, setCfg] = useState<AdminPayCfg>({
    receive_method:            'mobile',
    receive_phone:             '',
    receive_name:              '',
    receive_email:             '',
    receive_bank_code:         '',
    receive_bank_account:      '',
    receive_bank_account_name: '',
    is_live:                   false,
  });
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSearch, setBankSearch]         = useState('');

  const loadConfig = useCallback(async () => {
    setCfgLoading(true);
    const { data } = await supabase
      .from('payment_gateway_config')
      .select('id, receive_method, receive_phone, receive_name, receive_email, receive_bank_code, receive_bank_account, receive_bank_account_name, is_live')
      .maybeSingle();
    if (data) {
      setConfigId((data as any).id ?? null);
      setCfg({
        receive_method:            (data as any).receive_method             ?? 'mobile',
        receive_phone:             (data as any).receive_phone              ?? '',
        receive_name:              (data as any).receive_name               ?? '',
        receive_email:             (data as any).receive_email              ?? '',
        receive_bank_code:         (data as any).receive_bank_code          ?? '',
        receive_bank_account:      (data as any).receive_bank_account       ?? '',
        receive_bank_account_name: (data as any).receive_bank_account_name  ?? '',
        is_live:                   !!(data as any).is_live,
      });
    }
    setCfgLoading(false);
  }, []);

  const saveConfig = async () => {
    if (cfg.receive_method === 'mobile' && !cfg.receive_phone.trim()) {
      Alert.alert('Required', 'Please enter the receive phone number.');
      return;
    }
    if (cfg.receive_method === 'bank') {
      if (!cfg.receive_bank_code)              { Alert.alert('Required', 'Please select a bank.'); return; }
      if (!cfg.receive_bank_account.trim())    { Alert.alert('Required', 'Please enter the bank account number.'); return; }
      if (!cfg.receive_bank_account_name.trim()) { Alert.alert('Required', 'Please enter the account holder name.'); return; }
    }
    setCfgSaving(true);
    const payload = {
      receive_method:            cfg.receive_method,
      receive_phone:             cfg.receive_phone.trim()             || null,
      receive_name:              cfg.receive_name.trim()              || null,
      receive_email:             cfg.receive_email.trim()             || null,
      receive_bank_code:         cfg.receive_bank_code               || null,
      receive_bank_account:      cfg.receive_bank_account.trim()      || null,
      receive_bank_account_name: cfg.receive_bank_account_name.trim() || null,
      is_live:                   cfg.is_live,
    };
    let saveError: any = null;
    if (configId) {
      // Row exists — update it
      const { error } = await supabase
        .from('payment_gateway_config')
        .update(payload)
        .eq('id', configId);
      saveError = error;
    } else {
      // First time — insert and remember the new id
      const { data: newRow, error } = await supabase
        .from('payment_gateway_config')
        .insert(payload)
        .select('id')
        .single();
      saveError = error;
      if (newRow) setConfigId((newRow as any).id);
    }
    setCfgSaving(false);
    if (saveError) Alert.alert('Error', saveError.message);
    else Alert.alert('Saved', 'Payment configuration saved successfully.');
  };

  // ─── History state ──────────────────────────────────────────
  const [histLoading, setHistLoading] = useState(false);
  const [history, setHistory]         = useState<PaymentRow[]>([]);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    const { data, error } = await supabase
      .from('payments')
      .select('id, payment_type, amount, payer_phone, status, gateway_reference, created_at, updated_at, business:businesses(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      setHistLoading(false);
      return;
    }
    setHistory(
      (data ?? []).map((r: any) => ({
        id:                r.id,
        business_name:     r.business?.name ?? '—',
        payment_type:      r.payment_type,
        amount:            r.amount,
        payer_phone:       r.payer_phone,
        status:            r.status,
        gateway_reference: r.gateway_reference,
        created_at:        r.created_at,
        updated_at:        r.updated_at,
      }))
    );
    setHistLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (tab === 'History') loadHistory();
  }, [tab, loadHistory]);

  // ─── Render ─────────────────────────────────────────────────
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Summary banner */}
      <View style={[styles.banner, isMobile && styles.bannerMobile]}>
        <View style={styles.bannerIcon}>
          <Ionicons name="card-outline" size={28} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Snippe Payment Gateway</Text>
          <Text style={styles.bannerSub}>Configure your Snippe.sh account to collect plan subscription payments from business owners</Text>
        </View>
        <View style={[styles.liveChip, cfg.is_live ? styles.liveOn : styles.liveOff, isMobile && styles.liveChipMobile]}>
          <Text style={styles.liveChipText}>{cfg.is_live ? 'LIVE' : 'TEST'}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, isMobile && styles.tabRowMobile]}>
        {(['Config', 'History'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'Config' ? (
        cfgLoading ? (
          <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.card}>
            {/* Live mode toggle */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Live Mode</Text>
                <Text style={styles.settingHint}>Toggle off to use sandbox / test environment</Text>
              </View>
              <Toggle value={cfg.is_live} onChange={() => setCfg(p => ({ ...p, is_live: !p.is_live }))} />
            </View>

            <View style={styles.divider} />

            <Text style={styles.subsectionTitle}>Receive Account</Text>
            <Text style={styles.settingHint}>API keys and webhook secrets are managed via Supabase Vault and environment variables — not stored here.</Text>

            {/* Method selector */}
            <View style={[styles.payMethodRow, isMobile && styles.payMethodRowMobile]}>
              {([
                { method: 'mobile' as const, label: 'Mobile Money', icon: 'phone-portrait-outline' },
                { method: 'bank'   as const, label: 'Bank Transfer', icon: 'business-outline' },
              ]).map(opt => (
                <TouchableOpacity
                  key={opt.method}
                  style={[styles.payMethodCard, cfg.receive_method === opt.method && styles.payMethodCardActive]}
                  onPress={() => setCfg(p => ({ ...p, receive_method: opt.method }))}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={20}
                    color={cfg.receive_method === opt.method ? COLORS.accent : COLORS.textMuted}
                  />
                  <Text style={[styles.payMethodLabel, cfg.receive_method === opt.method && styles.payMethodLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {cfg.receive_method === 'mobile' ? (
              <>
                <Text style={styles.settingHint}>Mobile money account where subscription fees are collected</Text>
                {[
                  { label: 'Phone Number (e.g. 0712345678)', key: 'receive_phone' as const,  keyboard: 'phone-pad' as const },
                  { label: 'Account Name',                    key: 'receive_name' as const,   keyboard: 'default' as const },
                  { label: 'Email (optional)',                 key: 'receive_email' as const,  keyboard: 'email-address' as const },
                ].map(f => (
                  <View key={f.key} style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.input}
                      value={cfg[f.key] as string}
                      onChangeText={v => setCfg(p => ({ ...p, [f.key]: v }))}
                      keyboardType={f.keyboard}
                      autoCapitalize="none"
                      placeholder={f.label}
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.settingHint}>Bank account where subscription fees are disbursed</Text>
                {/* Bank picker */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Bank</Text>
                  {(() => {
                    const sel = SNIPPE_BANKS.find(b => b.code === cfg.receive_bank_code);
                    return (
                      <TouchableOpacity
                        style={[styles.input, styles.bankPickerBtn]}
                        onPress={() => { setBankSearch(''); setShowBankPicker(true); }}
                      >
                        <Text style={sel ? styles.bankPickerSelected : styles.bankPickerPlaceholder}>
                          {sel ? `${sel.code} — ${sel.name}` : 'Select a bank…'}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    );
                  })()}
                </View>
                {[
                  { label: 'Account Number', key: 'receive_bank_account' as const,      keyboard: 'numeric' as const },
                  { label: 'Account Name',   key: 'receive_bank_account_name' as const,  keyboard: 'default' as const },
                ].map(f => (
                  <View key={f.key} style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.input}
                      value={cfg[f.key] as string}
                      onChangeText={v => setCfg(p => ({ ...p, [f.key]: v }))}
                      keyboardType={f.keyboard}
                      autoCapitalize="words"
                      placeholder={f.label}
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                ))}
              </>
            )}

            <Button
              title={cfgSaving ? 'Saving…' : 'Save Configuration'}
              onPress={saveConfig}
              fullWidth size="lg"
              style={{ marginTop: SPACING.xl }}
            />
          </View>
        )
      ) : (
        histLoading ? (
          <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
        ) : history.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="receipt-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No payments yet</Text>
            <Text style={styles.emptySub}>Payment records will appear here once owners pay for subscriptions.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.subsectionTitle}>Payment History ({history.length})</Text>
            {history.map(row => (
              <View key={row.id} style={styles.histRow}>
                <View style={styles.histLeft}>
                  <Text style={styles.histBiz}>{row.business_name}</Text>
                  <Text style={styles.histMeta}>
                    {row.payment_type.toUpperCase()} · TZS {row.amount.toLocaleString()}{row.payer_phone ? ` · ${row.payer_phone}` : ''}
                  </Text>
                  {!!row.gateway_reference && (
                    <Text style={styles.histRef}>Ref: {row.gateway_reference}</Text>
                  )}
                  <Text style={styles.histDate}>
                    {format(new Date(row.created_at), 'dd MMM yyyy, HH:mm')}
                  </Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: (STATUS_COLOR[row.status] ?? COLORS.textMuted) + '22' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[row.status] ?? COLORS.textMuted }]}>
                    {row.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )
      )}

      {/* Bank picker modal */}
      <Modal
        visible={showBankPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBankPicker(false)}
      >
        <TouchableOpacity
          style={styles.bankModalOverlay}
          activeOpacity={1}
          onPress={() => setShowBankPicker(false)}
        />
        <View style={styles.bankModalContainer}>
          <View style={styles.bankModalHeader}>
            <Text style={styles.bankModalTitle}>Select Bank</Text>
            <TouchableOpacity onPress={() => setShowBankPicker(false)}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.bankModalSearch}
            placeholder="Search bank…"
            placeholderTextColor={COLORS.textMuted}
            value={bankSearch}
            onChangeText={setBankSearch}
            autoFocus
          />
          <FlatList
            data={bankSearch
              ? SNIPPE_BANKS.filter(b =>
                  b.name.toLowerCase().includes(bankSearch.toLowerCase()) ||
                  b.code.toLowerCase().includes(bankSearch.toLowerCase())
                )
              : SNIPPE_BANKS
            }
            keyExtractor={item => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.bankModalItem, cfg.receive_bank_code === item.code && styles.bankModalItemActive]}
                onPress={() => { setCfg(p => ({ ...p, receive_bank_code: item.code })); setShowBankPicker(false); }}
              >
                <Text style={[styles.bankModalCode, cfg.receive_bank_code === item.code && { color: COLORS.accent }]}>
                  {item.code}
                </Text>
                <Text style={styles.bankModalName} numberOfLines={1}>{item.name}</Text>
                {cfg.receive_bank_code === item.code && (
                  <Ionicons name="checkmark" size={18} color={COLORS.accent} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:     { flex: 1, backgroundColor: COLORS.background },
  container:  { padding: SPACING.lg, paddingBottom: SPACING['2xl'] },

  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
  },
  bannerMobile: { flexDirection: 'column' },
  bannerIcon:  { width: 48, height: 48, borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { color: COLORS.white, fontSize: FONTS.sizes.lg, fontWeight: '700', marginBottom: 2 },
  bannerSub:   { color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.sm },

  liveChip:     { borderRadius: RADIUS.xs ?? 4, paddingHorizontal: SPACING.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  liveOn:       { backgroundColor: COLORS.success },
  liveOff:      { backgroundColor: COLORS.textMuted },
  liveChipText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  liveChipMobile: { marginTop: SPACING.xs },

  tabRow:       { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  tabRowMobile: { flexWrap: 'wrap' },
  tabBtn:       { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  tabBtnActive: { backgroundColor: COLORS.primary },
  tabText:      { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive:{ color: COLORS.white },

  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.lg, ...SHADOWS.sm,
    marginBottom: SPACING.lg,
  },

  settingRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  settingLabel:{ fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  settingHint: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2, marginBottom: SPACING.md },

  subsectionTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.md },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.lg },

  fieldWrap:  { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.base, color: COLORS.text,
  },

  emptyBox:   { alignItems: 'center', paddingVertical: SPACING['2xl'], gap: SPACING.md },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  emptySub:   { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', maxWidth: 300 },

  histRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  histLeft:  { flex: 1, marginRight: SPACING.md },
  histBiz:   { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  histMeta:  { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  histRef:   { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  histDate:  { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },

  statusChip: { borderRadius: RADIUS.xs ?? 4, paddingHorizontal: SPACING.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  statusText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },

  // Payout method selector
  payMethodRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  payMethodRowMobile: { flexDirection: 'column' },
  payMethodCard: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingVertical: SPACING.md, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  payMethodCardActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '10' },
  payMethodLabel:       { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '600', textAlign: 'center' },
  payMethodLabelActive: { color: COLORS.accent },

  // Bank picker
  bankPickerBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bankPickerSelected:    { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  bankPickerPlaceholder: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.textMuted },

  bankModalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  bankModalContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingBottom: SPACING['2xl'],
    maxHeight: '75%',
  },
  bankModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  bankModalTitle:  { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  bankModalSearch: {
    margin: SPACING.md, padding: SPACING.sm,
    backgroundColor: COLORS.background, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    fontSize: FONTS.sizes.base, color: COLORS.text,
  },
  bankModalItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.border + '60',
  },
  bankModalItemActive: { backgroundColor: COLORS.accent + '10' },
  bankModalCode: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.textSecondary, width: 80 },
  bankModalName: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },
});
