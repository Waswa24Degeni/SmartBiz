import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../lib/constants';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/** A single shimmer block */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = RADIUS.sm,
  style,
}: SkeletonProps) {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: COLORS.border,
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

/** Card skeleton (metric card) */
export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[skeletonStyles.card, style]}>
      <Skeleton width={36} height={36} borderRadius={10} />
      <Skeleton width="60%" height={22} style={{ marginTop: SPACING.sm }} />
      <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
    </View>
  );
}

/** Row skeleton (list item) */
export function SkeletonRow({ style }: { style?: ViewStyle }) {
  return (
    <View style={[skeletonStyles.row, style]}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={skeletonStyles.rowContent}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={60} height={16} borderRadius={RADIUS.xs} />
    </View>
  );
}

/** Chart skeleton */
export function SkeletonChart({ style }: { style?: ViewStyle }) {
  return (
    <View style={[skeletonStyles.chart, style]}>
      <Skeleton width="40%" height={18} />
      <View style={skeletonStyles.chartBars}>
        {[0.6, 0.85, 0.45, 0.7, 0.55].map((h, i) => (
          <Skeleton
            key={i}
            width={28}
            height={120 * h}
            borderRadius={6}
            style={{ alignSelf: 'flex-end' }}
          />
        ))}
      </View>
      <View style={skeletonStyles.chartLabels}>
        {[1, 2, 3, 4, 5].map((_, i) => (
          <Skeleton key={i} width={28} height={9} borderRadius={4} />
        ))}
      </View>
    </View>
  );
}

/** Dashboard loading state */
export function DashboardSkeleton() {
  return (
    <View style={skeletonStyles.dashContainer}>
      {/* Quick actions */}
      <View style={skeletonStyles.quickRow}>
        {[1, 2, 3, 4].map((_, i) => (
          <View key={i} style={skeletonStyles.quickItem}>
            <Skeleton width={48} height={48} borderRadius={24} />
            <Skeleton width={40} height={10} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* Stat cards */}
      <View style={skeletonStyles.statsGrid}>
        {[1, 2, 3, 4, 5, 6].map((_, i) => (
          <SkeletonCard key={i} style={skeletonStyles.statCardSkel} />
        ))}
      </View>

      {/* Charts */}
      <View style={skeletonStyles.chartsRow}>
        <SkeletonChart style={{ flex: 1 }} />
        <SkeletonChart style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** List loading state (bills, expenses, etc.) */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={skeletonStyles.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  rowContent: {
    flex: 1,
    gap: 4,
  },
  chart: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    minHeight: 200,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    flex: 1,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.sm,
  },
  dashContainer: {
    padding: SPACING.base,
    gap: SPACING.lg,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surface,
    padding: SPACING.base,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  quickItem: {
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  statCardSkel: {
    flex: 1,
    minWidth: '45%',
  },
  chartsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  listContainer: {
    gap: 0,
  },
});
