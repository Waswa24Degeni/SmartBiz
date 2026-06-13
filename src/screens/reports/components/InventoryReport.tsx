import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../../lib/constants';

interface Product {
  name: string;
  quantity: number;
  revenue: number;
  stock: number;
  low_stock_threshold: number;
  profit_margin: number;
}

interface Props {
  topSelling: Product[];
  slowMoving: Product[];
  lowStock: Product[];
  outOfStock: Product[];
  mostProfitable: Product[];
}

function Section({ title, icon, items, emptyText, renderItem }: {
  title: string;
  icon: string;
  items: Product[];
  emptyText: string;
  renderItem: (p: Product, i: number) => React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        items.slice(0, 5).map((item, i) => renderItem(item, i))
      )}
    </View>
  );
}

export const InventoryReport = React.memo(function InventoryReport({
  topSelling, slowMoving, lowStock, outOfStock, mostProfitable,
}: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  const renderProductRow = (p: Product, i: number) => (
    <View key={`${p.name}-${i}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowRank}>#{i + 1}</Text>
        <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowQty}>{p.quantity} sold</Text>
        <Text style={styles.rowRevenue}>TZS {p.revenue >= 1000 ? `${(p.revenue / 1000).toFixed(0)}K` : p.revenue.toLocaleString()}</Text>
      </View>
    </View>
  );

  const renderStockRow = (p: Product, i: number) => {
    const isOut = p.stock === 0;
    return (
      <View key={`${p.name}-${i}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
        <View style={styles.rowLeft}>
          <View style={[styles.stockDot, { backgroundColor: isOut ? COLORS.error : COLORS.warning }]} />
          <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.stockQty, { color: isOut ? COLORS.error : COLORS.warning }]}>
            {p.stock} left
          </Text>
          <Text style={styles.stockThreshold}>min: {p.low_stock_threshold}</Text>
        </View>
      </View>
    );
  };

  const renderProfitRow = (p: Product, i: number) => (
    <View key={`${p.name}-${i}`} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowRank}>#{i + 1}</Text>
        <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowRevenue, { color: COLORS.success }]}>{p.profit_margin.toFixed(0)}% margin</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.card}>
      <Section
        title="Top Selling"
        icon="trending-up-outline"
        items={topSelling}
        emptyText="No sales data"
        renderItem={renderProductRow}
      />
      <Section
        title="Slow Moving"
        icon="trending-down-outline"
        items={slowMoving}
        emptyText="No slow-moving products"
        renderItem={renderProductRow}
      />
      <Section
        title="Low Stock"
        icon="warning-outline"
        items={lowStock}
        emptyText="All stocked up!"
        renderItem={renderStockRow}
      />
      <Section
        title="Out of Stock"
        icon="close-circle-outline"
        items={outOfStock}
        emptyText="Nothing out of stock"
        renderItem={renderStockRow}
      />
      <Section
        title="Most Profitable"
        icon="diamond-outline"
        items={mostProfitable}
        emptyText="No profit data"
        renderItem={renderProfitRow}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: SPACING.lg,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  sectionCount: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  rowAlt: { backgroundColor: COLORS.surfaceAlt },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    minWidth: 0,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rowRank: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '800',
    color: COLORS.textMuted,
    width: 24,
  },
  rowName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    minWidth: 0,
  },
  rowQty: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  rowRevenue: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.text,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stockQty: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  stockThreshold: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  emptyText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
});
