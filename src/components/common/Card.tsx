import React, { useRef } from 'react';
import { Animated, Pressable, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING, FONTS, SHADOWS, ANIM } from '../../lib/constants';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  /** Accent color strip at top of card */
  accent?: string;
}

export function Card({ children, style, onPress, title, subtitle, headerRight, accent }: CardProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!onPress) return;
    Animated.spring(scale, { toValue: 0.985, useNativeDriver: true, ...ANIM.springFast }).start();
  };
  const handlePressOut = () => {
    if (!onPress) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...ANIM.springFast }).start();
  };

  const inner = (
    <>
      {!!accent && <View style={[styles.accentBar, { backgroundColor: accent }]} />}
      {(title || headerRight) && (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {!!title && <Text style={styles.title}>{title}</Text>}
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {headerRight && <View>{headerRight}</View>}
        </View>
      )}
      {children}
    </>
  );

  if (onPress) {
    return (
      <Animated.View style={[styles.card, style, { transform: [{ scale }] }]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={{ flex: 1 }}
        >
          {inner}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.card, accent ? styles.cardWithAccent : undefined, style]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
    ...SHADOWS.sm,
  } as ViewStyle,
  cardWithAccent: {
    paddingTop: SPACING.xs,
  },
  accentBar: {
    height: 3,
    borderRadius: RADIUS.xs,
    marginBottom: SPACING.md,
    marginHorizontal: -SPACING.base,
    marginTop: -SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 16,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
