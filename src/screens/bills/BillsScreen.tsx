import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { Sale, Product } from '../../types';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS, WEB_OUTLINE_NONE } from '../../lib/constants';
import { getPosType } from '../../lib/inventory';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { useRealtimeSubscription } from '../../lib/hooks';
import { ListSkeleton } from '../../components/common/SkeletonLoader';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const STATUS_COLORS: Record<string, string> = {
  active: COLORS.success,
  completed: COLORS.info,
  cancelled: COLORS.error,
  refunded: COLORS.warning,
};

const STATUS_ICONS: Record<string, string> = {
  active: 'time-outline',
  completed: 'checkmark-circle-outline',
  cancelled: 'close-circle-outline',
  refunded: 'refresh-circle-outline',
};

const PAYMENT_COLORS: Record<string, string> = {
  paid: COLORS.success,
  pending: COLORS.warning,
  partial: COLORS.info,
  overdue: COLORS.error,
};

const PAYMENT_ICONS: Record<string, string> = {
  paid: 'checkmark-done-outline',
  pending: 'hourglass-outline',
  partial: 'ellipsis-horizontal-outline',
  overdue: 'alert-circle-outline',
};

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' },
  { id: 'mobile_money', label: 'Mobile Money', icon: 'phone-portrait-outline' },
] as const;

const MOBILE_MONEY_MIN_AMOUNT = 500;

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

interface BillsScreenProps {
  prefillProduct?: Product | null;
  prefillNonce?: number;
}

