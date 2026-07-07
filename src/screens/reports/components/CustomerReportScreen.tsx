import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SPACING, RADIUS } from '../../../lib/constants';

function fmtCurrency(n: number): string {
  return `TZS ${Math.round(n).toLocaleString()}`;
}

interface CustomerReportScreenProps {
  customerMetrics: {
    totalCustomers: number;
    newCustomers: number;
    repeatRate: number;
    sortedCustomerSales: Array<{
      name: string;
      phone: string;
      orders: number;
      spend: number;
      lastPurchase: string;
    }>;
  };
  generatePDFReport: () => void;
  generateExcelCSVReport: () => void;
}

export const CustomerReportScreen = ({
  customerMetrics,
  generatePDFReport,
  generateExcelCSVReport,
}: CustomerReportScreenProps) => {
  return (
    <View style={styles.tabContent}>
      {/* KPI metrics */}
      <Animated.View entering={FadeInDown.duration(200)} style={styles.reportMainCard}>
        <Text style={styles.sectionTitle}>Customer Analytics Report</Text>
        <Text style={styles.sectionDesc}>Customer loyalty and spending profiles.</Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Total Customers</Text>
            <Text style={styles.kpiValue}>{customerMetrics.totalCustomers}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>New Customers</Text>
            <Text style={[styles.kpiValue, { color: '#0165FC' }]}>{customerMetrics.newCustomers}</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Returning Rate</Text>
            <Text style={[styles.kpiValue, { color: '#10B981' }]}>{customerMetrics.repeatRate.toFixed(0)}%</Text>
          </View>
        </View>
      </Animated.View>

      {/* Top Customers List */}
      <View style={styles.tableCard}>
        <Text style={styles.tableCardTitle}>Top Spenders</Text>
        {customerMetrics.sortedCustomerSales.length === 0 ? (
          <Text style={styles.noDataRow}>No registered customer sales logged</Text>
        ) : (
          customerMetrics.sortedCustomerSales.map((c, i) => (
            <View key={i} style={styles.listItemRow}>
              <View style={styles.listItemLeft}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{i + 1}</Text>
                </View>
                <View style={styles.customerInfo}>
                  <Text style={styles.listItemName}>{c.name}</Text>
                  <Text style={styles.listItemSubtext}>{c.phone} • {c.orders} orders</Text>
                  <Text style={styles.lastPurchase}>Last: {c.lastPurchase}</Text>
                </View>
              </View>
              <View style={styles.listItemRight}>
                <Text style={styles.listItemVal}>{fmtCurrency(c.spend)}</Text>
                <Text style={styles.listItemSubVal}>Total Spend</Text>
              </View>
            </View>
          ))
        )}

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
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
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
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: SPACING.sm,
  },
  listItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0165FC',
  },
  customerInfo: {
    flex: 1,
    gap: 2,
  },
  listItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  listItemSubtext: {
    fontSize: 11,
    color: '#6B7280',
  },
  lastPurchase: {
    fontSize: 10,
    color: '#94A3B8',
  },
  listItemRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  listItemVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  listItemSubVal: {
    fontSize: 9,
    color: '#6B7280',
    textTransform: 'uppercase',
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
