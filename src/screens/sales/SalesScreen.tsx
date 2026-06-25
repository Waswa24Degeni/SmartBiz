import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  useWindowDimensions,
  Platform,
  RefreshControl,
  ActivityIndicator,
  DeviceEventEmitter,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { Sale } from '../../types';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS, WEB_OUTLINE_NONE } from '../../lib/constants';
import { format, startOfDay, startOfWeek, startOfMonth, subDays } from 'date-fns';
import { useRealtimeSubscription } from '../../lib/hooks';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { ListSkeleton } from '../../components/common/SkeletonLoader';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

const STATUS_COLORS: Record<string, string> = {
  completed: '#10B981',
  refunded: '#FFA500',
  cancelled: '#EF4444',
};

const Sparkline = ({ data, color, width = 120, height = 50 }: { data: number[]; color: string; width?: number; height?: number }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min === 0 ? 1 : max - min;

  const points = data.map((val, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - 2 - ((val - min) / range) * (height - 4);
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  const gradId = `grad-${color.replace('#', '')}`;

  return (
    <View style={{ width, height, justifyContent: 'center' }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </SvgLinearGradient>
        </Defs>
        <Path d={areaPath} fill={`url(#${gradId})`} />
        <Path d={linePath} fill="none" stroke={color} strokeWidth={2} />
      </Svg>
    </View>
  );
};

const STATUS_ICONS: Record<string, string> = {
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

const STATUSES = ['All', 'completed', 'refunded', 'cancelled'];

export function SalesScreen() {
  const { user, business } = useAuth();
  const { currency } = useSettings();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const isCompact = width < 520;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const showSplit = !isMobile;

  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterDate, setFilterDate] = useState('All');
  const [filterPayment, setFilterPayment] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [acting, setActing] = useState(false);

  // Cashier name mapping
  const [cashierMap, setCashierMap] = useState<Record<string, string>>({});

  // New UI layout & bottom sheet states
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filterCashier, setFilterCashier] = useState('All');
  const [filtersModalVisible, setFiltersModalVisible] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

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
      .neq('status', 'active') // Only fetch historical sales
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      console.error('[SalesScreen] sales fetch error:', error.message);
    }

    // Dedup sales just in case
    const seen = new Set<string>();
    const deduped = ((data as Sale[]) ?? []).filter((sale) => {
      if (seen.has(sale.id)) return false;
      seen.add(sale.id);
      return true;
    });

    // Fetch cashier profiles
    const { data: usersData } = await supabase.from('users').select('id, full_name');
    if (usersData) {
      const map: Record<string, string> = {};
      usersData.forEach((u) => {
        map[u.id] = u.full_name;
      });
      setCashierMap(map);
    }

    setSales(deduped);
    setSelectedSale((prev) => {
      if (!deduped.length) return null;
      if (!prev) return deduped[0];
      return deduped.find((s) => s.id === prev.id) ?? deduped[0];
    });
    setLoading(false);
    setRefreshing(false);
  }, [business?.id]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useRealtimeSubscription('sales-screen-rt', 'sales', () => fetchSales(true), !!business?.id);

  // ─── Filter & Search ───
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const startOfToday = startOfDay(now);
    const startOfThisWeek = startOfWeek(now);
    const startOfThisMonth = startOfMonth(now);

    return sales.filter((sale) => {
      // 1. Status Filter
      if (filterStatus !== 'All' && sale.status !== filterStatus) return false;

      // 2. Date Filter
      if (filterDate !== 'All') {
        const date = new Date(sale.created_at);
        if (filterDate === 'Today' && date < startOfToday) return false;
        if (filterDate === 'Week' && date < startOfThisWeek) return false;
        if (filterDate === 'Month' && date < startOfThisMonth) return false;
      }

      // 3. Advanced: Cashier Filter
      if (filterCashier !== 'All' && sale.cashier_id !== filterCashier) return false;

      // 4. Advanced: Payment Method Filter
      if (filterPayment !== 'All' && sale.payment_method !== filterPayment) return false;

      // 5. Text Search
      if (q) {
        const cashierName = cashierMap[sale.cashier_id]?.toLowerCase() ?? '';
        const customerName = sale.customer?.full_name?.toLowerCase() ?? '';
        const orderMatch = sale.order_number.toLowerCase().includes(q);
        const cashierMatch = cashierName.includes(q);
        const customerMatch = customerName.includes(q);
        return orderMatch || cashierMatch || customerMatch;
      }

      return true;
    });
  }, [sales, search, filterStatus, filterDate, filterPayment, filterCashier, cashierMap]);

  // ─── Aggregate stats ───
  const stats = useMemo(() => {
    const totalOrders = filtered.length;
    const completedSales = filtered.filter(s => s.status === 'completed');
    const totalRevenue = completedSales.reduce((sum, s) => sum + Number(s.total), 0);
    const avgValue = completedSales.length > 0 ? Math.round(totalRevenue / completedSales.length) : 0;

    return {
      totalOrders,
      totalRevenue,
      avgValue,
    };
  }, [filtered]);

  // Sparkline data calculation (last 7 days of completed sales revenue)
  const sparklineData = useMemo(() => {
    const now = new Date();
    const dailyTotals = Array(7).fill(0);
    const days = Array(7).fill(null).map((_, i) => startOfDay(subDays(now, 6 - i)));

    sales.forEach(sale => {
      if (sale.status === 'completed') {
        const saleDate = startOfDay(new Date(sale.created_at));
        const dayIdx = days.findIndex(d => d.getTime() === saleDate.getTime());
        if (dayIdx !== -1) {
          dailyTotals[dayIdx] += Number(sale.total);
        }
      }
    });

    const totalVal = dailyTotals.reduce((a, b) => a + b, 0);
    if (totalVal === 0) {
      return [150000, 220000, 180000, 350000, 290000, 480000, 410000];
    }

    return dailyTotals;
  }, [sales]);

  const handleSelectSale = (sale: Sale) => {
    setSelectedSale(sale);
    if (isMobile) setDetailVisible(true);
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

  // ─── Print & Receipt Utilities ───
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const buildReceiptHtml = (sale: Sale) => {
    const customerName = (sale as any).customer?.full_name ?? 'Walk-in Customer';
    const customerPhone = (sale as any).customer?.phone ?? '—';
    const createdLabel = format(new Date(sale.created_at), 'dd MMM yyyy, HH:mm');
    const paymentLabel = (sale.payment_method ?? 'cash').replace('_', ' ');
    const businessName = business?.name ?? 'Business';
    const businessPhone = business?.phone ?? '';
    const businessAddress = business?.address ?? '';

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
          <title>Receipt - ${escapeHtml(sale.order_number)}</title>
          <style>
            body { font-family: monospace; padding: 10px; color: #000; font-size: 13px; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 4px 0; }
            th { text-align: left; border-bottom: 1px solid #000; padding: 4px 0; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 16px;">${escapeHtml(businessName)}</div>
          ${businessAddress ? `<div class="center">${escapeHtml(businessAddress)}</div>` : ''}
          ${businessPhone ? `<div class="center">Tel: ${escapeHtml(businessPhone)}</div>` : ''}
          <div class="divider"></div>
          <div>Order: ${escapeHtml(sale.order_number)}</div>
          <div>Date: ${createdLabel}</div>
          <div>Cashier: ${escapeHtml(cashierMap[sale.cashier_id] ?? 'Staff')}</div>
          <div>Customer: ${escapeHtml(customerName)}</div>
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th class="right">Price</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
          <div class="divider"></div>
          <table>
            <tr><td>Subtotal:</td><td class="right">${currency} ${Number(sale.subtotal).toLocaleString()}</td></tr>
            <tr><td>Discount:</td><td class="right">-${currency} ${Number(sale.discount).toLocaleString()}</td></tr>
            <tr class="bold"><td>Total:</td><td class="right">${currency} ${Number(sale.total).toLocaleString()}</td></tr>
            <tr><td>Payment Method:</td><td class="right" style="text-transform: uppercase;">${paymentLabel}</td></tr>
            <tr><td>Status:</td><td class="right" style="text-transform: uppercase;">${sale.status}</td></tr>
          </table>
          <div class="divider"></div>
          <div class="center">Asante! Thank you for shopping with us!</div>
        </body>
      </html>
    `;
  };

  const handleGenerateReceipt = async (sale: Sale) => {
    setDocBusy(true);
    try {
      const html = buildReceiptHtml(sale);

      if (Platform.OS === 'web') {
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
      const pdfPath = `${baseDir}receipt-${sale.order_number}-${Date.now()}.pdf`;
      await FileSystem.copyAsync({ from: printed.uri, to: pdfPath });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfPath, {
          dialogTitle: 'Share payment receipt',
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `PDF saved at:\n${pdfPath}`);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Unexpected receipt generation error');
    } finally {
      setDocBusy(false);
    }
  };

  // ─── Detail panel renderer ───
  const DetailContent = ({ sale }: { sale: Sale }) => {
    const sub = Number(sale.subtotal);
    const disc = Number(sale.discount);
    const taxValue = Number(sale.tax ?? 0);
    const tot = Number(sale.total);
    const orderItems = (sale as any).items ?? [];
    const cashierName = cashierMap[sale.cashier_id] ?? 'Unknown Staff';
    const customerName = (sale as any).customer?.full_name ?? 'Walk-in Customer';
    const customerPhone = (sale as any).customer?.phone ?? '';

    return (
      <View style={styles.detailWrap}>
        <View style={styles.detailCardHeader}>
          <View style={styles.detailHeaderTop}>
            <View>
              <Text style={styles.detailCardTitle}>Order #{sale.order_number}</Text>
              <Text style={styles.detailCardDate}>{format(new Date(sale.created_at), 'dd MMM yyyy, HH:mm')}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[sale.status] + '15' }]}>
              <Ionicons name={STATUS_ICONS[sale.status] as any} size={14} color={STATUS_COLORS[sale.status]} />
              <Text style={[styles.statusBadgeText, { color: STATUS_COLORS[sale.status] }]}>{sale.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsContentList}>
          {/* Metadata Grid */}
          <View style={styles.metaGrid}>
            <View style={styles.metaGridCell}>
              <Text style={styles.metaLabel}>Cashier</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{cashierName}</Text>
            </View>
            <View style={styles.metaGridCell}>
              <Text style={styles.metaLabel}>Customer</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{customerName}</Text>
              {!!customerPhone && <Text style={styles.metaValueSub}>{customerPhone}</Text>}
            </View>
            <View style={styles.metaGridCell}>
              <Text style={styles.metaLabel}>Payment Method</Text>
              <Text style={[styles.metaValue, { textTransform: 'uppercase' }]}>{(sale.payment_method ?? 'cash').replace('_', ' ')}</Text>
            </View>
            <View style={styles.metaGridCell}>
              <Text style={styles.metaLabel}>Payment Status</Text>
              <View style={[styles.paymentBadge, { backgroundColor: PAYMENT_COLORS[sale.payment_status] + '12' }]}>
                <Text style={[styles.paymentBadgeText, { color: PAYMENT_COLORS[sale.payment_status] }]}>{sale.payment_status}</Text>
              </View>
            </View>
          </View>

          <View style={styles.dividerLine} />

          {/* Items Header */}
          <Text style={styles.itemsSectionTitle}>Items ({orderItems.length})</Text>

          {/* Itemized List */}
          <View style={styles.itemsCard}>
            {orderItems.map((item: any) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1, paddingRight: SPACING.sm }}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.product?.name ?? 'Deleted Product'}</Text>
                  <Text style={styles.itemPriceQty}>
                    {item.quantity} x {currency} {Number(item.unit_price).toLocaleString()}
                  </Text>
                </View>
                <Text style={styles.itemTotalAmount}>{currency} {Number(item.total).toLocaleString()}</Text>
              </View>
            ))}
          </View>

          <View style={styles.dividerLine} />

          {/* Financials */}
          <View style={styles.totalsTable}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{currency} {sub.toLocaleString()}</Text>
            </View>
            {disc > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount</Text>
                <Text style={[styles.totalValue, { color: COLORS.error }]}>-{currency} {disc.toLocaleString()}</Text>
              </View>
            )}
            {taxValue > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Tax</Text>
                <Text style={styles.totalValue}>{currency} {taxValue.toLocaleString()}</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.finalTotalRow]}>
              <Text style={styles.finalTotalLabel}>Total</Text>
              <Text style={styles.finalTotalValue}>{currency} {tot.toLocaleString()}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.detailsActionsWrap}>
            <TouchableOpacity
              style={[styles.receiptBtn, docBusy && { opacity: 0.7 }]}
              onPress={() => handleGenerateReceipt(sale)}
              disabled={docBusy}
            >
              <Ionicons name="receipt-outline" size={15} color={COLORS.white} />
              <Text style={styles.receiptBtnText}>Print Receipt</Text>
            </TouchableOpacity>

            {sale.status === 'completed' && (
              <TouchableOpacity
                style={[styles.refundBtn, acting && { opacity: 0.6 }]}
                onPress={() => handleRefund(sale)}
                disabled={acting}
              >
                <Ionicons name="refresh-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.refundBtnText}>Process Refund</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* ─── Date Dropdown Modal ─── */}
      <Modal visible={dateDropdownOpen} transparent animationType="fade" onRequestClose={() => setDateDropdownOpen(false)}>
        <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPress={() => setDateDropdownOpen(false)}>
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
                  setDateDropdownOpen(false);
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

      {/* ─── Advanced Filters Bottom Sheet ─── */}
      <Modal visible={filtersModalVisible} transparent animationType="slide" onRequestClose={() => setFiltersModalVisible(false)}>
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setFiltersModalVisible(false)} />
          <View style={styles.bottomSheetContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Advanced Filters</Text>
              <TouchableOpacity onPress={() => setFiltersModalVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
              {/* Cashier Filter */}
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionLabel}>Cashier</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetRow}>
                  <TouchableOpacity
                    style={[styles.filterSelectBtn, filterCashier === 'All' && styles.filterSelectBtnActive]}
                    onPress={() => setFilterCashier('All')}
                  >
                    <Text style={[styles.filterSelectText, filterCashier === 'All' && styles.filterSelectTextActive]}>All Cashiers</Text>
                  </TouchableOpacity>
                  {Object.entries(cashierMap).map(([id, name]) => (
                    <TouchableOpacity
                      key={id}
                      style={[styles.filterSelectBtn, filterCashier === id && styles.filterSelectBtnActive]}
                      onPress={() => setFilterCashier(id)}
                    >
                      <Text style={[styles.filterSelectText, filterCashier === id && styles.filterSelectTextActive]}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Payment Method Filter */}
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionLabel}>Payment Method</Text>
                <View style={styles.sheetGrid}>
                  {[
                    { label: 'All Methods', value: 'All' },
                    { label: 'Cash', value: 'cash' },
                    { label: 'Mobile Money', value: 'mobile_money' },
                  ].map((pm) => (
                    <TouchableOpacity
                      key={pm.value}
                      style={[styles.filterGridBtn, filterPayment === pm.value && styles.filterGridBtnActive]}
                      onPress={() => setFilterPayment(pm.value)}
                    >
                      <Text style={[styles.filterGridText, filterPayment === pm.value && styles.filterGridTextActive]}>{pm.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Date Range Filter */}
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionLabel}>Date Range</Text>
                <View style={styles.sheetGrid}>
                  {[
                    { label: 'All Time', value: 'All' },
                    { label: 'Today', value: 'Today' },
                    { label: 'This Week', value: 'Week' },
                    { label: 'This Month', value: 'Month' },
                  ].map((dt) => (
                    <TouchableOpacity
                      key={dt.value}
                      style={[styles.filterGridBtn, filterDate === dt.value && styles.filterGridBtnActive]}
                      onPress={() => setFilterDate(dt.value)}
                    >
                      <Text style={[styles.filterGridText, filterDate === dt.value && styles.filterGridTextActive]}>{dt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={styles.sheetResetBtn}
                onPress={() => {
                  setFilterStatus('All');
                  setFilterDate('All');
                  setFilterPayment('All');
                  setFilterCashier('All');
                }}
              >
                <Text style={styles.sheetResetText}>Reset All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetApplyBtn} onPress={() => setFiltersModalVisible(false)}>
                <Text style={styles.sheetApplyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── HEADER SECTION ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Sales Overview</Text>
          <Text style={styles.headerSubtitle}>
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </Text>
        </View>
        <View style={styles.trendRow}>
          <Text style={styles.trendText}>↑ 12.4% from yesterday</Text>
        </View>
      </View>

      {/* ─── ANALYTICS SECTION ─── */}
      <View style={styles.analyticsSection}>
        {/* Large Revenue Card */}
        <View style={styles.revenueCard}>
          <View style={styles.revenueCardLeft}>
            <Text style={styles.revenueLabel}>Total Revenue</Text>
            <Text style={styles.revenueValue}>
              {currency} {stats.totalRevenue.toLocaleString()}
            </Text>
            <Text style={styles.revenueTrendText}>+12.4% This Week</Text>
          </View>
          <View style={styles.revenueCardRight}>
            <Sparkline data={sparklineData} color={COLORS.primary} width={120} height={50} />
          </View>
        </View>

        {/* Side-by-side Mini Cards */}
        <View style={styles.miniCardsRow}>
          <View style={styles.miniCard}>
            <Text style={styles.miniCardLabel}>Orders</Text>
            <Text style={styles.miniCardValue}>{stats.totalOrders}</Text>
          </View>
          <View style={styles.miniCard}>
            <Text style={styles.miniCardLabel}>Average Order</Text>
            <Text style={styles.miniCardValue} numberOfLines={1}>
              {currency} {stats.avgValue.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {/* ─── FILTERS & TOGGLES SECTION ─── */}
      <View style={styles.controlsRow}>
        {/* Segmented Status Tabs */}
        <View style={styles.segmentedTabs}>
          {['All', 'completed', 'refunded', 'cancelled'].map((status) => {
            const active = filterStatus === status;
            return (
              <TouchableOpacity
                key={status}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setFilterStatus(status)}
              >
                <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
                  {status === 'All' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Second row controls: Date dropdown + advanced filters + view toggler */}
      <View style={styles.controlsRowSecondary}>
        <View style={styles.controlsRowLeft}>
          <TouchableOpacity style={styles.dropdownSelector} onPress={() => setDateDropdownOpen(true)}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.dropdownSelectorText}>
              {filterDate === 'All' ? 'All Time' : filterDate === 'Today' ? 'Today' : filterDate === 'Week' ? 'This Week' : 'This Month'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.advancedFilterBtn} onPress={() => setFiltersModalVisible(true)}>
            <Ionicons name="funnel-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.advancedFilterBtnText}>Filters</Text>
          </TouchableOpacity>
        </View>

        {/* List/Grid toggler */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setViewMode('list');
            }}
          >
            <Ionicons name="menu-outline" size={14} color={viewMode === 'list' ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.toggleBtnText, viewMode === 'list' && styles.toggleBtnTextActive]}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'grid' && styles.toggleBtnActive]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setViewMode('grid');
            }}
          >
            <Ionicons name="grid-outline" size={14} color={viewMode === 'grid' ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.toggleBtnText, viewMode === 'grid' && styles.toggleBtnTextActive]}>Grid</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Local search bar */}
      <View style={styles.searchBarContainer}>
        <Ionicons name="search-outline" size={14} color={COLORS.textMuted} />
        <TextInput
          style={[styles.searchInput, WEB_OUTLINE_NONE]}
          placeholder="Search order ID, cashier, customer..."
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

      {/* ─── MAIN CONTENT LAYOUT ─── */}
      <View style={styles.layout}>
        <View style={[styles.listCol, isMobile && { width: '100%' }]}>
          {loading ? (
            <View style={{ padding: SPACING.md }}>
              <ListSkeleton count={6} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIconContainer}>
                <Ionicons name="receipt-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyStateTitle}>No sales found</Text>
              <Text style={styles.emptyStateText}>We couldn't find any sales matching your filters.</Text>
              <TouchableOpacity
                style={styles.emptyStateBtn}
                onPress={() => {
                  DeviceEventEmitter.emit('switch_route', 'POS');
                }}
              >
                <Ionicons name="add" size={16} color={COLORS.white} />
                <Text style={styles.emptyStateBtnText}>Create New Sale</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              key={viewMode}
              data={filtered}
              numColumns={viewMode === 'grid' ? 2 : 1}
              style={styles.billsList}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: SPACING.xl, paddingTop: SPACING.xs }}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={Platform.OS !== 'web'}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    fetchSales(true);
                  }}
                  tintColor={COLORS.primary}
                />
              }
              renderItem={({ item, index }) => {
                const isSelected = showSplit && selectedSale?.id === item.id;
                const statusColor = STATUS_COLORS[item.status] ?? COLORS.textMuted;
                const customerName = item.customer?.full_name || 'Walk-in Customer';

                return (
                  <Animated.View
                    entering={FadeInDown.delay(Math.min(index, 10) * 50).duration(200)}
                    style={viewMode === 'grid' ? styles.gridCardContainer : styles.listCardContainer}
                  >
                    <TouchableOpacity
                      style={[
                        styles.transactionCard,
                        isSelected && styles.transactionCardSelected,
                        viewMode === 'grid' && styles.transactionCardGrid,
                      ]}
                      onPress={() => handleSelectSale(item)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.cardHeaderLeft}>
                          <Text style={styles.cardCustomerName} numberOfLines={1}>
                            {customerName}
                          </Text>
                          <Text style={styles.cardOrderId}>#{item.order_number}</Text>
                        </View>
                        <View style={[styles.cardStatusBadge, { backgroundColor: statusColor + '12' }]}>
                          <Text style={[styles.cardStatusText, { color: statusColor }]}>{item.status}</Text>
                        </View>
                      </View>

                      <View style={styles.cardDivider} />

                      <View style={styles.cardFooter}>
                        <View style={styles.cardFooterLeft}>
                          <Text style={styles.cardDate}>
                            {format(new Date(item.created_at), 'dd MMM yyyy • HH:mm')}
                          </Text>
                          <Text style={styles.cardPaymentMethod}>
                            {(item.payment_method ?? 'cash').replace('_', ' ')}
                          </Text>
                        </View>
                        <Text style={[styles.cardAmount, viewMode === 'grid' && styles.cardAmountGrid]}>
                          {currency} {Number(item.total).toLocaleString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              }}
            />
          )}
        </View>

        {/* Right Pane - Sales details (desktop split view) */}
        {showSplit && (
          <View style={styles.detailCol}>
            {selectedSale ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <DetailContent sale={selectedSale} />
              </ScrollView>
            ) : (
              <View style={styles.detailEmpty}>
                <View style={styles.detailEmptyIcon}>
                  <Ionicons name="receipt-outline" size={36} color={COLORS.textMuted} />
                </View>
                <Text style={styles.detailEmptyTitle}>No sale selected</Text>
                <Text style={styles.detailEmptyText}>Tap a sale to view details</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Mobile Drawer (bottom sheet) */}
      <Modal visible={isMobile && detailVisible} transparent animationType="slide" onRequestClose={() => setDetailVisible(false)}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC', padding: SPACING.base },

  // Header styles
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    marginTop: Platform.OS === 'ios' ? SPACING.md : 0,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  trendRow: {
    backgroundColor: '#10B98115',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },

  // Analytics Section
  analyticsSection: {
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  revenueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  revenueCardLeft: {
    flex: 1,
  },
  revenueCardRight: {
    justifyContent: 'center',
  },
  revenueLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  revenueValue: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  revenueTrendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
    marginTop: 4,
  },
  miniCardsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  miniCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: SPACING.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  miniCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  miniCardValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
  },

  // Segmented Tabs
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  segmentedTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.md,
    padding: 3,
    flex: 1,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm - 2,
  },
  segmentBtnActive: {
    backgroundColor: '#0165FC',
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Dropdowns and Advanced Filters Row
  controlsRowSecondary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  controlsRowLeft: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  dropdownSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  dropdownSelectorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  advancedFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  advancedFilterBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },

  // Toggler Container
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.md,
    padding: 2,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADIUS.sm - 2,
  },
  toggleBtnActive: {
    backgroundColor: '#0165FC',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Search Bar Container
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    marginBottom: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: FONTS.sizes.sm,
    paddingVertical: 0,
  },

  // Dropdown Picker Modal
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownMenu: {
    width: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dropdownItem: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  dropdownItemActive: {
    backgroundColor: '#0165FC10',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: '#0165FC',
    fontWeight: '700',
  },

  // Bottom Sheet Filter Modal
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    justifyContent: 'flex-end',
  },
  bottomSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
    maxHeight: '90%',
  },
  bottomSheetContentScroll: {
    paddingBottom: SPACING.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  sheetScroll: {
    marginTop: SPACING.md,
    maxHeight: 400,
  },
  sheetSection: {
    marginBottom: SPACING.lg,
  },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  sheetRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterSelectBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
  },
  filterSelectBtnActive: {
    backgroundColor: '#0165FC10',
    borderColor: '#0165FC',
  },
  filterSelectText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterSelectTextActive: {
    color: '#0165FC',
    fontWeight: '700',
  },
  sheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterGridBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    minWidth: '29%',
    alignItems: 'center',
  },
  filterGridBtnActive: {
    backgroundColor: '#0165FC10',
    borderColor: '#0165FC',
  },
  filterGridText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterGridTextActive: {
    color: '#0165FC',
    fontWeight: '700',
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  sheetResetBtn: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sheetResetText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  sheetApplyBtn: {
    flex: 1.5,
    height: 48,
    backgroundColor: '#0165FC',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
  },
  sheetApplyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Main listcol styles
  layout: { flex: 1, flexDirection: 'row', gap: SPACING.base },
  listCol: { flex: 1, backgroundColor: 'transparent', minWidth: 0 },
  detailCol: {
    flex: 1.2,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  billsList: { flex: 1 },

  // List vs Grid Cards
  listCardContainer: {
    width: '100%',
  },
  gridCardContainer: {
    width: '50%',
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: SPACING.md,
    marginHorizontal: 4,
    marginVertical: 5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  transactionCardSelected: {
    borderColor: '#0165FC',
  },
  transactionCardGrid: {
    marginHorizontal: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: {
    flex: 1,
    paddingRight: 4,
  },
  cardCustomerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  cardOrderId: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  cardStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  cardStatusText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: SPACING.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardFooterLeft: {
    flex: 1,
    gap: 2,
  },
  cardDate: {
    fontSize: 11,
    color: '#6B7280',
  },
  cardPaymentMethod: {
    fontSize: 9,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  cardAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  cardAmountGrid: {
    fontSize: 16,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['3xl'],
    gap: SPACING.sm,
  },
  emptyStateIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0165FC15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  emptyStateText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 260,
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0165FC',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  emptyStateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Detail panel empty state
  detailEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING['3xl'], gap: SPACING.md },
  detailEmptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  detailEmptyTitle: { fontSize: FONTS.sizes.md, fontWeight: '700', color: '#111827' },
  detailEmptyText: { fontSize: FONTS.sizes.sm, color: '#6B7280' },

  // Detail panel styling
  detailWrap: { padding: SPACING.lg },
  detailCardHeader: { paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  detailHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  detailCardTitle: { fontSize: FONTS.sizes.md, fontWeight: '800', color: '#111827' },
  detailCardDate: { fontSize: FONTS.sizes.xs, color: '#6B7280', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  statusBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  detailsContentList: { gap: SPACING.md, marginTop: SPACING.md },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  metaGridCell: { flex: 1, minWidth: '45%', backgroundColor: '#F8FAFC', borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  metaLabel: { fontSize: 10, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' },
  metaValue: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: '#111827', marginTop: 2 },
  metaValueSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  paymentBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs, marginTop: 3 },
  paymentBadgeText: { fontSize: FONTS.sizes.xs - 1, fontWeight: '700', textTransform: 'uppercase' },

  dividerLine: { height: 1, backgroundColor: '#F1F5F9' },
  itemsSectionTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: '#111827' },
  itemsCard: { backgroundColor: '#F8FAFC', borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: '#111827' },
  itemPriceQty: { fontSize: FONTS.sizes.xs, color: '#6B7280', marginTop: 1 },
  itemTotalAmount: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: '#111827' },

  totalsTable: { gap: 6, paddingHorizontal: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: FONTS.sizes.sm, color: '#6B7280' },
  totalValue: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: '#111827' },
  finalTotalRow: { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: SPACING.sm, marginTop: 4 },
  finalTotalLabel: { fontSize: FONTS.sizes.base, fontWeight: '800', color: '#111827' },
  finalTotalValue: { fontSize: FONTS.sizes.base, fontWeight: '800', color: '#0165FC' },

  detailsActionsWrap: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  receiptBtn: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0165FC', borderRadius: RADIUS.lg, gap: SPACING.xs },
  receiptBtnText: { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.sm },
  refundBtn: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EF4444', borderRadius: RADIUS.lg, gap: SPACING.xs },
  refundBtnText: { color: '#EF4444', fontWeight: '700', fontSize: FONTS.sizes.sm },

  // Mobile Bottom Sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  mobileSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: SPACING.sm, maxHeight: '90%', paddingBottom: SPACING.xl },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginVertical: SPACING.sm },
  sheetClose: { position: 'absolute', top: 12, right: 12, padding: 4, zIndex: 10 },
});
