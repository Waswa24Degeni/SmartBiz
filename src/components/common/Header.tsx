import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS } from '../../lib/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  onBack?: () => void;
  onMenuPress?: () => void;
  rightActions?: React.ReactNode;
  showSearch?: boolean;
  onSearch?: () => void;
}

export function Header({
  title,
  subtitle,
  breadcrumbs,
  onBack,
  onMenuPress,
  rightActions,
  showSearch,
  onSearch,
}: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.sm }]}>
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
            <View style={styles.breadcrumbs}>
              {breadcrumbs.map((crumb, i) => (
                <View key={i} style={styles.crumbRow}>
                  {i > 0 && <Text style={styles.crumbSep}> › </Text>}
                  <Text style={[styles.crumb, i === breadcrumbs.length - 1 && styles.crumbActive]}>
                    {crumb}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Right actions */}
        <View style={styles.right}>
          {showSearch && (
            <TouchableOpacity style={styles.iconBtn} onPress={onSearch}>
              <Text style={styles.searchPlaceholder}>Search ...</Text>
            </TouchableOpacity>
          )}
          {rightActions}
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="notifications-outline" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="time-outline" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtn: {
    marginRight: SPACING.sm,
    padding: SPACING.xs,
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumb: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
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
  },
  iconBtn: {
    marginLeft: SPACING.sm,
    padding: SPACING.xs,
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
  title: {
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
