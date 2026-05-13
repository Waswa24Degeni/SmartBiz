import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../lib/constants';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  activeRoute: string;
  onNavigate: (route: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  navItems?: { label: string; icon: string; route: string; badge?: number }[];
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const OTHER_ITEMS = [
  { label: 'Support', icon: 'help-circle-outline', route: 'Support' },
];

export function Sidebar({ activeRoute, onNavigate, collapsed = false, onToggleCollapse, navItems }: SidebarProps) {
  const insets = useSafeAreaInsets();
  const { user, business, signOut } = useAuth();

  const bName     = business?.name ?? 'SmartBiz';
  const bInitials = getInitials(bName);

  const DEFAULT_NAV_ITEMS = [
    { label: 'Dashboard', icon: 'grid-outline',       route: 'Dashboard' },
    { label: 'Inventory', icon: 'cube-outline',       route: 'Inventory' },
    { label: 'POS',       icon: 'cart-outline',       route: 'POS' },
    { label: 'Reports',   icon: 'bar-chart-outline',  route: 'Reports' },
    { label: 'Messages',  icon: 'chatbubble-outline', route: 'Messages' },
    { label: 'Bills',     icon: 'receipt-outline',    route: 'Bills' },
    { label: 'Customers', icon: 'people-circle-outline', route: 'Customers' },
    { label: 'Staff',     icon: 'people-outline',     route: 'Staff' },
    { label: 'Settings',  icon: 'settings-outline',   route: 'Settings' },
  ];
  const NAV_ITEMS = navItems ?? DEFAULT_NAV_ITEMS;

  const handleLogout = () => {
    Alert.alert('Sign out', 'Do you want to sign out now?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } },
    ]);
  };

  const renderNavItem = (item: { label: string; icon: string; route: string; badge?: number }) => {
    const active = activeRoute === item.route;
    return (
      <Pressable
        key={item.route}
        style={({ pressed }) => [
          styles.navItem,
          collapsed && styles.navItemCollapsed,
          active && styles.navItemActive,
          !active && pressed && styles.navItemPressed,
        ]}
        onPress={() => onNavigate(item.route)}
      >
        {active && !collapsed && <View style={styles.activeIndicator} />}
        <View style={[styles.iconCircle, active && styles.iconCircleActive]}>
          <Ionicons
            name={item.icon as any}
            size={18}
            color={active ? COLORS.white : 'rgba(255,255,255,0.65)'}
          />
        </View>
        {!collapsed && (
          <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>
            {item.label}
          </Text>
        )}
        {item.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.sm }]}>
      {/* Logo / business header */}
      <View style={[styles.logo, collapsed && styles.logoCollapsed]}>
        <LinearGradient
          colors={['#C49A2A', '#A67C1E']}
          style={styles.logoIcon}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.logoText}>{bInitials}</Text>
        </LinearGradient>
        {!collapsed && (
          <View style={{ flex: 1 }}>
            <Text style={styles.logoName} numberOfLines={1}>{bName}</Text>
            <Text style={styles.logoSub}>Business Portal</Text>
          </View>
        )}
        {onToggleCollapse && (
          <Pressable style={styles.collapseBtn} onPress={onToggleCollapse}>
            <Ionicons
              name={collapsed ? 'chevron-forward' : 'chevron-back'}
              size={16}
              color='rgba(255,255,255,0.5)'
            />
          </Pressable>
        )}
      </View>

      <View style={styles.divider} />

      {/* Nav items */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING.md }}
      >
        {!collapsed && (
          <Text style={styles.sectionLabel}>Main Menu</Text>
        )}
        {NAV_ITEMS.map(renderNavItem)}

        <View style={styles.sectionDivider} />
        {!collapsed && (
          <Text style={styles.sectionLabel}>Help</Text>
        )}
        {OTHER_ITEMS.map(renderNavItem)}
      </ScrollView>

      {/* Profile card */}
      <View style={[styles.profile, collapsed && styles.profileCollapsed]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}</Text>
        </View>
        {!collapsed && (
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{user?.full_name ?? 'User'}</Text>
            <Text style={styles.profileRole}>
              {user?.role === 'owner' ? 'Supervisor' : user?.role ?? 'Staff'}
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={handleLogout}
        style={({ pressed }) => [styles.logoutBtn, collapsed && styles.logoutBtnCollapsed, pressed && styles.logoutBtnPressed]}
      >
        <Ionicons name="log-out-outline" size={18} color={COLORS.errorLight} />
        {!collapsed && <Text style={styles.logoutText}>Logout</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#172F24',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.base,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  logoCollapsed: {
    justifyContent: 'center',
  },
  logoIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...SHADOWS.sm,
  } as any,
  logoText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: FONTS.sizes.base,
    letterSpacing: 0.5,
  },
  logoName: {
    color: COLORS.white,
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  logoSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.xs,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: SPACING.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.md,
    marginBottom: 2,
    overflow: 'hidden',
    position: 'relative',
    gap: SPACING.sm,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  navItemActive: {
    backgroundColor: 'rgba(196,154,42,0.15)',
  },
  navItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '20%',
    bottom: '20%',
    width: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  iconCircleActive: {
    backgroundColor: COLORS.accent,
  },
  navLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
    flex: 1,
    letterSpacing: 0.1,
  },
  navLabelActive: {
    color: COLORS.white,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: COLORS.error,
    borderRadius: RADIUS.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.lg,
    padding: SPACING.sm + 2,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  profileCollapsed: {
    justifyContent: 'center',
    padding: SPACING.xs,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: COLORS.white,
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },
  profileRole: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
  },
  logoutBtn: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs + 2,
  },
  logoutBtnCollapsed: {
    paddingHorizontal: 0,
  },
  logoutBtnPressed: {
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  logoutText: {
    color: COLORS.errorLight,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
  collapseBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
