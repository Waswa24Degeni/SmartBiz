import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SPACING, RADIUS } from '../../../lib/constants';
import { LineChart, BarChart } from './ReportCharts';

function fmtCurrency(n: number): string {
  return `TZS ${Math.round(n).toLocaleString()}`;
}

function getPeriodLabel(period: 'day' | 'week' | 'month' | 'year'): string {
  switch (period) {
    case 'day': return 'Today';
    case 'week': return 'This Week';
    case 'month': return 'This Month';
    case 'year': return 'This Year';
  }
}

interface ProfitReportScreenProps {
  metrics: {
    totalRevenue: number;
    totalCost: number;
  };
  totalExpensesMetrics: number;
  chartData: {
    values: number[];
    labels: string[];
    expValues: number[];
  };
  period: 'day' | 'week' | 'month' | 'year';
  generatePDFReport: () => void;
  setExportSheetVisible: (visible: boolean) => void;
}

export const ProfitReportScreen = ({
  metrics,
  totalExpensesMetrics,
  chartData,
  period,
  generatePDFReport,
  setExportSheetVisible,
}: ProfitReportScreenProps) => {
  const netPL = metrics.totalRevenue - metrics.totalCost - totalExpensesMetrics;

  return (
    <View style={styles.tabContent}>
      {/* Formula banner */}
      <Animated.View entering={FadeInDown.duration(200)} style={styles.reportMainCard}>
        <Text style={styles.sectionTitle}>Profit & Loss Report</Text>
        <View style={styles.formulaBox}>
          <Text style={styles.formulaTitle}>Formula</Text>
          <Text style={styles.formulaText}>Profit = Sales Revenue - Cost of Goods Sold - Operating Expenses</Text>
        </View>

        <View style={styles.kpiGridPL}>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>Gross Revenue</Text>
              <Text style={styles.kpiValue} numberOfLines={1}>{fmtCurrency(metrics.totalRevenue)}</Text>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>Cost of Goods</Text>
              <Text style={[styles.kpiValue, { color: '#EF4444' }]} numberOfLines={1}>-{fmtCurrency(metrics.totalCost)}</Text>
            </View>
          </View>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>Operating Expenses</Text>
              <Text style={[styles.kpiValue, { color: '#EF4444' }]} numberOfLines={1}>-{fmtCurrency(totalExpensesMetrics)}</Text>
            </View>
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>Net Profit</Text>
              <Text style={[styles.kpiValue, { color: '#0165FC' }]} numberOfLines={1}>{fmtCurrency(netPL)}</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Charts */}
      <View style={styles.chartsRow}>
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Revenue vs Expenses</Text>
          <BarChart data={chartData.values} labels={chartData.labels} color="#006D77" />
        </View>
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Profit Trend</Text>
          <LineChart data={chartData.values.map((v, idx) => v - chartData.expValues[idx])} labels={chartData.labels} color="#0165FC" />
        </View>
      </View>

      {/* Financial Data Table */}
      <View style={styles.tableCard}>
        <Text style={styles.tableCardTitle}>Monthly Breakdown</Text>
        <View style={styles.tableContainer}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thText, { flex: 1.2 }]}>Date</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>Revenue</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>Expenses</Text>
            <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>Net Profit</Text>
          </View>
          {chartData.labels.map((lbl, idx) => {
            const rev = chartData.values[idx] || 0;
            const exp = chartData.expValues[idx] || 0;
            const prof = rev - exp;
            return (
              <View key={lbl} style={styles.tableDataRow}>
                <Text style={[styles.tdText, { flex: 1.2 }]}>{lbl} ({getPeriodLabel(period)})</Text>
                <Text style={[styles.tdText, { flex: 1, textAlign: 'right' }]}>{fmtCurrency(rev)}</Text>
                <Text style={[styles.tdText, { flex: 1, textAlign: 'right', color: '#EF4444' }]}>{fmtCurrency(exp)}</Text>
                <Text style={[styles.tdText, styles.tdAmount, { flex: 1, textAlign: 'right', color: prof >= 0 ? '#10B981' : '#EF4444' }]}>{fmtCurrency(prof)}</Text>
              </View>
            );
          })}
        </View>

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
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabContent: {
    gap: SPACING.sm,
  },
  reportMainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: SPACING.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  formulaBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: SPACING.md,
  },
  formulaTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  formulaText: {
    fontSize: 11,
    color: '#334155',
    marginTop: 2,
    fontWeight: '600',
  },
  kpiGridPL: {
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
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
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
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
    borderRadius: 20,
    padding: SPACING.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111827',
    marginBottom: SPACING.xs,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: SPACING.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  tableCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginBottom: SPACING.sm,
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
  tdAmount: {
    fontWeight: '800',
    color: '#111827',
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
