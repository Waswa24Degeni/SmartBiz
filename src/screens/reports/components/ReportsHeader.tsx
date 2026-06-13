import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';

interface Props {
  businessName: string;
  dateRangeLabel: string;
  onRefresh: () => void;
  onExport: () => void;
  refreshing?: boolean;
}

export const ReportsHeader = React.memo(function ReportsHeader({
  businessName,
  dateRangeLabel,
  onRefresh,
  onExport,
  refreshing,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.title}>Business Performance</Text>
        <Text style={styles.subtitle}>{dateRangeLabel}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.iconBtn, refreshing && { opacity: 0.5 }]}
          onPress={onRefresh}
          disabled={refreshing}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={onExport} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: SPACING.sm,
  },
  left: { flex: 1, minWidth: 0 },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.xs,
  },
});
