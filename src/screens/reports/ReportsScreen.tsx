import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert,
  useWindowDimensions, Platform, RefreshControl,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../lib/hooks';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../lib/constants';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, subDays } from 'date-fns';

// Sub-components
import { ReportsHeader } from './components/ReportsHeader';
import { ReportTabs, type ReportTab } from './components/ReportTabs';
import { PeriodSelector, type Period } from './components/PeriodSelector';
import { QuickStats } from './components/QuickStats';
import { KPIGrid, type KPIItem } from './components/KPIGrid';
import { SalesChart } from './components/SalesChart';
import { CategoryBreakdown } from './components/CategoryBreakdown';
import { TopProducts } from './components/TopProducts';
import { SalesDetailList, type SaleItem } from './components/SalesDetailList';
import { InventoryReport } from './components/InventoryReport';
import { CustomerReport } from './components/CustomerReport';
import { InsightsCard } from './components/InsightsCard';
import { ExportSheet } from './components/ExportSheet';

/* ─── helpers ──────────────────────────────────────────── */

function getPeriodDays(period: Period): number {
  switch (period) {
    case 'day': return 1;
    case 'week': return 7;
    case 'month': return 30;
    case 'year': return 365;
  }
}

function getPeriodLabel(period: Period): string {
  switch (period) {
    case 'day': return 'Today';
    case 'week': return 'This Week';
    case 'month': return 'This Month';
    case 'year': return 'This Year';
  }
}

