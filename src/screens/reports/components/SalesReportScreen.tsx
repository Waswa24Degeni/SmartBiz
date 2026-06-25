import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { format } from 'date-fns';
import { SPACING, RADIUS } from '../../../lib/constants';
import { LineChart } from './ReportCharts';

function fmtCurrency(n: number): string {
  return `TZS ${Math.round(n).toLocaleString()}`;
}

interface SaleItem {
  id: string;
  product_name: string;
  cost_price: number;
  selling_price: number;
  cashier_name: string;
  quantity: number;
  total: number;
  created_at: string;
  _category?: string;
  _product_id?: string;
  _order_number?: string;
  _payment_method?: string;
}

interface SalesReportScreenProps {
  salesItems: SaleItem[];
  metrics: {
    totalRevenue: number;
    txCount: number;
    avgSale: number;
  };
  chartData: {
    values: number[];
    labels: string[];
    orders: number[];
  };
  topProductsList: Array<{ name: string; quantity: number; value: number }>;
  generatePDFReport: () => void;
  generateExcelCSVReport: () => void;
  setExportSheetVisible: (visible: boolean) => void;
}

export const SalesReportScreen = ({
  salesItems,
  metrics,
  chartData,
  topProductsList,
  generatePDFReport,
  generateExcelCSVReport,
  setExportSheetVisible,
}: SalesReportScreenProps) => {
  return (
    <View style={styles.tabContent}>
      {/* Analytics details */}
      <Animated.View entering={FadeInDown.duration(200)} style={styles.reportMainCard}>
        <Text style={styles.sectionTitle}>Sales Report</Text>
        <Text style={styles.sectionDesc}>Complete sales performance analysis.</Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Total Revenue</Text>
            <Text style={styles.kpiValue} numberOfLines={1}>{fmtCurrency(metrics.totalRevenue)}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Total Orders</Text>
            <Text style={styles.kpiValue}>{metrics.txCount}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Average Order Value</Text>
            <Text style={styles.kpiValue} numberOfLines={1}>{fmtCurrency(metrics.avgSale)}</Text>
          </View>
        </View>
      </Animated.View>

      {/* Charts */}
      <View style={styles.chartsRow}>
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Revenue Trend Chart</Text>
          <LineChart data={chartData.values} labels={chartData.labels} color="#0165FC" />
        </View>
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Orders Trend Chart</Text>
          <LineChart data={chartData.orders} labels={chartData.labels} color="#006D77" />
        </View>
      </View>

      {/* Top selling products list */}
      {topProductsList.length > 0 && (
        <View style={styles.tableCard}>
          <Text style={styles.tableCardTitle}>Top Selling Products</Text>
          {topProductsList.map((p, i) => (
            <View key={i} style={styles.listItemRow}>
              <View style={styles.listItemLeft}>
                <Text style={styles.listItemBadge}>{i + 1}</Text>
                <Text style={styles.listItemName}>{p.name}</Text>
              </View>
              <View style={styles.listItemRight}>
                <Text style={styles.listItemVal}>{p.quantity} sold</Text>
                <Text style={styles.listItemSubVal}>{fmtCurrency(p.value)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Detailed Sales Data Table */}
      <View style={styles.tableCard}>
        <Text style={styles.tableCardTitle}>Sales Ledger</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tableContainer}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thText, { width: 90 }]}>Order Number</Text>
              <Text style={[styles.thText, { width: 120 }]}>Customer</Text>
              <Text style={[styles.thText, { width: 90 }]}>Date</Text>
              <Text style={[styles.thText, { width: 60, textAlign: 'center' }]}>Items</Text>
              <Text style={[styles.thText, { width: 110, textAlign: 'right' }]}>Amount</Text>
              <Text style={[styles.thText, { width: 100 }]}>Payment Method</Text>
            </View>
            {salesItems.length === 0 ? (
              <Text style={styles.noDataRow}>No transactions logged</Text>
            ) : (
              salesItems.slice(0, 10).map((item) => (
                <View key={item.id} style={styles.tableDataRow}>
                  <Text style={[styles.tdText, styles.tdOrderNum, { width: 90 }]}>#{item._order_number || '—'}</Text>
                  <Text style={[styles.tdText, { width: 120 }]} numberOfLines={1}>{item.cashier_name}</Text>
                  <Text style={[styles.tdText, { width: 90 }]}>{format(new Date(item.created_at), 'dd MMM yyyy')}</Text>
                  <Text style={[styles.tdText, { width: 60, textAlign: 'center' }]}>{item.quantity}</Text>
                  <Text style={[styles.tdText, styles.tdAmount, { width: 110, textAlign: 'right' }]}>{fmtCurrency(item.total)}</Text>
                  <Text style={[styles.tdText, styles.tdPayment, { width: 100 }]}>{item._payment_method || 'cash'}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Action buttons inside the card */}
        <View style={styles.cardActionsRow}>
          <TouchableOpacity style={styles.cardActionBtn} onPress={() => setExportSheetVisible(true)}>
            <Ionicons name="eye-outline" size={14} color="#0165FC" />
            <Text style={styles.cardActionBtnText}>View Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardActionBtn} onPress={generatePDFReport}>
            <Ionicons name="download-outline" size={14} color="#0165FC" />
            <Text style={styles.cardActionBtnText}>Download PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardActionBtn} onPress={generateExcelCSVReport}>
            <Ionicons name="document-text-outline" size={14} color="#0165FC" />
            <Text style={styles.cardActionBtnText}>Export Excel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabContent: {
    gap: SPACING.md,
  },
  reportMainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: SPACING.lg,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  sectionDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  kpiCell: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
  },
  chartsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  chartCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: SPACING.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginBottom: SPACING.sm,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: SPACING.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  tableCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginBottom: SPACING.md,
  },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listItemBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
  },
  listItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  listItemRight: {
    alignItems: 'flex-end',
  },
  listItemVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  listItemSubVal: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },
  tableContainer: {
    flexDirection: 'column',
    minWidth: '100%',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
    marginBottom: 4,
  },
  thText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 10,
    alignItems: 'center',
  },
  tdText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  tdOrderNum: {
    fontWeight: '700',
    color: '#111827',
  },
  tdAmount: {
    fontWeight: '800',
    color: '#111827',
  },
  tdPayment: {
    textTransform: 'uppercase',
    fontSize: 10,
    color: '#6B7280',
  },
  noDataRow: {
    paddingVertical: 16,
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0165FC',
  },
});
