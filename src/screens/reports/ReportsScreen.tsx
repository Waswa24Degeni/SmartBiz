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

type SalesReportItem = {
  id: string;
  product_name: string;
  cost_price: number;
  selling_price: number;
  cashier_name: string;
  quantity: number;
  total: number;
  created_at: string;
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
  pending: COLORS.warning,
  processing: COLORS.info,
  failed: COLORS.error,
  expired: COLORS.textMuted,
};

export function ReportsScreen() {
  const { business } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [reportType, setReportType] = useState<'sales' | 'advanced'>('sales');
  const [salesItems, setSalesItems] = useState<SalesReportItem[]>([]);
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

  const fetchSalesReport = useCallback(async (silent = false) => {
    if (!business?.id) {
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);

    try {
      // First fetch all sales IDs for this business in the period
      const { data: sales, error: saleErr } = await supabase
        .from('sales')
        .select('id')
        .eq('business_id', business.id)
        .gte('created_at', sinceDate);

      if (saleErr) throw saleErr;

      const saleIds = (sales ?? []).map((s: any) => s.id);
      if (saleIds.length === 0) {
        setSalesItems([]);
        setLoading(false);
        return;
      }

      // Then fetch sale_items with product and cashier details
      const { data, error } = await supabase
        .from('sale_items')
        .select(`
          id,
          quantity,
          unit_price,
          total,
          sale_id,
          product_id
        `)
        .in('sale_id', saleIds);

      if (error) throw error;

      // Fetch all products and sales data we need
      const productIds = [...new Set((data ?? []).map((item: any) => item.product_id))];
      const salesDataMap = new Map();

      const { data: salesData } = await supabase
        .from('sales')
        .select('id, cashier_id, created_at, cashier:users(full_name)')
        .in('id', saleIds);

      (salesData ?? []).forEach((s: any) => {
        salesDataMap.set(s.id, { cashier_name: s.cashier?.full_name ?? 'Unknown', created_at: s.created_at });
      });

      const { data: productsData } = await supabase
        .from('products')
        .select('id, name, purchase_price')
        .in('id', productIds);

      const productsMap = new Map();
      (productsData ?? []).forEach((p: any) => {
        productsMap.set(p.id, { name: p.name, purchase_price: Number(p.purchase_price) || 0 });
      });

      // Merge everything together
      const items: SalesReportItem[] = (data ?? []).map((item: any) => ({
        id: item.id,
        product_name: productsMap.get(item.product_id)?.name ?? 'Unknown',
        cost_price: productsMap.get(item.product_id)?.purchase_price ?? 0,
        selling_price: Number(item.unit_price) || 0,
        cashier_name: salesDataMap.get(item.sale_id)?.cashier_name ?? 'Unknown',
        quantity: Number(item.quantity) || 0,
        total: Number(item.total) || 0,
        created_at: salesDataMap.get(item.sale_id)?.created_at ?? new Date().toISOString(),
      }));

      setSalesItems(items);
    } catch (err: any) {
      console.error('Error fetching sales report:', err);
      Alert.alert('Error', err.message || 'Failed to fetch sales report');
      setSalesItems([]);
    } finally {
      setLoading(false);
    }
  }, [business?.id, sinceDate]);

  const fetchPayments = useCallback(async () => {
    if (!business?.id) return;
    try {
      const { data } = await supabase
        .from('payments')
        .select('id, payment_type, amount, payer_phone, status, gateway_reference, metadata, initiated_at')
        .eq('business_id', business.id)
        .gte('initiated_at', sinceDate)
        .order('initiated_at', { ascending: false })
        .limit(100);
      setPayments((data as PaymentRow[]) ?? []);
    } catch (err: any) {
      console.error('Error fetching payments:', err);
    }
  }, [business?.id, sinceDate]);

  useEffect(() => {
    fetchSalesReport();
    fetchPayments();
  }, [fetchSalesReport, fetchPayments]);

  const realtimeEnabled = !!business?.id && Platform.OS !== 'web';
  useRealtimeSubscription('reports-sales-rt', 'sales', () => fetchSalesReport(true), realtimeEnabled);
  useRealtimeSubscription('reports-items-rt', 'sale_items', () => fetchSalesReport(true), realtimeEnabled);

  const reportMetrics = useMemo(() => {
    const totalRevenue = salesItems.reduce((sum, item) => sum + item.total, 0);
    const totalCost = salesItems.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);
    const netProfit = totalRevenue - totalCost;
    const totalItemsSold = salesItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalTransactions = salesItems.length;

    return { totalRevenue, totalCost, netProfit, totalItemsSold, totalTransactions };
  }, [salesItems]);

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const escapeCsv = (value: string | number) => {
    const safe = String(value ?? '');
    if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };

  const buildSalesReportPdf = () => {
    if (!business?.id) throw new Error('Business context is missing. Please sign in again.');
    if (salesItems.length === 0) throw new Error(`There are no sales transactions for this ${periodMeta.label.toLowerCase()}.`);

    const reportDate = format(new Date(), 'dd MMM yyyy, HH:mm');
    const rows = salesItems.map((item) => {
      const itemProfit = (item.selling_price - item.cost_price) * item.quantity;
      return `
      <tr>
        <td>${escapeHtml(item.product_name)}</td>
        <td style="text-align:right;">TZS ${item.cost_price.toLocaleString()}</td>
        <td style="text-align:right;">TZS ${item.selling_price.toLocaleString()}</td>
        <td>${escapeHtml(item.cashier_name)}</td>
        <td style="text-align:center;">${item.quantity}</td>
        <td style="text-align:right;">TZS ${item.total.toLocaleString()}</td>
        <td style="text-align:right;">TZS ${itemProfit.toLocaleString()}</td>
      </tr>
    `;
    }).join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 24px; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            .meta { color: #4B5563; font-size: 12px; margin-bottom: 20px; }
            h2 { font-size: 14px; margin-top: 18px; margin-bottom: 8px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
            th, td { border: 1px solid #E5E7EB; padding: 8px; text-align: left; }
            th { background: #F3F4F6; font-weight: 700; }
            .summary { display: flex; gap: 20px; margin-top: 20px; padding-top: 16px; border-top: 2px solid #E5E7EB; flex-wrap: wrap; }
            .summary-item { }
            .summary-label { color: #6B7280; font-size: 11px; font-weight: 700; text-transform: uppercase; }
            .summary-value { font-size: 16px; font-weight: 800; color: #111827; margin-top: 4px; }
            .profit { color: #10B981; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(business.name)} - Sales Report</h1>
          <div class="meta">Period: ${periodMeta.label} • Generated: ${reportDate}</div>

          <h2>Sales Transactions</h2>
          <table>
            <thead>
              <tr>
                <th>Product Name</th>
                <th style="text-align:right;">Cost Price</th>
                <th style="text-align:right;">Selling Price</th>
                <th>Cashier</th>
                <th style="text-align:center;">Quantity</th>
                <th style="text-align:right;">Total Amount</th>
                <th style="text-align:right;">Net Profit</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="summary">
            <div class="summary-item">
              <div class="summary-label">Total Revenue</div>
              <div class="summary-value">TZS ${reportMetrics.totalRevenue.toLocaleString()}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total Cost</div>
              <div class="summary-value">TZS ${reportMetrics.totalCost.toLocaleString()}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label profit">NET PROFIT</div>
              <div class="summary-value profit">TZS ${reportMetrics.netProfit.toLocaleString()}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Items Sold</div>
              <div class="summary-value">${reportMetrics.totalItemsSold}</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const buildAdvancedReportPdf = () => {
    if (!business?.id) throw new Error('Business context is missing. Please sign in again.');
    if (payments.length === 0 && salesItems.length === 0) {
      throw new Error(`There is no data for this ${periodMeta.label.toLowerCase()}.`);
    }

    const reportDate = format(new Date(), 'dd MMM yyyy, HH:mm');
    const paymentRows = payments.map((p) => `
      <tr>
        <td>${escapeHtml(p.payment_type)}</td>
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
            .meta { color: #4B5563; font-size: 12px; margin-bottom: 20px; }
            .cards { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
            .card { flex: 1; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px; min-width: 120px; }
            .card .label { color: #6B7280; font-size: 11px; font-weight: 700; }
            .card .value { margin-top: 4px; font-size: 15px; font-weight: 700; }
            h2 { font-size: 14px; margin-top: 18px; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #E5E7EB; padding: 8px; text-align: left; }
            th { background: #F3F4F6; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(business.name)} - Advanced Report</h1>
          <div class="meta">Period: ${periodMeta.label} • Generated: ${reportDate}</div>

          <div class="cards">
            <div class="card"><div class="label">Total Revenue</div><div class="value">TZS ${reportMetrics.totalRevenue.toLocaleString()}</div></div>
            <div class="card"><div class="label">Net Profit</div><div class="value">TZS ${reportMetrics.netProfit.toLocaleString()}</div></div>
            <div class="card"><div class="label">Items Sold</div><div class="value">${reportMetrics.totalItemsSold}</div></div>
            <div class="card"><div class="label">Transactions</div><div class="value">${reportMetrics.totalTransactions}</div></div>
          </div>

          <h2>Payment Transactions</h2>
          <table>
            <thead><tr><th>Type</th><th style="text-align:right;">Amount</th><th>Phone</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>${paymentRows || '<tr><td colspan="5">No payment transactions found.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `;
  };

  const buildSalesReportCsv = () => {
    if (salesItems.length === 0) throw new Error(`There are no sales transactions for this ${periodMeta.label.toLowerCase()}.`);
    const header = ['Product Name', 'Cost Price', 'Cashier', 'Selling Price', 'Quantity', 'Total Amount', 'Net Profit'];
    const rows = salesItems.map((item) => {
      const itemProfit = (item.selling_price - item.cost_price) * item.quantity;
      return [
        escapeCsv(item.product_name),
        escapeCsv(item.cost_price),
        escapeCsv(item.cashier_name),
        escapeCsv(item.selling_price),
        escapeCsv(item.quantity),
        escapeCsv(item.total),
        escapeCsv(itemProfit),
      ].join(',');
    });

    rows.push('');
    rows.push(['', '', '', '', '', 'NET PROFIT', escapeCsv(reportMetrics.netProfit)].join(','));
    return [header.join(','), ...rows].join('\n');
  };

  const buildAdvancedReportCsv = () => {
    if (payments.length === 0 && salesItems.length === 0) {
      throw new Error(`There is no data for this ${periodMeta.label.toLowerCase()}.`);
    }

    const header = ['Type', 'Amount', 'Phone', 'Status', 'Date'];
    const rows = payments.map((p) => [
      escapeCsv(p.payment_type),
      escapeCsv(Number(p.amount)),
      escapeCsv(p.payer_phone ?? '—'),
      escapeCsv(p.status),
      escapeCsv(format(new Date(p.initiated_at), 'dd MMM yyyy')),
    ].join(','));

    return [header.join(','), ...rows].join('\n');
  };

  const renderPdfToAppStorage = async (html: string) => {
    const printed = await Print.printToFileAsync({ html });
    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('Cannot access local storage on this device.');
    const dest = `${baseDir}smartbiz-${reportType}-report-${period}-${Date.now()}.pdf`;
    await FileSystem.copyAsync({ from: printed.uri, to: dest });
    return dest;
  };

  const getAndroidDownloadsUri = (fileName: string) => `file:///storage/emulated/0/Download/${fileName}`;

  const printReport = async () => {
    const html = reportType === 'sales' ? buildSalesReportPdf() : buildAdvancedReportPdf();
    await Print.printAsync({ html });
  };

  const sharePdf = async () => {
    if (Platform.OS === 'web') {
      const html = reportType === 'sales' ? buildSalesReportPdf() : buildAdvancedReportPdf();
      await Print.printAsync({ html });
      return;
    }

    const html = reportType === 'sales' ? buildSalesReportPdf() : buildAdvancedReportPdf();
    const localPdf = await renderPdfToAppStorage(html);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localPdf, {
        dialogTitle: `Share ${reportType} report PDF`,
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    Alert.alert('Saved', `PDF saved to app storage:\n${localPdf}`);
  };

  const saveCsvToDevice = async () => {
    const csvContent = reportType === 'sales' ? buildSalesReportCsv() : buildAdvancedReportCsv();
    const fileName = `smartbiz-${reportType}-report-${period}-${Date.now()}.csv`;

    if (Platform.OS === 'web') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    if (Platform.OS === 'android') {
      const targetUri = getAndroidDownloadsUri(fileName);
      try {
        await FileSystem.writeAsStringAsync(targetUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
        Alert.alert('Saved', `CSV saved to Downloads:\n${targetUri}`);
        return;
      } catch {
        // Some devices restrict direct Downloads writes in managed apps.
      }
    }

    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!baseDir) throw new Error('Cannot access local storage on this device.');
    const dest = `${baseDir}${fileName}`;
    await FileSystem.writeAsStringAsync(dest, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert('Saved', `CSV saved to app storage:\n${dest}`);
  };

  const handlePrintReport = async () => {
    setExporting(true);
    try {
      await printReport();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not print report.');
    } finally {
      setExporting(false);
    }
  };

  const handleSharePdf = async () => {
    setExporting(true);
    try {
      await sharePdf();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not export report PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadExcel = async () => {
    setExporting(true);
    try {
      await saveCsvToDevice();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not export Excel file.');
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

      {/* Report Type Toggle */}
      <View style={styles.reportTypeRow}>
        <TouchableOpacity
          style={[styles.reportTypeBtn, reportType === 'sales' && styles.reportTypeBtnActive]}
          onPress={() => setReportType('sales')}
          activeOpacity={0.7}
        >
          <Ionicons name="receipt-outline" size={16} color={reportType === 'sales' ? COLORS.white : COLORS.textSecondary} />
          <Text style={[styles.reportTypeText, reportType === 'sales' && styles.reportTypeTextActive]}>Sales Report</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.reportTypeBtn, reportType === 'advanced' && styles.reportTypeBtnActive]}
          onPress={() => setReportType('advanced')}
          activeOpacity={0.7}
        >
          <Ionicons name="bar-chart-outline" size={16} color={reportType === 'advanced' ? COLORS.white : COLORS.textSecondary} />
          <Text style={[styles.reportTypeText, reportType === 'advanced' && styles.reportTypeTextActive]}>Advanced Report</Text>
        </TouchableOpacity>
      </View>

      {/* Controls Section */}
      <View style={[styles.topRow, isMobile && styles.topRowMobile]}>
        <View style={styles.periodRow}>
          {([
            { key: 'day' as const, label: 'Day' },
            { key: 'week' as const, label: 'Week' },
            { key: 'month' as const, label: 'Month' },
          ] as const).map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
              onPress={() => setPeriod(p.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.exportBtnsRow}>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
            onPress={handlePrintReport}
            disabled={exporting}
            activeOpacity={0.85}
          >
            {exporting ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <>
                <Ionicons name="print-outline" size={16} color={COLORS.white} />
                <Text style={styles.exportBtnText}>Print</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.excelBtn, exporting && { opacity: 0.6 }]}
            onPress={handleDownloadExcel}
            disabled={exporting}
            activeOpacity={0.85}
          >
            <Ionicons name="document-outline" size={16} color={COLORS.success} />
            <Text style={styles.excelBtnText}>Excel</Text>
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
          <Text style={styles.loadingText}>Loading {reportType === 'sales' ? 'sales' : 'advanced'} report...</Text>
        </View>
      ) : (
        <>
          {reportType === 'sales' ? (
            <>
              {/* Sales Report */}
              <View style={styles.summaryGrid}>
                <View style={[styles.summaryCard, { backgroundColor: COLORS.success + '15', borderColor: COLORS.success + '40' }]}>
                  <View style={[styles.summaryIconBg, { backgroundColor: COLORS.success + '20' }]}>
                    <Ionicons name="cash-outline" size={20} color={COLORS.success} />
                  </View>
                  <Text style={styles.summaryLabel}>Total Revenue</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>TZS {reportMetrics.totalRevenue.toLocaleString()}</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: COLORS.info + '15', borderColor: COLORS.info + '40' }]}>
                  <View style={[styles.summaryIconBg, { backgroundColor: COLORS.info + '20' }]}>
                    <Ionicons name="cube-outline" size={20} color={COLORS.info} />
                  </View>
                  <Text style={styles.summaryLabel}>Items Sold</Text>
                  <Text style={styles.summaryValue}>{reportMetrics.totalItemsSold}</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: COLORS.accent + '15', borderColor: COLORS.accent + '40' }]}>
                  <View style={[styles.summaryIconBg, { backgroundColor: COLORS.accent + '20' }]}>
                    <Ionicons name="trending-up-outline" size={20} color={COLORS.accent} />
                  </View>
                  <Text style={styles.summaryLabel}>NET PROFIT</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.accent }]}>{reportMetrics.totalTransactions > 0 ? `TZS ${reportMetrics.netProfit.toLocaleString()}` : '—'}</Text>
                </View>
              </View>

              {/* Sales Details Table */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="receipt-outline" size={18} color={COLORS.info} />
                  <Text style={styles.cardTitle}>Sales Details</Text>
                </View>
                {salesItems.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <Ionicons name="cube-outline" size={32} color={COLORS.textMuted} />
                    <Text style={styles.emptyText}>No sales transactions in this period</Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
                    <View style={{ minWidth: isMobile ? 800 : 0, flex: 1 }}>
                      <View style={[styles.tableHeaderRow, styles.salesHeaderRow]}>
                        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Product</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Cost</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Selling</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Cashier</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'center' }]}>Qty</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 1.3, textAlign: 'right' }]}>Total</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 1.3, textAlign: 'right' }]}>Profit</Text>
                      </View>
                      {salesItems.map((item, idx) => {
                        const itemProfit = (item.selling_price - item.cost_price) * item.quantity;
                        return (
                          <View key={item.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                            <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{item.product_name}</Text>
                            <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right' }]}>TZS {item.cost_price.toLocaleString()}</Text>
                            <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right' }]}>TZS {item.selling_price.toLocaleString()}</Text>
                            <Text style={[styles.tableCell, { flex: 1.5 }]} numberOfLines={1}>{item.cashier_name}</Text>
                            <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'center', fontWeight: '600' }]}>{item.quantity}</Text>
                            <Text style={[styles.tableCell, { flex: 1.3, textAlign: 'right', fontWeight: '600', color: COLORS.success }]}>TZS {item.total.toLocaleString()}</Text>
                            <Text style={[styles.tableCell, { flex: 1.3, textAlign: 'right', fontWeight: '600', color: COLORS.accent }]}>TZS {itemProfit.toLocaleString()}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </View>

              {/* Net Profit Summary */}
              {salesItems.length > 0 && (
                <View style={[styles.profitSummaryCard, { borderColor: COLORS.accent + '40', backgroundColor: COLORS.accent + '08' }]}>
                  <View style={styles.profitSummaryRow}>
                    <View style={styles.profitSummaryItem}>
                      <Text style={styles.profitSummaryLabel}>Total Revenue</Text>
                      <Text style={[styles.profitSummaryValue, { color: COLORS.success }]}>
                        TZS {reportMetrics.totalRevenue.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.profitSummaryDivider} />
                    <View style={styles.profitSummaryItem}>
                      <Text style={styles.profitSummaryLabel}>Total Cost</Text>
                      <Text style={styles.profitSummaryValue}>
                        TZS {reportMetrics.totalCost.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.profitSummaryDivider} />
                    <View style={styles.profitSummaryItem}>
                      <Text style={[styles.profitSummaryLabel, { fontWeight: '800', color: COLORS.accent }]}>NET PROFIT</Text>
                      <Text style={[styles.profitSummaryValue, { color: COLORS.accent, fontSize: FONTS.sizes.lg }]}>
                        TZS {reportMetrics.netProfit.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </>
          ) : (
            <>
              {/* Advanced Report */}
              <View style={styles.summaryGrid}>
                <View style={[styles.summaryCard, { backgroundColor: COLORS.success + '15', borderColor: COLORS.success + '40' }]}>
                  <View style={[styles.summaryIconBg, { backgroundColor: COLORS.success + '20' }]}>
                    <Ionicons name="cash-outline" size={20} color={COLORS.success} />
                  </View>
                  <Text style={styles.summaryLabel}>Revenue</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>TZS {reportMetrics.totalRevenue.toLocaleString()}</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: COLORS.accent + '15', borderColor: COLORS.accent + '40' }]}>
                  <View style={[styles.summaryIconBg, { backgroundColor: COLORS.accent + '20' }]}>
                    <Ionicons name="trending-up-outline" size={20} color={COLORS.accent} />
                  </View>
                  <Text style={styles.summaryLabel}>Net Profit</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.accent }]}>TZS {reportMetrics.netProfit.toLocaleString()}</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: COLORS.info + '15', borderColor: COLORS.info + '40' }]}>
                  <View style={[styles.summaryIconBg, { backgroundColor: COLORS.info + '20' }]}>
                    <Ionicons name="card-outline" size={20} color={COLORS.info} />
                  </View>
                  <Text style={styles.summaryLabel}>Transactions</Text>
                  <Text style={styles.summaryValue}>{payments.length}</Text>
                </View>
              </View>

              {/* Payment Transactions */}
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
                        <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>Amount</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Phone</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Status</Text>
                        <Text style={[styles.tableHeaderCell, { flex: 1.1 }]}>Date</Text>
                      </View>
                      {payments.map((p, idx) => (
                        <View key={p.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                          <Text style={[styles.tableCell, { flex: 0.9 }]} numberOfLines={1}>{p.payment_type}</Text>
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

  /* Report Type Toggle */
  reportTypeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md, backgroundColor: COLORS.surface, padding: 4, borderRadius: RADIUS.lg },
  reportTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: 'transparent',
  },
  reportTypeBtnActive: { backgroundColor: COLORS.primary },
  reportTypeText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '600' },
  reportTypeTextActive: { color: COLORS.white, fontWeight: '700' },

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
  },
  periodBtnActive: { backgroundColor: COLORS.primary },
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
  },
  exportBtnText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '700' },
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
  },
  shareBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  excelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.success + '15',
    borderWidth: 1.5,
    borderColor: COLORS.success + '40',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  excelBtnText: { color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700' },

  /* Summary Cards */
  summaryGrid: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  summaryIconBg: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  summaryLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

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
  salesHeaderRow: { paddingHorizontal: SPACING.md },
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

  /* Net Profit Summary */
  profitSummaryCard: {
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  profitSummaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  profitSummaryItem: { flex: 1, alignItems: 'center' },
  profitSummaryDivider: { width: 1, height: 40, backgroundColor: COLORS.border, marginHorizontal: SPACING.sm },
  profitSummaryLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  profitSummaryValue: { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.text, marginTop: SPACING.xs },

  /* Status Badge */
  statusBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.white, textTransform: 'capitalize' },
});
