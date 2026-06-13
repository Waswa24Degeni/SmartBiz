import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../../lib/constants';

interface Props {
  insights: string[];
}

export const InsightsCard = React.memo(function InsightsCard({ insights }: Props) {
  if (insights.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconBg}>
          <Ionicons name="bulb-outline" size={16} color={COLORS.accent} />
        </View>
        <Text style={styles.title}>Business Insights</Text>
      </View>
      <View style={styles.list}>
        {insights.map((text, i) => (
          <View key={i} style={styles.insightRow}>
            <Text style={styles.bullet}>💡</Text>
            <Text style={styles.insightText}>{text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.accent + '08',
    borderRadius: 20,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  iconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    color: COLORS.text,
  },
  list: { gap: SPACING.sm },
  insightRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'flex-start',
  },
  bullet: { fontSize: 14, lineHeight: 20 },
  insightText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    fontWeight: '500',
  },
});
