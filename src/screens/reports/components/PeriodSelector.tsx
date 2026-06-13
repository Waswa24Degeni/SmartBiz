import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONTS, RADIUS } from '../../../lib/constants';

export type Period = 'day' | 'week' | 'month' | 'year';

interface Props {
  period: Period;
  onPeriodChange: (p: Period) => void;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

export const PeriodSelector = React.memo(function PeriodSelector({ period, onPeriodChange }: Props) {
  return (
    <View style={styles.container}>
      {PERIODS.map((p) => {
        const isActive = period === p.key;
        return (
          <Pressable
            key={p.key}
            style={[styles.btn, isActive && styles.btnActive]}
            onPress={() => onPeriodChange(p.key)}
          >
            {isActive && (
              <LinearGradient
                colors={['#14B8A6', '#0D9488']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.full }]}
              />
            )}
            <Text style={[styles.btnText, isActive && styles.btnTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  btn: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  btnActive: {
    borderColor: COLORS.primary,
  },
  btnText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    position: 'relative',
    zIndex: 1,
  },
  btnTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
});