function getDateRangeLabel(period: Period): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - getPeriodDays(period));
  return `${format(start, 'dd MMM')} — ${format(now, 'dd MMM yyyy')}`;
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `TZS ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `TZS ${(n / 1_000).toFixed(1)}K`;
  return `TZS ${n.toLocaleString()}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeCsv(value: string | number) {
  const safe = String(value ?? '');
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

const CATEGORY_COLORS = ['#0D9488', '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'];

/* ─── main component ───────────────────────────────────── */

export function ReportsScreen() {
  const { business } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);

  // Data
  const [salesItems, setSalesItems] = useState<SaleItem[]>([]);
  const [prevSalesItems, setPrevSalesItems] = useState<SaleItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSales, setCustomerSales] = useState<Map<string, { spend: number; count: number }>>(new Map());

  const sinceDate = useMemo(() => {
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() - getPeriodDays(period));
    return d.toISOString();
  }, [period]);

  const prevSinceDate = useMemo(() => {
    const days = getPeriodDays(period);
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() - days * 2);
    return d.toISOString();
  }, [period]);

  /* ─── data fetching ────────────────────────── */

  const fetchSalesReport = useCallback(async (silent = false) => {
    if (!business?.id) { setLoading(false); return; }
    if (!silent) setLoading(true);

    try {
      // Current period sales
      const { data: sales } = await supabase
        .from('sales')
        .select('id, cashier_id, created_at, customer_id, cashier:users(full_name)')
        .eq('business_id', business.id)
        .gte('created_at', sinceDate)
        .not('status', 'eq', 'cancelled');

      const saleIds = (sales ?? []).map((s: any) => s.id);
      const salesDataMap = new Map<string, { cashier_name: string; created_at: string; customer_id: string | null }>();
      (sales ?? []).forEach((s: any) => {
        salesDataMap.set(s.id, {
          cashier_name: (s.cashier as any)?.full_name ?? 'Unknown',
          created_at: s.created_at,
          customer_id: s.customer_id ?? null,
        });
      });

      // Build customer sales map
      const custMap = new Map<string, { spend: number; count: number }>();
      (sales ?? []).forEach((s: any) => {
        if (s.customer_id) {
          const existing = custMap.get(s.customer_id) ?? { spend: 0, count: 0 };
          existing.count += 1;
          custMap.set(s.customer_id, existing);
        }
      });

      let items: SaleItem[] = [];
      if (saleIds.length > 0) {
        const { data } = await supabase
          .from('sale_items')
          .select('id, quantity, unit_price, total, sale_id, product_id')
          .in('sale_id', saleIds);

        const productIds = [...new Set((data ?? []).map((item: any) => item.product_id))];
        const { data: productsData } = await supabase
          .from('products')
          .select('id, name, purchase_price, category_id, categories(name)')
          .in('id', productIds);

        const productsMap = new Map<string, any>();
        (productsData ?? []).forEach((p: any) => {
          productsMap.set(p.id, { name: p.name, purchase_price: Number(p.purchase_price) || 0, category: (p.categories as any)?.name ?? 'Uncategorized' });
        });

        items = (data ?? []).map((item: any) => {
          const saleData = salesDataMap.get(item.sale_id);
          // Update customer spend
          const custId = (sales ?? []).find((s: any) => s.id === item.sale_id)?.customer_id;
          if (custId) {
            const c = custMap.get(custId) ?? { spend: 0, count: 0 };
            c.spend += Number(item.total) || 0;
            custMap.set(custId, c);
          }
          return {
            id: item.id,
            product_name: productsMap.get(item.product_id)?.name ?? 'Unknown',
            cost_price: productsMap.get(item.product_id)?.purchase_price ?? 0,
            selling_price: Number(item.unit_price) || 0,
            cashier_name: saleData?.cashier_name ?? 'Unknown',
            quantity: Number(item.quantity) || 0,
            total: Number(item.total) || 0,
            created_at: saleData?.created_at ?? new Date().toISOString(),
            _category: productsMap.get(item.product_id)?.category ?? 'Uncategorized',
            _product_id: item.product_id,
          };
        }) as any;
      }

      setSalesItems(items);
      setCustomerSales(custMap);

      // Previous period for trends
      const prevEnd = sinceDate;
      const { data: prevSales } = await supabase
        .from('sales')
        .select('id')
        .eq('business_id', business.id)
        .gte('created_at', prevSinceDate)
        .lt('created_at', prevEnd)
        .not('status', 'eq', 'cancelled');

      const prevSaleIds = (prevSales ?? []).map((s: any) => s.id);
      if (prevSaleIds.length > 0) {
        const { data: prevItemsData } = await supabase
          .from('sale_items')
          .select('id, quantity, unit_price, total, sale_id, product_id')
          .in('sale_id', prevSaleIds);

        const prevProductIds = [...new Set((prevItemsData ?? []).map((item: any) => item.product_id))];
        const { data: prevProdsData } = await supabase
          .from('products')
          .select('id, purchase_price')
          .in('id', prevProductIds);

        const prevProdsMap = new Map<string, number>();
        (prevProdsData ?? []).forEach((p: any) => prevProdsMap.set(p.id, Number(p.purchase_price) || 0));

        setPrevSalesItems((prevItemsData ?? []).map((item: any) => ({
          id: item.id,
          product_name: '',
          cost_price: prevProdsMap.get(item.product_id) ?? 0,
          selling_price: Number(item.unit_price) || 0,
          cashier_name: '',
          quantity: Number(item.quantity) || 0,
          total: Number(item.total) || 0,
          created_at: '',
        })));
      } else {
        setPrevSalesItems([]);
      }
    } catch (err: any) {
      console.error('Error fetching sales report:', err);
      if (!silent) Alert.alert('Error', err.message || 'Failed to fetch report');
      setSalesItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business?.id, sinceDate, prevSinceDate]);

  const fetchInventoryData = useCallback(async () => {
    if (!business?.id) return;
    const { data } = await supabase
      .from('products')
      .select('id, name, selling_price, purchase_price, stock_quantity, low_stock_threshold, is_active')
      .eq('business_id', business.id)
      .eq('is_active', true);
    setProducts(data ?? []);
  }, [business?.id]);

  const fetchCustomerData = useCallback(async () => {
    if (!business?.id) return;
    const { data } = await supabase
      .from('customers')
      .select('id, name, created_at')
      .eq('business_id', business.id);
    setCustomers(data ?? []);
  }, [business?.id]);

  useEffect(() => {
    fetchSalesReport();
    fetchInventoryData();
    fetchCustomerData();
  }, [fetchSalesReport, fetchInventoryData, fetchCustomerData]);

  const realtimeEnabled = !!business?.id && Platform.OS !== 'web';
  useRealtimeSubscription('reports-sales-rt', 'sales', () => fetchSalesReport(true), realtimeEnabled);
  useRealtimeSubscription('reports-items-rt', 'sale_items', () => fetchSalesReport(true), realtimeEnabled);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSalesReport();
    fetchInventoryData();
    fetchCustomerData();
  }, [fetchSalesReport, fetchInventoryData, fetchCustomerData]);

  /* ─── computed metrics ─────────────────────── */

  const metrics = useMemo(() => {
    const totalRevenue = salesItems.reduce((s, i) => s + i.total, 0);
    const totalCost = salesItems.reduce((s, i) => s + (i.cost_price * i.quantity), 0);
    const netProfit = totalRevenue - totalCost;
    const totalItemsSold = salesItems.reduce((s, i) => s + i.quantity, 0);
    const totalTransactions = salesItems.length;
    const avgSale = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const prevRevenue = prevSalesItems.reduce((s, i) => s + i.total, 0);
    const prevProfit = prevSalesItems.reduce((s, i) => s + i.total - (i.cost_price * i.quantity), 0);
    const prevItems = prevSalesItems.reduce((s, i) => s + i.quantity, 0);
    const prevTx = prevSalesItems.length;

    const trendRev = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const trendProfit = prevProfit > 0 ? ((netProfit - prevProfit) / prevProfit) * 100 : 0;
    const trendItems = prevItems > 0 ? ((totalItemsSold - prevItems) / prevItems) * 100 : 0;
    const trendTx = prevTx > 0 ? ((totalTransactions - prevTx) / prevTx) * 100 : 0;

    return {
      totalRevenue, totalCost, netProfit, totalItemsSold,
      totalTransactions, avgSale,
      trendRev, trendProfit, trendItems, trendTx,
    };
  }, [salesItems, prevSalesItems]);

  const quickStatsData = useMemo(() => [
    { label: "Revenue", value: fmtCurrency(metrics.totalRevenue), icon: 'cash-outline', color: COLORS.success },
    { label: "Profit", value: fmtCurrency(metrics.netProfit), icon: 'trending-up-outline', color: COLORS.primary },
    { label: "Orders", value: String(metrics.totalTransactions), icon: 'receipt-outline', color: COLORS.info },
    { label: "Items", value: String(metrics.totalItemsSold), icon: 'cube-outline', color: COLORS.accent },
  ], [metrics]);

  const kpiItems = useMemo((): KPIItem[] => [
    { label: 'Total Revenue', value: fmtCurrency(metrics.totalRevenue), icon: 'cash-outline', color: COLORS.success, trend: metrics.trendRev },
    { label: 'Net Profit', value: fmtCurrency(metrics.netProfit), icon: 'trending-up-outline', color: COLORS.primary, trend: metrics.trendProfit },
    { label: 'Items Sold', value: String(metrics.totalItemsSold), icon: 'cube-outline', color: COLORS.info, trend: metrics.trendItems },
    { label: 'Transactions', value: String(metrics.totalTransactions), icon: 'receipt-outline', color: COLORS.accent, trend: metrics.trendTx },
    { label: 'Avg Sale', value: fmtCurrency(metrics.avgSale), icon: 'calculator-outline', color: '#8B5CF6' },
    { label: 'Low Stock', value: String(products.filter(p => p.stock_quantity <= p.low_stock_threshold).length), icon: 'warning-outline', color: COLORS.warning },
  ], [metrics, products]);

  // Chart data — sales by time bucket
  const chartData = useMemo(() => {
    if (period === 'day') {
      const buckets = [9, 12, 15, 18, 21];
      const labels = ['9AM', '12PM', '3PM', '6PM', '9PM'];
      const values = buckets.map((h) => {
        const now = new Date();
        const from = new Date(now); from.setHours(h, 0, 0, 0);
        const to = new Date(now); to.setHours(h + 2, 59, 59, 999);
        return salesItems
          .filter((s) => { const d = new Date(s.created_at); return d >= from && d <= to; })
          .reduce((sum, s) => sum + s.total, 0);
      });
      return { labels, values };
    }
    if (period === 'week') {
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const values = [0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const target = new Date(weekStart);
        target.setDate(target.getDate() + dayOffset);
        const nextDay = new Date(target);
        nextDay.setDate(nextDay.getDate() + 1);
        return salesItems
          .filter((s) => { const d = new Date(s.created_at); return d >= target && d < nextDay; })
          .reduce((sum, s) => sum + s.total, 0);
      });
      return { labels, values };
    }
    // month/year — show weeks
    const labels = ['W1', 'W2', 'W3', 'W4'];
    const now = new Date();
    const mStart = startOfMonth(now);
    const values = [0, 1, 2, 3].map((wk) => {
      const from = new Date(mStart);
      from.setDate(from.getDate() + wk * 7);
      const to = new Date(from);
      to.setDate(to.getDate() + 7);
      return salesItems
        .filter((s) => { const d = new Date(s.created_at); return d >= from && d < to; })
        .reduce((sum, s) => sum + s.total, 0);
    });
    return { labels, values };
  }, [salesItems, period]);

  // Category breakdown
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    (salesItems as any[]).forEach((item) => {
      const cat = item._category ?? 'Uncategorized';
      map.set(cat, (map.get(cat) ?? 0) + item.total);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map((([name, value], i) => ({
        name,
        value,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      })));
  }, [salesItems]);

  // Top products
  const topProductsData = useMemo(() => {
    const map = new Map<string, { value: number; quantity: number }>();
    salesItems.forEach((item) => {
      const existing = map.get(item.product_name) ?? { value: 0, quantity: 0 };
      existing.value += item.total;
      existing.quantity += item.quantity;
      map.set(item.product_name, existing);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 8)
      .map(([name, data]) => ({ name, ...data }));
  }, [salesItems]);

  // Inventory report data
  const inventoryData = useMemo(() => {
    const productSales = new Map<string, { quantity: number; revenue: number }>();
    salesItems.forEach((item) => {
      const key = (item as any)._product_id ?? item.product_name;
      const existing = productSales.get(key) ?? { quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += item.total;
      productSales.set(key, existing);
    });

    const enriched = products.map((p) => {
      const sales = productSales.get(p.id) ?? { quantity: 0, revenue: 0 };
      const margin = p.selling_price > 0 ? ((p.selling_price - (p.purchase_price ?? 0)) / p.selling_price) * 100 : 0;
      return { ...p, sold: sales.quantity, revenue: sales.revenue, profit_margin: margin };
    });

    return {
      topSelling: enriched.filter((p) => p.sold > 0).sort((a, b) => b.sold - a.sold).slice(0, 5).map((p) => ({
        name: p.name, quantity: p.sold, revenue: p.revenue, stock: p.stock_quantity, low_stock_threshold: p.low_stock_threshold, profit_margin: p.profit_margin,
      })),
      slowMoving: enriched.filter((p) => p.sold === 0 || p.sold <= 2).sort((a, b) => a.sold - b.sold).slice(0, 5).map((p) => ({
        name: p.name, quantity: p.sold, revenue: p.revenue, stock: p.stock_quantity, low_stock_threshold: p.low_stock_threshold, profit_margin: p.profit_margin,
      })),
      lowStock: enriched.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold).slice(0, 5).map((p) => ({
        name: p.name, quantity: p.sold, revenue: p.revenue, stock: p.stock_quantity, low_stock_threshold: p.low_stock_threshold, profit_margin: p.profit_margin,
      })),
      outOfStock: enriched.filter((p) => p.stock_quantity === 0).slice(0, 5).map((p) => ({
        name: p.name, quantity: p.sold, revenue: p.revenue, stock: p.stock_quantity, low_stock_threshold: p.low_stock_threshold, profit_margin: p.profit_margin,
      })),
      mostProfitable: enriched.filter((p) => p.sold > 0).sort((a, b) => b.profit_margin - a.profit_margin).slice(0, 5).map((p) => ({
        name: p.name, quantity: p.sold, revenue: p.revenue, stock: p.stock_quantity, low_stock_threshold: p.low_stock_threshold, profit_margin: p.profit_margin,
      })),
    };
  }, [products, salesItems]);

  // Customer report data
  const customerReportData = useMemo(() => {
    const customerNames = new Map<string, string>();
    customers.forEach((c: any) => customerNames.set(c.id, c.name));

    const topCustomers = Array.from(customerSales.entries())
      .map(([id, data]) => ({
        name: customerNames.get(id) ?? 'Unknown',
        total_spend: data.spend,
        order_count: data.count,
      }))
      .sort((a, b) => b.total_spend - a.total_spend)
      .slice(0, 8);

    const totalWithSales = customerSales.size;
    const repeatCustomers = Array.from(customerSales.values()).filter((c) => c.count > 1).length;
    const repeatRate = totalWithSales > 0 ? (repeatCustomers / totalWithSales) * 100 : 0;
    const totalSpend = Array.from(customerSales.values()).reduce((s, c) => s + c.spend, 0);
    const avgSpend = totalWithSales > 0 ? totalSpend / totalWithSales : 0;

    const newCustomers = customers.filter((c: any) => new Date(c.created_at) >= new Date(sinceDate)).length;

    return { topCustomers, repeatRate, avgSpend, newCustomers, totalCustomers: customers.length };
  }, [customerSales, customers, sinceDate]);

  // Insights
  const insights = useMemo(() => {
    const list: string[] = [];
    if (metrics.trendRev > 0) list.push(`Revenue increased by ${metrics.trendRev.toFixed(0)}% compared to last period.`);
    else if (metrics.trendRev < 0) list.push(`Revenue decreased by ${Math.abs(metrics.trendRev).toFixed(0)}% compared to last period.`);

    if (topProductsData.length > 0) list.push(`${topProductsData[0].name} is your best seller with ${topProductsData[0].quantity} units sold.`);

    const lowStockCount = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold).length;
    if (lowStockCount > 0) list.push(`${lowStockCount} product${lowStockCount > 1 ? 's are' : ' is'} below stock threshold.`);

    if (metrics.avgSale > 0) list.push(`Average transaction value is ${fmtCurrency(metrics.avgSale)}.`);

    const outOfStockCount = products.filter((p) => p.stock_quantity === 0).length;
    if (outOfStockCount > 0) list.push(`${outOfStockCount} product${outOfStockCount > 1 ? 's are' : ' is'} out of stock.`);

    if (customerReportData.repeatRate > 0) list.push(`${customerReportData.repeatRate.toFixed(0)}% of customers are repeat buyers.`);

    return list;
  }, [metrics, topProductsData, products, customerReportData]);

  /* ─── export logic ─────────────────────────── */

  const buildSalesReportPdf = useCallback(() => {
    if (!business?.id) throw new Error('Business context is missing.');
    if (salesItems.length === 0) throw new Error('No sales transactions for this period.');

    const reportDate = format(new Date(), 'dd MMM yyyy, HH:mm');
    const rows = salesItems.map((item) => {
      const profit = (item.selling_price - item.cost_price) * item.quantity;
      return `<tr><td>${escapeHtml(item.product_name)}</td><td style="text-align:right;">TZS ${item.cost_price.toLocaleString()}</td><td style="text-align:right;">TZS ${item.selling_price.toLocaleString()}</td><td>${escapeHtml(item.cashier_name)}</td><td style="text-align:center;">${item.quantity}</td><td style="text-align:right;">TZS ${item.total.toLocaleString()}</td><td style="text-align:right;">TZS ${profit.toLocaleString()}</td></tr>`;
    }).join('');

    return `<html><head><meta charset="utf-8"/><style>body{font-family:-apple-system,sans-serif;color:#111827;padding:24px}h1{font-size:22px;margin:0 0 8px}.meta{color:#4B5563;font-size:12px;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #E5E7EB;padding:8px;text-align:left}th{background:#F3F4F6;font-weight:700}.summary{display:flex;gap:20px;margin-top:20px;padding-top:16px;border-top:2px solid #E5E7EB;flex-wrap:wrap}.summary-label{color:#6B7280;font-size:11px;font-weight:700;text-transform:uppercase}.summary-value{font-size:16px;font-weight:800;color:#111827;margin-top:4px}.profit{color:#10B981}</style></head><body><h1>${escapeHtml(business.name)} - Sales Report</h1><div class="meta">Period: ${getPeriodLabel(period)} • Generated: ${reportDate}</div><table><thead><tr><th>Product</th><th style="text-align:right;">Cost</th><th style="text-align:right;">Selling</th><th>Cashier</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Total</th><th style="text-align:right;">Profit</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><div><div class="summary-label">Revenue</div><div class="summary-value">TZS ${metrics.totalRevenue.toLocaleString()}</div></div><div><div class="summary-label">Cost</div><div class="summary-value">TZS ${metrics.totalCost.toLocaleString()}</div></div><div><div class="summary-label profit">NET PROFIT</div><div class="summary-value profit">TZS ${metrics.netProfit.toLocaleString()}</div></div></div></body></html>`;
  }, [business, salesItems, metrics, period]);

  const buildCsv = useCallback(() => {
    if (salesItems.length === 0) throw new Error('No sales transactions for this period.');
    const header = ['Product', 'Cost Price', 'Selling Price', 'Cashier', 'Quantity', 'Total', 'Profit'];
    const rows = salesItems.map((item) => {
      const profit = (item.selling_price - item.cost_price) * item.quantity;
      return [escapeCsv(item.product_name), escapeCsv(item.cost_price), escapeCsv(item.selling_price), escapeCsv(item.cashier_name), escapeCsv(item.quantity), escapeCsv(item.total), escapeCsv(profit)].join(',');
    });
    rows.push('');
    rows.push(['', '', '', '', '', 'NET PROFIT', escapeCsv(metrics.netProfit)].join(','));
    return [header.join(','), ...rows].join('\n');
  }, [salesItems, metrics]);

  const handlePrint = useCallback(async () => {
    setExporting(true);
    try {
      await Print.printAsync({ html: buildSalesReportPdf() });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not print.');
    } finally {
      setExporting(false);
    }
  }, [buildSalesReportPdf]);

  const handleExcel = useCallback(async () => {
    setExporting(true);
    try {
      const csv = buildCsv();
      const fileName = `smartbiz-report-${period}-${Date.now()}.csv`;
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.setAttribute('download', fileName);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }
      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) throw new Error('Cannot access storage.');
      const dest = `${baseDir}${fileName}`;
      await FileSystem.writeAsStringAsync(dest, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, { mimeType: 'text/csv', dialogTitle: 'Export CSV' });
      } else {
        Alert.alert('Saved', `CSV saved to: ${dest}`);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not export.');
    } finally {
      setExporting(false);
    }
  }, [buildCsv, period]);

  const handleSharePdf = useCallback(async () => {
    setExporting(true);
    try {
      const html = buildSalesReportPdf();
      if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
      const printed = await Print.printToFileAsync({ html });
      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) throw new Error('Cannot access storage.');
      const dest = `${baseDir}smartbiz-report-${period}-${Date.now()}.pdf`;
      await FileSystem.copyAsync({ from: printed.uri, to: dest });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, { mimeType: 'application/pdf', dialogTitle: 'Share Report PDF', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('Saved', `PDF saved to: ${dest}`);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not share PDF.');
    } finally {
      setExporting(false);
    }
  }, [buildSalesReportPdf, period]);

  /* ─── render ───────────────────────────────── */

  const renderSalesTab = () => (
    <>
      <KPIGrid items={kpiItems} />
      <SalesChart title="Sales Trend" subtitle={getPeriodLabel(period)} labels={chartData.labels} values={chartData.values} />
      {categoryData.length > 0 && <CategoryBreakdown title="Category Breakdown" items={categoryData} />}
      {topProductsData.length > 0 && <TopProducts title="Top Products" items={topProductsData} />}
      <SalesDetailList items={salesItems} />
    </>
  );

  const renderProfitTab = () => {
    const profitKpi: KPIItem[] = [
      { label: 'Gross Revenue', value: fmtCurrency(metrics.totalRevenue), icon: 'cash-outline', color: COLORS.success, trend: metrics.trendRev },
      { label: 'Total Cost', value: fmtCurrency(metrics.totalCost), icon: 'cart-outline', color: COLORS.error },
      { label: 'Net Profit', value: fmtCurrency(metrics.netProfit), icon: 'trending-up-outline', color: COLORS.primary, trend: metrics.trendProfit },
      { label: 'Profit Margin', value: metrics.totalRevenue > 0 ? `${((metrics.netProfit / metrics.totalRevenue) * 100).toFixed(1)}%` : '0%', icon: 'pie-chart-outline', color: COLORS.accent },
    ];
    return (
      <>
        <KPIGrid items={profitKpi} />
        <SalesChart title="Profit Trend" subtitle={getPeriodLabel(period)} labels={chartData.labels} values={chartData.values.map((v, i) => {
          // Approximate profit per bucket
          const ratio = metrics.totalRevenue > 0 ? metrics.netProfit / metrics.totalRevenue : 0;
          return Math.max(0, Math.round(v * ratio));
        })} />
        {topProductsData.length > 0 && (
          <TopProducts title="Most Profitable Products" items={topProductsData.map((p) => {
            const item = salesItems.find((s) => s.product_name === p.name);
            const profitPerUnit = item ? item.selling_price - item.cost_price : 0;
            return { ...p, value: profitPerUnit * p.quantity };
          }).sort((a, b) => b.value - a.value)} />
        )}
        <SalesDetailList items={salesItems} />
      </>
    );
  };

  const renderInventoryTab = () => (
    <InventoryReport
      topSelling={inventoryData.topSelling}
      slowMoving={inventoryData.slowMoving}
      lowStock={inventoryData.lowStock}
      outOfStock={inventoryData.outOfStock}
      mostProfitable={inventoryData.mostProfitable}
    />
  );

  const renderCustomersTab = () => (
    <CustomerReport
      topCustomers={customerReportData.topCustomers}
      repeatRate={customerReportData.repeatRate}
      avgSpend={customerReportData.avgSpend}
      newCustomers={customerReportData.newCustomers}
      totalCustomers={customerReportData.totalCustomers}
    />
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'sales': return renderSalesTab();
      case 'profit': return renderProfitTab();
      case 'inventory': return renderInventoryTab();
      case 'customers': return renderCustomersTab();
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        <ReportsHeader
          businessName={business?.name ?? ''}
          dateRangeLabel={getDateRangeLabel(period)}
          onRefresh={onRefresh}
          onExport={() => setExportSheetVisible(true)}
          refreshing={refreshing}
        />

        <ReportTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <PeriodSelector period={period} onPeriodChange={setPeriod} />
        <QuickStats stats={quickStatsData} />

        {insights.length > 0 && <InsightsCard insights={insights} />}

        {renderActiveTab()}
      </ScrollView>

      {loading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      )}

      <ExportSheet
        visible={exportSheetVisible}
        onClose={() => setExportSheetVisible(false)}
        onPrint={handlePrint}
        onExcel={handleExcel}
        onSharePdf={handleSharePdf}
        exporting={exporting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: {
    padding: SPACING.base,
    gap: SPACING.md,
    paddingBottom: SPACING['3xl'],
  },
  contentMobile: {
    paddingHorizontal: SPACING.md,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    zIndex: 20,
    elevation: 20,
  },
});
