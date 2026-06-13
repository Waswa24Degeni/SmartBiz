import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BREAKPOINTS, SHADOWS } from '../../lib/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  onBack?: () => void;
  onMenuPress?: () => void;
  rightActions?: React.ReactNode;
  onNotificationsPress?: () => void;
  onActivityPress?: () => void;
  notificationsBadge?: number;
  activityBadge?: number;
}

export function Header({
  title,
  subtitle,
  breadcrumbs,
  onBack,
  onMenuPress,
  rightActions,
  onNotificationsPress,
  onActivityPress,
  notificationsBadge = 0,
  activityBadge = 0,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  return (
    <View style={[
      styles.container,
      isMobile && styles.containerMobile,
      { paddingTop: insets.top + SPACING.sm },
    ]}>
      <View style={styles.row}>
        {/* Left: hamburger / back + breadcrumbs */}
        <View style={styles.left}>
          {onMenuPress && !onBack && (
            <TouchableOpacity onPress={onMenuPress} style={styles.backBtn}>
              <Ionicons name="menu-outline" size={24} color={COLORS.text} />
            </TouchableOpacity>
          )}
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={COLORS.text} />
            </TouchableOpacity>
          )}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <View style={[styles.breadcrumbs, isMobile && styles.breadcrumbsMobile]}>
              {breadcrumbs.map((crumb, i) => (
                <View key={i} style={styles.crumbRow}>
                  {i > 0 && <Text style={styles.crumbSep}> › </Text>}
                  <Text
                    style={[
                      styles.crumb,
                      isMobile && styles.crumbMobile,
                      i === breadcrumbs.length - 1 && styles.crumbActive,
                    ]}
                    numberOfLines={1}
                  >
                    {crumb}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Right actions */}
        <View style={styles.right}>

          {rightActions}
          <TouchableOpacity style={styles.iconBtn} onPress={onNotificationsPress} disabled={!onNotificationsPress}>
            <Ionicons name="notifications-outline" size={20} color={COLORS.text} />
            {notificationsBadge > 0 && (
              <View style={styles.badgeDot}>
                <Text style={styles.badgeText}>{notificationsBadge > 99 ? '99+' : String(notificationsBadge)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onActivityPress} disabled={!onActivityPress}>
            <Ionicons name="time-outline" size={20} color={COLORS.text} />
            {activityBadge > 0 && (
              <View style={styles.badgeDot}>
                <Text style={styles.badgeText}>{activityBadge > 99 ? '99+' : String(activityBadge)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.title, isMobile && styles.titleMobile]} numberOfLines={2}>{title}</Text>
      {!!subtitle && <Text style={[styles.subtitle, isMobile && styles.subtitleMobile]} numberOfLines={2}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  containerMobile: {
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    marginRight: SPACING.sm,
    padding: SPACING.xs,
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  breadcrumbsMobile: {
    flex: 1,
    minWidth: 0,
  },
  crumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumb: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  crumbMobile: {
    fontSize: FONTS.sizes.xs,
  },
  crumbActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  crumbSep: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: SPACING.xs,
  },
  iconBtn: {
    marginLeft: SPACING.sm,
    padding: SPACING.xs,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...SHADOWS.xs,
  },
  badgeDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
  searchPlaceholder: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textMuted,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    minWidth: 120,
  },
  searchPlaceholderMobile: {
    minWidth: 88,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    fontSize: FONTS.sizes.xs,
  },
  title: {
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '700',
    color: COLORS.text,
  },
  titleMobile: {
    fontSize: FONTS.sizes.xl,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  subtitleMobile: {
    fontSize: FONTS.sizes.xs,
  },
});
