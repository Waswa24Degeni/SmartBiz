import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SPACING, RADIUS } from '../../../lib/constants';
import { BarChart } from './ReportCharts';

function fmtCurrency(n: number): string {
  return `TZS ${Math.round(n).toLocaleString()}`;
}

interface InventoryReportScreenProps {
  products: any[];
  inventoryMetrics: {
    totalProducts: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    catLabels: string[];
    catValues: number[];
  };
  generatePDFReport: () => void;
  generateExcelCSVReport: () => void;
}

export const InventoryReportScreen = ({
  products,
  inventoryMetrics,
  generatePDFReport,
  generateExcelCSVReport,
}: InventoryReportScreenProps) => {
  return (
    <View style={styles.tabContent}>
      {/* KPI metrics */}
      <Animated.View entering={FadeInDown.duration(200)} style={styles.reportMainCard}>
        <Text style={styles.sectionTitle}>Current Inventory Report</Text>
        <Text style={styles.sectionDesc}>Provide complete stock visibility.</Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Total Products</Text>
            <Text style={styles.kpiValue}>{inventoryMetrics.totalProducts}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>In Stock</Text>
            <Text style={[styles.kpiValue, { color: '#10B981' }]}>{inventoryMetrics.inStock}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Low Stock</Text>
            <Text style={[styles.kpiValue, { color: '#FFA500' }]}>{inventoryMetrics.lowStock}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Out of Stock</Text>
            <Text style={[styles.kpiValue, { color: '#EF4444' }]}>{inventoryMetrics.outOfStock}</Text>
          </View>
        </View>
      </Animated.View>

      {/* Charts */}
      <View style={styles.chartsRow}>
        {inventoryMetrics.catLabels.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Category Distribution</Text>
            <BarChart data={inventoryMetrics.catValues} labels={inventoryMetrics.catLabels} color="#006D77" />
          </View>
        )}
      </View>

      {/* Product Table */}
      <View style={styles.tableCard}>
        <Text style={styles.tableCardTitle}>Stock Valuation Summary</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tableContainer}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thText, { width: 140 }]}>Product Name</Text>
              <Text style={[styles.thText, { width: 80 }]}>SKU</Text>
              <Text style={[styles.thText, { width: 100 }]}>Category</Text>
              <Text style={[styles.thText, { width: 70, textAlign: 'center' }]}>Current Stock</Text>
              <Text style={[styles.thText, { width: 90, textAlign: 'right' }]}>Buying Price</Text>
              <Text style={[styles.thText, { width: 90, textAlign: 'right' }]}>Selling Price</Text>
              <Text style={[styles.thText, { width: 110, textAlign: 'right' }]}>Stock Value</Text>
            </View>
            {products.length === 0 ? (
              <Text style={styles.noDataRow}>No active products</Text>
            ) : (
              products.slice(0, 10).map((p) => {
                const val = (p.stock_quantity || 0) * (p.selling_price || 0);
                const lowStock = p.stock_quantity <= (p.low_stock_threshold || 0);
                return (
                  <View key={p.id} style={styles.tableDataRow}>
                    <Text style={[styles.tdText, styles.tdOrderNum, { width: 140 }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.tdText, { width: 80 }]} numberOfLines={1}>{p.sku || '—'}</Text>
                    <Text style={[styles.tdText, { width: 100 }]}>{p.categories?.name || 'Uncategorized'}</Text>
                    <Text style={[styles.tdText, { width: 70, textAlign: 'center', fontWeight: '700', color: lowStock ? '#EF4444' : '#10B981' }]}>{p.stock_quantity}</Text>
                    <Text style={[styles.tdText, { width: 90, textAlign: 'right' }]}>{fmtCurrency(p.purchase_price || 0)}</Text>
                    <Text style={[styles.tdText, { width: 90, textAlign: 'right' }]}>{fmtCurrency(p.selling_price || 0)}</Text>
                    <Text style={[styles.tdText, styles.tdAmount, { width: 110, textAlign: 'right' }]}>{fmtCurrency(val)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Action buttons inside the card */}
        <View style={styles.cardActionsRow}>
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
