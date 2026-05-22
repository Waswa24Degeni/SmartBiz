import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
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
      <View style={[styles.topRow, isMobile && styles.topRowMobile]}>
        <View style={styles.periodRow}>
          {([
            { key: 'day' as const, label: 'Day' },
            { key: 'week' as const, label: 'Week' },
            { key: 'month' as const, label: 'Month' },
          ] as const).map((p) => (
            <TouchableOpacity key={p.key} style={[styles.periodBtn, period === p.key && styles.periodBtnActive]} onPress={() => setPeriod(p.key)}>
              <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.exportBtnsRow}>
          <TouchableOpacity style={[styles.exportBtn, exporting && { opacity: 0.7 }]} onPress={handleDownloadPdf} disabled={exporting}>
            {exporting ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <>
                <Ionicons name="download-outline" size={15} color={COLORS.white} />
                <Text style={styles.exportBtnText}>Save PDF</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.shareBtn, exporting && { opacity: 0.7 }]} onPress={handleSharePdf} disabled={exporting}>
            <Ionicons name="share-social-outline" size={15} color={COLORS.primary} />
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <>
          <View style={styles.summaryGrid}>
            {summaryCards.map((card) => (
              <View key={card.key} style={styles.summaryCard}>
                <Ionicons name={card.icon as any} size={18} color={card.color} />
                <Text style={styles.summaryValue}>{card.value}</Text>
                <Text style={styles.summaryLabel}>{card.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Products</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: isMobile ? 520 : 0, flex: 1 }}>
                {topItems.length === 0 ? (
                  <Text style={styles.emptyText}>No product sales in this period</Text>
                ) : (
                  topItems.map((item) => (
                    <View key={item.product_name} style={styles.row}>
                      <Text style={[styles.cell, { flex: 2 }]} numberOfLines={1}>{item.product_name}</Text>
                      <Text style={[styles.cell, { flex: 1 }]}>Qty {item.qty}</Text>
                      <Text style={[styles.cell, { flex: 1, textAlign: 'right' }]}>TZS {item.revenue.toLocaleString()}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Orders</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: isMobile ? 560 : 0, flex: 1 }}>
                {sales.length === 0 ? (
                  <Text style={styles.emptyText}>No orders in this period</Text>
                ) : (
                  sales.slice(0, 20).map((s) => (
                    <View key={s.id} style={styles.row}>
                      <Text style={[styles.cell, { flex: 1.4 }]} numberOfLines={1}>{s.order_number}</Text>
                      <Text style={[styles.cell, { flex: 1 }]}>{s.status}</Text>
                      <Text style={[styles.cell, { flex: 1.2 }]}>{format(new Date(s.created_at), 'dd MMM')}</Text>
                      <Text style={[styles.cell, { flex: 1.2, textAlign: 'right' }]}>TZS {Number(s.total).toLocaleString()}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment Transactions</Text>
            {payments.length === 0 ? (
              <Text style={styles.emptyText}>No payment transactions found</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: isMobile ? 620 : 0, flex: 1 }}>
                  <View style={[styles.row, styles.payHeadRow]}>
                    <Text style={[styles.payHeadCell, { flex: 0.9 }]}>Type</Text>
                    <Text style={[styles.payHeadCell, { flex: 0.8 }]}>Plan</Text>
                    <Text style={[styles.payHeadCell, { flex: 1.2, textAlign: 'right' }]}>Amount</Text>
                    <Text style={[styles.payHeadCell, { flex: 1 }]}>Phone</Text>
                    <Text style={[styles.payHeadCell, { flex: 0.8 }]}>Status</Text>
                    <Text style={[styles.payHeadCell, { flex: 1.1 }]}>Date</Text>
                  </View>
                  {payments.map((p, idx) => (
                    <View key={p.id} style={[styles.row, idx % 2 === 1 && styles.rowAlt]}>
                      <Text style={[styles.cell, { flex: 0.9 }]} numberOfLines={1}>{p.payment_type}</Text>
                      <Text style={[styles.cell, { flex: 0.8 }]} numberOfLines={1}>{p.metadata?.plan ?? '—'}</Text>
                      <Text style={[styles.cell, { flex: 1.2, textAlign: 'right' }]}>TZS {Number(p.amount).toLocaleString()}</Text>
                      <Text style={[styles.cell, { flex: 1 }]} numberOfLines={1}>{p.payer_phone ?? '—'}</Text>
                      <View style={{ flex: 0.8, alignItems: 'flex-start' }}>
                        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[p.status] ?? COLORS.textMuted }]}>
                          <Text style={styles.statusBadgeText}>{p.status}</Text>
                        </View>
                      </View>
                      <Text style={[styles.cell, { flex: 1.1 }]}>{format(new Date(p.initiated_at), 'dd MMM yyyy')}</Text>
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
  container: { padding: SPACING.base, gap: SPACING.base },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topRowMobile: { alignItems: 'flex-start', flexDirection: 'column', gap: SPACING.sm },
  title: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  periodRow: { flexDirection: 'row', gap: SPACING.xs },
  periodBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  periodTextActive: { color: COLORS.white },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 1,
    minWidth: 76,
  },
  exportBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  exportBtnText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 1,
  },
  shareBtnText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  summaryGrid: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  summaryCard: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    gap: 3,
  },
  summaryValue: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  summaryLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
  },
  cardTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cell: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.md, fontSize: FONTS.sizes.sm },
  payHeadRow: { backgroundColor: COLORS.background },
  payHeadCell: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.text },
  rowAlt: { backgroundColor: COLORS.background + '80' },
  statusBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.white, textTransform: 'capitalize' },
});
