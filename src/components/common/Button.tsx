import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, RADIUS, SPACING, FONTS, SHADOWS, ANIM } from '../../lib/constants';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const GRADIENT_VARIANTS: Partial<Record<Variant, readonly [string, string]>> = {
  primary:   GRADIENTS.primary,
  secondary: GRADIENTS.accent,
  success:   GRADIENTS.success,
  danger:    GRADIENTS.error,
};

const SOLID_BG: Partial<Record<Variant, string>> = {
  outline: 'transparent',
  ghost:   'transparent',
};

const TEXT_COLOR: Record<Variant, string> = {
  primary:   COLORS.white,
  secondary: COLORS.white,
  success:   COLORS.white,
  danger:    COLORS.white,
  outline:   COLORS.primary,
  ghost:     COLORS.primary,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
  icon,
  iconRight,
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      ...ANIM.springFast,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      ...ANIM.springFast,
    }).start();
  };

  const usesGradient = variant in GRADIENT_VARIANTS;
  const gradientColors = GRADIENT_VARIANTS[variant];

  const sizeStyle = sizeStyles[size];
  const textSizeStyle = textSizeStyles[size];

  const pressableStyle: ViewStyle = {
    ...styles.base,
    ...sizeStyle,
    ...(fullWidth ? styles.fullWidth : {}),
    ...((disabled || loading) ? styles.disabled : {}),
    ...(usesGradient ? styles.gradientWrapper : {}),
    ...(!usesGradient && SOLID_BG[variant] !== undefined
      ? { backgroundColor: SOLID_BG[variant] }
      : {}),
    ...(variant === 'outline' ? styles.outlineBorder : {}),
    ...(variant === 'outline' || variant === 'ghost' ? {} : (SHADOWS.sm as ViewStyle)),
    ...(style ?? {}),
  };

  const textCombined: TextStyle = {
    ...styles.text,
    ...textSizeStyle,
    color: TEXT_COLOR[variant],
    ...(textStyle ?? {}),
  };

  const content = loading ? (
    <ActivityIndicator
      color={TEXT_COLOR[variant]}
      size="small"
    />
  ) : (
    <View style={styles.row}>
      {icon && <View style={styles.iconWrap}>{icon}</View>}
      <Text style={textCombined}>{title}</Text>
      {iconRight && <View style={styles.iconRightWrap}>{iconRight}</View>}
    </View>
  );

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        fullWidth && styles.fullWidth,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={pressableStyle}
      >
        {usesGradient && gradientColors ? (
          <LinearGradient
            colors={[gradientColors[0], gradientColors[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: pressableStyle.borderRadius as number ?? RADIUS.md }]}
          />
        ) : null}
        {content}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  } as ViewStyle,
  gradientWrapper: {
    backgroundColor: 'transparent',
  },
  outlineBorder: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    marginRight: SPACING.xs + 2,
  },
  iconRightWrap: {
    marginLeft: SPACING.xs + 2,
  },
  fullWidth: {
    width: '100%',
  } as ViewStyle,
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.1,
  } as TextStyle,
});

const sizeStyles: Record<Size, ViewStyle> = {
  sm: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.sm },
  md: { paddingHorizontal: SPACING.lg,   paddingVertical: SPACING.md - 1 },
  lg: { paddingHorizontal: SPACING.xl,   paddingVertical: SPACING.base - 1 },
};

const textSizeStyles: Record<Size, TextStyle> = {
  sm: { fontSize: FONTS.sizes.sm },
  md: { fontSize: FONTS.sizes.base },
  lg: { fontSize: FONTS.sizes.md },
};
