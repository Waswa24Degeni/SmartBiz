/**
 * WalletScreen.tsx
 *
 * Business wallet — collect money from sales, request withdrawals to
 * bank or mobile money.
 *
 * Roles:
 *   owner  — view balance, collections, withdrawals; manage payout methods;
 *             request withdrawal (requires password re-auth).
 *   cashier/staff — view-only (balance + transactions). No withdrawal.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format, parseISO } from 'date-fns';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { SNIPPE_BANKS } from '../../lib/snippe';
import {
  WalletAccount,
  WalletTransaction,
  PayoutMethod,
  WithdrawalRequest,
} from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOBILE_NETWORKS = ['Vodacom', 'Airtel', 'Tigo', 'Halotel', 'TTCL', 'Zantel'];
const PAYOUT_FEE      = 1500;  // TZS
const MIN_WITHDRAWAL  = PAYOUT_FEE + 1;   // Must be greater than payout fee
const MAX_ATTEMPTS    = 3;     // password attempts before lockout

type WalletTab = 'transactions' | 'withdrawals' | 'methods';
type NoticeTone = 'info' | 'warning' | 'error' | 'success';
type NoticeState = { tone: NoticeTone; title: string; message: string };

// ─── Helper: mask sensitive account numbers ───────────────────────────────────
function maskAccount(acc: string): string {
  if (acc.length <= 4) return '****';
  return acc.slice(0, 2) + '****' + acc.slice(-3);
}

function fmtMoney(amount: number, currency = 'TZS'): string {
  return `${currency} ${amount.toLocaleString('en-TZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string): string {
  try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); }
  catch { return iso; }
}

function normalizeTzPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `255${digits.slice(1)}`;
  if (digits.length === 9) return `255${digits}`;
  return digits;
}

function isValidTzPhone(raw: string): boolean {
  return /^255\d{9}$/.test(normalizeTzPhone(raw));
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function WalletScreen() {
  const { user, business } = useAuth();
  const { width }          = useWindowDimensions();
  const isMobile           = width < BREAKPOINTS.tablet;
  const isOwner            = user?.role === 'owner';

  const [wallet,       setWallet]       = useState<WalletAccount | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals,  setWithdrawals]  = useState<WithdrawalRequest[]>([]);
  const [methods,      setMethods]      = useState<PayoutMethod[]>([]);
  const [tab,          setTab]          = useState<WalletTab>('transactions');
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // modal visibility
  const [showWithdraw,   setShowWithdraw]   = useState(false);
  const [showAddMethod,  setShowAddMethod]  = useState(false);
  const [editingMethod,  setEditingMethod]  = useState<PayoutMethod | null>(null);
  const reconcilingCollectionsRef           = useRef(false);
  const [notice, setNotice]                 = useState<NoticeState | null>(null);
  const noticeTimerRef                      = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((tone: NoticeTone, title: string, message: string) => {
    setNotice({ tone, title, message });
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 6000);
  }, []);

  const reconcileCompletedCollections = useCallback(async () => {
    if (!business?.id || !isOwner || reconcilingCollectionsRef.current) return;

    reconcilingCollectionsRef.current = true;
    try {
      const { data: walletRow, error: walletErr } = await supabase
        .from('wallet_accounts')
        .select('id')
        .eq('business_id', business.id)
        .maybeSingle();

      if (walletErr || !walletRow?.id) {
        console.warn('[WalletScreen] reconcileCompletedCollections wallet lookup failed:', walletErr?.message ?? 'missing wallet');
        return;
      }

      const nowIso = new Date().toISOString();
      const { data: completedPayments, error: paymentsErr } = await supabase
        .from('payments')
        .select('pos_order_id')
        .eq('business_id', business.id)
        .eq('payment_type', 'pos')
        .eq('status', 'completed')
        .not('pos_order_id', 'is', null)
        .limit(500);

      if (paymentsErr) throw paymentsErr;

      const orderIds = ((completedPayments ?? []) as { pos_order_id: string | null }[])
        .map((payment) => payment.pos_order_id)
        .filter((id): id is string => !!id && /^[0-9a-fA-F-]{36}$/.test(id));

      if (orderIds.length > 0) {
        const { error: syncSalesErr } = await supabase
          .from('sales')
          .update({
            payment_status: 'paid',
            status: 'completed',
            updated_at: nowIso,
          })
          .eq('business_id', business.id)
          .in('id', orderIds)
          .or('status.neq.completed,payment_status.neq.paid');

        if (syncSalesErr) throw syncSalesErr;
      }

      const { data: completedSales, error: salesErr } = await supabase
        .from('sales')
        .select('id, total, order_number, cashier_id, created_at')
        .eq('business_id', business.id)
        .eq('status', 'completed')
        .eq('payment_status', 'paid')
        .eq('payment_method', 'mobile_money')
        .limit(500);

      if (salesErr) throw salesErr;

      const saleRows = (completedSales ?? []) as Array<{
        id: string;
        total: number;
        order_number: string | null;
        cashier_id: string | null;
        created_at: string;
      }>;

      if (saleRows.length > 0) {
        const saleIds = saleRows.map((sale) => sale.id);
        const { data: existingTx, error: txErr } = await supabase
          .from('wallet_transactions')
          .select('reference')
          .eq('business_id', business.id)
          .eq('type', 'collection')
          .in('reference', saleIds);

        if (txErr) throw txErr;

        const existingRefs = new Set(((existingTx ?? []) as Array<{ reference: string | null }>).map((tx) => tx.reference).filter(Boolean));
        const missingTx = saleRows
          .filter((sale) => !existingRefs.has(sale.id))
          .map((sale) => ({
            business_id: business.id,
            wallet_id: walletRow.id,
            type: 'collection' as const,
            amount: Number(sale.total ?? 0),
            balance_before: 0,
            balance_after: 0,
            reference: sale.id,
            description: `Recovered sale #${sale.order_number ?? sale.id.slice(0, 8)}`,
            status: 'completed' as const,
            initiated_by: sale.cashier_id,
            created_at: sale.created_at,
          }));

        if (missingTx.length > 0) {
          const { error: insertErr } = await supabase
            .from('wallet_transactions')
            .insert(missingTx);

          if (insertErr) throw insertErr;
        }
      }

      const { data: allTx, error: allTxErr } = await supabase
        .from('wallet_transactions')
        .select('type, amount')
        .eq('business_id', business.id);

      if (allTxErr) throw allTxErr;

      const totals = ((allTx ?? []) as Array<{ type: string; amount: number }>).reduce((acc, tx) => {
        const amount = Number(tx.amount ?? 0);
        if (tx.type === 'collection') {
          acc.totalCollected += amount;
          acc.balance += amount;
        } else if (tx.type === 'withdrawal') {
          acc.totalWithdrawn += amount;
          acc.balance -= amount;
        } else if (tx.type === 'refund') {
          acc.balance -= amount;
        }
        return acc;
      }, { totalCollected: 0, totalWithdrawn: 0, balance: 0 });

      const { error: walletUpdateErr } = await supabase
        .from('wallet_accounts')
        .update({
          total_collected: totals.totalCollected,
          total_withdrawn: totals.totalWithdrawn,
          balance: Math.max(0, totals.balance),
          updated_at: nowIso,
        })
        .eq('id', walletRow.id);

      if (walletUpdateErr) throw walletUpdateErr;
    } catch (e) {
      console.warn('[WalletScreen] reconcileCompletedCollections failed:', e);
    } finally {
      reconcilingCollectionsRef.current = false;
    }
  }, [business?.id, isOwner]);

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!business?.id) return;
    if (!silent) setLoading(true);
    setError(null);

    try {
      await reconcileCompletedCollections();

      const [walletRes, txRes, wdRes, mRes] = await Promise.all([
        supabase
          .from('wallet_accounts')
          .select('*')
          .eq('business_id', business.id)
          .maybeSingle(),
        supabase
          .from('wallet_transactions')
          .select('*')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('withdrawal_requests')
          .select('*, payout_method:payout_methods(*)')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('payout_methods')
          .select('*')
          .eq('business_id', business.id)
          .order('is_default', { ascending: false }),
      ]);

      if (walletRes.error) throw walletRes.error;
      if (txRes.error)     throw txRes.error;
      if (wdRes.error)     throw wdRes.error;
      if (mRes.error)      throw mRes.error;

      setWallet(walletRes.data as WalletAccount | null);
      setTransactions((txRes.data ?? []) as WalletTransaction[]);
      setWithdrawals((wdRes.data ?? []) as WithdrawalRequest[]);
      setMethods((mRes.data ?? []) as PayoutMethod[]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load wallet data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business?.id, reconcileCompletedCollections]);

  useEffect(() => { load(); }, [load]);

  // ── Realtime: refresh when a new sale collection comes in ─────────────────
  useEffect(() => {
    if (!business?.id) return;
    const sub = supabase
      .channel(`wallet-${business.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'wallet_accounts',
        filter: `business_id=eq.${business.id}`,
      }, () => load(true))
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'wallet_transactions',
        filter: `business_id=eq.${business.id}`,
      }, () => load(true))
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [business?.id, load]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  // ── Delete payout method ──────────────────────────────────────────────────
  const handleDeleteMethod = (m: PayoutMethod) => {
    Alert.alert(
      'Remove Payout Method',
      `Remove "${m.label}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('payout_methods')
              .delete()
              .eq('id', m.id);
            if (error) Alert.alert('Error', error.message);
            else load(true);
          },
        },
      ]
    );
  };

  // ── Set default payout method ─────────────────────────────────────────────
  const handleSetDefault = async (m: PayoutMethod) => {
    if (m.is_default) return;
    // Clear all defaults first, then set this one
    await supabase
      .from('payout_methods')
      .update({ is_default: false })
      .eq('business_id', business!.id);

    await supabase
      .from('payout_methods')
      .update({ is_default: true })
      .eq('id', m.id);

    load(true);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const todayCollected = transactions
    .filter(t => t.type === 'collection' &&
      t.created_at.startsWith(new Date().toISOString().slice(0, 10)))
    .reduce((s, t) => s + t.amount, 0);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Balance Card ─────────────────────────────────────────────── */}
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceTop}>
            <View>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceAmount}>
                {fmtMoney(wallet?.balance ?? 0, wallet?.currency ?? 'TZS')}
              </Text>
            </View>
            <View style={styles.walletIconWrap}>
              <Ionicons name="wallet-outline" size={32} color="rgba(255,255,255,0.8)" />
            </View>
          </View>

          <View style={styles.balanceStats}>
            <BalanceStat
              label="Collected Today"
              value={fmtMoney(todayCollected)}
              icon="arrow-down-circle-outline"
              color={COLORS.accentLight}
            />
            <View style={styles.statDivider} />
            <BalanceStat
              label="Total Collected"
              value={fmtMoney(wallet?.total_collected ?? 0)}
              icon="trending-up-outline"
              color="rgba(255,255,255,0.75)"
            />
            <View style={styles.statDivider} />
            <BalanceStat
              label="Total Withdrawn"
              value={fmtMoney(wallet?.total_withdrawn ?? 0)}
              icon="arrow-up-circle-outline"
              color="rgba(255,255,255,0.75)"
            />
          </View>

          {isOwner && (
            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => {
                if ((wallet?.balance ?? 0) < MIN_WITHDRAWAL) {
                  showNotice(
                    'warning',
                    'Insufficient Balance',
                    `Withdrawal must be greater than payout fee (${fmtMoney(PAYOUT_FEE)}). Minimum is ${fmtMoney(MIN_WITHDRAWAL)}. ` +
                    `Current balance: ${fmtMoney(wallet?.balance ?? 0)}`
                  );
                  return;
                }
                if (methods.length === 0) {
                  showNotice(
                    'info',
                    'No Payout Method',
                    'Add a bank account or mobile number first to enable withdrawals.'
                  );
                  setTab('methods');
                  return;
                }
                setShowWithdraw(true);
              }}
              activeOpacity={0.82}
            >
              <Ionicons name="arrow-up-circle" size={18} color={COLORS.primary} />
              <Text style={styles.withdrawBtnText}>Withdraw</Text>
            </TouchableOpacity>
          )}
        </LinearGradient>

        {notice && (
          <InlineNotice
            tone={notice.tone}
            title={notice.title}
            message={notice.message}
            onClose={() => setNotice(null)}
          />
        )}

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          {([
            { key: 'transactions', label: 'Collections',    icon: 'list-outline' },
            { key: 'withdrawals',  label: 'Withdrawals',    icon: 'arrow-up-outline' },
            { key: 'methods',      label: 'Payout Methods', icon: 'card-outline' },
          ] as { key: WalletTab; label: string; icon: string }[]).map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons
                name={t.icon as any}
                size={16}
                color={tab === t.key ? COLORS.accent : COLORS.textSecondary}
              />
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab: Transactions ────────────────────────────────────────── */}
        {tab === 'transactions' && (
          <View style={styles.section}>
            {transactions.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title="No collections yet"
                body="Completed sales will appear here automatically."
              />
            ) : (
              transactions.map(tx => (
                <TransactionRow key={tx.id} tx={tx} currency={wallet?.currency} />
              ))
            )}
          </View>
        )}

        {/* ── Tab: Withdrawals ─────────────────────────────────────────── */}
        {tab === 'withdrawals' && (
          <View style={styles.section}>
            {withdrawals.length === 0 ? (
              <EmptyState
                icon="arrow-up-circle-outline"
                title="No withdrawals yet"
                body={isOwner ? 'Tap Withdraw to move funds to your bank or mobile.' : 'Withdrawal history will appear here.'}
              />
            ) : (
              withdrawals.map(wd => (
                <WithdrawalRow key={wd.id} wd={wd} currency={wallet?.currency} />
              ))
            )}
          </View>
        )}

        {/* ── Tab: Payout Methods ──────────────────────────────────────── */}
        {tab === 'methods' && (
          <View style={styles.section}>
            {!isOwner ? (
              <View style={styles.restrictedBanner}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.restrictedText}>
                  Only the business owner can manage payout methods.
                </Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.addMethodBtn}
                  onPress={() => { setEditingMethod(null); setShowAddMethod(true); }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.addMethodText}>Add Payout Method</Text>
                </TouchableOpacity>

                {methods.length === 0 ? (
                  <EmptyState
                    icon="card-outline"
                    title="No payout methods"
                    body="Add a bank account or mobile money number to enable withdrawals."
                  />
                ) : (
                  methods.map(m => (
                    <PayoutMethodCard
                      key={m.id}
                      method={m}
                      onSetDefault={() => handleSetDefault(m)}
                      onEdit={() => { setEditingMethod(m); setShowAddMethod(true); }}
                      onDelete={() => handleDeleteMethod(m)}
                    />
                  ))
                )}
              </>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showWithdraw && (
        <WithdrawModal
          wallet={wallet}
          methods={methods}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => { setShowWithdraw(false); load(); }}
          businessId={business!.id}
          userEmail={user!.email!}
        />
      )}

      {showAddMethod && (
        <AddPayoutMethodModal
          businessId={business!.id}
          editing={editingMethod}
          onClose={() => { setShowAddMethod(false); setEditingMethod(null); }}
          onSaved={() => { setShowAddMethod(false); setEditingMethod(null); load(true); }}
        />
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BalanceStat({
  label, value, icon, color,
}: {
  label: string; value: string; icon: string; color: string;
}) {
  return (
    <View style={styles.balanceStat}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={styles.balanceStatLabel}>{label}</Text>
      <Text style={styles.balanceStatValue}>{value}</Text>
    </View>
  );
}

function TransactionRow({ tx, currency }: { tx: WalletTransaction; currency?: string }) {
  const isIn = tx.type === 'collection';
  const isRefund = tx.type === 'refund';

  const iconName = isIn   ? 'arrow-down-circle'
                 : isRefund ? 'refresh-circle'
                 : 'arrow-up-circle';
  const iconColor = isIn     ? COLORS.success
                  : isRefund ? COLORS.warning
                  : COLORS.error;

  return (
    <View style={styles.txRow}>
      <View style={[styles.txIconWrap, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={iconName as any} size={22} color={iconColor} />
      </View>
      <View style={styles.txMeta}>
        <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
        <Text style={styles.txDate}>{fmtDate(tx.created_at)}</Text>
      </View>
      <View style={styles.txAmountWrap}>
        <Text style={[styles.txAmount, { color: iconColor }]}>
          {isIn || isRefund ? '+' : '-'}{fmtMoney(tx.amount, currency)}
        </Text>
        <StatusChip status={tx.status} />
      </View>
    </View>
  );
}

function WithdrawalRow({
  wd, currency,
}: {
  wd: WithdrawalRequest & { payout_method?: PayoutMethod };
  currency?: string;
}) {
  const statusColor: Record<string, string> = {
    pending:    COLORS.warning,
    processing: COLORS.info,
    completed:  COLORS.success,
    failed:     COLORS.error,
  };
  const m = wd.payout_method;

  return (
    <View style={styles.txRow}>
      <View style={[styles.txIconWrap, { backgroundColor: COLORS.primary + '18' }]}>
        <Ionicons
          name={m?.type === 'bank' ? 'business-outline' : 'phone-portrait-outline'}
          size={22}
          color={COLORS.primary}
        />
      </View>
      <View style={styles.txMeta}>
        <Text style={styles.txDesc} numberOfLines={1}>
          {m?.label ?? 'Unknown method'}
        </Text>
        <Text style={styles.txDate}>
          {m ? maskAccount(m.account_number) : ''} · {fmtDate(wd.created_at)}
        </Text>
      </View>
      <View style={styles.txAmountWrap}>
        <Text style={[styles.txAmount, { color: COLORS.text }]}>
          -{fmtMoney(wd.amount, currency)}
        </Text>
        <View style={[styles.statusChip, { backgroundColor: (statusColor[wd.status] ?? COLORS.textMuted) + '22' }]}>
          <Text style={[styles.statusChipText, { color: statusColor[wd.status] ?? COLORS.textMuted }]}>
            {wd.status.charAt(0).toUpperCase() + wd.status.slice(1)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function StatusChip({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    completed: COLORS.success,
    pending:   COLORS.warning,
    failed:    COLORS.error,
    cancelled: COLORS.textMuted,
  };
  const c = colorMap[status] ?? COLORS.textMuted;
  return (
    <View style={[styles.statusChip, { backgroundColor: c + '22' }]}>
      <Text style={[styles.statusChipText, { color: c }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}

function PayoutMethodCard({
  method, onSetDefault, onEdit, onDelete,
}: {
  method: PayoutMethod;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isMobile = method.type === 'mobile_money';
  return (
    <View style={[styles.methodCard, method.is_default && styles.methodCardDefault]}>
      <View style={styles.methodCardLeft}>
        <View style={[styles.methodIcon, { backgroundColor: isMobile ? COLORS.accentLight + '25' : COLORS.infoLight }]}>
          <Ionicons
            name={isMobile ? 'phone-portrait-outline' : 'business-outline'}
            size={20}
            color={isMobile ? COLORS.accent : COLORS.info}
          />
        </View>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.methodLabel}>{method.label}</Text>
            {method.is_default && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Default</Text>
              </View>
            )}
          </View>
          <Text style={styles.methodSub}>
            {isMobile
              ? `${method.mobile_network ?? ''} · ${maskAccount(method.account_number)}`
              : `${method.bank_name ?? ''} · ${maskAccount(method.account_number)}`}
          </Text>
          <Text style={styles.methodHolder}>{method.account_name}</Text>
        </View>
      </View>
      <View style={styles.methodActions}>
        {!method.is_default && (
          <TouchableOpacity style={styles.methodActionBtn} onPress={onSetDefault}>
            <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.methodActionBtn} onPress={onEdit}>
          <Ionicons name="pencil-outline" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.methodActionBtn} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon as any} size={44} color={COLORS.textMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

// ─── Withdraw Modal ───────────────────────────────────────────────────────────
function WithdrawModal({
  wallet, methods, onClose, onSuccess, businessId, userEmail,
}: {
  wallet: WalletAccount | null;
  methods: PayoutMethod[];
  onClose: () => void;
  onSuccess: () => void;
  businessId: string;
  userEmail: string;
}) {
  type Step = 'form' | 'confirm' | 'success';

  const [step,          setStep]          = useState<Step>('form');
  const [amount,        setAmount]        = useState('');
  const [selectedId,    setSelectedId]    = useState<string>(
    methods.find(m => m.is_default)?.id ?? methods[0]?.id ?? ''
  );
  const [notes,         setNotes]         = useState('');
  const [password,      setPassword]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [attempts,      setAttempts]      = useState(0);
  const [busy,          setBusy]          = useState(false);
  const [withdrawalErr, setWithdrawalErr] = useState('');
  const [withdrawalId,  setWithdrawalId]  = useState<string | null>(null);
  const [formNotice,    setFormNotice]    = useState<NoticeState | null>(null);

  const selectedMethod = methods.find(m => m.id === selectedId);

  const numAmount = parseFloat(amount.replace(/,/g, '')) || 0;
  const available = wallet?.balance ?? 0;
  const netAmount = Math.max(0, numAmount - PAYOUT_FEE);
  const isAmountValid = numAmount >= MIN_WITHDRAWAL && numAmount <= available;

  // ── Step 1 → 2: validate form ─────────────────────────────────────────────
  const handleContinue = () => {
    if (!isAmountValid) {
      setFormNotice({
        tone: 'warning',
        title: 'Invalid Amount',
        message:
        numAmount < MIN_WITHDRAWAL
          ? `Withdrawal amount must be greater than payout fee (${fmtMoney(PAYOUT_FEE)}). Minimum is ${fmtMoney(MIN_WITHDRAWAL)}.`
          : `Amount exceeds available balance of ${fmtMoney(available)}.`,
      });
      return;
    }
    if (!selectedId) {
      setFormNotice({ tone: 'warning', title: 'No Method', message: 'Select a payout method first.' });
      return;
    }
    setFormNotice(null);
    setWithdrawalErr('');
    setPassword('');
    setStep('confirm');
  };

  // ── Step 2: password re-auth + RPC ────────────────────────────────────────
  const handleConfirm = async () => {
    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert('Too Many Attempts', 'Please wait before trying again or log out and back in.');
      return;
    }

    setBusy(true);
    setWithdrawalErr('');

    try {
      // 1. Ensure active session; optional password check only when provided.
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        throw new Error('Your session has expired. Please log in again and retry.');
      }

      if (password.trim()) {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email:    userEmail,
          password: password,
        });

        if (authErr) {
          const remaining = MAX_ATTEMPTS - attempts - 1;
          setAttempts(a => a + 1);
          setWithdrawalErr(
            remaining > 0
              ? `Password verification failed. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
              : 'Too many incorrect attempts. Withdrawal locked.'
          );
          setBusy(false);
          return;
        }
      }

      // 2. Call secure server-side RPC (atomic balance deduction)
      const { data, error: rpcErr } = await supabase.rpc('process_withdrawal', {
        p_business_id:      businessId,
        p_payout_method_id: selectedId,
        p_amount:           numAmount,
        p_fee:              PAYOUT_FEE,
        p_notes:            notes.trim() || null,
      });

      if (rpcErr) {
        const msg = rpcErr.message || 'Withdrawal RPC failed';
        if (/process_withdrawal|function .* does not exist/i.test(msg)) {
          throw new Error('Withdrawal service is not installed in the database yet. Run scripts/wallet-module.sql in Supabase SQL Editor, then retry.');
        }
        throw rpcErr;
      }

      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.ok) {
        throw new Error(result?.error_msg ?? 'Withdrawal failed. Please try again.');
      }

      setWithdrawalId(result.withdrawal_id);
      setStep('success');
    } catch (e: any) {
      setWithdrawalErr(e?.message ?? 'An error occurred. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {step === 'form'    && 'Withdraw Funds'}
              {step === 'confirm' && 'Confirm Withdrawal'}
              {step === 'success' && 'Withdrawal Submitted'}
            </Text>
            {step !== 'success' && (
              <TouchableOpacity onPress={onClose} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>

            {/* ── Step 1: Form ─────────────────────────────────────────── */}
            {step === 'form' && (
              <View style={styles.modalBody}>
                {formNotice && (
                  <InlineNotice
                    tone={formNotice.tone}
                    title={formNotice.title}
                    message={formNotice.message}
                    onClose={() => setFormNotice(null)}
                  />
                )}

                {/* Available balance banner */}
                <View style={styles.availableBanner}>
                  <Ionicons name="wallet-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.availableText}>
                    Available: <Text style={{ fontWeight: '700' }}>{fmtMoney(available)}</Text>
                  </Text>
                </View>

                {/* Amount */}
                <Text style={styles.fieldLabel}>Amount (TZS) *</Text>
                <TextInput
                  style={[styles.input, !isAmountValid && numAmount > 0 && styles.inputError]}
                  placeholder={`Min ${fmtMoney(MIN_WITHDRAWAL)} (fee ${fmtMoney(PAYOUT_FEE)})`}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                  placeholderTextColor={COLORS.textMuted}
                />
                {numAmount > available && (
                  <Text style={styles.fieldError}>Exceeds available balance</Text>
                )}
                {numAmount > 0 && numAmount < MIN_WITHDRAWAL && (
                  <Text style={styles.fieldError}>
                    Withdrawal amount must be greater than payout fee ({fmtMoney(PAYOUT_FEE)}). Minimum is {fmtMoney(MIN_WITHDRAWAL)}
                  </Text>
                )}

                {/* Payout Method */}
                <Text style={[styles.fieldLabel, { marginTop: SPACING.base }]}>
                  Payout To *
                </Text>
                {methods.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.methodOption,
                      selectedId === m.id && styles.methodOptionSelected,
                    ]}
                    onPress={() => setSelectedId(m.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.methodOptionLeft}>
                      <Ionicons
                        name={m.type === 'bank' ? 'business-outline' : 'phone-portrait-outline'}
                        size={20}
                        color={selectedId === m.id ? COLORS.primary : COLORS.textSecondary}
                      />
                      <View style={{ marginLeft: SPACING.sm }}>
                        <Text style={styles.methodOptionLabel}>{m.label}</Text>
                        <Text style={styles.methodOptionSub}>
                          {maskAccount(m.account_number)} · {m.account_name}
                        </Text>
                      </View>
                    </View>
                    {selectedId === m.id && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                ))}

                {/* Notes */}
                <Text style={[styles.fieldLabel, { marginTop: SPACING.base }]}>
                  Notes (optional)
                </Text>
                <TextInput
                  style={[styles.input, { minHeight: 68, textAlignVertical: 'top' }]}
                  placeholder="Reason for withdrawal…"
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                  placeholderTextColor={COLORS.textMuted}
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, !isAmountValid && { opacity: 0.5 }]}
                  onPress={handleContinue}
                >
                  <Text style={styles.primaryBtnText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Step 2: Confirm + Password ───────────────────────────── */}
            {step === 'confirm' && (
              <View style={styles.modalBody}>
                {/* Summary card */}
                <View style={styles.summaryCard}>
                  <Ionicons name="shield-checkmark-outline" size={28} color={COLORS.primary} style={{ marginBottom: SPACING.sm }} />
                  <Text style={styles.summaryTitle}>Review Withdrawal</Text>

                  <SummaryRow label="Amount"   value={fmtMoney(numAmount)} />
                  <SummaryRow label="Payout Fee" value={fmtMoney(PAYOUT_FEE)} />
                  <SummaryRow label="To"       value={selectedMethod?.label ?? ''} />
                  <SummaryRow label="Account"  value={maskAccount(selectedMethod?.account_number ?? '')} />
                  <SummaryRow label="Name"     value={selectedMethod?.account_name ?? ''} />
                  {notes.trim() && <SummaryRow label="Notes" value={notes.trim()} />}

                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryNetRow}>
                    <Text style={styles.summaryNetLabel}>You receive</Text>
                    <Text style={styles.summaryNetValue}>{fmtMoney(netAmount)}</Text>
                  </View>
                </View>

                {/* Security confirmation */}
                <View style={styles.securitySection}>
                  <View style={styles.securityHeader}>
                    <Ionicons name="lock-closed" size={16} color={COLORS.primary} />
                    <Text style={styles.securityTitle}>Identity Verification</Text>
                  </View>
                  <Text style={styles.securityBody}>
                    Enter your SmartEnterprise account password for extra security (optional).
                  </Text>

                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Account password (optional)"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={v => { setPassword(v); setWithdrawalErr(''); }}
                      placeholderTextColor={COLORS.textMuted}
                      autoComplete="password"
                    />
                    <TouchableOpacity
                      style={styles.passwordEye}
                      onPress={() => setShowPassword(v => !v)}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  {!!withdrawalErr && (
                    <View style={styles.errorBanner}>
                      <Ionicons name="warning-outline" size={16} color={COLORS.error} />
                      <Text style={styles.errorBannerText}>{withdrawalErr}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.confirmBtns}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => { setStep('form'); setWithdrawalErr(''); }}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { flex: 1 }, busy && { opacity: 0.7 }]}
                    onPress={handleConfirm}
                    disabled={busy || attempts >= MAX_ATTEMPTS}
                  >
                    {busy
                      ? <ActivityIndicator color={COLORS.white} size="small" />
                      : <>
                          <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                          <Text style={styles.primaryBtnText}>Confirm Withdrawal</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── Step 3: Success ──────────────────────────────────────── */}
            {step === 'success' && (
              <View style={[styles.modalBody, styles.successBody]}>
                <View style={styles.successIconWrap}>
                  <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
                </View>
                <Text style={styles.successTitle}>Withdrawal Submitted!</Text>
                <Text style={styles.successBody2}>
                  {fmtMoney(netAmount)} will be sent to{' '}
                  <Text style={{ fontWeight: '700' }}>{selectedMethod?.label}</Text>.
                  {'\n\n'}Your balance has been updated and you can track this request
                  in the Withdrawals tab.
                </Text>

                {!!withdrawalId && (
                  <Text style={styles.successRef}>
                    Reference: {withdrawalId.slice(0, 8).toUpperCase()}
                  </Text>
                )}

                <TouchableOpacity style={styles.primaryBtn} onPress={onSuccess}>
                  <Text style={styles.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryRowLabel}>{label}</Text>
      <Text style={styles.summaryRowValue}>{value}</Text>
    </View>
  );
}

function InlineNotice({
  tone,
  title,
  message,
  onClose,
}: {
  tone: NoticeTone;
  title: string;
  message: string;
  onClose?: () => void;
}) {
  const cfg: Record<NoticeTone, { bg: string; border: string; text: string; icon: string }> = {
    info: {
      bg: COLORS.infoLight,
      border: COLORS.info,
      text: COLORS.info,
      icon: 'information-circle-outline',
    },
    warning: {
      bg: COLORS.warningLight,
      border: COLORS.warning,
      text: COLORS.warning,
      icon: 'alert-circle-outline',
    },
    error: {
      bg: COLORS.errorLight,
      border: COLORS.error,
      text: COLORS.error,
      icon: 'close-circle-outline',
    },
    success: {
      bg: COLORS.successLight,
      border: COLORS.success,
      text: COLORS.success,
      icon: 'checkmark-circle-outline',
    },
  };

  const theme = cfg[tone];

  return (
    <View style={[styles.inlineNotice, { backgroundColor: theme.bg, borderColor: theme.border + '66' }]}> 
      <View style={[styles.inlineNoticeIconWrap, { backgroundColor: theme.border + '20' }]}>
        <Ionicons name={theme.icon as any} size={18} color={theme.text} />
      </View>
      <View style={styles.inlineNoticeContent}>
        <Text style={[styles.inlineNoticeTitle, { color: theme.text }]}>{title}</Text>
        <Text style={styles.inlineNoticeBody}>{message}</Text>
      </View>
      {!!onClose && (
        <TouchableOpacity onPress={onClose} style={styles.inlineNoticeClose}>
          <Ionicons name="close" size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Add / Edit Payout Method Modal ──────────────────────────────────────────
function AddPayoutMethodModal({
  businessId, editing, onClose, onSaved,
}: {
  businessId: string;
  editing: PayoutMethod | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type,          setType]          = useState<'bank' | 'mobile_money'>(editing?.type ?? 'mobile_money');
  const [label,         setLabel]         = useState(editing?.label ?? '');
  const [accountName,   setAccountName]   = useState(editing?.account_name ?? '');
  const [accountNumber, setAccountNumber] = useState(editing?.account_number ?? '');
  const [bankCode,      setBankCode]      = useState(editing?.bank_code ?? '');
  const [bankName,      setBankName]      = useState(editing?.bank_name ?? '');
  const [network,       setNetwork]       = useState(editing?.mobile_network ?? '');
  const [isDefault,     setIsDefault]     = useState(editing?.is_default ?? false);
  const [busy,          setBusy]          = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);

  const isEdit = !!editing;

  const validate = (): string | null => {
    const cleanLabel = label.trim();
    const cleanAccountName = accountName.trim();
    const cleanAccountNumber = accountNumber.trim();

    if (!cleanLabel) return 'Label is required.';
    if (cleanLabel.length < 3 || cleanLabel.length > 60) {
      return 'Label must be between 3 and 60 characters.';
    }

    if (!cleanAccountName) return 'Account holder name is required.';
    if (cleanAccountName.length < 3 || cleanAccountName.length > 80) {
      return 'Account holder name must be between 3 and 80 characters.';
    }

    if (!cleanAccountNumber) return 'Account number / phone is required.';

    if (type === 'mobile_money' && !isValidTzPhone(cleanAccountNumber)) {
      return 'Enter a valid Tanzania mobile number (07XXXXXXXX or 2557XXXXXXX).';
    }

    if (type === 'bank' && !/^[A-Za-z0-9]{6,34}$/.test(cleanAccountNumber.replace(/\s+/g, ''))) {
      return 'Enter a valid bank account number (6-34 letters/numbers).';
    }

    if (type === 'bank' && !bankCode) return 'Select a bank.';
    if (type === 'mobile_money' && !network) return 'Select a mobile network.';
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { Alert.alert('Validation Error', err); return; }

    setBusy(true);
    try {
      const payload: Partial<PayoutMethod> & { business_id: string } = {
        business_id:    businessId,
        type,
        label:          label.trim(),
        account_name:   accountName.trim(),
        account_number: type === 'mobile_money'
          ? normalizeTzPhone(accountNumber)
          : accountNumber.replace(/\s+/g, '').trim(),
        bank_code:      type === 'bank'         ? bankCode   : undefined,
        bank_name:      type === 'bank'         ? bankName   : undefined,
        mobile_network: type === 'mobile_money' ? network    : undefined,
        is_default:     isDefault,
      };

      if (isEdit) {
        const { error } = await supabase
          .from('payout_methods')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editing!.id);
        if (error) throw error;
      } else {
        // If this is the first method, make it default
        const { data: existing } = await supabase
          .from('payout_methods')
          .select('id')
          .eq('business_id', businessId)
          .limit(1);
        const autoDefault = !existing || existing.length === 0;
        const { error } = await supabase
          .from('payout_methods')
          .insert({ ...payload, is_default: isDefault || autoDefault });
        if (error) throw error;
      }

      // If setting default, clear other defaults first
      if (isDefault) {
        await supabase
          .from('payout_methods')
          .update({ is_default: false })
          .eq('business_id', businessId)
          .neq('id', editing?.id ?? '00000000-0000-0000-0000-000000000000');
      }

      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isEdit ? 'Edit Payout Method' : 'Add Payout Method'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalBody}>

              {/* Type selector */}
              <Text style={styles.fieldLabel}>Type *</Text>
              <View style={styles.typeRow}>
                {(['mobile_money', 'bank'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, type === t && styles.typeBtnActive]}
                    onPress={() => setType(t)}
                  >
                    <Ionicons
                      name={t === 'bank' ? 'business-outline' : 'phone-portrait-outline'}
                      size={18}
                      color={type === t ? COLORS.white : COLORS.textSecondary}
                    />
                    <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>
                      {t === 'bank' ? 'Bank Account' : 'Mobile Money'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Mobile network selector */}
              {type === 'mobile_money' && (
                <>
                  <Text style={styles.fieldLabel}>Network *</Text>
                  <View style={styles.networkRow}>
                    {MOBILE_NETWORKS.map(n => (
                      <TouchableOpacity
                        key={n}
                        style={[styles.networkChip, network === n && styles.networkChipActive]}
                        onPress={() => setNetwork(n)}
                      >
                        <Text style={[styles.networkChipText, network === n && styles.networkChipTextActive]}>
                          {n}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Bank selector */}
              {type === 'bank' && (
                <>
                  <Text style={styles.fieldLabel}>Bank *</Text>
                  <TouchableOpacity
                    style={styles.bankPickerBtn}
                    onPress={() => setShowBankPicker(true)}
                  >
                    <Text style={[styles.bankPickerText, !bankName && { color: COLORS.textMuted }]}>
                      {bankName || 'Select bank…'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </>
              )}

              {/* Label */}
              <Text style={styles.fieldLabel}>Label *</Text>
              <TextInput
                style={styles.input}
                placeholder={type === 'bank' ? 'e.g. NMB Savings Account' : 'e.g. Vodacom M-Pesa'}
                value={label}
                onChangeText={setLabel}
                placeholderTextColor={COLORS.textMuted}
              />

              {/* Account number / phone */}
              <Text style={styles.fieldLabel}>
                {type === 'bank' ? 'Account Number *' : 'Phone Number *'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={type === 'bank' ? 'e.g. 1234567890' : 'e.g. 0744123456'}
                keyboardType={type === 'bank' ? 'default' : 'phone-pad'}
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholderTextColor={COLORS.textMuted}
              />

              {/* Account holder name */}
              <Text style={styles.fieldLabel}>Account Holder Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Full name as on account"
                value={accountName}
                onChangeText={setAccountName}
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />

              {/* Set default toggle */}
              <TouchableOpacity
                style={styles.defaultToggleRow}
                onPress={() => setIsDefault(v => !v)}
                activeOpacity={0.8}
              >
                <View>
                  <Text style={styles.defaultToggleLabel}>Set as Default</Text>
                  <Text style={styles.defaultToggleSub}>
                    This method will be pre-selected on withdrawals
                  </Text>
                </View>
                <View style={[styles.toggle, isDefault && styles.toggleActive]}>
                  <View style={[styles.toggleThumb, isDefault && styles.toggleThumbActive]} />
                </View>
              </TouchableOpacity>

              {/* Save button */}
              <TouchableOpacity
                style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={busy}
              >
                {busy
                  ? <ActivityIndicator color={COLORS.white} size="small" />
                  : <Text style={styles.primaryBtnText}>
                      {isEdit ? 'Save Changes' : 'Add Method'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Bank picker sub-modal */}
        {showBankPicker && (
          <Modal visible animationType="slide" transparent onRequestClose={() => setShowBankPicker(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Bank</Text>
                  <TouchableOpacity onPress={() => setShowBankPicker(false)} style={styles.modalClose}>
                    <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={SNIPPE_BANKS as unknown as { code: string; name: string }[]}
                  keyExtractor={item => item.code}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.bankItem, bankCode === item.code && styles.bankItemSelected]}
                      onPress={() => {
                        setBankCode(item.code);
                        setBankName(item.name);
                        // Auto-fill label if empty
                        if (!label) setLabel(item.name);
                        setShowBankPicker(false);
                      }}
                    >
                      <Text style={[
                        styles.bankItemText,
                        bankCode === item.code && styles.bankItemTextSelected,
                      ]}>
                        {item.name}
                      </Text>
                      {bankCode === item.code && (
                        <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                      )}
                    </TouchableOpacity>
                  )}
                  style={{ maxHeight: 420 }}
                />
              </View>
            </View>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: COLORS.background },
  scroll:        { flex: 1 },
  scrollContent: { padding: SPACING.base },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING['2xl'] },

  // Balance card
  balanceCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.base,
    ...(SHADOWS.lg as object),
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  balanceLabel: {
    fontSize: FONTS.sizes.sm,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  balanceAmount: {
    fontSize: FONTS.sizes['3xl'],
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  walletIconWrap: {
    width: 52, height: 52, borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  balanceStats: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
  },
  balanceStat: {
    flex: 1, alignItems: 'center', gap: 4,
  },
  balanceStatLabel: {
    fontSize: FONTS.sizes.xs,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  balanceStatValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'stretch',
    marginHorizontal: SPACING.xs,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xs,
    ...(SHADOWS.sm as object),
  },
  withdrawBtnText: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xs,
    marginBottom: SPACING.base,
    ...(SHADOWS.xs as object),
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 5,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  tabItemActive: {
    backgroundColor: COLORS.primary + '15',
  },
  tabLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: COLORS.accent,
  },

  // Section
  section: { gap: SPACING.xs },

  // Transaction row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    gap: SPACING.sm,
    ...(SHADOWS.xs as object),
  },
  txIconWrap: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  txMeta: { flex: 1 },
  txDesc: {
    fontSize: FONTS.sizes.base,
    fontWeight: '600',
    color: COLORS.text,
  },
  txDate: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  txAmountWrap: { alignItems: 'flex-end', gap: 4 },
  txAmount: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
  },
  statusChip: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusChipText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
  },

  // Payout method card
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...(SHADOWS.xs as object),
  },
  methodCardDefault: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '06',
  },
  methodCardLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  methodIcon: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  methodLabel: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  methodSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  methodHolder: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  methodActions: { flexDirection: 'row', gap: 4 },
  methodActionBtn: {
    width: 36, height: 36, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  defaultBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },

  // Add method button
  addMethodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.base,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '50',
    borderStyle: 'dashed',
    borderRadius: RADIUS.lg,
    justifyContent: 'center',
  },
  addMethodText: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.primary },

  // Restricted banner
  restrictedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.base,
    backgroundColor: COLORS.warningLight,
    borderRadius: RADIUS.lg,
  },
  restrictedText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, flex: 1 },

  inlineNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.base,
  },
  inlineNoticeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  inlineNoticeContent: { flex: 1, gap: 2 },
  inlineNoticeTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
  },
  inlineNoticeBody: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  inlineNoticeClose: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.sm,
  },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  emptyBody: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '92%',
    ...(SHADOWS.xl as object),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.text },
  modalClose: {
    width: 36, height: 36, borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  modalBody: { padding: SPACING.xl, gap: SPACING.sm },

  // Form fields
  fieldLabel: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  fieldError: { fontSize: FONTS.sizes.xs, color: COLORS.error, marginTop: -4 },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm + 2,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
  },
  inputError: { borderColor: COLORS.error },

  // Payout method option in withdraw form
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.base,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  methodOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '08',
  },
  methodOptionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  methodOptionLabel: { fontWeight: '700', fontSize: FONTS.sizes.base, color: COLORS.text },
  methodOptionSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },

  // Available balance banner in withdraw
  availableBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary + '12',
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  availableText: { fontSize: FONTS.sizes.sm, color: COLORS.primary },

  // Summary
  summaryCard: {
    backgroundColor: COLORS.primary + '08',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primary + '25',
    alignItems: 'center',
    gap: 2,
  },
  summaryTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 4,
  },
  summaryRowLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  summaryRowValue: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text, maxWidth: '60%', textAlign: 'right' },
  summaryDivider: { height: 1, backgroundColor: COLORS.border, width: '100%', marginVertical: SPACING.xs },
  summaryNetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 4,
  },
  summaryNetLabel: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  summaryNetValue: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.success },

  // Security section
  securitySection: {
    backgroundColor: COLORS.warningLight,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    gap: SPACING.sm,
  },
  securityHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  securityTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  securityBody: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 44 },
  passwordEye: {
    position: 'absolute',
    right: 12, top: 0, bottom: 0,
    justifyContent: 'center',
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: SPACING.sm,
    backgroundColor: COLORS.errorLight,
    borderRadius: RADIUS.md,
  },
  errorBannerText: { fontSize: FONTS.sizes.sm, color: COLORS.error, flex: 1 },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    ...(SHADOWS.sm as object),
  },
  primaryBtnText: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.white },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginTop: SPACING.sm,
  },
  secondaryBtnText: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  confirmBtns: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'stretch' },

  // Success screen
  successBody: { alignItems: 'center' },
  successIconWrap: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.successLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.base,
  },
  successTitle: { fontSize: FONTS.sizes['2xl'], fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  successBody2: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginVertical: SPACING.base },
  successRef: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, fontFamily: 'monospace' },

  // Type selector
  typeRow: { flexDirection: 'row', gap: SPACING.sm },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  typeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeBtnText: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.textSecondary },
  typeBtnTextActive: { color: COLORS.white },

  // Network chips
  networkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  networkChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  networkChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '18' },
  networkChipText: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.textSecondary },
  networkChipTextActive: { color: COLORS.accent },

  // Bank picker
  bankPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm + 2,
  },
  bankPickerText: { fontSize: FONTS.sizes.base, color: COLORS.text, flex: 1 },
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  bankItemSelected: { backgroundColor: COLORS.primary + '0A' },
  bankItemText: { fontSize: FONTS.sizes.base, color: COLORS.text },
  bankItemTextSelected: { fontWeight: '700', color: COLORS.primary },

  // Default toggle
  defaultToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.base,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xs,
  },
  defaultToggleLabel: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  defaultToggleSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: COLORS.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: COLORS.primary },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: COLORS.white,
    ...(SHADOWS.xs as object),
  },
  toggleThumbActive: { alignSelf: 'flex-end' },

  // General error
  errorText: { fontSize: FONTS.sizes.base, color: COLORS.error, textAlign: 'center', marginTop: SPACING.sm },
  retryBtn: {
    marginTop: SPACING.base,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.lg,
  },
  retryText: { color: COLORS.white, fontWeight: '700' },
});
