import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';

interface QuickStat {
  label: string;
  value: string;
  icon: string;
  color: string;
}

interface Props {
  stats: QuickStat[];
}

export const QuickStats = React.memo(function QuickStats({ stats }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      {stats.map((stat) => (
        <View key={stat.label} style={styles.chip}>
          <View style={[styles.iconDot, { backgroundColor: stat.color + '18' }]}>
            <Ionicons name={stat.icon as any} size={14} color={stat.color} />
          </View>
          <View style={styles.chipContent}>
            <Text style={styles.chipValue} numberOfLines={1}>{stat.value}</Text>
            <Text style={styles.chipLabel} numberOfLines={1}>{stat.label}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  container: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    minWidth: 130,
    ...SHADOWS.xs,
  },
  iconDot: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipContent: { flex: 1, minWidth: 0 },
  chipValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  chipLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
});
