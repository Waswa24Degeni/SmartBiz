import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';

interface ExpenseReportScreenProps {
  onTriggerExport: (reportType: 'summary' | 'category' | 'monthly' | 'budget') => void;
}

const REPORT_CATALOG = [
  {
    id: 'summary' as const,
    title: 'Expense Summary Report',
    description: 'Complete breakdown of all business expense transactions and payment methods.',
    icon: 'document-text-outline',
    color: '#0165FC',
  },
  {
    id: 'category' as const,
    title: 'Category Expense Report',
    description: 'Detailed analysis of operating costs distributed across different categories.',
    icon: 'pie-chart-outline',
    color: '#006D77',
  },
  {
    id: 'monthly' as const,
    title: 'Monthly Expense Report',
    description: 'Month-over-month financial trends comparison and growth rate indicator.',
    icon: 'bar-chart-outline',
    color: '#FFA500',
  },
  {
    id: 'budget' as const,
    title: 'Budget Performance Report',
    description: 'Tracks budget utilization, spent amounts, thresholds, and remaining allowances.',
    icon: 'wallet-outline',
    color: '#10B981',
  },
];

export function ExpenseReportScreen({ onTriggerExport }: ExpenseReportScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Catalog Title */}
      <View style={styles.header}>
        <Text style={styles.title}>Export Center</Text>
        <Text style={styles.subtitle}>Generate and download professional accounting and financial expense reports</Text>
      </View>

      {/* Catalog Grid */}
      <View style={styles.grid}>
        {REPORT_CATALOG.map((report) => (
          <TouchableOpacity
            key={report.id}
            style={styles.card}
            onPress={() => onTriggerExport(report.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: report.color + '12' }]}>
              <Ionicons name={report.icon as any} size={24} color={report.color} />
            </View>
            <View style={styles.content}>
              <Text style={styles.cardTitle}>{report.title}</Text>
              <Text style={styles.cardDesc}>{report.description}</Text>
            </View>
            <View style={styles.actionBtn}>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
    gap: SPACING.lg,
    paddingBottom: SPACING['3xl'],
  },
  header: {
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  grid: {
    gap: SPACING.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: FONTS.sizes.sm + 1,
    fontWeight: '800',
    color: COLORS.text,
  },
  cardDesc: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  actionBtn: {
    padding: SPACING.xs,
  },
});
