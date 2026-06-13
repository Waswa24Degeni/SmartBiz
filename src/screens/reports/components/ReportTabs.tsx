import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONTS, RADIUS } from '../../../lib/constants';

export type ReportTab = 'sales' | 'profit' | 'inventory' | 'customers';

interface Props {
  activeTab: ReportTab;
  onTabChange: (tab: ReportTab) => void;
}

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'profit', label: 'Profit' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'customers', label: 'Customers' },
];

export const ReportTabs = React.memo(function ReportTabs({ activeTab, onTabChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onTabChange(tab.key)}
          >
            {isActive && (
              <LinearGradient
                colors={['#14B8A6', '#0D9488']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
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
  pill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    position: 'relative',
  },
  pillActive: {
    borderColor: COLORS.primary,
  },
  pillText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    position: 'relative',
    zIndex: 1,
  },
  pillTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
});
