import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../../lib/constants';

export interface KPIItem {
  label: string;
  value: string;
  icon: string;
  color: string;
  trend?: number; // percentage change, positive = up
}

interface Props {
  items: KPIItem[];
}

export const KPIGrid = React.memo(function KPIGrid({ items }: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  return (
    <View style={[styles.grid, isMobile && styles.gridMobile]}>
      {items.map((item) => (
        <View key={item.label} style={[styles.card, isMobile && styles.cardMobile]}>
          <View style={[styles.iconCircle, { backgroundColor: item.color + '15' }]}>
            <Ionicons name={item.icon as any} size={20} color={item.color} />
          </View>
          <Text style={styles.label}>{item.label}</Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {item.value}
          </Text>
          {item.trend !== undefined && item.trend !== 0 && (
            <View style={styles.trendRow}>
              <Ionicons
                name={item.trend > 0 ? 'arrow-up' : 'arrow-down'}
                size={12}
                color={item.trend > 0 ? COLORS.success : COLORS.error}
              />
              <Text
                style={[
                  styles.trendText,
                  { color: item.trend > 0 ? COLORS.success : COLORS.error },
                ]}
              >
                {Math.abs(item.trend).toFixed(1)}%
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  gridMobile: {
    gap: SPACING.sm,
  },
  card: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  cardMobile: {
    minWidth: '47%',
    flex: undefined,
    width: '48%',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: SPACING.xs,
  },
  value: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: SPACING.xs,
  },
  trendText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
});
