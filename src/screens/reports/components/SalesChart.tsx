import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS, BREAKPOINTS } from '../../../lib/constants';

interface Props {
  title: string;
  subtitle?: string;
  labels: string[];
  values: number[];
  values2?: number[];
  colors?: [string, string];
  colors2?: [string, string];
}

export const SalesChart = React.memo(function SalesChart({ title, subtitle, labels, values, values2, colors = ['#14B8A6', '#0D9488'], colors2 }: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const maxVal = Math.max(...values, ...(values2 || []), 1);
  const barMaxHeight = isMobile ? 110 : 140;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.chartWrap}>
        {/* Horizontal grid lines */}
        <View style={styles.gridLines}>
          {[1, 0.75, 0.5, 0.25, 0].map((frac) => (
            <View key={frac} style={styles.gridLine}>
              <Text style={styles.gridLabel}>
                {frac > 0 ? formatCompact(maxVal * frac) : '0'}
              </Text>
              <View style={styles.gridDash} />
            </View>
          ))}
        </View>

        {/* Bars */}
        <View style={styles.barsRow}>
          {values.map((v, i) => {
            const h1 = Math.max(4, Math.round((v / maxVal) * barMaxHeight));
            const h2 = values2 ? Math.max(4, Math.round((values2[i] / maxVal) * barMaxHeight)) : 0;
            return (
              <View key={`${labels[i]}-${i}`} style={styles.barCol}>
                <View style={styles.barWrap}>
                  <LinearGradient
                    colors={colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.bar, { height: h1 }]}
                  />
                  {values2 && colors2 && (
                    <LinearGradient
                      colors={colors2}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={[styles.bar, { height: h2, marginLeft: 2 }]}
                    />
                  )}
                </View>
                <Text style={styles.barLabel} numberOfLines={1}>{labels[i]}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
});

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  header: {
    marginBottom: SPACING.base,
  },
  title: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  chartWrap: {
    position: 'relative',
  },
  gridLines: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 24, // leave space for bar labels
    justifyContent: 'space-between',
  },
  gridLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    width: 32,
    textAlign: 'right',
    marginRight: SPACING.xs,
  },
  gridDash: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    paddingLeft: 40,
    minHeight: 140,
    gap: SPACING.xs,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barWrap: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bar: {
    flex: 1,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    marginTop: SPACING.xs,
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});
