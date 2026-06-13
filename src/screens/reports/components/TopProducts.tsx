import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';

interface ProductItem {
  name: string;
  value: number;
  quantity: number;
}

interface Props {
  title: string;
  items: ProductItem[];
  valuePrefix?: string;
}

const RANK_COLORS: string[] = ['#F59E0B', '#94A3B8', '#CD7F32', '#0D9488', '#3B82F6', '#8B5CF6'];

export const TopProducts = React.memo(function TopProducts({ title, items, valuePrefix = 'TZS' }: Props) {
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.list}>
        {items.slice(0, 8).map((item, idx) => {
          const pct = Math.round((item.value / maxVal) * 100);
          const rankColor = RANK_COLORS[idx] ?? COLORS.textMuted;
          return (
            <View key={item.name} style={styles.row}>
              <View style={[styles.rankBadge, { backgroundColor: rankColor + '20' }]}>
                <Text style={[styles.rankText, { color: rankColor }]}>#{idx + 1}</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.infoTop}>
                  <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.productValue}>
                    {valuePrefix} {item.value >= 1000 ? `${(item.value / 1000).toFixed(0)}K` : item.value.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${Math.max(pct, 3)}%` }]}>
                    <LinearGradient
                      colors={['#14B8A6', '#0D9488']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </View>
                </View>
                <Text style={styles.meta}>{item.quantity} sold • {pct}% of top</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.base,
  },
  list: { gap: SPACING.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rankText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '800',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: SPACING.xs,
  },
  infoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    minWidth: 0,
    marginRight: SPACING.sm,
  },
  productValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.success,
  },
  barBg: {
    height: 8,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  meta: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
});
