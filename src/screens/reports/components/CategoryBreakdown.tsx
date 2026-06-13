import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';

interface CategoryItem {
  name: string;
  value: number;
  color: string;
}

interface Props {
  title: string;
  items: CategoryItem[];
}

const GRADIENT_MAP: Record<string, readonly [string, string]> = {
  '#0D9488': ['#14B8A6', '#0D9488'],
  '#3B82F6': ['#60A5FA', '#3B82F6'],
  '#F59E0B': ['#FBBF24', '#F59E0B'],
  '#10B981': ['#34D399', '#10B981'],
  '#EF4444': ['#F87171', '#EF4444'],
  '#8B5CF6': ['#A78BFA', '#8B5CF6'],
};

export const CategoryBreakdown = React.memo(function CategoryBreakdown({ title, items }: Props) {
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.list}>
        {items.slice(0, 6).map((item) => {
          const pct = Math.round((item.value / maxVal) * 100);
          const gradColors = GRADIENT_MAP[item.color] ?? [item.color, item.color];
          return (
            <View key={item.name} style={styles.row}>
              <View style={styles.labelRow}>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
                <Text style={styles.label} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.valueText}>
                  TZS {item.value >= 1000 ? `${(item.value / 1000).toFixed(0)}K` : item.value.toLocaleString()}
                </Text>
              </View>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${Math.max(pct, 3)}%` }]}>
                  <LinearGradient
                    colors={gradColors as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
                <Text style={styles.pctLabel}>{pct}%</Text>
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
  row: { gap: SPACING.xs },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    fontWeight: '500',
    minWidth: 0,
  },
  valueText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  barBg: {
    height: 20,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  barFill: {
    height: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  pctLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginLeft: SPACING.xs,
  },
});
