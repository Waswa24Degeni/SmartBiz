import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';

interface Customer {
  name: string;
  total_spend: number;
  order_count: number;
}

interface Props {
  topCustomers: Customer[];
  repeatRate: number;       // percentage
  avgSpend: number;
  newCustomers: number;
  totalCustomers: number;
}

export const CustomerReport = React.memo(function CustomerReport({
  topCustomers, repeatRate, avgSpend, newCustomers, totalCustomers,
}: Props) {
  return (
    <View style={styles.wrapper}>
      {/* Quick metrics */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <LinearGradient colors={['#14B8A6', '#0D9488']} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
          <Ionicons name="people-outline" size={20} color={COLORS.white} style={{ position: 'relative', zIndex: 1 }} />
          <Text style={styles.metricValue}>{totalCustomers}</Text>
          <Text style={styles.metricLabel}>Total</Text>
        </View>
        <View style={styles.metricCard}>
          <LinearGradient colors={['#34D399', '#10B981']} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
          <Ionicons name="person-add-outline" size={20} color={COLORS.white} style={{ position: 'relative', zIndex: 1 }} />
          <Text style={styles.metricValue}>{newCustomers}</Text>
          <Text style={styles.metricLabel}>New</Text>
        </View>
        <View style={styles.metricCard}>
          <LinearGradient colors={['#FBBF24', '#F59E0B']} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
          <Ionicons name="repeat-outline" size={20} color={COLORS.white} style={{ position: 'relative', zIndex: 1 }} />
          <Text style={styles.metricValue}>{repeatRate.toFixed(0)}%</Text>
          <Text style={styles.metricLabel}>Repeat</Text>
        </View>
        <View style={styles.metricCard}>
          <LinearGradient colors={['#60A5FA', '#3B82F6']} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
          <Ionicons name="cash-outline" size={20} color={COLORS.white} style={{ position: 'relative', zIndex: 1 }} />
          <Text style={styles.metricValue}>
            {avgSpend >= 1000 ? `${(avgSpend / 1000).toFixed(0)}K` : avgSpend.toLocaleString()}
          </Text>
          <Text style={styles.metricLabel}>Avg Spend</Text>
        </View>
      </View>

      {/* Top customers */}
      <View style={styles.listCard}>
        <View style={styles.listHeader}>
          <Ionicons name="trophy-outline" size={16} color={COLORS.accent} />
          <Text style={styles.listTitle}>Top Customers</Text>
        </View>
        {topCustomers.length === 0 ? (
          <Text style={styles.emptyText}>No customer data available</Text>
        ) : (
          topCustomers.slice(0, 8).map((c, i) => (
            <View key={`${c.name}-${i}`} style={[styles.customerRow, i % 2 === 1 && styles.customerRowAlt]}>
              <View style={styles.customerAvatar}>
                <Text style={styles.customerAvatarText}>{c.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.customerInfo}>
                <Text style={styles.customerName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.customerMeta}>{c.order_count} orders</Text>
              </View>
              <Text style={styles.customerSpend}>
                TZS {c.total_spend >= 1000 ? `${(c.total_spend / 1000).toFixed(0)}K` : c.total_spend.toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: SPACING.md },
  metricsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    padding: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    minHeight: 90,
    ...SHADOWS.sm,
  },
  metricValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.white,
    position: 'relative',
    zIndex: 1,
    marginTop: SPACING.xs,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    position: 'relative',
    zIndex: 1,
    marginTop: 2,
  },
  listCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  listTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  customerRowAlt: { backgroundColor: COLORS.surfaceAlt },
  customerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.primary,
  },
  customerInfo: { flex: 1, minWidth: 0 },
  customerName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  customerMeta: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  customerSpend: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.success,
  },
  emptyText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
});
