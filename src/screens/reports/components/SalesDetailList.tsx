import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';

export interface SaleItem {
  id: string;
  product_name: string;
  cost_price: number;
  selling_price: number;
  cashier_name: string;
  quantity: number;
  total: number;
  created_at: string;
}

interface Props {
  items: SaleItem[];
}

const INITIAL_COUNT = 5;

const SaleCard = React.memo(function SaleCard({ item }: { item: SaleItem }) {
  const profit = (item.selling_price - item.cost_price) * item.quantity;
  const margin = item.selling_price > 0
    ? ((item.selling_price - item.cost_price) / item.selling_price * 100)
    : 0;
  const timeAgo = getTimeAgo(item.created_at);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.productDot}>
          <Text style={styles.productDotText}>{item.product_name.charAt(0)}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.productName} numberOfLines={1}>{item.product_name}</Text>
          <Text style={styles.meta}>Qty: {item.quantity}  •  {item.cashier_name}  •  {timeAgo}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Cost</Text>
          <Text style={styles.statValue}>TZS {item.cost_price.toLocaleString()}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Selling</Text>
          <Text style={styles.statValue}>TZS {item.selling_price.toLocaleString()}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Profit</Text>
          <Text style={[styles.statValue, { color: profit >= 0 ? COLORS.success : COLORS.error }]}>
            TZS {profit.toLocaleString()}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Margin</Text>
          <Text style={[styles.statValue, { color: COLORS.accent }]}>{margin.toFixed(0)}%</Text>
        </View>
      </View>
    </View>
  );
});

export const SalesDetailList = React.memo(function SalesDetailList({ items }: Props) {
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? items : items.slice(0, INITIAL_COUNT);

  if (items.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="receipt-outline" size={36} color={COLORS.textMuted} />
        <Text style={styles.emptyText}>No sales transactions in this period</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.header}>
        <Ionicons name="receipt-outline" size={16} color={COLORS.primary} />
        <Text style={styles.title}>Sales Details</Text>
        <Text style={styles.countBadge}>{items.length}</Text>
      </View>
      {displayItems.map((item) => (
        <SaleCard key={item.id} item={item} />
      ))}
      {items.length > INITIAL_COUNT && !showAll && (
        <Pressable style={styles.showAllBtn} onPress={() => setShowAll(true)}>
          <Text style={styles.showAllText}>Show all {items.length} items</Text>
          <Ionicons name="chevron-down" size={14} color={COLORS.primary} />
        </Pressable>
      )}
      {showAll && items.length > INITIAL_COUNT && (
        <Pressable style={styles.showAllBtn} onPress={() => setShowAll(false)}>
          <Text style={styles.showAllText}>Show less</Text>
          <Ionicons name="chevron-up" size={14} color={COLORS.primary} />
        </Pressable>
      )}
    </View>
  );
});

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  countBadge: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  productDot: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productDotText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.primary,
  },
  cardInfo: { flex: 1, minWidth: 0 },
  productName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  meta: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.text,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  showAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  showAllText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
