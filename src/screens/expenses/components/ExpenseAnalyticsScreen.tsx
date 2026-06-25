import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';
import { format } from 'date-fns';

interface ExpenseAnalyticsScreenProps {
  expenses: any[];
  categories: any[];
  currency: string;
}

const CATEGORY_COLORS = [
  '#0165FC', // Primary Blue
  '#FFA500', // Secondary Orange
  '#006D77', // Accent Teal
  '#10B981', // Success Green
  '#EF4444', // Danger Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#6B7280', // Slate Grey
];

export function ExpenseAnalyticsScreen({
  expenses,
  categories,
  currency,
}: ExpenseAnalyticsScreenProps) {
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount), 0), [expenses]);

  // Compute category breakdown with colors and percentages
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      const catName = e.category?.name || 'Uncategorized';
      map[catName] = (map[catName] || 0) + Number(e.amount);
    });

    const list = Object.entries(map).map(([name, amount], index) => ({
      name,
      amount,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }));

    return list.sort((a, b) => b.amount - a.amount);
  }, [expenses, totalExpenses]);

  // Compute monthly trend (last 6 months)
  const monthlyTrend = useMemo(() => {
    const trendMap: Record<string, number> = {};
    const sortedExpenses = [...expenses].sort(
      (a, b) => new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime()
    );

    sortedExpenses.forEach((e) => {
      const key = format(new Date(e.expense_date), 'MMM yy');
      trendMap[key] = (trendMap[key] || 0) + Number(e.amount);
    });

    const entries = Object.entries(trendMap);
    // Slice last 6 months
    const last6 = entries.slice(-6);
    return last6.map(([label, value]) => ({ label, value }));
  }, [expenses]);

  // Compute payment method breakdown
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      const method = e.payment_method || 'cash';
      map[method] = (map[method] || 0) + Number(e.amount);
    });

    const labels: Record<string, string> = {
      cash: 'Cash',
      mobile_money: 'Mobile Money',
    };

    return Object.entries(map).map(([method, amount]) => ({
      label: labels[method] || 'Cash',
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }));
  }, [expenses, totalExpenses]);

  // SVG Donut Circles
  const donutElements = useMemo(() => {
    if (totalExpenses === 0) {
      return (
        <Circle
          cx="70"
          cy="70"
          r="50"
          stroke="#E5E7EB"
          strokeWidth="14"
          fill="transparent"
        />
      );
    }

    let accumulatedPercent = 0;
    const r = 50;
    const circumference = 2 * Math.PI * r; // ~314.16

    return categoryBreakdown.map((cat) => {
      if (cat.percentage === 0) return null;
      const strokeDashoffset = circumference * (1 - cat.percentage / 100);
      const rotation = accumulatedPercent * 3.6 - 90;
      accumulatedPercent += cat.percentage;

      return (
        <Circle
          key={cat.name}
          cx="70"
          cy="70"
          r={r}
          stroke={cat.color}
          strokeWidth="14"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(${rotation} 70 70)`}
          strokeLinecap={cat.percentage === 100 ? 'butt' : 'round'}
        />
      );
    });
  }, [categoryBreakdown, totalExpenses]);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Visual Chart Header Card */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Expense Breakdown</Text>
        <Text style={styles.chartSubtitle}>Distribution of monthly operating expenses</Text>

        <View style={styles.donutRow}>
          {/* Donut graphic */}
          <View style={styles.donutFrame}>
            <Svg width="140" height="140" viewBox="0 0 140 140">
              {donutElements}
            </Svg>
            <View style={styles.donutCenter}>
              <Text style={styles.donutTotalLabel}>Total Spent</Text>
              <Text style={styles.donutTotalValue} numberOfLines={1}>
                {totalExpenses >= 1000000
                  ? `${(totalExpenses / 1000000).toFixed(1)}M`
                  : totalExpenses >= 1000
                    ? `${(totalExpenses / 1000).toFixed(0)}K`
                    : String(totalExpenses)}
              </Text>
            </View>
          </View>

          {/* Donut Legend */}
          <View style={styles.legendWrap}>
            {categoryBreakdown.slice(0, 4).map((cat) => (
              <View key={cat.name} style={styles.legendRow}>
                <View style={[styles.legendColor, { backgroundColor: cat.color }]} />
                <Text style={styles.legendName} numberOfLines={1}>{cat.name}</Text>
                <Text style={styles.legendPercent}>{cat.percentage.toFixed(0)}%</Text>
              </View>
            ))}
            {categoryBreakdown.length > 4 && (
              <Text style={styles.moreLegendText}>+ {categoryBreakdown.length - 4} more categories</Text>
            )}
          </View>
        </View>
      </View>

      {/* Category Progress Listing */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Category Spending</Text>
        {categoryBreakdown.length === 0 ? (
          <Text style={styles.emptyText}>No data available</Text>
        ) : (
          categoryBreakdown.map((cat) => (
            <View key={cat.name} style={styles.categoryProgressRow}>
              <View style={styles.categoryHead}>
                <View style={styles.categoryNameCol}>
                  <View style={[styles.bullet, { backgroundColor: cat.color }]} />
                  <Text style={styles.categoryNameText}>{cat.name}</Text>
                </View>
                <Text style={styles.categoryAmountText}>{currency} {cat.amount.toLocaleString()}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${cat.percentage}%`, backgroundColor: cat.color }]} />
              </View>
            </View>
          ))
        )}
      </View>

      {/* Monthly Trend Bar Chart */}
      {monthlyTrend.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Monthly Trends</Text>
          <Text style={styles.cardSubtitle}>Expense history comparison</Text>

          <View style={styles.barChartContainer}>
            {monthlyTrend.map((item) => {
              const maxVal = Math.max(...monthlyTrend.map(t => t.value), 1);
              const heightPct = (item.value / maxVal) * 100;
              return (
                <View key={item.label} style={styles.barChartCol}>
                  <Text style={styles.barChartValueText}>
                    {item.value >= 1000000
                      ? `${(item.value / 1000000).toFixed(1)}M`
                      : item.value >= 1000
                        ? `${(item.value / 1000).toFixed(0)}K`
                        : String(item.value)}
                  </Text>
                  <View style={styles.barFrame}>
                    <View style={[styles.barFill, { height: `${Math.max(heightPct, 5)}%` }]} />
                  </View>
                  <Text style={styles.barLabelText}>{item.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Payment Breakdown Cards */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment Breakdown</Text>
        <View style={styles.paymentList}>
          {paymentBreakdown.length === 0 ? (
            <Text style={styles.emptyText}>No data available</Text>
          ) : (
            paymentBreakdown.map((pm) => (
              <View key={pm.label} style={styles.paymentItem}>
                <View style={styles.paymentHeader}>
                  <View style={styles.paymentLeft}>
                    <Ionicons
                      name={
                        pm.label === 'Mobile Money'
                          ? 'phone-portrait-outline'
                          : 'cash-outline'
                      }
                      size={18}
                      color={COLORS.primary}
                    />
                    <Text style={styles.paymentLabelText}>{pm.label}</Text>
                  </View>
                  <Text style={styles.paymentAmountText}>{currency} {pm.amount.toLocaleString()}</Text>
                </View>
                <Text style={styles.paymentPercentageText}>{pm.percentage.toFixed(0)}% of total expenses</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING['3xl'],
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  cardTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
    color: COLORS.text,
  },
  cardSubtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  chartCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  chartTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
    color: COLORS.text,
  },
  chartSubtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: SPACING.lg,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: SPACING.md,
  },
  donutFrame: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
  },
  donutTotalLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  donutTotalValue: {
    fontSize: FONTS.sizes.base,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2,
  },
  legendWrap: {
    flex: 1,
    gap: SPACING.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendName: {
    flex: 1,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  legendPercent: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.text,
  },
  moreLegendText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  categoryProgressRow: {
    marginBottom: SPACING.md,
  },
  categoryHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryNameCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryNameText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  categoryAmountText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  barChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
    marginTop: SPACING.md,
  },
  barChartCol: {
    alignItems: 'center',
    flex: 1,
  },
  barChartValueText: {
    fontSize: 8,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginBottom: 4,
  },
  barFrame: {
    width: 22,
    height: 110,
    backgroundColor: COLORS.borderLight,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barLabelText: {
    fontSize: 9,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: 6,
  },
  paymentList: {
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  paymentItem: {
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentLabelText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  paymentAmountText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  paymentPercentageText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginLeft: 26,
  },
  emptyText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
});
