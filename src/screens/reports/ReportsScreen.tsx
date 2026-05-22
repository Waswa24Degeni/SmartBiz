import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../lib/constants';
import { format } from 'date-fns';

type SaleRow = {
  id: string;
  order_number: string;
  total: number;
  status: string;
  created_at: string;
};

type TopItemRow = {
  product_name: string;
  qty: number;
  revenue: number;
};

type PaymentRow = {
  id: string;
  payment_type: string;
  amount: number;
  payer_phone: string | null;
  status: string;
  gateway_reference: string | null;
  metadata: Record<string, any>;
  initiated_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  completed: COLORS.success,
  pending:   COLORS.warning,
  processing: COLORS.info,
  failed:    COLORS.error,
  expired:   COLORS.textMuted,
};

const getStatusPillStyle = (status: string) => {
  const color = STATUS_COLORS[status] ?? COLORS.textMuted;
  return { backgroundColor: color + '20', borderWidth: 1, borderColor: color + '40' };
};

export function ReportsScreen() {
  const { business } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [topItems, setTopItems] = useState<TopItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const periodMeta = useMemo(() => {
    if (period === 'day') return { days: 1, label: 'Day' };
    if (period === 'week') return { days: 7, label: 'Week' };
    return { days: 30, label: 'Month' };
  }, [period]);

  const sinceDate = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getTime());
    d.setDate(d.getDate() - periodMeta.days);
    return d.toISOString();
  }, [periodMeta.days]);

  const fetchReport = useCallback(async (silent = false) => {
    if (!business?.id) {
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);

    const { data: saleRows, error: saleErr } = await supabase
      .from('sales')
      .select('id, order_number, total, status, created_at')
      .eq('business_id', business.id)
      .gte('created_at', sinceDate)
      .order('created_at', { ascending: false })
      .limit(200);

    if (saleErr) {
      Alert.alert('Error', saleErr.message);
      setSales([]);
      setTopItems([]);
      setLoading(false);
      return;
    }

    const saleIds = ((saleRows as SaleRow[]) ?? []).map((s) => s.id);

    let top: TopItemRow[] = [];
    if (saleIds.length) {
      const { data: itemRows, error: itemErr } = await supabase
        .from('sale_items')
        .select('quantity, total, product:products(name)')
        .in('sale_id', saleIds);

      if (!itemErr) {
        const map = new Map<string, { qty: number; revenue: number }>();
        (itemRows ?? []).forEach((row: any) => {
          const name = row.product?.name ?? 'Unknown item';
          const current = map.get(name) ?? { qty: 0, revenue: 0 };
          current.qty += Number(row.quantity) || 0;
          current.revenue += Number(row.total) || 0;
          map.set(name, current);
        });

        top = Array.from(map.entries())
          .map(([product_name, v]) => ({ product_name, qty: v.qty, revenue: v.revenue }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 8);
      }
    }

    setSales((saleRows as SaleRow[]) ?? []);
    setTopItems(top);
    setLoading(false);
  }, [business?.id, sinceDate]);

  const fetchPayments = useCallback(async () => {
    if (!business?.id) return;
    const { data } = await supabase
      .from('payments')
      .select('id, payment_type, amount, payer_phone, status, gateway_reference, metadata, initiated_at')
      .eq('business_id', business.id)
      .order('initiated_at', { ascending: false })
      .limit(100);
    setPayments((data as PaymentRow[]) ?? []);
  }, [business?.id]);

  useEffect(() => {
    fetchReport();
    fetchPayments();
  }, [fetchReport, fetchPayments]);

  useRealtimeSubscription('reports-sales-rt', 'sales', () => fetchReport(true), !!business?.id);
  useRealtimeSubscription('reports-items-rt', 'sale_items', () => fetchReport(true), !!business?.id);
  useRealtimeSubscription('reports-payments-rt', 'payments', () => fetchPayments(), !!business?.id);

  const completedRevenue = sales
    .filter((s) => s.status === 'completed' || s.status === 'active')
    .reduce((sum, s) => sum + Number(s.total), 0);
  const completedCount = sales.filter((s) => s.status === 'completed').length;
  const cancelledCount = sales.filter((s) => s.status === 'cancelled').length;

  const planPayTotal = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const summaryCards = [
    { key: 'revenue', icon: 'cash-outline', color: COLORS.success, value: `TZS ${completedRevenue.toLocaleString()}`, label: 'Revenue' },
    { key: 'completed', icon: 'checkmark-circle-outline', color: COLORS.info, value: String(completedCount), label: 'Completed Orders' },
    { key: 'cancelled', icon: 'close-circle-outline', color: COLORS.error, value: String(cancelledCount), label: 'Cancelled Orders' },
    { key: 'planfees', icon: 'card-outline', color: COLORS.accent, value: `TZS ${planPayTotal.toLocaleString()}`, label: 'Plan Fees Paid' },
  ];

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const buildPdfHtml = () => {
    if (!business?.id) {
      throw new Error('Business context is missing. Please sign in again.');
    }

    if (sales.length === 0) {
      throw new Error(`There are no orders for this ${periodMeta.label.toLowerCase()} yet.`);
    }

    const reportDate = format(new Date(), 'dd MMM yyyy, HH:mm');
    const topRows = topItems.map((item) => `
        <tr>
          <td>${escapeHtml(item.product_name)}</td>
          <td>${item.qty}</td>
          <td style="text-align:right;">TZS ${Number(item.revenue).toLocaleString()}</td>
        </tr>
      `).join('');

    const orderRows = sales.slice(0, 30).map((row) => `
        <tr>
          <td>${escapeHtml(row.order_number)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${format(new Date(row.created_at), 'dd MMM yyyy')}</td>
          <td style="text-align:right;">TZS ${Number(row.total).toLocaleString()}</td>
        </tr>
      `).join('');

    const paymentRows = payments.slice(0, 30).map((p) => `
        <tr>
          <td>${escapeHtml(p.payment_type)}</td>
          <td>${escapeHtml(p.metadata?.plan ?? '—')}</td>
          <td style="text-align:right;">TZS ${Number(p.amount).toLocaleString()}</td>
          <td>${escapeHtml(p.payer_phone ?? '—')}</td>
          <td>${escapeHtml(p.status)}</td>
          <td>${format(new Date(p.initiated_at), 'dd MMM yyyy')}</td>
        </tr>
      `).join('');

    return `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 24px; }
              h1 { font-size: 22px; margin: 0 0 8px; }
              .meta { color: #4B5563; font-size: 12px; margin-bottom: 16px; }
              .cards { display: flex; gap: 10px; margin-bottom: 16px; }
              .card { flex: 1; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px; }
              .card .label { color: #6B7280; font-size: 11px; }
              .card .value { margin-top: 4px; font-size: 15px; font-weight: 700; }
              h2 { font-size: 14px; margin-top: 18px; margin-bottom: 8px; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { border: 1px solid #E5E7EB; padding: 8px; text-align: left; }
              th { background: #F3F4F6; }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(business.name)} Report</h1>
            <div class="meta">Period: ${periodMeta.label} • Generated: ${reportDate}</div>

            <div class="cards">
              <div class="card"><div class="label">Revenue</div><div class="value">TZS ${completedRevenue.toLocaleString()}</div></div>
              <div class="card"><div class="label">Completed Orders</div><div class="value">${completedCount}</div></div>
              <div class="card"><div class="label">Cancelled Orders</div><div class="value">${cancelledCount}</div></div>
              <div class="card"><div class="label">Plan Fees Paid</div><div class="value">TZS ${planPayTotal.toLocaleString()}</div></div>
            </div>

            <h2>Top Products</h2>
            <table>
              <thead><tr><th>Product</th><th>Qty</th><th style="text-align:right;">Revenue</th></tr></thead>
              <tbody>${topRows || '<tr><td colspan="3">No top products for this period.</td></tr>'}</tbody>
            </table>

            <h2>Recent Orders</h2>
            <table>
              <thead><tr><th>Order</th><th>Status</th><th>Date</th><th style="text-align:right;">Total</th></tr></thead>
              <tbody>${orderRows}</tbody>
            </table>

            <h2>Payment Transactions</h2>
            <table>
              <thead><tr><th>Type</th><th>Plan</th><th style="text-align:right;">Amount</th><th>Phone</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>${paymentRows || '<tr><td colspan="6">No payment transactions found.</td></tr>'}</tbody>
            </table>
          </body>
        </html>
      `;
  };

  const renderPdfToAppStorage = async (html: string) => {
    const printed = await Print.printToFileAsync({ html });
    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('Cannot access local storage on this device.');
    const dest = `${baseDir}smartbiz-report-${period}-${Date.now()}.pdf`;
    await FileSystem.copyAsync({ from: printed.uri, to: dest });
    return dest;
  };

  const savePdfToDevice = async () => {
    if (Platform.OS === 'web') {
      const html = buildPdfHtml();
      await Print.printAsync({ html });
      return;
    }

    const html = buildPdfHtml();
    const localPdf = await renderPdfToAppStorage(html);

    if (Platform.OS === 'android') {
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permission.granted) {
        const fileName = `smartbiz-report-${period}-${Date.now()}.pdf`;
        const base64 = await FileSystem.readAsStringAsync(localPdf, { encoding: FileSystem.EncodingType.Base64 });
        const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          fileName,
          'application/pdf',
        );
        await FileSystem.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        Alert.alert('Saved', 'PDF saved to selected folder.');
        return;
      }
    }

    Alert.alert('Saved', `PDF saved to app storage:\n${localPdf}`);
  };

  const sharePdf = async () => {
    if (Platform.OS === 'web') {
      const html = buildPdfHtml();
      await Print.printAsync({ html });
      return;
    }

    const html = buildPdfHtml();
    const localPdf = await renderPdfToAppStorage(html);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localPdf, {
        dialogTitle: 'Share report PDF',
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    Alert.alert('Saved', `PDF saved to app storage:\n${localPdf}`);
  };

  const handleDownloadPdf = async () => {
    setExporting(true);
    try {
      await savePdfToDevice();
    } catch (e: any) {
      if ((e?.message ?? '').toLowerCase().includes('there are no orders')) {
        Alert.alert('No data', e.message);
      } else {
        Alert.alert('PDF save failed', e?.message ?? 'Could not save report PDF.');
      }
    } finally {
      setExporting(false);
    }
  };

  const handleSharePdf = async () => {
    setExporting(true);
    try {
      await sharePdf();
    } catch (e: any) {
      if ((e?.message ?? '').toLowerCase().includes('there are no orders')) {
        Alert.alert('No data', e.message);
      } else {
        Alert.alert('PDF export failed', e?.message ?? 'Could not export report PDF.');
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Section */}
      <View style={styles.headerSection}>
        <View>
          <Text style={styles.screenTitle}>Reports</Text>
          <Text style={styles.screenSubtitle}>Track your business performance</Text>
        </View>
      </View>

      {/* Controls Section */}
      <View style={[styles.topRow, isMobile && styles.topRowMobile]}>
        <View style={styles.periodRow}>
          {([
            { key: 'day' as const, label: 'Day', icon: 'today-outline' },
            { key: 'week' as const, label: 'Week', icon: 'calendar-outline' },
            { key: 'month' as const, label: 'Month', icon: 'calendar-outline' },
          ] as const).map((p) => (
            <TouchableOpacity 
              key={p.key} 
              style={[styles.periodBtn, period === p.key && styles.periodBtnActive]} 
              onPress={() => setPeriod(p.key)}
              activeOpacity={0.7}
            >
              {period === p.key && <View style={styles.periodBtnIndicator} />}
              <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.exportBtnsRow}>
          <TouchableOpacity 
            style={[styles.exportBtn, exporting && { opacity: 0.6 }]} 
            onPress={handleDownloadPdf} 
            disabled={exporting}
            activeOpacity={0.85}
          >
            {exporting ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <>
                <Ionicons name="download-outline" size={16} color={COLORS.white} />
                <Text style={styles.exportBtnText}>Save</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.shareBtn, exporting && { opacity: 0.6 }]} 
            onPress={handleSharePdf} 
            disabled={exporting}
            activeOpacity={0.85}
          >
            <Ionicons name="share-social-outline" size={16} color={COLORS.primary} />
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      ) : (
        <>
          {/* Summary Cards Grid */}
          <View style={styles.summaryGrid}>
            {summaryCards.map((card, idx) => (
              <View key={card.key} style={[styles.summaryCard, isMobile && idx > 1 && styles.summaryCardMobile]}>
                <View style={[styles.summaryIconBg, { backgroundColor: card.color + '15' }]}>
                  <Ionicons name={card.icon as any} size={20} color={card.color} />
                </View>
                <Text style={styles.summaryLabel}>{card.label}</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>{card.value}</Text>
              </View>
            ))}
          </View>

          {/* Top Products Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="star-outline" size={18} color={COLORS.accent} />
              <Text style={styles.cardTitle}>Top Products</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
              <View style={{ minWidth: isMobile ? 520 : 0, flex: 1 }}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Product</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Qty</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Revenue</Text>
                </View>
                {topItems.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <Ionicons name="cube-outline" size={32} color={COLORS.textMuted} />
                    <Text style={styles.emptyText}>No product sales in this period</Text>
                  </View>
                ) : (
                  topItems.map((item, idx) => (
                    <View key={item.product_name} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{item.product_name}</Text>
                      <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '600' }]}>{item.qty}</Text>
                      <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', fontWeight: '600', color: COLORS.success }]}>TZS {item.revenue.toLocaleString()}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>

          {/* Recent Orders Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="receipt-outline" size={18} color={COLORS.info} />
              <Text style={styles.cardTitle}>Recent Orders</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
              <View style={{ minWidth: isMobile ? 560 : 0, flex: 1 }}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Order #</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Status</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Date</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Total</Text>
                </View>
                {sales.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <Ionicons name="receipt-outline" size={32} color={COLORS.textMuted} />
                    <Text style={styles.emptyText}>No orders in this period</Text>
                  </View>
                ) : (
                  sales.slice(0, 20).map((s, idx) => (
                    <View key={s.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={[styles.tableCell, { flex: 1.4 }]} numberOfLines={1}>{s.order_number}</Text>
                      <View style={{ flex: 1, alignItems: 'flex-start' }}>
                        <View style={[styles.statusPill, getStatusPillStyle(s.status)]}>
                          <Text style={styles.statusPillText}>{s.status}</Text>
                        </View>
                      </View>
                      <Text style={[styles.tableCell, { flex: 1.2 }]}>{format(new Date(s.created_at), 'dd MMM')}</Text>
                      <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', fontWeight: '600', color: COLORS.success }]}>TZS {Number(s.total).toLocaleString()}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>

          {/* Payment Transactions Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="card-outline" size={18} color={COLORS.accent} />
              <Text style={styles.cardTitle}>Payment Transactions</Text>
            </View>
            {payments.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="card-outline" size={32} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No payment transactions found</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
                <View style={{ minWidth: isMobile ? 620 : 0, flex: 1 }}>
                  <View style={[styles.tableHeaderRow, styles.paymentHeaderRow]}>
                    <Text style={[styles.tableHeaderCell, { flex: 0.9 }]}>Type</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Plan</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Amount</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Phone</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Status</Text>
                    <Text style={[styles.tableHeaderCell, { flex: 1.1 }]}>Date</Text>
                  </View>
                  {payments.map((p, idx) => (
                    <View key={p.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={[styles.tableCell, { flex: 0.9 }]} numberOfLines={1}>{p.payment_type}</Text>
                      <Text style={[styles.tableCell, { flex: 0.8 }]} numberOfLines={1}>{p.metadata?.plan ?? '—'}</Text>
                      <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right', fontWeight: '600', color: COLORS.success }]}>TZS {Number(p.amount).toLocaleString()}</Text>
                      <Text style={[styles.tableCell, { flex: 1 }]} numberOfLines={1}>{p.payer_phone ?? '—'}</Text>
                      <View style={{ flex: 0.8, alignItems: 'flex-start' }}>
                        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[p.status] ?? COLORS.textMuted }]}>
                          <Text style={styles.statusBadgeText}>{p.status}</Text>
                        </View>
                      </View>
                      <Text style={[styles.tableCell, { flex: 1.1 }]}>{format(new Date(p.initiated_at), 'dd MMM')}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: SPACING.base, gap: SPACING.lg },
  
  /* Header Section */
  headerSection: { marginBottom: SPACING.sm },
  screenTitle: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  screenSubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, marginTop: 4 },

  /* Loading State */
  loadingContainer: { justifyContent: 'center', alignItems: 'center', paddingVertical: SPACING['2xl'], gap: SPACING.md },
  loadingText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, marginTop: SPACING.sm },

  /* Controls */
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.md },
  topRowMobile: { alignItems: 'flex-start', flexDirection: 'column', gap: SPACING.md },
  
  periodRow: { flexDirection: 'row', gap: SPACING.xs, backgroundColor: COLORS.surface, padding: 4, borderRadius: RADIUS.full },
  periodBtn: {
    borderRadius: RADIUS.full,
    backgroundColor: 'transparent',
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 1,
    position: 'relative',
  },
  periodBtnActive: { backgroundColor: COLORS.primary },
  periodBtnIndicator: { position: 'absolute', bottom: 3, left: SPACING.xs + 2, right: SPACING.xs + 2, height: 2, borderRadius: 1 },
  periodText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  periodTextActive: { color: COLORS.white, fontWeight: '700' },
  
  exportBtnsRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    minWidth: 80,
  },
  exportBtnText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.3 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '40',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    minWidth: 80,
  },
  shareBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.3 },

  /* Summary Cards */
  summaryGrid: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  summaryCardMobile: { minWidth: '48%' },
  summaryIconBg: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  summaryLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '500' },

  /* Cards */
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  cardTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, flex: 1 },

  /* Table Styles */
  tableScroll: { marginHorizontal: -SPACING.md },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.border,
    gap: SPACING.xs,
  },
  paymentHeaderRow: { paddingHorizontal: SPACING.md },
  tableHeaderCell: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '40',
    gap: SPACING.xs,
  },
  tableRowAlt: { backgroundColor: COLORS.background + '50' },
  tableCell: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },

  /* Empty State */
  emptyStateContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', fontSize: FONTS.sizes.sm, fontWeight: '500' },

  /* Status Pills */
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize', color: COLORS.text },
  
  /* Status Badge */
  statusBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.white, textTransform: 'capitalize' },
});