export function BillsScreen({ prefillProduct = null, prefillNonce = 0 }: BillsScreenProps) {
  const { user, business } = useAuth();
  const { currency } = useSettings();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const isCompact = width < 520;

  const posType = getPosType(business?.category);
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const showSplit = !isMobile;

  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterDate, setFilterDate] = useState('All');
  const [filterPayment, setFilterPayment] = useState('All');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [acting, setActing] = useState(false);
  const [docBusy, setDocBusy] = useState(false);

  // New layout and menu states
  const [viewMode, setViewMode] = useState<'list' | 'card' | 'kanban'>('card');
  const [statusOpen, setStatusOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const [detailVisible, setDetailVisible] = useState(false);
  const [newOrderVisible, setNewOrderVisible] = useState(false);
  const [chargeVisible, setChargeVisible] = useState(false);
  const [addItemVisible, setAddItemVisible] = useState(false);
  const [chargeSale, setChargeSale] = useState<Sale | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const reconcilingRef = useRef(false);

  const [tableNumber, setTableNumber] = useState('');
  const [guests, setGuests] = useState('1');
  const [newMethod, setNewMethod] = useState<string>('cash');
  const [creatingOrder, setCreatingOrder] = useState(false);

  const [chargeMethod, setChargeMethod] = useState<string>('cash');
  const [chargeDiscount, setChargeDiscount] = useState('0');
  const [chargeCashReceived, setChargeCashReceived] = useState('');
  const [chargeMobilePhone, setChargeMobilePhone] = useState('');
  const [chargePayerName, setChargePayerName] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [savingItems, setSavingItems] = useState(false);
  const [loadingPrefill, setLoadingPrefill] = useState(false);

  const fetchSales = useCallback(async (silent = false) => {
    if (!business?.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!silent) setLoading(true);

    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        items:sale_items(*, product:products(id, name, selling_price)),
        customer:customers(id, full_name, phone)
      `)
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      console.error('[BillsScreen] sales fetch error:', error.message);
    }

    const seen = new Set<string>();
    const deduped = ((data as Sale[]) ?? []).filter((sale) => {
      if (seen.has(sale.id)) return false;
      seen.add(sale.id);
      return true;
    });

    setSales(deduped);
    setSelectedSale((prev) => {
      if (!deduped.length) return null;
      if (!prev) return deduped[0];
      return deduped.find((s) => s.id === prev.id) ?? deduped[0];
    });
    setLoading(false);
    setRefreshing(false);
  }, [business?.id]);

  const fetchProducts = useCallback(async () => {
    if (!business?.id) return;

    const { data, error } = await supabase
      .from('products')
      .select('id, name, selling_price, stock_quantity, unit')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[BillsScreen] fetchProducts error:', error.message);
    }
    setProducts((data as Product[]) ?? []);
  }, [business?.id]);

  // Sync historical/late-updated payment records to sales so Bills UI stays correct.
  const reconcilePaidSales = useCallback(async () => {
    if (!business?.id || reconcilingRef.current) return;
    reconcilingRef.current = true;
    setReconciling(true);
    try {
      // 0) Actively verify any pending mobile money payments with Snippe
      const { data: pendingPayments } = await supabase
        .from('payments')
        .select('id')
        .eq('business_id', business.id)
        .eq('payment_type', 'pos')
        .in('status', ['pending', 'processing'])
        .not('gateway_reference', 'is', null)
        .limit(10);

      if (pendingPayments && pendingPayments.length > 0) {
        await Promise.all(
          pendingPayments.map((p) =>
            supabase.functions.invoke('verify-payment', { body: { payment_id: p.id } }).catch(() => null)
          )
        );
      }

      // 1) If a sale is already paid, ensure status is completed.
      await supabase
        .from('sales')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('business_id', business.id)
        .eq('payment_status', 'paid')
        .neq('status', 'completed');

      // 2) If a POS payment was completed, force linked order to paid/completed.
      const { data: completedPosPayments } = await supabase
        .from('payments')
        .select('pos_order_id')
        .eq('business_id', business.id)
        .eq('payment_type', 'pos')
        .eq('status', 'completed')
        .not('pos_order_id', 'is', null)
        .limit(500);

      const orderIds = ((completedPosPayments ?? []) as { pos_order_id: string | null }[])
        .map((p) => p.pos_order_id)
        .filter((id): id is string => !!id && /^[0-9a-fA-F-]{36}$/.test(id));

      if (orderIds.length > 0) {
        await supabase
          .from('sales')
          .update({
            payment_status: 'paid',
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('business_id', business.id)
          .in('id', orderIds)
          .or('status.neq.completed,payment_status.neq.paid');
      }
    } catch (e) {
      console.warn('[BillsScreen] reconcilePaidSales failed:', e);
    } finally {
      reconcilingRef.current = false;
      setReconciling(false);
    }
  }, [business?.id]);

  useEffect(() => {
    if (ordersLoaded) {
      reconcilePaidSales().finally(() => fetchSales(true));
    }
    fetchProducts();
  }, [fetchSales, fetchProducts, reconcilePaidSales, ordersLoaded]);

  useEffect(() => {
    if (selectedSale) {
      const updated = sales.find((s) => s.id === selectedSale.id);
      if (updated && updated !== selectedSale) {
        setSelectedSale(updated);
      }
    }
  }, [sales, selectedSale]);

  useRealtimeSubscription('bills-sales', 'sales', () => fetchSales(true), !!business?.id && ordersLoaded);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    return sales.filter((sale) => {
      const matchSearch =
        !q
        || sale.order_number.toLowerCase().includes(q)
        || (sale as any).customer?.full_name?.toLowerCase().includes(q)
        || (sale.table_number ?? '').toLowerCase().includes(q);

      const matchStatus = filterStatus === 'All' || sale.status === filterStatus;
      const matchPayment = filterPayment === 'All' || sale.payment_method === filterPayment;

      let matchDate = true;
      if (filterDate !== 'All') {
          const sDate = new Date(sale.created_at);
          if (filterDate === 'Today') {
              matchDate = sDate >= startOfDay(now);
          } else if (filterDate === 'Week') {
              matchDate = sDate >= startOfWeek(now);
          } else if (filterDate === 'Month') {
              matchDate = sDate >= startOfMonth(now);
          }
      }

      return matchSearch && matchStatus && matchPayment && matchDate;
    });
  }, [sales, search, filterStatus, filterPayment, filterDate]);

  const totalRevenue = useMemo(
    () => sales.filter((sale) => sale.status === 'completed').reduce((sum, sale) => sum + Number(sale.total), 0),
    [sales],
  );

  const activeCount = useMemo(() => sales.filter((sale) => sale.status === 'active').length, [sales]);

  const pendingCount = useMemo(
    () => sales.filter((sale) => sale.payment_status === 'pending' && sale.status !== 'cancelled').length,
    [sales],
  );

  const todaySales = useMemo(() => {
    const today = startOfDay(new Date());
    return sales.filter((s) => new Date(s.created_at) >= today);
  }, [sales]);

  const todayRevenue = useMemo(() => {
    return todaySales
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + Number(s.total || s.subtotal || 0), 0);
  }, [todaySales]);

  const completedToday = useMemo(() => {
    return todaySales.filter((s) => s.status === 'completed').length;
  }, [todaySales]);

  const statsPendingOrders = useMemo(() => {
    return sales.filter((s) => s.status === 'active' && s.payment_status === 'pending').length;
  }, [sales]);

  const handleSelectSale = (sale: Sale) => {
    setSelectedSale(sale);
    if (isMobile) {
      setDetailVisible(true);
    }
  };

  const openCharge = (sale: Sale) => {
    setChargeSale(sale);
    setChargeMethod(sale.payment_method ?? 'cash');
    setChargeDiscount('0');
    setChargeCashReceived('');
    setChargeMobilePhone('');
    setChargePayerName('');
    setChargeVisible(true);
  };

  // Polling function to verify payment completion (called after initiating payment)
  const pollPaymentStatus = async (
    paymentId: string,
    maxAttempts: number = 60, // 60 attempts = 5 minutes with 5s intervals
  ): Promise<string | null> => {
    let attempts = 0;

    const poll = async (): Promise<string | null> => {
      attempts++;

      try {
        console.log(`[Payment Poll] Calling verify-payment (attempt ${attempts}/${maxAttempts})...`);

        const { data, error } = await supabase.functions.invoke('verify-payment', {
          body: { payment_id: paymentId },
        });

        console.log(`[Payment Poll] Response (attempt ${attempts}):`, { data, error });

        if (error) {
          console.error(`[Payment Poll] verify-payment error (attempt ${attempts}):`, error);
          if (attempts >= maxAttempts) return null;
          await new Promise((resolve) => setTimeout(resolve, 5000)); // retry in 5s
          return poll();
        }

        // Check all possible status fields
        const status = data?.status || data?.payment_status;
        console.log(`[Payment Poll] Status value: "${status}" | Full data:`, JSON.stringify(data, null, 2));

        if (status === 'completed') {
          console.log('[Payment Poll] ✓ Payment completed!');
          return 'completed';
        }

        if (['failed', 'expired'].includes(status)) {
          console.log(`[Payment Poll] ✗ Payment ${status}`);
          return status;
        }

        // Still processing — keep polling
        if (attempts >= maxAttempts) {
          console.warn('[Payment Poll] Polling timeout — payment still pending');
          console.log(`[Payment Poll] Final status received: "${status}"`);
          return null;
        }

        console.log(`[Payment Poll] Still waiting... (${attempts}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return poll();
      } catch (err) {
        console.error(`[Payment Poll] Unexpected error (attempt ${attempts}):`, err);
        if (attempts >= maxAttempts) return null;
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return poll();
      }
    };

    return poll();
  };

  const handleCharge = async () => {
    if (!chargeSale) return;

    const discount = Math.max(0, parseFloat(chargeDiscount) || 0);
    const baseAmount = Number(chargeSale.total || chargeSale.subtotal || 0);
    const newTotal = Math.max(0, baseAmount - discount);

    if (chargeMethod === 'cash') {
      const received = parseFloat(chargeCashReceived) || 0;
      if (received < newTotal) {
        Alert.alert('Insufficient amount', `Cash received (${currency} ${received.toLocaleString()}) is less than the total (${currency} ${newTotal.toLocaleString()}).`);
        return;
      }
    }

    if (chargeMethod === 'mobile_money' && !chargeMobilePhone.trim()) {
      Alert.alert('Phone required', "Please enter the customer's mobile money phone number.");
      return;
    }
    if (chargeMethod === 'mobile_money' && /[a-zA-Z]/.test(chargeMobilePhone)) {
      Alert.alert('Invalid phone', 'Phone number should not contain letters.');
      return;
    }
    if (chargeMethod === 'mobile_money' && !isValidTzPhone(chargeMobilePhone)) {
      Alert.alert('Invalid phone', 'Enter a valid Tanzania mobile number (07XXXXXXXX or 2557XXXXXXX).');
      return;
    }
    if (chargeMethod === 'mobile_money' && !chargePayerName.trim()) {
      Alert.alert('Name required', "Please enter the payer's name.");
      return;
    }
    if (chargeMethod === 'mobile_money' && /\d/.test(chargePayerName)) {
      Alert.alert('Invalid name', 'Payer name should not contain numbers.');
      return;
    }
    if (chargeMethod === 'mobile_money' && chargePayerName.trim().length < 3) {
      Alert.alert('Invalid name', 'Payer name must be at least 3 characters.');
      return;
    }
    if (chargeMethod === 'mobile_money' && newTotal < MOBILE_MONEY_MIN_AMOUNT) {
      Alert.alert('Amount too low', `Mobile money payments must be at least ${currency} ${MOBILE_MONEY_MIN_AMOUNT.toLocaleString()}.`);
      return;
    }

    setActing(true);
    try {
      if (chargeMethod === 'mobile_money') {
        const normalizedPayerPhone = normalizeTzPhone(chargeMobilePhone);

        // ── Mobile money: trigger Snippe USSD push via Edge Function ──
        // Store the payment details on the sale first so the webhook can
        // find the order when Snippe confirms.
        const { error: updateErr } = await supabase
          .from('sales')
          .update({
            payment_method: 'mobile_money',
            mobile_phone:   normalizedPayerPhone,
            payer_name:     chargePayerName.trim(),
            discount,
            total:          newTotal,
            updated_at:     new Date().toISOString(),
          })
          .eq('id', chargeSale.id);

        if (updateErr) {
          Alert.alert('Error', updateErr.message);
          return;
        }

        // Call the Edge Function — it reads SNIPPE_API_KEY from Vault and
        // sends a USSD push to the payer's phone via Snippe.
        const { data, error: fnError } = await supabase.functions.invoke('initiate-payment', {
          body: {
            payment_type:    'pos',
            channel:         'mobile',
            amount:          newTotal,
            business_id:     chargeSale.business_id,
            idempotency_key: `${chargeSale.id}_${Date.now()}`,
            payer_phone:     normalizedPayerPhone,
            payer_name:      chargePayerName.trim(),
            pos_order_id:    chargeSale.id,
          },
        });

        if (fnError || !data?.success) {
          Alert.alert(
            'Payment failed',
            data?.message ?? fnError?.message ?? 'Could not send payment request to phone.',
          );
          return;
        }

        // Store payment_id for polling
        const paymentId = data?.payment_id;

        setChargeVisible(false);
        fetchSales(true);
        Alert.alert(
          'Request Sent',
          `A payment prompt has been sent to ${normalizedPayerPhone}. The order will be marked complete once the customer confirms on their phone.`,
        );

        // ── Auto-verify payment completion (poll for up to 5 minutes) ──
        if (paymentId) {
          console.log(`[BillsScreen] Starting payment verification for order ${chargeSale.id} (payment_id: ${paymentId})`);

          // Run polling in background without blocking UI
          (async () => {
            const finalStatus = await pollPaymentStatus(paymentId);

            if (finalStatus === 'completed') {
              // Payment succeeded — refresh sales list to show update from webhook/trigger
              console.log('[BillsScreen] Payment completed, refreshing sales...');
              await new Promise((resolve) => setTimeout(resolve, 1000)); // give DB time to update
              await fetchSales(true);

              // Show success confirmation
              Alert.alert(
                '✓ Payment Confirmed',
                `Payment of ${currency} ${newTotal.toLocaleString()} has been confirmed. Order and wallet updated.`,
              );
            } else if (finalStatus) {
              // Payment failed
              Alert.alert(
                '✗ Payment ' + (finalStatus === 'expired' ? 'Expired' : 'Failed'),
                `The payment ${finalStatus}. Order remains pending. Please try again.`,
              );
              await fetchSales(true);
            } else {
              // Polling timeout — payment still pending
              console.log('[BillsScreen] Payment verification timeout (still processing)');
              // Don't show alert — user already knows to wait for USSD
            }
          })();
        }
      } else {
        // ── Cash: complete immediately ──────────────────────────────
        const { error } = await supabase
          .from('sales')
          .update({
            payment_status: 'paid',
            payment_method: 'cash',
            status:         'completed',
            discount,
            total:          newTotal,
            updated_at:     new Date().toISOString(),
          })
          .eq('id', chargeSale.id);

        if (error) {
          Alert.alert('Error', error.message);
          return;
        }

        const change = Math.max(0, (parseFloat(chargeCashReceived) || 0) - newTotal);
        setChargeVisible(false);
        fetchSales(true);

        const paidSale: Sale = {
          ...chargeSale,
          payment_status: 'paid',
          payment_method: 'cash',
          status: 'completed',
          discount,
          total: newTotal,
        } as Sale;

        Alert.alert(
          'Payment recorded',
          change > 0
            ? `Change to return: ${currency} ${change.toLocaleString()}`
            : 'Customer payment recorded successfully.',
          [
            { text: 'Close', style: 'cancel' },
            {
              text: 'Generate Receipt',
              onPress: () => {
                handleGenerateReceipt(paidSale);
              },
            },
          ],
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Unexpected error');
    } finally {
      setActing(false);
    }
  };

  const handleCancel = (sale: Sale) => {
    setActing(true);
    (async () => {
      try {
        const { error } = await supabase
          .from('sales')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', sale.id);

        if (error) {
          Alert.alert('Error', error.message);
          return;
        }

        await fetchSales(true);
        if (selectedSale?.id === sale.id) {
          setDetailVisible(false);
        }
        Alert.alert('Order cancelled', `${sale.order_number} has been cancelled.`);
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Unexpected error');
      } finally {
        setActing(false);
      }
    })();
  };

  const handleRefund = (sale: Sale) => {
    Alert.alert(
      'Process Refund',
      `Are you sure you want to refund order #${sale.order_number}?\n\nThis will mark the order as refunded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Refund',
          style: 'destructive',
          onPress: async () => {
            setActing(true);
            try {
              const { error } = await supabase
                .from('sales')
                .update({ status: 'refunded', updated_at: new Date().toISOString() })
                .eq('id', sale.id);

              if (error) {
                Alert.alert('Error', error.message);
                return;
              }

              await fetchSales(true);
              if (selectedSale?.id === sale.id) {
                setDetailVisible(false);
              }
              Alert.alert('Order Refunded', `${sale.order_number} has been refunded.`);
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Unexpected error');
            } finally {
              setActing(false);
            }
          }
        }
      ]
    );
  };

  const handleClearOrder = (sale: Sale) => {
    setActing(true);
    (async () => {
      try {
        const { error: deleteErr } = await supabase
          .from('sale_items')
          .delete()
          .eq('sale_id', sale.id);

        if (deleteErr) {
          Alert.alert('Error', deleteErr.message);
          return;
        }

        const { error: saleErr } = await supabase
          .from('sales')
          .update({
            subtotal: 0,
            discount: 0,
            total: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sale.id);

        if (saleErr) {
          Alert.alert('Error', saleErr.message);
          return;
        }

        await fetchSales(true);
        Alert.alert('Order cleared', `${sale.order_number} is now empty.`);
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Could not clear order.');
      } finally {
        setActing(false);
      }
    })();
  };

  const handleCreateOrder = async () => {
    if (posType === 'food' && !tableNumber.trim()) {
      Alert.alert('Required', 'Table number is required');
      return;
    }

    if (!user?.id || !business?.id) {
      Alert.alert('Unavailable', 'Account or business context missing. Please sign in again.');
      return;
    }

    setCreatingOrder(true);
    const orderNumber = `ORD-${Date.now().toString().slice(-5)}`;

    const { data: newSale, error } = await supabase
      .from('sales')
      .insert({
        business_id: business.id,
        cashier_id: user.id,
        order_number: orderNumber,
        table_number: posType === 'food' ? tableNumber.trim() : null,
        guests: posType === 'food' ? (parseInt(guests, 10) || 1) : 1,
        status: 'active',
        subtotal: 0,
        discount: 0,
        total: 0,
        payment_status: 'pending',
        payment_method: newMethod,
      })
      .select('*, items:sale_items(*), customer:customers(id, full_name)')
      .single();

    setCreatingOrder(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setNewOrderVisible(false);
    setTableNumber('');
    setGuests('1');
    setNewMethod('cash');

    setOrdersLoaded(true);
    fetchSales(true);

    if (newSale) {
      setSelectedSale(newSale as Sale);
      if (isMobile) setDetailVisible(true);
    }
  };

  const openAddItems = (sale: Sale) => {
    setSelectedSale(sale);
    const existingQtys: Record<string, number> = {};
    if ((sale as any).items) {
      (sale as any).items.forEach((item: any) => {
        existingQtys[item.product_id] = (existingQtys[item.product_id] || 0) + item.quantity;
      });
    }
    setItemQty(existingQtys);
    setItemSearch('');
    fetchProducts();
    setAddItemVisible(true);
  };

  const handleSaveItems = async () => {
    if (!selectedSale) return;

    setSavingItems(true);

    const { error: deleteErr } = await supabase.from('sale_items').delete().eq('sale_id', selectedSale.id);
    if (deleteErr) {
      Alert.alert('Error', deleteErr.message);
      setSavingItems(false);
      return;
    }

    const entries = Object.entries(itemQty).filter(([, qty]) => qty > 0);

    let newSubtotal = 0;

    if (entries.length > 0) {
      const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
      const rows = entries.map(([productId, qty]) => {
        const total = qty * (productMap[productId]?.selling_price ?? 0);
        newSubtotal += total;
        return {
          sale_id: selectedSale.id,
          product_id: productId,
          quantity: qty,
          unit_price: productMap[productId]?.selling_price ?? 0,
          discount: 0,
          total: total,
        };
      });

      const { error: insertErr } = await supabase.from('sale_items').insert(rows);
      if (insertErr) {
        Alert.alert('Error', insertErr.message);
        setSavingItems(false);
        return;
      }
    }

    const newTotal = Math.max(0, newSubtotal - Number(selectedSale.discount));

    const { error: updateErr } = await supabase
      .from('sales')
      .update({ subtotal: newSubtotal, total: newTotal, updated_at: new Date().toISOString() })
      .eq('id', selectedSale.id);

    if (updateErr) {
      Alert.alert('Error', updateErr.message);
      setSavingItems(false);
      return;
    }

    setSavingItems(false);
    setAddItemVisible(false);
    fetchSales(true);
  };

  const resolveActiveSale = useCallback(async () => {
    if (!business?.id || !user?.id) return null;

    const inMemoryActive = sales.find((sale) => sale.status === 'active')
      || (selectedSale?.status === 'active' ? selectedSale : null);
    if (inMemoryActive) return inMemoryActive;

    const { data: latestActive } = await supabase
      .from('sales')
      .select('*, items:sale_items(*, product:products(id, name, selling_price)), customer:customers(id, full_name, phone)')
      .eq('business_id', business.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestActive) return latestActive as Sale;

    const orderNumber = `ORD-${Date.now().toString().slice(-5)}`;
    const { data: newSale } = await supabase
      .from('sales')
      .insert({
        business_id: business.id,
        cashier_id: user.id,
        order_number: orderNumber,
        guests: 1,
        status: 'active',
        subtotal: 0,
        discount: 0,
        total: 0,
        payment_status: 'pending',
        payment_method: 'cash',
      })
      .select('*, items:sale_items(*, product:products(id, name, selling_price)), customer:customers(id, full_name, phone)')
      .single();

    return (newSale as Sale) ?? null;
  }, [business?.id, user?.id, sales, selectedSale]);

  const addPrefillProductToOrder = useCallback(async (product: Product) => {
    if (!business?.id || !user?.id) return;
    setLoadingPrefill(true);
    try {
      const targetSale = await resolveActiveSale();
      if (!targetSale?.id) {
        Alert.alert('Order error', 'Could not load or create an active order.');
        return;
      }

      const { data: existingItems } = await supabase
        .from('sale_items')
        .select('id, quantity, total, discount')
        .eq('sale_id', targetSale.id)
        .eq('product_id', product.id)
        .limit(1);

      const current = existingItems?.[0] as any;

      if (current?.id) {
        const nextQty = Number(current.quantity ?? 0) + 1;
        const nextTotal = nextQty * Number(product.selling_price);
        const { error: updateItemErr } = await supabase
          .from('sale_items')
          .update({ quantity: nextQty, total: nextTotal })
          .eq('id', current.id);
        if (updateItemErr) throw new Error(updateItemErr.message);
      } else {
        const { error: insertErr } = await supabase
          .from('sale_items')
          .insert({
            sale_id: targetSale.id,
            product_id: product.id,
            quantity: 1,
            unit_price: product.selling_price,
            discount: 0,
            total: product.selling_price,
          });
        if (insertErr) throw new Error(insertErr.message);
      }

      const { data: totalsData, error: totalsErr } = await supabase
        .from('sale_items')
        .select('quantity, unit_price, discount')
        .eq('sale_id', targetSale.id);
      if (totalsErr) throw new Error(totalsErr.message);

      const subtotal = (totalsData ?? []).reduce((sum: number, row: any) => (
        sum + Number(row.quantity || 0) * Number(row.unit_price || 0)
      ), 0);
      const discount = (totalsData ?? []).reduce((sum: number, row: any) => (
        sum + Number(row.discount || 0)
      ), 0);

      const { error: saleUpdateErr } = await supabase
        .from('sales')
        .update({
          subtotal,
          total: Math.max(0, subtotal - discount),
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetSale.id);
      if (saleUpdateErr) throw new Error(saleUpdateErr.message);

      const { data: refreshedSale } = await supabase
        .from('sales')
        .select('*, items:sale_items(*, product:products(id, name, selling_price)), customer:customers(id, full_name, phone)')
        .eq('id', targetSale.id)
        .maybeSingle();

      const activeSale = (refreshedSale as Sale) ?? targetSale;

      setOrdersLoaded(true);
      await fetchSales(true);
      setSelectedSale(activeSale);
      if (isMobile) setDetailVisible(true);
    } catch (e: any) {
      Alert.alert('Order update failed', e?.message ?? 'Could not add product to order.');
    } finally {
      setLoadingPrefill(false);
    }
  }, [business?.id, user?.id, resolveActiveSale, fetchSales, isMobile]);

  useEffect(() => {
    if (!prefillProduct || !prefillNonce) return;
    addPrefillProductToOrder(prefillProduct);
  }, [prefillProduct, prefillNonce, addPrefillProductToOrder]);

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const buildBillingDocumentHtml = (sale: Sale, kind: 'proforma' | 'receipt') => {
    const customerName = (sale as any).customer?.full_name ?? 'Walk-in Customer';
    const customerPhone = (sale as any).customer?.phone ?? '—';
    const createdLabel = format(new Date(sale.created_at), 'dd MMM yyyy, HH:mm');
    const paymentLabel = (sale.payment_method ?? 'cash').replace('_', ' ');
    const title = kind === 'proforma' ? 'PROFORMA INVOICE' : 'PAYMENT RECEIPT';
    const statusLabel = kind === 'proforma' ? 'Pending Payment' : 'Paid';
    const businessName = business?.name ?? 'Business';
    const businessPhone = business?.phone ?? '';
    const businessAddress = business?.address ?? '';
    const businessEmail = business?.email ?? '';

    const itemRows = ((sale as any).items ?? []).map((item: any) => `
      <tr>
        <td>${escapeHtml(item.product?.name ?? 'Item')}</td>
        <td>${Number(item.quantity)}</td>
        <td style="text-align:right;">${currency} ${Number(item.unit_price).toLocaleString()}</td>
        <td style="text-align:right;">${currency} ${Number(item.total).toLocaleString()}</td>
      </tr>
    `).join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(businessName)} - ${title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 24px; }
            h1 { font-size: 22px; margin: 0 0 4px; }
            .biz { margin: 0 0 12px; }
            .biz-name { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
            .biz-meta { color: #4B5563; font-size: 12px; margin-bottom: 2px; }
            .meta { color: #4B5563; font-size: 12px; margin-bottom: 12px; }
            .pill { display: inline-block; font-size: 11px; font-weight: 700; border: 1px solid #D1D5DB; border-radius: 999px; padding: 4px 10px; margin-bottom: 12px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
            .cell { border: 1px solid #E5E7EB; border-radius: 8px; padding: 8px; }
            .k { color: #6B7280; font-size: 11px; }
            .v { margin-top: 2px; font-size: 13px; font-weight: 600; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
            th, td { border: 1px solid #E5E7EB; padding: 8px; text-align: left; }
            th { background: #F3F4F6; }
            .totals { margin-top: 12px; width: 280px; margin-left: auto; }
            .line { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
            .final { border-top: 1px solid #E5E7EB; margin-top: 4px; padding-top: 8px; font-size: 16px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="biz">
            <div class="biz-name">${escapeHtml(businessName)}</div>
            ${businessPhone ? `<div class="biz-meta">Phone: ${escapeHtml(businessPhone)}</div>` : ''}
            ${businessAddress ? `<div class="biz-meta">Address: ${escapeHtml(businessAddress)}</div>` : ''}
            ${businessEmail ? `<div class="biz-meta">Email: ${escapeHtml(businessEmail)}</div>` : ''}
          </div>

          <h1>${title}</h1>
          <div class="meta">Order ${escapeHtml(sale.order_number)} • Generated ${createdLabel}</div>
          <div class="pill">${statusLabel}</div>

          <div class="grid">
            <div class="cell"><div class="k">Customer</div><div class="v">${escapeHtml(customerName)}</div></div>
            <div class="cell"><div class="k">Phone</div><div class="v">${escapeHtml(customerPhone)}</div></div>
            <div class="cell"><div class="k">Table</div><div class="v">${escapeHtml(sale.table_number ?? '—')}</div></div>
            <div class="cell"><div class="k">Payment Method</div><div class="v">${escapeHtml(paymentLabel)}</div></div>
          </div>

          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
            <tbody>${itemRows || '<tr><td colspan="4">No items</td></tr>'}</tbody>
          </table>

          <div class="totals">
            <div class="line"><span>Subtotal</span><span>${currency} ${Number(sale.subtotal).toLocaleString()}</span></div>
            <div class="line"><span>Discount</span><span>${currency} ${Number(sale.discount).toLocaleString()}</span></div>
            <div class="line final"><span>Total</span><span>${currency} ${Number(sale.total).toLocaleString()}</span></div>
          </div>
        </body>
      </html>
    `;
  };

  const exportBillingDocument = async (sale: Sale, kind: 'proforma' | 'receipt') => {
    const html = buildBillingDocumentHtml(sale, kind);

    if (Platform.OS === 'web') {
      // Use an off-screen iframe for reliable document-only printing on web.
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      document.body.appendChild(frame);

      const frameWindow = frame.contentWindow;
      const frameDoc = frameWindow?.document;
      if (!frameWindow || !frameDoc) {
        document.body.removeChild(frame);
        throw new Error('Failed to initialize print frame.');
      }

      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();

      setTimeout(() => {
        frameWindow.focus();
        frameWindow.print();
        setTimeout(() => {
          if (frame.parentNode) {
            frame.parentNode.removeChild(frame);
          }
        }, 600);
      }, 220);
      return;
    }

    const printed = await Print.printToFileAsync({ html });
    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('Cannot access device storage for PDF export.');
    const pdfPath = `${baseDir}${kind}-${sale.order_number}-${Date.now()}.pdf`;
    await FileSystem.copyAsync({ from: printed.uri, to: pdfPath });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(pdfPath, {
        dialogTitle: kind === 'proforma' ? 'Share proforma invoice' : 'Share payment receipt',
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert('Saved', `PDF saved at:\n${pdfPath}`);
    }
  };

  const handleGenerateProforma = async (sale: Sale) => {
    setDocBusy(true);
    try {
      await exportBillingDocument(sale, 'proforma');
      const note = (sale.notes ?? '').includes('[proforma_generated]')
        ? sale.notes
        : `${sale.notes ? `${sale.notes}\n` : ''}[proforma_generated] ${new Date().toISOString()}`;
      await supabase
        .from('sales')
        .update({ notes: note, updated_at: new Date().toISOString() })
        .eq('id', sale.id);
      fetchSales(true);
    } catch (e: any) {
      Alert.alert('Proforma failed', e?.message ?? 'Could not generate proforma invoice.');
    } finally {
      setDocBusy(false);
    }
  };

  const handleGenerateReceipt = async (sale: Sale) => {
    if (sale.payment_status !== 'paid' || sale.status !== 'completed') {
      Alert.alert('Payment required', 'Receipt can only be generated after full payment is completed.');
      return;
    }

    setDocBusy(true);
    try {
      await exportBillingDocument(sale, 'receipt');
    } catch (e: any) {
      Alert.alert('Receipt failed', e?.message ?? 'Could not generate receipt.');
    } finally {
      setDocBusy(false);
    }
  };

  const statusBadge = (status: string) => (
    <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[status] ?? COLORS.textMuted) + '22' }]}>
      <Ionicons
        name={(STATUS_ICONS[status] ?? 'ellipse-outline') as any}
        size={11}
        color={STATUS_COLORS[status] ?? COLORS.textMuted}
        style={{ marginRight: 3 }}
      />
      <Text style={[styles.badgeText, { color: STATUS_COLORS[status] ?? COLORS.textMuted }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );

  const payBadge = (status: string) => {
    const color = PAYMENT_COLORS[status] ?? COLORS.textMuted;
    return (
      <View style={[styles.badge, { backgroundColor: color + '22' }]}>
        <Ionicons
          name={(PAYMENT_ICONS[status] ?? 'ellipse-outline') as any}
          size={11}
          color={color}
          style={{ marginRight: 3 }}
        />
        <Text style={[styles.badgeText, { color }]}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Text>
      </View>
    );
  };

  const proformaIssuedBadge = (sale: Sale) => {
    const hasProforma = sale.notes?.includes('[proforma_generated]') ?? false;
    if (!hasProforma) return null;
    return (
      <View style={[styles.badge, { backgroundColor: COLORS.accent + '22' }]}>
        <Ionicons name="document-outline" size={11} color={COLORS.accent} style={{ marginRight: 3 }} />
        <Text style={[styles.badgeText, { color: COLORS.accent }]}>Proforma</Text>
      </View>
    );
  };

  const receiptIssuedBadge = (sale: Sale) => {
    const hasReceipt = sale.payment_status === 'paid' && sale.status === 'completed';
    if (!hasReceipt) return null;
    return (
      <View style={[styles.badge, { backgroundColor: COLORS.success + '22' }]}>
        <Ionicons name="checkmark-done-outline" size={11} color={COLORS.success} style={{ marginRight: 3 }} />
        <Text style={[styles.badgeText, { color: COLORS.success }]}>Receipt</Text>
      </View>
    );
  };

  const DetailContent = ({ sale }: { sale: Sale }) => {
    const isActive = sale.status === 'active';
    const isDone = sale.status === 'completed' || sale.status === 'cancelled';

    return (
      <>
        <View style={styles.receiptHeader}>
          <View style={{ flex: 1, marginRight: SPACING.sm }}>
            <Text style={styles.orderTitle}>{sale.order_number}</Text>
            <Text style={styles.orderTime}>{format(new Date(sale.created_at), 'MMM d, yyyy · HH:mm')}</Text>
          </View>
          <View style={{ gap: SPACING.xs, alignItems: 'flex-end' }}>
            {statusBadge(sale.status)}
            {payBadge(sale.payment_status ?? 'pending')}
          </View>
        </View>

        <View style={[styles.metaGrid, isCompact && styles.metaGridCompact]}>
          {[
            { icon: 'grid-outline', label: 'Table', value: sale.table_number ?? '—' },
            { icon: 'people-outline', label: 'Guests', value: String(sale.guests ?? 1) },
            { icon: 'person-outline', label: 'Customer', value: (sale as any).customer?.full_name ?? '—' },
            {
              icon: 'card-outline',
              label: 'Method',
              value: (sale.payment_method ?? 'cash').replace('_', ' '),
            },
          ].map((d) => (
            <View key={d.label} style={styles.metaCell}>
              <View style={styles.metaIconWrap}>
                <Ionicons name={d.icon as any} size={14} color={COLORS.accent} />
              </View>
              <Text style={styles.metaCellLabel}>{d.label}</Text>
              <Text style={styles.metaCellValue} numberOfLines={1}>{d.value}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.sectionHeader, isCompact && styles.sectionHeaderCompact]}>
          <Text style={styles.sectionTitle}>Items</Text>
          {isActive && (
            <TouchableOpacity style={styles.addItemBtn} onPress={() => openAddItems(sale)}>
              <Ionicons name="add" size={13} color={COLORS.accent} />
              <Text style={styles.addItemBtnText}>Load Order</Text>
            </TouchableOpacity>
          )}
        </View>

        {(sale as any).items?.length > 0 ? (
          <>
            <View style={styles.itemsHeader}>
              <Text style={styles.itemsHeadText}>Item</Text>
              <Text style={styles.itemsHeadText}>Qty · Total</Text>
            </View>
            {(sale as any).items.map((item: any) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemIcon}>
                  <Ionicons name="pricetag-outline" size={13} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.product?.name ?? 'Item'}</Text>
                  <Text style={styles.itemMeta}>
                    ×{item.quantity} @ {currency} {Number(item.unit_price).toLocaleString()}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>{currency} {Number(item.total).toLocaleString()}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.emptyItems}>
            <Ionicons name="bag-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyItemsText}>No items yet</Text>
            {isActive && (
              <TouchableOpacity style={styles.addItemBtn} onPress={() => openAddItems(sale)}>
                <Ionicons name="add" size={13} color={COLORS.accent} />
                <Text style={styles.addItemBtnText}>Load Order</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.totalsCard}>
          <View style={styles.totalLine}>
            <Text style={styles.totalLineLabel}>Subtotal</Text>
            <Text style={styles.totalLineValue}>{currency} {Number(sale.subtotal).toLocaleString()}</Text>
          </View>
          {sale.discount > 0 && (
            <View style={styles.totalLine}>
              <Text style={[styles.totalLineLabel, { color: COLORS.success }]}>Discount</Text>
              <Text style={[styles.totalLineValue, { color: COLORS.success }]}>−{currency} {Number(sale.discount).toLocaleString()}</Text>
            </View>
          )}
          <View style={[styles.totalLine, styles.totalFinalLine]}>
            <Text style={styles.totalFinalLabel}>Total</Text>
            <Text style={styles.totalFinalValue}>{currency} {Number(sale.total).toLocaleString()}</Text>
          </View>
        </View>

        {!isDone && (
          <>
            <TouchableOpacity
              style={[styles.docBtn, docBusy && { opacity: 0.7 }]}
              onPress={() => handleGenerateProforma(sale)}
              disabled={docBusy}
            >
              <Ionicons name="document-text-outline" size={15} color={COLORS.primary} />
              <Text style={styles.docBtnText}>Generate Proforma Invoice</Text>
            </TouchableOpacity>

            <View style={[styles.actionBtns, isCompact && styles.actionBtnsCompact]}>
              {isActive && (
                <TouchableOpacity
                  style={[styles.clearBtn, isCompact && styles.clearBtnCompact, acting && { opacity: 0.6 }]}
                  onPress={() => handleClearOrder(sale)}
                  disabled={acting}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.warning} />
                  <Text style={styles.clearBtnText}>Clear Order</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.cancelBtn, isCompact && styles.cancelBtnCompact, acting && { opacity: 0.6 }]}
                onPress={() => handleCancel(sale)}
                disabled={acting}
              >
                <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.cancelBtnText}>Cancel Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chargeBtn, isCompact && styles.chargeBtnCompact, acting && { opacity: 0.6 }]}
                onPress={() => openCharge(sale)}
                disabled={acting}
              >
                <Ionicons name="checkmark-done-outline" size={16} color={COLORS.white} />
                <Text style={styles.chargeBtnText}>Charge · {currency} {Number(sale.total).toLocaleString()}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {isDone && (
          <>
            <View
              style={[
                styles.doneBanner,
                {
                  backgroundColor:
                    sale.status === 'completed' ? COLORS.successLight : COLORS.errorLight,
                },
              ]}
            >
              <Ionicons
                name={sale.status === 'completed' ? 'checkmark-circle-outline' : 'close-circle-outline'}
                size={16}
                color={sale.status === 'completed' ? COLORS.success : COLORS.error}
              />
              <Text
                style={[
                  styles.doneBannerText,
                  { color: sale.status === 'completed' ? COLORS.success : COLORS.error },
                ]}
              >
                Order {sale.status}
              </Text>
            </View>

            {sale.status === 'completed' && sale.payment_status === 'paid' && (
              <>
                <TouchableOpacity
                  style={[styles.receiptBtn, docBusy && { opacity: 0.7 }]}
                  onPress={() => handleGenerateReceipt(sale)}
                  disabled={docBusy}
                >
                  <Ionicons name="receipt-outline" size={15} color={COLORS.white} />
                  <Text style={styles.receiptBtnText}>Generate Receipt</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cancelBtn, isCompact && styles.cancelBtnCompact, acting && { opacity: 0.6 }, { marginTop: SPACING.md }]}
                  onPress={() => handleRefund(sale)}
                  disabled={acting}
                >
                  <Ionicons name="refresh-circle-outline" size={16} color={COLORS.error} />
                  <Text style={styles.cancelBtnText}>Process Refund</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </>
    );
  };

  const filteredProducts = products.filter((p) => {
    const q = itemSearch.toLowerCase();
    return !q || p.name.toLowerCase().includes(q);
  }).sort((a, b) => {
    const qtyA = itemQty[a.id] || 0;
    const qtyB = itemQty[b.id] || 0;
    if (qtyA > 0 && qtyB === 0) return -1;
    if (qtyB > 0 && qtyA === 0) return 1;
    return a.name.localeCompare(b.name);
  });

  const renderCompactRow = (item: Sale) => {
    const isSelected = selectedSale?.id === item.id;
    const paymentColor = PAYMENT_COLORS[item.payment_status ?? 'pending'] ?? COLORS.textMuted;

    return (
      <Animated.View entering={FadeInDown.duration(200)} layout={Layout.springify()}>
        <TouchableOpacity
          style={[styles.compactRow, isSelected && styles.compactRowSelected]}
          onPress={() => handleSelectSale(item)}
          activeOpacity={0.7}
        >
          <View style={styles.compactRowLeft}>
            <Text style={styles.compactOrderNum}>{item.order_number}</Text>
            <Text style={styles.compactCustomer} numberOfLines={1}>
              {(item as any).customer?.full_name ?? 'Walk-in Customer'}
            </Text>
          </View>
          <View style={styles.compactRowRight}>
            <Text style={styles.compactAmount}>{currency} {Number(item.total).toLocaleString()}</Text>
            <View style={styles.compactMetaRow}>
              <Text style={[styles.compactBadgeText, { color: paymentColor }]}>
                {item.payment_status ?? 'pending'}
              </Text>
              <Text style={styles.compactDot}>•</Text>
              <Text style={styles.compactTime}>
                {format(new Date(item.created_at), 'HH:mm')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderModernCard = (item: Sale) => {
    const isSelected = selectedSale?.id === item.id;
    const accentColor = STATUS_COLORS[item.status] ?? COLORS.textMuted;
    const paymentColor = PAYMENT_COLORS[item.payment_status ?? 'pending'] ?? COLORS.textMuted;
    const itemsCount = (item as any).items?.length ?? 0;

    return (
      <Animated.View entering={FadeInDown.duration(300)} layout={Layout.springify()}>
        <TouchableOpacity
          style={[styles.modernCard, isSelected && styles.modernCardSelected]}
          onPress={() => handleSelectSale(item)}
          activeOpacity={0.8}
        >
          <View style={styles.modernCardHeader}>
            <View>
              <Text style={styles.modernCardOrderNum}>{item.order_number}</Text>
              <Text style={styles.modernCardSub} numberOfLines={1}>
                {(item as any).customer?.full_name ?? 'Walk-in Customer'}
                {!!item.table_number && ` • Table ${item.table_number}`}
              </Text>
            </View>
            <View style={[styles.modernBadge, { backgroundColor: accentColor + '15' }]}>
              <Text style={[styles.modernBadgeText, { color: accentColor }]}>
                {item.status}
              </Text>
            </View>
          </View>

          <View style={styles.modernCardMiddle}>
            <Text style={styles.modernCardMetaText}>
              {itemsCount} {itemsCount === 1 ? 'Item' : 'Items'}
            </Text>
            <Text style={styles.modernCardTime}>
              {format(new Date(item.created_at), 'HH:mm')}
            </Text>
          </View>

          <View style={styles.modernCardFooter}>
            <View style={styles.modernCardFooterLeft}>
              <View style={[styles.paymentBadgeSmall, { backgroundColor: paymentColor + '15' }]}>
                <Text style={[styles.paymentBadgeSmallText, { color: paymentColor }]}>
                  {item.payment_status ?? 'pending'}
                </Text>
              </View>
              <Text style={styles.modernCardMethodText}>
                {(item.payment_method ?? 'cash').replace('_', ' ')}
              </Text>
            </View>
            <Text style={styles.modernCardAmount}>{currency} {Number(item.total).toLocaleString()}</Text>
          </View>

          <View style={styles.modernCardActions}>
            <TouchableOpacity style={styles.modernActionBtn} onPress={() => handleSelectSale(item)}>
              <Ionicons name="eye-outline" size={14} color={COLORS.primary} />
              <Text style={styles.modernActionBtnText}>View</Text>
            </TouchableOpacity>
            {item.status === 'active' && (
              <TouchableOpacity style={styles.modernActionBtn} onPress={() => openAddItems(item)}>
                <Ionicons name="pencil-outline" size={14} color={COLORS.accent} />
                <Text style={[styles.modernActionBtnText, { color: COLORS.accent }]}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.modernActionBtn} onPress={() => handleGenerateReceipt(item)}>
              <Ionicons name="print-outline" size={14} color={COLORS.textSecondary} />
              <Text style={[styles.modernActionBtnText, { color: COLORS.textSecondary }]}>Print</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderKanbanBoard = () => {
    const pendingSales = filtered.filter(s => s.status === 'active' && s.payment_status === 'pending');
    const activeSales = filtered.filter(s => s.status === 'active' && s.payment_status !== 'pending');
    const completedSales = filtered.filter(s => s.status === 'completed');

    const renderKanbanCard = (item: Sale) => {
      const paymentColor = PAYMENT_COLORS[item.payment_status ?? 'pending'] ?? COLORS.textMuted;

      return (
        <TouchableOpacity
          key={item.id}
          style={styles.kanbanCard}
          onPress={() => handleSelectSale(item)}
          activeOpacity={0.8}
        >
          <View style={styles.kanbanCardHeader}>
            <Text style={styles.kanbanCardOrderNum}>{item.order_number}</Text>
            <Text style={styles.kanbanCardTime}>
              {format(new Date(item.created_at), 'HH:mm')}
            </Text>
          </View>

          <Text style={styles.kanbanCardCustomer} numberOfLines={1}>
            {(item as any).customer?.full_name ?? 'Walk-in Customer'}
          </Text>
          {!!item.table_number && (
            <Text style={styles.kanbanCardTable}>Table {item.table_number}</Text>
          )}

          <View style={styles.kanbanCardFooter}>
            <View style={[styles.paymentBadgeSmall, { backgroundColor: paymentColor + '15' }]}>
              <Text style={[styles.paymentBadgeSmallText, { color: paymentColor }]}>
                {item.payment_status ?? 'pending'}
              </Text>
            </View>
            <Text style={styles.kanbanCardAmount}>{currency} {Number(item.total).toLocaleString()}</Text>
          </View>
        </TouchableOpacity>
      );
    };

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kanbanScroll} contentContainerStyle={styles.kanbanScrollContent}>
        {/* Pending Column */}
        <View style={styles.kanbanCol}>
          <View style={styles.kanbanColHeader}>
            <View style={[styles.kanbanDot, { backgroundColor: COLORS.secondary }]} />
            <Text style={styles.kanbanColTitle}>Pending</Text>
            <View style={styles.kanbanColBadge}>
              <Text style={styles.kanbanColBadgeText}>{pendingSales.length}</Text>
            </View>
          </View>
          <ScrollView style={styles.kanbanCardScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingBottom: SPACING.xl }}>
            {pendingSales.length === 0 ? (
              <Text style={styles.kanbanEmptyText}>No pending orders</Text>
            ) : (
              pendingSales.map(renderKanbanCard)
            )}
          </ScrollView>
        </View>

        {/* Active Column */}
        <View style={styles.kanbanCol}>
          <View style={styles.kanbanColHeader}>
            <View style={[styles.kanbanDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.kanbanColTitle}>Active</Text>
            <View style={styles.kanbanColBadge}>
              <Text style={styles.kanbanColBadgeText}>{activeSales.length}</Text>
            </View>
          </View>
          <ScrollView style={styles.kanbanCardScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingBottom: SPACING.xl }}>
            {activeSales.length === 0 ? (
              <Text style={styles.kanbanEmptyText}>No active orders</Text>
            ) : (
              activeSales.map(renderKanbanCard)
            )}
          </ScrollView>
        </View>

        {/* Completed Column */}
        <View style={styles.kanbanCol}>
          <View style={styles.kanbanColHeader}>
            <View style={[styles.kanbanDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.kanbanColTitle}>Completed</Text>
            <View style={styles.kanbanColBadge}>
              <Text style={styles.kanbanColBadgeText}>{completedSales.length}</Text>
            </View>
          </View>
          <ScrollView style={styles.kanbanCardScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingBottom: SPACING.xl }}>
            {completedSales.length === 0 ? (
              <Text style={styles.kanbanEmptyText}>No completed orders</Text>
            ) : (
              completedSales.map(renderKanbanCard)
            )}
          </ScrollView>
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Status Dropdown Modal ── */}
      <Modal visible={statusOpen} transparent animationType="fade" onRequestClose={() => setStatusOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setStatusOpen(false)}>
          <View style={styles.dropdownMenu}>
            {['All', 'active', 'completed', 'cancelled', 'refunded'].map((statusOption) => (
              <TouchableOpacity
                key={statusOption}
                style={[styles.dropdownItem, filterStatus === statusOption && styles.dropdownItemActive]}
                onPress={() => {
                  setFilterStatus(statusOption);
                  setStatusOpen(false);
                }}
              >
                <Text style={[styles.dropdownItemText, filterStatus === statusOption && styles.dropdownItemTextActive]}>
                  {statusOption === 'All' ? 'All Statuses' : statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Date Dropdown Modal ── */}
      <Modal visible={dateOpen} transparent animationType="fade" onRequestClose={() => setDateOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setDateOpen(false)}>
          <View style={styles.dropdownMenu}>
            {[
              { label: 'All Time', value: 'All' },
              { label: 'Today', value: 'Today' },
              { label: 'This Week', value: 'Week' },
              { label: 'This Month', value: 'Month' },
            ].map((dt) => (
              <TouchableOpacity
                key={dt.value}
                style={[styles.dropdownItem, filterDate === dt.value && styles.dropdownItemActive]}
                onPress={() => {
                  setFilterDate(dt.value);
                  setDateOpen(false);
                }}
              >
                <Text style={[styles.dropdownItemText, filterDate === dt.value && styles.dropdownItemTextActive]}>
                  {dt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Payment Dropdown Modal ── */}
      <Modal visible={paymentOpen} transparent animationType="fade" onRequestClose={() => setPaymentOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPaymentOpen(false)}>
          <View style={styles.dropdownMenu}>
            {[
              { label: 'Any Payment', value: 'All' },
              { label: 'Cash', value: 'cash' },
              { label: 'Mobile Money', value: 'mobile_money' },
            ].map((pm) => (
              <TouchableOpacity
                key={pm.value}
                style={[styles.dropdownItem, filterPayment === pm.value && styles.dropdownItemActive]}
                onPress={() => {
                  setFilterPayment(pm.value);
                  setPaymentOpen(false);
                }}
              >
                <Text style={[styles.dropdownItemText, filterPayment === pm.value && styles.dropdownItemTextActive]}>
                  {pm.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>



      {/* ── Summary Metric Cards ── */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.summaryScroll}
          contentContainerStyle={styles.summaryScrollContent}
        >
          <LinearGradient colors={['#0165FC15', '#0165FC08']} style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.summaryCardTitle}>Total Orders</Text>
              <Ionicons name="receipt-outline" size={15} color={COLORS.primary} />
            </View>
            <Text style={styles.summaryCardValue}>{todaySales.length}</Text>
          </LinearGradient>

          <LinearGradient colors={['#FFA50015', '#FFA50008']} style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.summaryCardTitle}>Pending Orders</Text>
              <Ionicons name="time-outline" size={15} color={COLORS.secondary} />
            </View>
            <Text style={styles.summaryCardValue}>{statsPendingOrders}</Text>
          </LinearGradient>

          <LinearGradient colors={['#10B98115', '#10B98108']} style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.summaryCardTitle}>Completed</Text>
              <Ionicons name="checkmark-done-outline" size={15} color={COLORS.success} />
            </View>
            <Text style={styles.summaryCardValue}>{completedToday}</Text>
          </LinearGradient>

          <LinearGradient colors={['#006D7715', '#006D7708']} style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.summaryCardTitle}>Revenue</Text>
              <Ionicons name="cash-outline" size={15} color={COLORS.accent} />
            </View>
            <Text style={styles.summaryCardValue} numberOfLines={1}>
              {currency} {todayRevenue >= 1000000 ? `${(todayRevenue / 1000000).toFixed(1)}M` : todayRevenue.toLocaleString()}
            </Text>
          </LinearGradient>
        </ScrollView>
      </View>

      {/* ── Filters Section ── */}
      <View style={styles.filterSelectorsRow}>
        <TouchableOpacity style={styles.filterChip} onPress={() => setStatusOpen(true)}>
          <Ionicons name="funnel-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.filterChipLabel} numberOfLines={1}>
            {filterStatus === 'All' ? 'Status' : filterStatus === 'active' ? 'Active' : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
          </Text>
          <Ionicons name="chevron-down" size={12} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.filterChip} onPress={() => setDateOpen(true)}>
          <Ionicons name="calendar-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.filterChipLabel} numberOfLines={1}>
            {filterDate === 'All' ? 'Date' : filterDate === 'Week' ? 'This Week' : filterDate === 'Month' ? 'This Month' : filterDate}
          </Text>
          <Ionicons name="chevron-down" size={12} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.filterChip} onPress={() => setPaymentOpen(true)}>
          <Ionicons name="card-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.filterChipLabel} numberOfLines={1}>
            {filterPayment === 'All' ? 'Payment' : filterPayment === 'mobile_money' ? 'Mobile' : filterPayment.charAt(0).toUpperCase() + filterPayment.slice(1)}
          </Text>
          <Ionicons name="chevron-down" size={12} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ── */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={14} color={COLORS.textMuted} />
        <TextInput
          style={[styles.searchInput, WEB_OUTLINE_NONE]}
          placeholder="Search order number or customer..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={COLORS.textMuted}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── View Toggle & Add Button Row ── */}
      <View style={styles.viewModeToggleRow}>
        <View style={styles.viewToggleGroup}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setViewMode('list');
            }}
          >
            <Ionicons name="list-outline" size={14} color={viewMode === 'list' ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.viewToggleBtnText, viewMode === 'list' && styles.viewToggleBtnTextActive]}>List</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'card' && styles.viewToggleBtnActive]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setViewMode('card');
            }}
          >
            <Ionicons name="grid-outline" size={14} color={viewMode === 'card' ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.viewToggleBtnText, viewMode === 'card' && styles.viewToggleBtnTextActive]}>Card</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'kanban' && styles.viewToggleBtnActive]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setViewMode('kanban');
            }}
          >
            <Ionicons name="albums-outline" size={14} color={viewMode === 'kanban' ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.viewToggleBtnText, viewMode === 'kanban' && styles.viewToggleBtnTextActive]}>Kanban</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.ordersHeaderAddBtn} onPress={() => setNewOrderVisible(true)}>
          <Ionicons name="add" size={14} color={COLORS.white} />
          <Text style={styles.ordersHeaderAddBtnText}>New Order</Text>
        </TouchableOpacity>
      </View>

      {/* ── Main Layout ── */}
      <View style={styles.layout}>
        <View
          style={[
            styles.listCol,
            isMobile && styles.listColMobile,
            isTablet && styles.listColTablet,
            isDesktop && styles.listColDesktop,
          ]}
        >
          {loading && sales.length === 0 ? (
            <View style={{ padding: SPACING.md }}>
              <ListSkeleton count={6} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyStateIconContainer}>
                <Ionicons
                  name={!ordersLoaded ? "cloud-download-outline" : "receipt-outline"}
                  size={40}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.emptyStateTitle}>
                {!ordersLoaded ? 'Load Your Orders' : 'No orders found'}
              </Text>
              <Text style={styles.emptyStateDescription}>
                {!ordersLoaded
                  ? 'Tap below to load active and completed orders for your business.'
                  : 'We couldn\'t find any orders matching your filters.'}
              </Text>
              {!ordersLoaded ? (
                <TouchableOpacity
                  style={styles.emptyStateBtn}
                  onPress={() => {
                    setOrdersLoaded(true);
                    setLoading(true);
                    fetchSales();
                  }}
                >
                  <Ionicons name="cloud-download-outline" size={16} color={COLORS.white} />
                  <Text style={styles.emptyStateBtnText}>Load Orders</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.emptyStateBtn} onPress={() => setNewOrderVisible(true)}>
                  <Ionicons name="add" size={16} color={COLORS.white} />
                  <Text style={styles.emptyStateBtnText}>Create New Order</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : viewMode === 'kanban' ? (
            renderKanbanBoard()
          ) : (
            <FlatList
              key={viewMode}
              data={filtered}
              numColumns={viewMode === 'card' && !isCompact ? 2 : 1}
              style={styles.billsList}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              contentContainerStyle={{ paddingBottom: SPACING.xl, paddingTop: SPACING.xs }}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={Platform.OS !== 'web'}
              columnWrapperStyle={viewMode === 'card' && !isCompact ? { gap: SPACING.xs } : undefined}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    fetchSales();
                  }}
                  tintColor={COLORS.accent}
                />
              }
              renderItem={({ item }) => {
                if (viewMode === 'list') {
                  return renderCompactRow(item);
                }
                return renderModernCard(item);
              }}
            />
          )}
        </View>

        {/* Tablet/Desktop Detail Split Column */}
        {showSplit && selectedSale && (
          <ScrollView style={styles.detailCol} contentContainerStyle={styles.detailColContent}>
            <DetailContent sale={selectedSale} />
          </ScrollView>
        )}

        {showSplit && !selectedSale && (
          <View style={styles.detailEmpty}>
            <View style={styles.detailEmptyIcon}>
              <Ionicons name="receipt-outline" size={36} color={COLORS.textMuted} />
            </View>
            <Text style={styles.detailEmptyTitle}>No order selected</Text>
            <Text style={styles.detailEmptyText}>Tap an order to view details</Text>
          </View>
        )}
      </View>

      {loading && sales.length > 0 && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      )}

      <Modal visible={(isMobile || viewMode === 'kanban') && detailVisible} transparent animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setDetailVisible(false)} />
          <View style={styles.mobileSheet}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setDetailVisible(false)}>
              <Ionicons name="close" size={20} color={COLORS.text} />
            </TouchableOpacity>
            {selectedSale && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <DetailContent sale={selectedSale} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={newOrderVisible} transparent animationType="fade" onRequestClose={() => setNewOrderVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { padding: 0, overflow: 'hidden', maxHeight: '90%' }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: SPACING.lg }}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>New Order</Text>
                <TouchableOpacity onPress={() => setNewOrderVisible(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {posType === 'food' && (
                <>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Table Number *</Text>
                    <TextInput
                      style={[styles.fieldInput, WEB_OUTLINE_NONE]}
                      placeholder="e.g. 5A"
                      placeholderTextColor={COLORS.textMuted}
                      value={tableNumber}
                      onChangeText={setTableNumber}
                      autoFocus
                    />
                  </View>

                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Guests</Text>
                    <TextInput
                      style={[styles.fieldInput, WEB_OUTLINE_NONE]}
                      placeholder="1"
                      placeholderTextColor={COLORS.textMuted}
                      value={guests}
                      onChangeText={setGuests}
                      keyboardType="number-pad"
                    />
                  </View>
                </>
              )}

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Payment Method</Text>
                <View style={styles.methodRow}>
                  {PAYMENT_METHODS.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.methodChip, newMethod === m.id && styles.methodChipActive]}
                      onPress={() => setNewMethod(m.id)}
                    >
                      <Ionicons
                        name={m.icon as any}
                        size={13}
                        color={newMethod === m.id ? COLORS.white : COLORS.textSecondary}
                      />
                      <Text style={[styles.methodChipText, newMethod === m.id && styles.methodChipTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={[styles.modalBtns, isCompact && styles.modalBtnsMobile]}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNewOrderVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, creatingOrder && { opacity: 0.7 }]}
                  onPress={handleCreateOrder}
                  disabled={creatingOrder}
                >
                  {creatingOrder ? (
                    <ActivityIndicator color={COLORS.white} size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>Create Order</Text>
                  )}
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={chargeVisible} transparent animationType="fade" onRequestClose={() => setChargeVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { padding: 0, overflow: 'hidden', maxHeight: '90%' }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: SPACING.lg }}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Charge Customer</Text>
                <TouchableOpacity onPress={() => setChargeVisible(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {chargeSale && (
                <>
                  <View style={[styles.chargeAmountCard, { backgroundColor: COLORS.primary + '10' }]}>
                    <Text style={styles.chargeAmountLabel}>Order {chargeSale.order_number}</Text>
                    <Text style={styles.chargeAmountValue}>
                      {currency}{' '}
                      {Math.max(
                        0,
                        Number(chargeSale.subtotal) - (parseFloat(chargeDiscount) || 0),
                      ).toLocaleString()}
                    </Text>
                  </View>

                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Payment Method</Text>
                    <View style={styles.methodRow}>
                      {PAYMENT_METHODS.map((m) => (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.methodChip, chargeMethod === m.id && styles.methodChipActive]}
                          onPress={() => setChargeMethod(m.id)}
                        >
                          <Ionicons
                            name={m.icon as any}
                            size={13}
                            color={chargeMethod === m.id ? COLORS.white : COLORS.textSecondary}
                          />
                          <Text style={[styles.methodChipText, chargeMethod === m.id && styles.methodChipTextActive]}>
                            {m.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Cash: received + change */}
                  {chargeMethod === 'cash' && (() => {
                    const discount = Math.max(0, parseFloat(chargeDiscount) || 0);
                    const baseAmount = Number(chargeSale.total || chargeSale.subtotal || 0);
                    const due = Math.max(0, baseAmount - discount);
                    const received = parseFloat(chargeCashReceived) || 0;
                    const change = Math.max(0, received - due);
                    return (
                      <View style={styles.fieldWrap}>
                        <Text style={styles.fieldLabel}>Cash Received ({currency})</Text>
                        <TextInput
                          style={[styles.fieldInput, WEB_OUTLINE_NONE]}
                          placeholder={String(due)}
                          placeholderTextColor={COLORS.textMuted}
                          value={chargeCashReceived}
                          onChangeText={setChargeCashReceived}
                          keyboardType="numeric"
                        />
                        {received >= due && due > 0 && (
                          <View style={styles.changeRow}>
                            <Ionicons name="return-down-forward-outline" size={13} color={COLORS.success} />
                            <Text style={styles.changeText}>Change: {currency} {change.toLocaleString()}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Mobile money: phone number + payer name */}
                  {chargeMethod === 'mobile_money' && (
                    <>
                      <View style={styles.fieldWrap}>
                        <Text style={styles.fieldLabel}>Payer Phone Number</Text>
                        <TextInput
                          style={[styles.fieldInput, WEB_OUTLINE_NONE]}
                          placeholder="0XXXXXXXXX or 255XXXXXXXXX"
                          placeholderTextColor={COLORS.textMuted}
                          value={chargeMobilePhone}
                          onChangeText={setChargeMobilePhone}
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={styles.fieldWrap}>
                        <Text style={styles.fieldLabel}>Payer Name</Text>
                        <TextInput
                          style={[styles.fieldInput, WEB_OUTLINE_NONE]}
                          placeholder="Full name of the account holder"
                          placeholderTextColor={COLORS.textMuted}
                          value={chargePayerName}
                          onChangeText={setChargePayerName}
                          autoCapitalize="words"
                        />
                      </View>
                    </>
                  )}

                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Discount ({currency})</Text>
                    <TextInput
                      style={[styles.fieldInput, WEB_OUTLINE_NONE]}
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                      value={chargeDiscount}
                      onChangeText={setChargeDiscount}
                      keyboardType="numeric"
                    />
                  </View>
                </>
              )}

              <View style={[styles.modalBtns, isCompact && styles.modalBtnsMobile]}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setChargeVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chargeConfirmBtn, acting && { opacity: 0.7 }]}
                  onPress={handleCharge}
                  disabled={acting}
                >
                  {acting ? (
                    <ActivityIndicator color={COLORS.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done-outline" size={15} color={COLORS.white} />
                      <Text style={styles.modalSaveText}>Confirm Payment</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={addItemVisible} transparent animationType="slide" onRequestClose={() => setAddItemVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { padding: 0, overflow: 'hidden', height: '75%', maxHeight: '90%' }]}>
              <View style={[styles.modalHeader, { padding: SPACING.lg, paddingBottom: 0 }]}>
                <Text style={styles.modalTitle}>Add Items</Text>
                <TouchableOpacity onPress={() => setAddItemVisible(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

            <View style={[styles.searchBar, { marginHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.sm }]}>
              <Ionicons name="search-outline" size={14} color={COLORS.textMuted} />
              <TextInput
                style={[styles.searchInput, WEB_OUTLINE_NONE]}
                placeholder="Search products..."
                value={itemSearch}
                onChangeText={setItemSearch}
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: SPACING.lg, paddingTop: 0 }}>
              {filteredProducts.length === 0 && (
                <Text style={[styles.emptyItemsText, { marginTop: SPACING.xl }]}>No products found</Text>
              )}

              {filteredProducts.map((p) => {
                const qty = itemQty[p.id] ?? 0;
                return (
                  <View key={p.id} style={styles.productRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName}>{p.name}</Text>
                      <Text style={styles.productPrice}>
                        {currency} {Number(p.selling_price).toLocaleString()} / {p.unit}
                      </Text>
                    </View>

                    <View style={styles.qtyRow}>
                      <TouchableOpacity
                        style={[styles.qtyBtn, qty === 0 && { opacity: 0.3 }]}
                        onPress={() => setItemQty((prev) => ({
                          ...prev,
                          [p.id]: Math.max(0, (prev[p.id] ?? 0) - 1),
                        }))}
                        disabled={qty === 0}
                      >
                        <Ionicons name="remove" size={14} color={COLORS.text} />
                      </TouchableOpacity>
                      <Text style={styles.qtyVal}>{qty}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => setItemQty((prev) => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }))}
                      >
                        <Ionicons name="add" size={14} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {Object.values(itemQty).some((qty) => qty > 0) && (
              <View style={styles.addItemsSummary}>
                <Text style={styles.addItemsSummaryText}>
                  {Object.values(itemQty).reduce((sum, qty) => sum + qty, 0)} items · {currency}{' '}
                  {Object.entries(itemQty)
                    .filter(([, qty]) => qty > 0)
                    .reduce((sum, [productId, qty]) => {
                      const p = products.find((x) => x.id === productId);
                      return sum + qty * (p?.selling_price ?? 0);
                    }, 0)
                    .toLocaleString()}
                </Text>
              </View>
            )}

            <View style={[styles.modalBtns, { padding: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border }]}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddItemVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chargeConfirmBtn, savingItems && { opacity: 0.7 }, { flex: 1 }]}
                onPress={handleSaveItems}
                disabled={savingItems}
              >
                {savingItems ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-outline" size={15} color={COLORS.white} />
                    <Text style={styles.modalSaveText}>Add to Order</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, overflow: 'hidden' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    zIndex: 20,
    elevation: 20,
  },

  // ── Header styles ──
  ordersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    backgroundColor: COLORS.surface,
  },
  ordersHeaderLeft: {
    flex: 1,
  },
  ordersHeaderTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  ordersHeaderSubtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  ordersHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerIconBtnActive: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary,
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.error,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ── Stats Cards Styles ──
  summaryScroll: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.xs,
  },
  summaryScrollContent: {
    paddingHorizontal: SPACING.base,
    gap: SPACING.xs,
  },
  summaryCard: {
    width: 130,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  summaryCardTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  summaryCardValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2,
  },

  // ── Dropdown Filters ──
  filterSelectorsRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  // ── View Toggle and Action Row ──
  viewModeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
  },
  viewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.sm - 2,
  },
  viewToggleBtnActive: {
    backgroundColor: COLORS.primary,
  },
  viewToggleBtnText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  viewToggleBtnTextActive: {
    color: COLORS.white,
  },
  ordersHeaderAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingVertical: 5,
    paddingHorizontal: SPACING.sm,
  },
  ordersHeaderAddBtnText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ── Compact Row Styles ──
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  compactRowSelected: {
    backgroundColor: COLORS.primary + '06',
  },
  compactRowLeft: {
    flex: 1,
    gap: 2,
  },
  compactRowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  compactOrderNum: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.text,
  },
  compactCustomer: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
  },
  compactAmount: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  compactDot: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  compactTime: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
  },

  // ── Modern Card Styles ──
  modernCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.sm,
    marginVertical: SPACING.xs,
    marginHorizontal: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  modernCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: '#FFFDF9',
  },
  modernCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  modernCardOrderNum: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.text,
  },
  modernCardSub: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  modernBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  modernBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  modernCardMiddle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modernCardTime: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  modernCardMetaText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  modernCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  modernCardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
  },
  paymentBadgeSmallText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  modernCardMethodText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  modernCardAmount: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.text,
  },
  modernCardActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.xs,
  },
  modernActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modernActionBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // ── Kanban View Styles ──
  kanbanScroll: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  kanbanScrollContent: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  kanbanCol: {
    width: 260,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  kanbanColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingHorizontal: 4,
  },
  kanbanDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  kanbanColTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  kanbanColBadge: {
    backgroundColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  kanbanColBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  kanbanCardScroll: {
    flex: 1,
  },
  kanbanEmptyText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xl,
    fontStyle: 'italic',
  },
  kanbanCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.xs,
  },
  kanbanCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kanbanCardOrderNum: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.text,
  },
  kanbanCardTime: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  kanbanCardCustomer: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  kanbanCardTable: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  kanbanCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  kanbanCardAmount: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
  },

  // ── Dropdown Picker Modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownMenu: {
    width: 240,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    ...SHADOWS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownItem: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  dropdownItemActive: {
    backgroundColor: COLORS.primary + '10',
  },
  dropdownItemText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },

  // ── Empty State ──
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['2xl'],
    gap: SPACING.sm,
  },
  emptyStateIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  emptyStateTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '800',
    color: COLORS.text,
  },
  emptyStateDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    ...SHADOWS.sm,
  },
  emptyStateBtnText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },

  layout: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  listCol: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    minHeight: 0,
    overflow: 'hidden',
  },
  listColMobile: { flex: 1 },
  listColTablet: { flex: 0, width: '42%' },
  listColDesktop: { flex: 0, width: 320 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginHorizontal: SPACING.base,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },

  billsList: {
    flex: 1,
    minHeight: 0,
  },

  billTotal: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },

  detailCol: { flex: 1, overflow: 'hidden' },
  detailColContent: { padding: SPACING.lg, paddingBottom: SPACING['3xl'] },
  detailEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING['2xl'],
  },
  detailEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  detailEmptyTitle: { fontSize: FONTS.sizes.md, fontWeight: '700', color: COLORS.text },
  detailEmptyText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  orderTitle: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  orderTime: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  metaGridCompact: {},
  metaCell: {
    flex: 1,
    minWidth: 90,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metaIconWrap: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  metaCellLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  metaCellValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 1,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionHeaderCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent + '18',
    borderRadius: RADIUS.full,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    minHeight: 40,
  },
  addItemBtnText: { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: '600' },

  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 2,
  },
  itemsHeadText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '50',
  },
  itemIcon: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemName: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  itemMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 1 },
  itemTotal: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },

  emptyItems: { alignItems: 'center', paddingVertical: SPACING.lg, gap: SPACING.sm },
  emptyItemsText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, textAlign: 'center' },

  totalsCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  totalLineLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  totalLineValue: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  totalFinalLine: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 4,
    paddingTop: SPACING.sm,
  },
  totalFinalLabel: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  totalFinalValue: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.text },

  docBtn: {
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary + '12',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  docBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: FONTS.sizes.sm,
  },
  actionBtns: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  actionBtnsCompact: {
    flexDirection: 'column',
  },
  clearBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.warning + '10',
    minHeight: 44,
  },
  clearBtnText: { color: COLORS.warning, fontWeight: '600', fontSize: FONTS.sizes.sm },
  clearBtnCompact: {
    width: '100%',
    flex: 0,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    minHeight: 44,
  },
  cancelBtnText: { color: COLORS.error, fontWeight: '600', fontSize: FONTS.sizes.sm },
  cancelBtnCompact: {
    width: '100%',
    flex: 0,
  },
  chargeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    minHeight: 44,
  },
  chargeBtnText: { color: COLORS.white, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  chargeBtnCompact: {
    width: '100%',
    flex: 0,
  },

  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  doneBannerText: { fontSize: FONTS.sizes.sm, fontWeight: '600', textTransform: 'capitalize' },
  receiptBtn: {
    marginBottom: SPACING.xl,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
  },
  receiptBtnText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  mobileSheet: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: '92%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  sheetClose: { alignSelf: 'flex-end', padding: SPACING.xs, marginBottom: SPACING.sm },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.base,
  },
  modalBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    width: '100%',
    maxWidth: 420,
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  modalCloseBtn: { padding: 4 },

  fieldWrap: { marginBottom: SPACING.md },
  fieldLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },

  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  methodChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  methodChipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontWeight: '500' },
  methodChipTextActive: { color: COLORS.white, fontWeight: '600' },

  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  changeText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.success,
  },

  modalBtns: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  modalBtnsMobile: { flexDirection: 'column' },
  modalCancelBtn: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    minHeight: 44,
  },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: '600' },
  modalSaveBtn: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    minHeight: 44,
  },
  modalSaveText: { color: COLORS.white, fontWeight: '700' },

  chargeConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.success,
  },
  chargeAmountCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  chargeAmountLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: 4 },
  chargeAmountValue: { fontSize: FONTS.sizes['2xl'], fontWeight: '800', color: COLORS.text },

  addItemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  addItemsSummary: {
    backgroundColor: COLORS.accent + '18',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    alignItems: 'center',
  },
  addItemsSummaryText: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.accent },

  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '50',
  },
  productName: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  productPrice: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 1 },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qtyVal: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 20,
    textAlign: 'center',
  },
});
